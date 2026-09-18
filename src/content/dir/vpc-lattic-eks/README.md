# VPC Lattice on `lab-cluster` — two Python apps + private hosted zone

**Assumes:** EKS cluster `lab-cluster`, worker VPC, and `kubectl` access already exist. This lab does **not** create VPC or EKS.

| App | Namespace | Lattice path | Role |
| --- | --- | --- | --- |
| `catalog-backend` | `catalog-backend` | `/catalog/*` | Data API |
| `catalog-frontend` | `catalog-frontend` | `/fetch/*` | Calls backend via **Route 53 private name** → Lattice |

Flow: client → Lattice → frontend → `http://catalog.lattice.lab.internal/catalog/...` (PHZ CNAME → backend Lattice FQDN) → Lattice → backend.

Extended reference: [VPC Lattice on EKS with Gateway API](/eks-vpc-lattice-gateway-api/).

---

## Step 0 — Variables

```bash
export AWS_REGION=us-east-1
export EKS_CLUSTER_NAME=lab-cluster
export SERVICE_NETWORK_NAME=lattice-sn
export PRIVATE_ZONE_NAME=lattice.lab.internal
export BACKEND_DNS_NAME=catalog.lattice.lab.internal
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

---

## Step 1 — Cluster access + Lattice prefix lists on pod SG

```bash
aws eks update-kubeconfig --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}"

CLUSTER_SG=$(aws eks describe-cluster --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}" \
  --output json | jq -r '.cluster.resourcesVpcConfig.clusterSecurityGroupId')

PREFIX_LIST_ID=$(aws ec2 describe-managed-prefix-lists --region "${AWS_REGION}" \
  --query "PrefixLists[?PrefixListName=='com.amazonaws.${AWS_REGION}.vpc-lattice'].PrefixListId" \
  --output text)

aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" \
  --group-id "${CLUSTER_SG}" \
  --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID}}],IpProtocol=tcp,FromPort=8080,ToPort=8080" 2>/dev/null || true

aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" \
  --group-id "${CLUSTER_SG}" \
  --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID}}],IpProtocol=-1" 2>/dev/null || true
```

---

## Step 2 — Service network + VPC association

```bash
aws vpc-lattice create-service-network --name "${SERVICE_NETWORK_NAME}" --region "${AWS_REGION}" 2>/dev/null || true

SERVICE_NETWORK_ID=$(aws vpc-lattice list-service-networks --region "${AWS_REGION}" \
  --query "items[?name=='${SERVICE_NETWORK_NAME}'].id" --output text)

CLUSTER_VPC_ID=$(aws eks describe-cluster --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}" \
  --query 'cluster.resourcesVpcConfig.vpcId' --output text)

aws vpc-lattice create-service-network-vpc-association \
  --region "${AWS_REGION}" \
  --service-network-identifier "${SERVICE_NETWORK_ID}" \
  --vpc-identifier "${CLUSTER_VPC_ID}" 2>/dev/null || true
```

Wait until association is **ACTIVE**:

```bash
aws vpc-lattice list-service-network-vpc-associations \
  --region "${AWS_REGION}" \
  --vpc-id "${CLUSTER_VPC_ID}"
```

---

## Step 3 — Gateway API CRDs

```bash
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

---

## Step 4 — Controller IAM + EKS Pod Identity (no hand-written ServiceAccount manifest)

```bash
curl -fsSL -o /tmp/vpc-lattice-controller-policy.json \
  https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/recommended-inline-policy.json

aws iam create-policy \
  --policy-name VPCLatticeControllerIAMPolicy \
  --policy-document file:///tmp/vpc-lattice-controller-policy.json 2>/dev/null || true

POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/VPCLatticeControllerIAMPolicy"

aws iam create-role \
  --role-name VPCLatticeControllerRole \
  --assume-role-policy-document file://controller/pod-identity-trust.json 2>/dev/null || true

aws iam attach-role-policy \
  --role-name VPCLatticeControllerRole \
  --policy-arn "${POLICY_ARN}"

aws eks create-pod-identity-association \
  --cluster-name "${EKS_CLUSTER_NAME}" \
  --region "${AWS_REGION}" \
  --role-arn "arn:aws:iam::${ACCOUNT_ID}:role/VPCLatticeControllerRole" \
  --namespace aws-application-networking-system \
  --service-account gateway-api-controller
```

Ensure **eks-pod-identity-agent** add-on is on the cluster.

---

## Step 5 — Helm: Gateway API controller (`serviceAccount.create=true`)

Helm creates the ServiceAccount; Pod Identity binds IAM to `gateway-api-controller`.

