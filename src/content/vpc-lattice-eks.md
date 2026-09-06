---
title: "VPC Lattice on EKS (Gateway API)"
description: "Install AWS Gateway API Controller, then Gateway + HTTPRoute + TargetGroupPolicy for VPC Lattice."
tags:
  - vpc-lattice
  - eks
  - gateway-api
  - networking
  - aws
  - notes
date: 2026-09-05
---

Gateway API objects → AWS Gateway API Controller → VPC Lattice service + target groups. Order: kubeconfig → OIDC/IAM → CRDs → controller → GatewayClass → Gateway → HTTPRoute → TargetGroupPolicy.

Docs: [controller deploy](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/) · [Gateway API CRDs](https://gateway-api.sigs.k8s.io/guides/#installing-gateway-api) · app-networking lab: [VPC Lattice application networking](/vpc-lattice-application-networking/)

---

## 1. Cluster context

```bash
export AWS_REGION=<eks_cluster_region>
export EKS_CLUSTER_NAME=<EKS_CLUSTER_NAME>

aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${AWS_REGION}
eksctl utils associate-iam-oidc-provider --cluster ${EKS_CLUSTER_NAME} --approve --region ${AWS_REGION}
```

Node / pod SG: inbound **all** from Lattice managed prefix lists `com.amazonaws.$AWS_REGION.vpc-lattice` and `com.amazonaws.$AWS_REGION.ipv6.vpc-lattice`. See deploy guide **Allow traffic from Amazon VPC Lattice**.

IAM for controller: create `VPCLatticeControllerIAMPolicy` from [recommended-inline-policy.json](https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/recommended-inline-policy.json), namespace `aws-application-networking-system`, then **Pod Identity** (preferred) or **IRSA** `gateway-api-controller` SA. Follow deploy guide through **Install the controller**. Skip this → Helm pods crash / Lattice APIs denied.

---

## 2. Gateway API CRDs

Pin version from [Gateway API releases](https://github.com/kubernetes-sigs/gateway-api/releases). Example:

```bash
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

---

## 3. Controller (Helm)

Chart version: check [deploy#install-the-controller](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/#install-the-controller). `serviceAccount.create=false` because SA already exists from Pod Identity / IRSA.

On EKS, `CLUSTER_VPC_ID` / `AWS_ACCOUNT_ID` / `REGION` / `CLUSTER_NAME` **infer from IMDS**. No IMDS (Fargate-only control, out-of-cluster) → pass Helm `--set` or controller fails.

```bash
aws ecr-public get-login-password --region us-east-1 | helm registry login --username AWS --password-stdin public.ecr.aws

helm upgrade --install gateway-api-controller \
  oci://public.ecr.aws/aws-application-networking-k8s/aws-gateway-controller-chart \
  --version=v2.1.3 \
  --namespace aws-application-networking-system \
  --set serviceAccount.create=false \
  --set log.level=info \
  --set clusterVpcId=${CLUSTER_VPC_ID} \
  --set awsAccountId=${AWS_ACCOUNT_ID} \
  --set awsRegion=${AWS_REGION} \
  --set clusterName=${EKS_CLUSTER_NAME}
```

```bash
kubectl apply -f https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/gatewayclass.yaml
```

---

## 4. Gateway

Gateway lives in `networking`. HTTPRoutes in other ns attach because `allowedRoutes.from: All`.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-hotel
  namespace: networking
spec:
  gatewayClassName: amazon-vpc-lattice
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      hostname: "*.example.com"
      allowedRoutes:
        namespaces:
          from: All
```

<details>
<summary>hostname vs allowedRoutes</summary>

Two knobs. Not the same.

| Field | Filters |
| --- | --- |
| `hostname` | Request `Host` header |
| `allowedRoutes.namespaces.from` | Which namespaces may **attach** an HTTPRoute |

`from`:

- `Same` → only Gateway ns
- `All` → any ns
- `Selector` → labeled ns

No `hostname` → listener accepts any Host; path/header rules on HTTPRoute decide.

Lattice custom domain: Gateway listener hostname **and** HTTPRoute `hostnames` must **overlap** or route `Accepted=False`.
</details>

---

## 5. HTTPRoute

Route ns `my-app-ns`. `parentRefs.namespace` = Gateway ns (`networking`). `sectionName` = listener `name: http`.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-route
  namespace: my-app-ns
spec:
  parentRefs:
    - name: my-hotel
      namespace: networking
      sectionName: http
  hostnames:
    - "*.example.com"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /reviews
      backendRefs:
        - name: reviews-service
          port: 80
    - matches:
        - path:
            type: PathPrefix
            value: /inventory
      backendRefs:
        - name: inventory-service
          port: 80
```

<details>
<summary>parentRefs, hostnames, rules, backendRefs</summary>

- **parentRefs** — which Gateway. `sectionName` binds one listener; omit → try all listeners. `namespace` required for cross-ns attach; Gateway `allowedRoutes` must allow it.
- **hostnames** — must overlap Gateway listener hostname (same or more specific, e.g. `app.example.com` under `*.example.com`). No overlap → not accepted. Gateway has no hostname → this field is the Host filter.
- **rules.matches** — path / header / method. Omit matches → `/`.
- **backendRefs** — Kubernetes Service + port. Controller → Lattice target group, registers pod IPs.
</details>

---

## 6. TargetGroupPolicy

Attach to the **Service**, not the Route.

```yaml
apiVersion: application-networking.k8s.aws/v1alpha1
kind: TargetGroupPolicy
metadata:
  name: reviews-policy
  namespace: my-app-ns
spec:
  targetRef:
    group: ""
    kind: Service
    name: reviews-service
  protocol: HTTP
  protocolVersion: HTTP1
  healthCheck:
    enabled: true
    path: /healthz
    port: 8080
    intervalSeconds: 30
    healthyThresholdCount: 3
    unhealthyThresholdCount: 3
```

<details>
<summary>targetRef and health checks</summary>

- **targetRef** → Service pods. Not Gateway, not HTTPRoute.
- **protocol / protocolVersion** → must match what pods speak (`HTTP1` / `HTTP2` / `GRPC`). Wrong → 5xx.
- **healthCheck.path / port** → default probe often wrong path → target `unhealthy` → no traffic, DNS still works.
</details>
