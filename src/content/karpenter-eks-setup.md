---
title: Karpenter Setup on EKS
description: Install Karpenter on an existing EKS cluster for node autoscaling.
tags:
  - eks
  - vpc
  - karpenter
  - nodes
  - oidc
  - oidc-provider
---
# Karpenter Setup on EKS

Install [Karpenter](https://karpenter.sh/) on an **existing** Amazon EKS cluster so it can provision EC2 nodes when pods are unschedulable.

## Prerequisites

- `aws`, `kubectl`, `eksctl`, and `helm` installed and on your `PATH`
- `envsubst` (Git Bash / WSL on Windows, or the `gettext` package on Linux/macOS) — only needed for the bash steps
- Credentials with permission to create IAM roles/policies, tag EC2 resources, and administer the cluster
- The cluster already exists and `kubectl` can already reach it

> If your cluster was **not** created by you or is older, don't assume its IAM auth setup — step #4 below detects it for you before you touch anything.



### #1 - Configure kubectl



```bash
aws eks update-kubeconfig --name "${CLUSTER_NAME}" --region "${AWS_REGION}"
```



### #2 - Set environment variables



```bash
# verify you're pointed at the right account/region first
aws configure list

export KARPENTER_NAMESPACE=kube-system
export CLUSTER_NAME=<your-cluster-name>
export KARPENTER_VERSION="1.14.0"
export AWS_PARTITION="aws" # use aws-cn or aws-us-gov for other partitions
export AWS_REGION="$(aws configure get region)"
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query 'Account' --output text)"
export OIDC_ENDPOINT="$(aws eks describe-cluster --name "${CLUSTER_NAME}" \
    --query "cluster.identity.oidc.issuer" --output text)"
export K8S_VERSION="$(aws eks describe-cluster --name "${CLUSTER_NAME}" --query "cluster.version" --output text)"
export ALIAS_VERSION="$(aws ssm get-parameter --name "/aws/service/eks/optimized-ami/${K8S_VERSION}/amazon-linux-2023/x86_64/standard/recommended/image_id" --query Parameter.Value --output text | xargs -I{} aws ec2 describe-images --image-ids {} --query 'Images[0].Name' --output text | sed -r 's/^.*(v[[:digit:]]+).*$/\1/')"
```



### #3 - Associate an OIDC provider

The Karpenter controller authenticates via IRSA, which needs an IAM OIDC provider on the cluster. Existing clusters often don't have one yet — check first, don't assume:



```bash
OIDC_ID="${OIDC_ENDPOINT#*//}"
aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[].Arn" --output text | grep -q "${OIDC_ID##*/}" \
    && echo "OIDC provider already associated" \
    || eksctl utils associate-iam-oidc-provider --cluster "${CLUSTER_NAME}" --region "${AWS_REGION}" --approve
```



### #4 - Create node IAM role

Karpenter-launched nodes assume this role.



```bash
cat > node-trust-policy.json <<'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "ec2.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

aws iam create-role --role-name "KarpenterNodeRole-${CLUSTER_NAME}" \
    --assume-role-policy-document file://node-trust-policy.json

aws iam attach-role-policy --role-name "KarpenterNodeRole-${CLUSTER_NAME}" \
    --policy-arn "arn:${AWS_PARTITION}:iam::aws:policy/AmazonEKSWorkerNodePolicy"

aws iam attach-role-policy --role-name "KarpenterNodeRole-${CLUSTER_NAME}" \
    --policy-arn "arn:${AWS_PARTITION}:iam::aws:policy/AmazonEKS_CNI_Policy"

aws iam attach-role-policy --role-name "KarpenterNodeRole-${CLUSTER_NAME}" \
    --policy-arn "arn:${AWS_PARTITION}:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly"

aws iam attach-role-policy --role-name "KarpenterNodeRole-${CLUSTER_NAME}" \
    --policy-arn "arn:${AWS_PARTITION}:iam::aws:policy/AmazonSSMManagedInstanceCore"
```



### #5 - Authorize the node role to join the cluster

**This is the step that breaks most often on existing clusters.** `eksctl create iamidentitymapping` only works against the legacy `aws-auth` ConfigMap. Since EKS added **access entries**, most clusters created or upgraded in the last couple of years default to `API` or `API_AND_CONFIG_MAP` authentication mode — and on `API`-only clusters, ConfigMap-based mapping fails outright. Check the mode first, then use the matching command:



```bash
AUTH_MODE=$(aws eks describe-cluster --name "${CLUSTER_NAME}" \
    --query "cluster.accessConfig.authenticationMode" --output text)
echo "Authentication mode: ${AUTH_MODE}"

if [ "${AUTH_MODE}" = "CONFIG_MAP" ]; then
  # Legacy clusters only
  eksctl create iamidentitymapping \
    --cluster "${CLUSTER_NAME}" \
    --region "${AWS_REGION}" \
    --arn "arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:role/KarpenterNodeRole-${CLUSTER_NAME}" \
    --username system:node:{{EC2PrivateDNSName}} \
    --group system:bootstrappers \
    --group system:nodes
else
  # API or API_AND_CONFIG_MAP (current default) — use an access entry instead.
  # EC2_LINUX is a special node type: it wires up bootstrap auth automatically,
  # no access policy association needed.
  aws eks create-access-entry \
    --cluster-name "${CLUSTER_NAME}" \
    --principal-arn "arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:role/KarpenterNodeRole-${CLUSTER_NAME}" \
    --type EC2_LINUX
fi
```



If you get `ResourceInUseException: The specified access entry already exists`, the role is already authorized — safe to ignore.

### #6 - Create Karpenter controller IAM role

The controller uses IRSA to launch and terminate instances.



```bash
cat << EOF > controller-trust-policy.json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:oidc-provider/${OIDC_ENDPOINT#*//}"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "${OIDC_ENDPOINT#*//}:aud": "sts.amazonaws.com",
                    "${OIDC_ENDPOINT#*//}:sub": "system:serviceaccount:${KARPENTER_NAMESPACE}:karpenter"
                }
            }
        }
    ]
}
EOF

aws iam create-role --role-name "KarpenterControllerRole-${CLUSTER_NAME}" \
    --assume-role-policy-document file://controller-trust-policy.json

cat << EOF > controller-policy.json
{
    "Statement": [
        {
            "Action": [
                "ssm:GetParameter",
                "ec2:DescribeImages",
                "ec2:RunInstances",
                "ec2:DescribeSubnets",
                "ec2:DescribeSecurityGroups",
                "ec2:DescribeLaunchTemplates",
                "ec2:DescribeInstances",
                "ec2:DescribeInstanceTypes",
                "ec2:DescribeInstanceTypeOfferings",
                "ec2:DeleteLaunchTemplate",
                "ec2:CreateTags",
                "ec2:CreateLaunchTemplate",
                "ec2:CreateFleet",
                "ec2:DescribeSpotPriceHistory",
                "pricing:GetProducts"
            ],
            "Effect": "Allow",
            "Resource": "*",
            "Sid": "Karpenter"
        },
        {
            "Action": "ec2:TerminateInstances",
            "Condition": {
                "StringLike": {
                    "ec2:ResourceTag/karpenter.sh/nodepool": "*"
                }
            },
            "Effect": "Allow",
            "Resource": "*",
            "Sid": "ConditionalEC2Termination"
        },
        {
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": "arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:role/KarpenterNodeRole-${CLUSTER_NAME}",
            "Sid": "PassNodeIAMRole"
        },
        {
            "Effect": "Allow",
            "Action": "eks:DescribeCluster",
            "Resource": "arn:${AWS_PARTITION}:eks:${AWS_REGION}:${AWS_ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
            "Sid": "EKSClusterEndpointLookup"
        },
        {
            "Sid": "AllowScopedInstanceProfileCreationActions",
            "Effect": "Allow",
            "Resource": "*",
            "Action": [
                "iam:CreateInstanceProfile"
            ],
            "Condition": {
                "StringEquals": {
                    "aws:RequestTag/kubernetes.io/cluster/${CLUSTER_NAME}": "owned",
                    "aws:RequestTag/topology.kubernetes.io/region": "${AWS_REGION}"
                },
                "StringLike": {
                    "aws:RequestTag/karpenter.k8s.aws/ec2nodeclass": "*"
                }
            }
        },
        {
            "Sid": "AllowScopedInstanceProfileTagActions",
            "Effect": "Allow",
            "Resource": "*",
            "Action": [
                "iam:TagInstanceProfile"
            ],
            "Condition": {
                "StringEquals": {
                    "aws:ResourceTag/kubernetes.io/cluster/${CLUSTER_NAME}": "owned",
                    "aws:ResourceTag/topology.kubernetes.io/region": "${AWS_REGION}",
                    "aws:RequestTag/kubernetes.io/cluster/${CLUSTER_NAME}": "owned",
                    "aws:RequestTag/topology.kubernetes.io/region": "${AWS_REGION}"
                },
                "StringLike": {
                    "aws:ResourceTag/karpenter.k8s.aws/ec2nodeclass": "*",
                    "aws:RequestTag/karpenter.k8s.aws/ec2nodeclass": "*"
                }
            }
        },
        {
            "Sid": "AllowScopedInstanceProfileActions",
            "Effect": "Allow",
            "Resource": "*",
            "Action": [
                "iam:AddRoleToInstanceProfile",
                "iam:RemoveRoleFromInstanceProfile",
                "iam:DeleteInstanceProfile"
            ],
            "Condition": {
                "StringEquals": {
                    "aws:ResourceTag/kubernetes.io/cluster/${CLUSTER_NAME}": "owned",
                    "aws:ResourceTag/topology.kubernetes.io/region": "${AWS_REGION}"
                },
                "StringLike": {
                    "aws:ResourceTag/karpenter.k8s.aws/ec2nodeclass": "*"
                }
            }
        },
        {
            "Sid": "AllowInstanceProfileReadActions",
            "Effect": "Allow",
            "Resource": "*",
            "Action": "iam:GetInstanceProfile"
        },
        {
            "Sid": "AllowUnscopedInstanceProfileListAction",
            "Effect": "Allow",
            "Resource": "*",
            "Action": "iam:ListInstanceProfiles"
        }
    ],
    "Version": "2012-10-17"
}
EOF

aws iam put-role-policy --role-name "KarpenterControllerRole-${CLUSTER_NAME}" \
    --policy-name "KarpenterControllerPolicy-${CLUSTER_NAME}" \
    --policy-document file://controller-policy.json

export KARPENTER_IAM_ROLE_ARN="arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:role/KarpenterControllerRole-${CLUSTER_NAME}"
```

> PowerShell users: build these two JSON policy documents the same way as the trust policy in step #4 (a `@'...'@` here-string piped to `Set-Content`), then run the equivalent `aws iam` commands with ``` line continuations and `$env:` variables as in the other PowerShell blocks.



### #7 - Tag subnets and security groups

Karpenter discovers networking resources using the `karpenter.sh/discovery` tag. On an existing cluster, tag the subnets an existing node group already uses (not every subnet in the VPC) and the cluster's shared security group:

```bash
# Subnets used by an existing managed node group
NODEGROUP=$(aws eks list-nodegroups --cluster-name "${CLUSTER_NAME}" --query "nodegroups[0]" --output text)
SUBNET_IDS=$(aws eks describe-nodegroup --cluster-name "${CLUSTER_NAME}" --nodegroup-name "${NODEGROUP}" --query "nodegroup.subnets" --output text)

# Cluster security group (shared by the control plane and, usually, nodes)
SECURITY_GROUP_ID=$(aws eks describe-cluster --name "${CLUSTER_NAME}" --query "cluster.resourcesVpcConfig.clusterSecurityGroupId" --output text)

aws ec2 create-tags --resources ${SUBNET_IDS} --tags Key=karpenter.sh/discovery,Value="${CLUSTER_NAME}"
aws ec2 create-tags --resources "${SECURITY_GROUP_ID}" --tags Key=karpenter.sh/discovery,Value="${CLUSTER_NAME}"
```



Don't use a Fargate-only cluster or a custom node group with a different security group without adjusting this. To see all candidate subnets/security groups in the VPC instead of relying on an existing node group:

> Make sure that the additional security allow the inbound from EKS security for worker-node 
>
> **IMP**: Use eks default security group only ( It will cause CoreDNS issue - traffic from additional sg must be allowed on eks-default on port 53 )

```bash
aws ec2 authorize-security-group-ingress \
   --group-id <additional-sg> \
   --protocol tcp \
   --port 443 \
   --source-group <eks-default-sg>
```

**Inspect and list subnets and security groups**

```bash
aws ec2 describe-subnets --query "Subnets[*].[SubnetId,VpcId,CidrBlock,Tags[?Key=='Name'].Value | [0]]" --output table
aws ec2 describe-security-groups --query "SecurityGroups[*].[GroupId, GroupName, VpcId, Description]" --output json
```

### #8 - Create interruption queue (optional)

> Skip this if you don't use spot instances or interruption handling. Recommended for production spot workloads.

Spot and scheduled-event handling requires an SQS queue named `${CLUSTER_NAME}`. Deploy the official CloudFormation template to create it:

```bash
curl -fsSL "https://raw.githubusercontent.com/aws/karpenter-provider-aws/v${KARPENTER_VERSION}/website/content/en/preview/getting-started/getting-started-with-karpenter/cloudformation.yaml" > karpenter-cf.yaml

aws cloudformation deploy \
  --stack-name "Karpenter-${CLUSTER_NAME}" \
  --template-file karpenter-cf.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "ClusterName=${CLUSTER_NAME}"
```



### #9 - Render the Karpenter manifest

`helm template` against the OCI registry prints `Pulled:` / `Digest:` lines ahead of the YAML, which corrupts `karpenter.yaml` if left in — strip them before writing the file:

```bash
helm registry logout public.ecr.aws

helm template karpenter oci://public.ecr.aws/karpenter/karpenter \
  --version "${KARPENTER_VERSION}" \
  --namespace "${KARPENTER_NAMESPACE}" \
  --set "settings.clusterName=${CLUSTER_NAME}" \
  --set "settings.interruptionQueue=${CLUSTER_NAME}" \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=${KARPENTER_IAM_ROLE_ARN}" \
  --set controller.resources.requests.cpu=1 \
  --set controller.resources.requests.memory=1Gi \
  --set controller.resources.limits.cpu=1 \
  --set controller.resources.limits.memory=1Gi \
  | sed '1,2{/^\(Pulled:\|Digest:\)/d;}' > karpenter.yaml
```



If `kubectl apply -f karpenter.yaml` ever fails with a YAML parse error, open the file and check the first couple of lines for leftover `Pulled:`/`Digest:` text.

#### #9.1 - Pin Karpenter to an existing managed node group (optional)

Schedule the controller on your existing node group so it starts before Karpenter provisions any nodes.



```bash
aws eks list-nodegroups --cluster-name "${CLUSTER_NAME}" --region "${AWS_REGION}"
```

Edit `karpenter.yaml` and set `${NODEGROUP}` to a node group from the command above:

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        - key: karpenter.sh/nodepool
          operator: DoesNotExist
        - key: eks.amazonaws.com/nodegroup
          operator: In
          values:
          - ${NODEGROUP}
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      - topologyKey: "kubernetes.io/hostname"
```



### #10 - Deploy CRDs

```bash
kubectl create namespace "${KARPENTER_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f \
    "https://raw.githubusercontent.com/aws/karpenter-provider-aws/v${KARPENTER_VERSION}/pkg/apis/crds/karpenter.sh_nodepools.yaml"
kubectl apply -f \
    "https://raw.githubusercontent.com/aws/karpenter-provider-aws/v${KARPENTER_VERSION}/pkg/apis/crds/karpenter.k8s.aws_ec2nodeclasses.yaml"
kubectl apply -f \
    "https://raw.githubusercontent.com/aws/karpenter-provider-aws/v${KARPENTER_VERSION}/pkg/apis/crds/karpenter.sh_nodeclaims.yaml"
```



### #11 - Apply Karpenter

```bash
kubectl apply -f karpenter.yaml
```



### #12 - Create default NodePool

```bash
cat <<EOF | envsubst | kubectl apply -f -
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: kubernetes.io/os
          operator: In
          values: ["linux"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot"]
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["c", "m", "r"]
        - key: karpenter.k8s.aws/instance-generation
          operator: Gt
          values: ["2"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
      expireAfter: 720h
  limits:
    cpu: 1000
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 1m
---
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: default
spec:
  role: "KarpenterNodeRole-${CLUSTER_NAME}"
  amiSelectorTerms:
    - alias: "al2023@${ALIAS_VERSION}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: "${CLUSTER_NAME}"
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: "${CLUSTER_NAME}"
EOF
```



### #13 - Verify (optional)

Confirm Karpenter is healthy and can provision nodes:

```bash
kubectl rollout status deployment/karpenter -n "${KARPENTER_NAMESPACE}"
kubectl get nodepools,ec2nodeclasses
```

Deploy a test workload to confirm node provisioning:

```bash
kubectl create deployment inflate --image=public.ecr.aws/eks-distro/kubernetes/pause:3.9
kubectl scale deployment inflate --replicas=3
kubectl get nodes -l karpenter.sh/nodepool
```

Clean up the test workload once you've confirmed nodes came up:

```bash
kubectl delete deployment inflate
```



## Troubleshooting

```bash
# Check controller pod status
kubectl get pods -n kube-system -l app.kubernetes.io/name=karpenter

# Read controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=karpenter -c controller --tail=100

# List Karpenter resources
kubectl get nodepools,ec2nodeclasses,nodeclaims

# Inspect NodePool configuration
kubectl describe nodepool default

# Inspect a failed NodeClaim (replace <name> with one from the previous command)
kubectl describe nodeclaim <name>

# Review recent scheduling events
kubectl get events -A --sort-by='.lastTimestamp' | grep -i karpenter

# Confirm subnet discovery tags
aws ec2 describe-subnets --filters "Name=tag:karpenter.sh/discovery,Values=${CLUSTER_NAME}" --query 'Subnets[*].SubnetId' --output table

# Confirm node role is authorized to join (access-entry clusters)
aws eks list-access-entries --cluster-name "${CLUSTER_NAME}"

# Fix Helm OCI authentication errors
helm registry logout public.ecr.aws

# Restart the controller after a config change
kubectl rollout restart deployment karpenter -n kube-system
```



## NodeClaim

```bash
kubectl get nodeclaim -w
kubectl delete nodeclaim default-nj5tj
```



## Update the Kubeconfig for Scaling

```bash
aws eks describe-nodegroup \
  --cluster-name lab-cluster \
  --nodegroup-name lab-nodes \
  --query 'nodegroup.scalingConfig'


aws eks update-nodegroup-config \
  --cluster-name lab-cluster \
  --nodegroup-name lab-nodes \
  --scaling-config minSize=2,maxSize=8,desiredSize=2
```



## VPC private endpoints

If the cluster's nodes run in private subnets with no NAT gateway, create interface endpoints for the services Karpenter and the nodes need:


| Service                          | Purpose                                     |
| -------------------------------- | ------------------------------------------- |
| `com.amazonaws.<region>.ec2`     | EC2 API calls (launch/terminate instances)  |
| `com.amazonaws.<region>.ecr.api` | Container image pulls (auth)                |
| `com.amazonaws.<region>.ecr.dkr` | Container image pulls (layers)              |
| `com.amazonaws.<region>.s3`      | Pulling container images (gateway endpoint) |
| `com.amazonaws.<region>.sts`     | IAM roles for service accounts              |
| `com.amazonaws.<region>.ssm`     | Resolving default AMIs                      |
| `com.amazonaws.<region>.sqs`     | Interruption handling (if enabled)          |
| `com.amazonaws.<region>.eks`     | Karpenter discovering the cluster endpoint  |


```bash
aws ec2 create-vpc-endpoint --vpc-id "${VPC_ID}" --service-name "${SERVICE_NAME}" \
  --vpc-endpoint-type Interface --subnet-ids ${SUBNET_IDS} --security-group-ids "${SECURITY_GROUP_ID}"
```