```bash
aws ecr-public get-login-password --region us-east-1 | \
  helm registry login --username AWS --password-stdin public.ecr.aws

helm upgrade --install gateway-api-controller \
  oci://public.ecr.aws/aws-application-networking-k8s/aws-gateway-controller-chart \
  --version=v2.1.3 \
  --namespace aws-application-networking-system \
  --create-namespace \
  -f controller/helm-values.yaml

kubectl get pods -n aws-application-networking-system
```

Values file: [`controller/helm-values.yaml`](./controller/helm-values.yaml).

---

## Step 6 — GatewayClass + Gateway

```bash
kubectl apply -f manifests/namespaces.yaml
kubectl apply -f manifests/gatewayclass.yaml
kubectl apply -f manifests/gateway.yaml
kubectl get gateway -n networking
```

Wait for `PROGRAMMED=True`.

---

## Step 7 — Build and push images

From this directory:

```bash
export ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
export BACKEND_REPO=catalog-backend
export FRONTEND_REPO=catalog-frontend

aws ecr create-repository --repository-name "${BACKEND_REPO}" --region "${AWS_REGION}" 2>/dev/null || true
aws ecr create-repository --repository-name "${FRONTEND_REPO}" --region "${AWS_REGION}" 2>/dev/null || true
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

docker build -t "${ECR_REGISTRY}/${BACKEND_REPO}:latest" backend/
docker build -t "${ECR_REGISTRY}/${FRONTEND_REPO}:latest" frontend/
docker push "${ECR_REGISTRY}/${BACKEND_REPO}:latest"
docker push "${ECR_REGISTRY}/${FRONTEND_REPO}:latest"
```

Edit manifests — replace image placeholders:

- `manifests/backend.yaml` → `REPLACE_WITH_BACKEND_ECR_IMAGE`
- `manifests/frontend.yaml` → `REPLACE_WITH_FRONTEND_ECR_IMAGE`

---

## Step 8 — Deploy workloads + HTTPRoute + TargetGroupPolicy

```bash
kubectl apply -f manifests/backend.yaml
kubectl apply -f manifests/frontend.yaml
kubectl get httproute -A
```

Backend Lattice FQDN:

```bash
export BACKEND_LATTICE_FQDN=$(kubectl get httproute catalog-backend-route -n catalog-backend \
  -o jsonpath='{.metadata.annotations.application-networking\.k8s\.aws/lattice-assigned-domain-name}')
echo "${BACKEND_LATTICE_FQDN}"
```

---

## Step 9 — Route 53 private hosted zone → VPC Lattice

Create a **private** zone linked to the cluster VPC (once per lab):

```bash
HOSTED_ZONE_ID=$(aws route53 create-hosted-zone \
  --name "${PRIVATE_ZONE_NAME}" \
  --vpc VPCRegion="${AWS_REGION}",VPCId="${CLUSTER_VPC_ID}" \
  --caller-reference "lattice-lab-$(date +%s)" \
  --query 'HostedZone.Id' --output text | tr -d '/hostedzone/')

sed "s/REPLACE_WITH_BACKEND_LATTICE_FQDN/${BACKEND_LATTICE_FQDN}/" route53/private-zone-cname.json > /tmp/cname-change.json

aws route53 change-resource-record-sets \
  --hosted-zone-id "${HOSTED_ZONE_ID}" \
  --change-batch file:///tmp/cname-change.json
```

Record template: [`route53/private-zone-cname.json`](./route53/private-zone-cname.json).  
Name `catalog.lattice.lab.internal` must match `BACKEND_HOST` in [`manifests/frontend.yaml`](./manifests/frontend.yaml).

---

## Step 10 — Verify

From a pod or host in the cluster VPC:

```bash
export FRONTEND_LATTICE_FQDN=$(kubectl get httproute catalog-frontend-route -n catalog-frontend \
  -o jsonpath='{.metadata.annotations.application-networking\.k8s\.aws/lattice-assigned-domain-name}')

curl -s "http://${FRONTEND_LATTICE_FQDN}/fetch/item-1" | jq .
curl -s "http://${BACKEND_LATTICE_FQDN}/catalog/item-1" | jq .
```

Expected: frontend JSON includes `via: private-hosted-zone` and `item` from backend.

---

## Layout

```text
vpc-lattic-eks/
  README.md                 # this guide
  backend/                  # FastAPI catalog API
  frontend/                 # calls backend via PHZ name
  controller/helm-values.yaml
  manifests/*.yaml
  route53/private-zone-cname.json
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Controller crash | Pod Identity association + `VPCLatticeControllerIAMPolicy` |
| Unhealthy targets | TargetGroupPolicy `/health` on port **8080**; SG prefix list |
| Frontend 502 | PHZ CNAME → correct backend Lattice FQDN; zone associated with VPC |
| Gateway not programmed | `defaultServiceNetwork=lattice-sn`; VPC association **ACTIVE** |
