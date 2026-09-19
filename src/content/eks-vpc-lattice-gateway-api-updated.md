---
title: "VPC Lattice on EKS with Gateway API (updated)"
description: "lab-cluster walkthrough: Pod Identity + Helm serviceAccount.create=true, Gateway name = service network, two Python apps, Route 53 private zone, HTTPRoute troubleshooting."
tags:
  - vpc-lattice
  - eks
  - gateway-api
  - networking
  - route53
  - pod-identity
  - aws
  - notes
date: 2026-09-18
resources:
  - title: Controller installation (EKS)
    url: https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/
  - title: Gateway API type — Gateway
    url: https://www.gateway-api-controller.eks.aws.dev/latest/api-types/gateway/
  # - title: Earlier guide (unchanged)
  #   url: /eks-vpc-lattice-gateway-api/
---

This page supersedes the **operational** details for new clusters; the [original Gateway API guide](/eks-vpc-lattice-gateway-api/) is unchanged. Manifests and apps live under [`dir/vpc-lattic-eks/`](./dir/vpc-lattic-eks/).

**Lab cluster:** `lab-cluster` (us-east-1). VPC and EKS already exist.

---

## What changed vs the original post

| Topic | Original emphasis | Updated (validated on `lab-cluster`) |
| --- | --- | --- |
| ServiceAccount | `serviceAccount.create=false` after manual SA | **Helm `serviceAccount.create=true`**; bind IAM with **EKS Pod Identity** (no hand-written SA YAML) |
| Service network | `defaultServiceNetwork` / `lattice-sn` | **Gateway `metadata.name` = VPC Lattice service network name** (e.g. Gateway `lattice-gateway` → SN `lattice-gateway`) |
| Helm account ID | Numeric `awsAccountId` in values | Use **`helm --set-string awsAccountId=...`** or omit on EKS — bare numbers can become `2.71e+11` in pod env |
| HTTPRoute errors | Generic troubleshooting | **IMDS timeout** on `Resource Groups Tagging API` / target group synthesis → missing Pod Identity/IRSA on controller SA |

One VPC can be associated with **one** service network at a time. Plan SN name before associating the cluster VPC.

---

## Architecture (two apps + private DNS)

```text
Client → VPC Lattice → catalog-frontend (/fetch/*)
                              │
                              ▼
              http://catalog.lattice.lab.internal/catalog/...
              (Route 53 private CNAME → backend Lattice FQDN)
                              │
                              ▼
              VPC Lattice → catalog-backend (/catalog/*)
```

| App | Namespace (lab) | HTTPRoute path |
| --- | --- | --- |
| `catalog-backend` | `backend` | `/catalog` |
| `catalog-frontend` | `frontend` | `/fetch` |

---

## 1. Prefix lists on the cluster security group

```bash
export AWS_REGION=us-east-1
export EKS_CLUSTER_NAME=lab-cluster

aws eks update-kubeconfig --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}"

CLUSTER_SG=$(aws eks describe-cluster --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}" \
  --output json | jq -r '.cluster.resourcesVpcConfig.clusterSecurityGroupId')

PREFIX_LIST_ID=$(aws ec2 describe-managed-prefix-lists --region "${AWS_REGION}" \
  --query "PrefixLists[?PrefixListName=='com.amazonaws.${AWS_REGION}.vpc-lattice'].PrefixListId" \
  --output text)

aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" \
  --group-id "${CLUSTER_SG}" \
  --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID}}],IpProtocol=tcp,FromPort=8080,ToPort=8080" 2>/dev/null || true
```

---

## 2. Service network (name = Gateway name)

Create a service network whose **name matches the Kubernetes Gateway name** (`lattice-gateway` in [`manifests/gateway.yaml`](./dir/vpc-lattic-eks/manifests/gateway.yaml)):

```bash
export SERVICE_NETWORK_NAME=lattice-gateway

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

Wait for association **ACTIVE** before expecting `HTTPRoute` `DeploySucceed`.

---

## 3. Gateway API CRDs

```bash
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

---

## 4. Controller IAM + Pod Identity

Policy: [recommended-inline-policy.json](https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/recommended-inline-policy.json). Trust policy for Pod Identity: [`controller/pod-identity-trust.json`](./dir/vpc-lattic-eks/controller/pod-identity-trust.json).

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

curl -fsSL -o /tmp/vpc-lattice-controller-policy.json \
  https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/recommended-inline-policy.json

aws iam create-policy --policy-name VPCLatticeControllerIAMPolicy \
  --policy-document file:///tmp/vpc-lattice-controller-policy.json 2>/dev/null || true

