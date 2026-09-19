---
title: "VPC Lattice on EKS with Gateway API"
description: "Install AWS Gateway API Controller, service network association, Gateway + HTTPRoute + TargetGroupPolicy for VPC Lattice."
tags:
  - vpc-lattice
  - eks
  - gateway-api
  - networking
  - aws
  - notes
date: 2026-09-05
resources:
  - title: Controller installation (EKS)
    url: https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/
  - title: Getting started (single cluster)
    url: https://www.gateway-api-controller.eks.aws.dev/latest/guides/getstarted/
---

Gateway API objects → **Amazon VPC Lattice Gateway API Controller** → Lattice services and target groups.

**Order:** kubeconfig → Lattice prefix-list SG rules → IAM (Pod Identity or IRSA) → Gateway API CRDs → Helm controller → **service network + VPC association** → GatewayClass → Gateway → workload + HTTPRoute → TargetGroupPolicy → verify Lattice DNS.

Pair with the app lab: [VPC Lattice application networking](/aws-vpc-lattice-application-networking/) (service network name **`lattice-sn`**). This page uses the same network name so EKS inventory shares the network with ECS/EC2 services.

Official walkthrough: [Getting started](https://www.gateway-api-controller.eks.aws.dev/latest/guides/getstarted/) (upstream examples use service network **`my-hotel`** — name is arbitrary).

---

## 1. Cluster context and Lattice security groups

```bash
export AWS_REGION=<eks_cluster_region>
export EKS_CLUSTER_NAME=<EKS_CLUSTER_NAME>

aws eks update-kubeconfig --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}"
eksctl utils associate-iam-oidc-provider --cluster "${EKS_CLUSTER_NAME}" --approve --region "${AWS_REGION}"
```

Allow **inbound from VPC Lattice managed prefix lists** on the security group that protects your **pod ENIs** (often the cluster security group or a custom node group SG). Without this, targets stay unhealthy or connections time out.

```bash
CLUSTER_SG=$(aws eks describe-cluster --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}" \
  --output json | jq -r '.cluster.resourcesVpcConfig.clusterSecurityGroupId')

PREFIX_LIST_ID=$(aws ec2 describe-managed-prefix-lists --region "${AWS_REGION}" \
  --query "PrefixLists[?PrefixListName=='com.amazonaws.${AWS_REGION}.vpc-lattice'].PrefixListId" \
  --output text)

aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" \
  --group-id "${CLUSTER_SG}" \
  --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID}}],IpProtocol=-1" 2>/dev/null || true

PREFIX_LIST_ID_IPV6=$(aws ec2 describe-managed-prefix-lists --region "${AWS_REGION}" \
  --query "PrefixLists[?PrefixListName=='com.amazonaws.${AWS_REGION}.ipv6.vpc-lattice'].PrefixListId" \
  --output text)

aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" \
  --group-id "${CLUSTER_SG}" \
  --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID_IPV6}}],IpProtocol=-1" 2>/dev/null || true
```

Also allow **TCP 8080** (app port) from the IPv4 prefix list on the same SG if your lab apps listen on 8080. See [Allow traffic from Amazon VPC Lattice](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/#allow-traffic-from-amazon-vpc-lattice).

**Controller IAM:** create `VPCLatticeControllerIAMPolicy` from [recommended-inline-policy.json](https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/recommended-inline-policy.json), namespace `aws-application-networking-system`, then **EKS Pod Identity** (recommended) or **IRSA** for ServiceAccount `gateway-api-controller`. Follow [Set up IAM permissions](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/#set-up-iam-permissions) through namespace + role binding. Skipping IAM → controller pods crash on Lattice API calls.

---

## 2. Gateway API CRDs

Pin a release from [Gateway API releases](https://github.com/kubernetes-sigs/gateway-api/releases). Match a version compatible with your controller chart (see deploy guide).

```bash
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

---

## 3. Install the controller (Helm)

Chart version: use the value in [Install the controller](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/#install-the-controller) (currently **v2.1.3**). Set `serviceAccount.create=false` because the SA already exists from Pod Identity / IRSA.

On **Amazon EKS**, the chart reads account, Region, VPC, and cluster name from the control plane — **do not** pass empty `clusterVpcId` / `awsAccountId` placeholders.

```bash
aws ecr-public get-login-password --region us-east-1 | \
  helm registry login --username AWS --password-stdin public.ecr.aws

helm upgrade --install gateway-api-controller \
  oci://public.ecr.aws/aws-application-networking-k8s/aws-gateway-controller-chart \
  --version=v2.1.3 \
  --namespace aws-application-networking-system \
  --set serviceAccount.create=false \
  --set log.level=info

kubectl get pods -n aws-application-networking-system
```

<details>
<summary>Self-hosted Kubernetes (not EKS)</summary>

When the controller is not on EKS, set Helm values explicitly: `clusterVpcId`, `awsAccountId`, `awsRegion`, `clusterName`. See [Environment variables](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/#environment-variables) in the deploy guide.

</details>

---

## 4. GatewayClass

`GatewayClass` tells Kubernetes **which controller** owns Gateways of that class. Your `Gateway` must set `spec.gatewayClassName: amazon-vpc-lattice` to match this object.

Apply the manifest from the controller repo (after Helm pods are running):

```bash
kubectl apply -f https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/gatewayclass.yaml
```

Same content (cluster-scoped — no namespace):

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: amazon-vpc-lattice
spec:
  controllerName: application-networking.k8s.aws/gateway-api-controller
```

Verify the class exists and is accepted:

```bash
kubectl get gatewayclass amazon-vpc-lattice
kubectl describe gatewayclass amazon-vpc-lattice
```

`controllerName` must match the running controller. If `GatewayClass` is missing, `kubectl apply` on a `Gateway` succeeds but status stays unprogrammed and no Lattice resources are created.

Upstream file may still use `apiVersion: gateway.networking.k8s.io/v1beta1`; either `v1` or `v1beta1` is fine once Gateway API CRDs are installed.

---

## 5. Service network (required)

The controller attaches new Gateways to a **VPC Lattice service network**. Create the network (once per Region/account lab) and associate the **EKS cluster VPC**.

If you already created **`lattice-sn`** in [application networking](/aws-vpc-lattice-application-networking/#2-service-network), reuse it. Otherwise:

```bash
export SERVICE_NETWORK_NAME=lattice-sn

aws vpc-lattice create-service-network --name "${SERVICE_NETWORK_NAME}" --region "${AWS_REGION}" 2>/dev/null || true

SERVICE_NETWORK_ID=$(aws vpc-lattice list-service-networks --region "${AWS_REGION}" \
  --query "items[?name=='${SERVICE_NETWORK_NAME}'].id" --output text)

CLUSTER_VPC_ID=$(aws eks describe-cluster --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}" \
  --query 'cluster.resourcesVpcConfig.vpcId' --output text)

aws vpc-lattice create-service-network-vpc-association \
  --region "${AWS_REGION}" \
  --service-network-identifier "${SERVICE_NETWORK_ID}" \
  --vpc-identifier "${CLUSTER_VPC_ID}"
```

Wait until association status is **ACTIVE**:

```bash
aws vpc-lattice list-service-network-vpc-associations \
  --region "${AWS_REGION}" \
  --vpc-id "${CLUSTER_VPC_ID}"
```

Tell the controller which service network to use (Helm):

```bash
helm upgrade gateway-api-controller \
  oci://public.ecr.aws/aws-application-networking-k8s/aws-gateway-controller-chart \
  --version=v2.1.3 \
  --reuse-values \
  --namespace aws-application-networking-system \
  --set defaultServiceNetwork="${SERVICE_NETWORK_NAME}"
```

---

## 6. Gateway

Create namespace `networking` (optional; keeps Gateway separate from app namespaces):

```bash
kubectl create namespace networking
```

Minimal Gateway (matches [upstream `my-hotel-gateway.yaml`](https://github.com/aws/aws-application-networking-k8s/blob/main/files/examples/my-hotel-gateway.yaml)). Custom `hostname` and cross-namespace routes are optional — see collapsible note below.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: lattice-gateway
  namespace: networking
spec:
  gatewayClassName: amazon-vpc-lattice
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: All
```

```bash
kubectl apply -f lattice-gateway.yaml
kubectl get gateway -n networking
```

`PROGRAMMED=True` in status when the controller has linked the Gateway to Lattice.

<details>
<summary>hostname vs allowedRoutes (custom domains)</summary>

| Field | Filters |
| --- | --- |
| `listeners[].hostname` | Request `Host` header |
| `allowedRoutes.namespaces.from` | Which namespaces may attach an HTTPRoute |

`from`: `Same` (Gateway ns only), `All`, or `Selector`.

For a custom domain, Gateway listener `hostname` and HTTPRoute `hostnames` must **overlap** or the route is not accepted (`Accepted=False`).

</details>

---

## 7. Workload (inventory lab)

Deploy the sample app from the repo (Service port **80** → pod **8080**, health **`GET /health`**):

1. Build/push [`eks-inventory-service/Dockerfile`](./dir/vpc/vpc-lattice-networking/eks-inventory-service/Dockerfile) to ECR.
2. Edit [`eks-inventory-service/k8s/deployment.yaml`](./dir/vpc/vpc-lattice-networking/eks-inventory-service/k8s/deployment.yaml) (`REPLACE_WITH_ECR_IMAGE`).
3. Create namespace and apply:

```bash
kubectl create namespace inventory
kubectl apply -n inventory -f deployment.yaml
```

---

## 8. HTTPRoute

Example route to **`inventory-service`** on path prefix **`/inventory`** (matches the lab app).

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: inventory-route
  namespace: inventory
spec:
  parentRefs:
    - name: lattice-gateway
      namespace: networking
      sectionName: http
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /inventory
      backendRefs:
        - name: inventory-service
          port: 80
```

<details>
<summary>parentRefs, hostnames, backendRefs</summary>

- **parentRefs** — Gateway name; `sectionName` binds listener `http`. Cross-namespace attach requires Gateway `allowedRoutes.namespaces.from: All`.
- **hostnames** — optional; must overlap Gateway listener hostname when both are set.
- **backendRefs** — Kubernetes Service name and **Service port** (80 here, not 8080).

</details>

---

## 9. TargetGroupPolicy

Attach to the **Service**, not the HTTPRoute. Health check must hit the **pod** path and port the app exposes.

```yaml
apiVersion: application-networking.k8s.aws/v1alpha1
kind: TargetGroupPolicy
metadata:
  name: inventory-policy
  namespace: inventory
spec:
  targetRef:
    group: ""
    kind: Service
    name: inventory-service
  protocol: HTTP
  protocolVersion: HTTP1
  healthCheck:
    enabled: true
    path: /health
    port: 8080
    intervalSeconds: 30
    healthyThresholdCount: 3
    unhealthyThresholdCount: 3
```

Wrong `healthCheck.path` (for example `/healthz`) → targets **unhealthy** → no traffic even when DNS resolves.

---

## 10. Verify

```bash
kubectl get httproute -n inventory
kubectl get httproute inventory-route -n inventory -o jsonpath='{.metadata.annotations.application-networking\.k8s\.aws/lattice-assigned-domain-name}{"\n"}'
```

Call the Lattice-assigned hostname from a client in a VPC associated with **`lattice-sn`** (HTTP **80**, path **`/inventory/...`**):

```bash
curl -s "http://${LATTICE_FQDN}/inventory/SKU-001"
```

Controller logs:

```bash
kubectl logs -n aws-application-networking-system -l app.kubernetes.io/name=aws-gateway-controller --tail=50
```

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `GatewayClass` not found | Apply §4 before `Gateway`; name must be **`amazon-vpc-lattice`** |
| Gateway not `PROGRAMMED` | Missing `defaultServiceNetwork` or VPC association not **ACTIVE** |
| HTTPRoute not accepted | `parentRefs` namespace/name wrong; hostname mismatch with Gateway |
| 503 / no healthy targets | TargetGroupPolicy path/port wrong; SG missing Lattice prefix list on pod SG |
| Helm env errors on Fargate-only | Controller needs EC2 or hybrid; or set explicit Helm env for non-EKS |

## References

- [Deploy on EKS](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/)
- [Getting started](https://www.gateway-api-controller.eks.aws.dev/latest/guides/getstarted/)
- [VPC Lattice application networking lab](/aws-vpc-lattice-application-networking/)