aws iam create-role --role-name VPCLatticeControllerRole \
  --assume-role-policy-document file://dir/vpc-lattic-eks/controller/pod-identity-trust.json 2>/dev/null || true

aws iam attach-role-policy --role-name VPCLatticeControllerRole \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/VPCLatticeControllerIAMPolicy"

aws eks create-pod-identity-association \
  --cluster-name "${EKS_CLUSTER_NAME}" \
  --region "${AWS_REGION}" \
  --role-arn "arn:aws:iam::${ACCOUNT_ID}:role/VPCLatticeControllerRole" \
  --namespace aws-application-networking-system \
  --service-account gateway-api-controller
```

Requires **eks-pod-identity-agent** on the cluster.

---

## 5. Helm (`serviceAccount.create=true`)

```bash
aws ecr-public get-login-password --region us-east-1 | \
  helm registry login --username AWS --password-stdin public.ecr.aws

helm upgrade --install gateway-api-controller \
  oci://public.ecr.aws/aws-application-networking-k8s/aws-gateway-controller-chart \
  --version=v2.1.3 \
  --namespace aws-application-networking-system \
  --create-namespace \
  --set serviceAccount.create=true \
  --set serviceAccount.name=gateway-api-controller \
  --set defaultServiceNetwork=lattice-gateway \
  --set log.level=info \
  --set-string awsAccountId="${ACCOUNT_ID}" \
  --set-string clusterVpcId="${CLUSTER_VPC_ID}" \
  --set awsRegion="${AWS_REGION}" \
  --set clusterName="${EKS_CLUSTER_NAME}"

kubectl rollout restart deployment -n aws-application-networking-system \
  -l app.kubernetes.io/instance=gateway-api-controller
```

Reference values: [`controller/helm-values.yaml`](./dir/vpc-lattic-eks/controller/helm-values.yaml).

---

## 6. GatewayClass, Gateway, workloads

```bash
kubectl apply -f dir/vpc-lattic-eks/manifests/namespaces.yaml
kubectl apply -f dir/vpc-lattic-eks/manifests/gatewayclass.yaml
kubectl apply -f dir/vpc-lattic-eks/manifests/gateway.yaml
# After ECR images are set in YAML:
kubectl apply -f dir/vpc-lattic-eks/manifests/backend.yaml
kubectl apply -f dir/vpc-lattic-eks/manifests/frontend.yaml
kubectl apply -f dir/vpc-lattic-eks/manifests/targetgrouppolicies-lab.yaml
```

**TargetGroupPolicy is required** for healthy Lattice targets (`/health` on pod port **8080**).

---

## 7. Route 53 private zone (frontend → backend via Lattice DNS)

CNAME `catalog.lattice.lab.internal` → backend HTTPRoute Lattice FQDN. Template: [`route53/private-zone-cname.json`](./dir/vpc-lattic-eks/route53/private-zone-cname.json). Full steps: [`dir/vpc-lattic-eks/README.md`](./dir/vpc-lattic-eks/README.md).

---

## 8. Verify

```bash
kubectl get httproute -A
kubectl describe httproute catalog-backend-route -n backend

export BACKEND_FQDN=$(kubectl get httproute catalog-backend-route -n backend \
  -o jsonpath='{.metadata.annotations.application-networking\.k8s\.aws/lattice-assigned-domain-name}')

curl -s "http://${BACKEND_FQDN}/catalog/item-1"
```

---

## Troubleshooting (from `lab-cluster`)

| Symptom | Fix |
| --- | --- |
| `FailedDeployModel` … `no EC2 IMDS role found` … `Resource Groups Tagging API` | Create **Pod Identity** (or IRSA) for `gateway-api-controller`; restart controller pods |
| `Service network lattice-gateway` not found | Create SN **named like the Gateway**; associate cluster VPC (only one SN per VPC) |
| `awsAccountId` looks like `2.71e+11` in pod env | `helm --set-string awsAccountId=...` |
| HTTPRoute stuck; no `lattice-assigned-domain-name` | Fix controller IAM + SN; wait for `DeploySucceed` event |
| 503 / unhealthy targets | Apply **TargetGroupPolicy**; SG allows Lattice prefix list to **8080** |

```bash
aws eks list-pod-identity-associations --cluster-name lab-cluster --region us-east-1
kubectl logs -n aws-application-networking-system -l app.kubernetes.io/instance=gateway-api-controller --tail=50
```

---

## References

- [VPC Lattice on EKS with Gateway API](/eks-vpc-lattice-gateway-api/) (original)
- [VPC Lattice application networking](/aws-vpc-lattice-application-networking/)
- [Deploy on EKS](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/)
