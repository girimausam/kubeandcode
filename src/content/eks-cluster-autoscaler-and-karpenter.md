---
title: "EKS Cluster Autoscaler and Karpenter"
description: "When pods are pending, who adds nodes: Cluster Autoscaler on managed node groups versus Karpenter NodePools. IAM, tags, interruption queue, and how not to run both on the same capacity."
tags:
  - eks
  - cluster-autoscaler
  - karpenter
  - autoscaling
  - ec2
  - iam
---

# EKS Cluster Autoscaler and Karpenter

Horizontal Pod Autoscaler changes the **number of pods**. It does not create EC2 instances. When a pod stays `Pending` with `0/3 nodes are available: Insufficient cpu`, something else must add a node.

Two controllers do that on EKS:

| | Cluster Autoscaler | Karpenter |
| --- | --- | --- |
| What it changes | `DesiredCapacity` on an **Auto Scaling group** you already created | Calls **RunInstances**. No ASG for the workload nodes |
| Node shape | Whatever the ASG launch template already is | Picks instance type, AZ, and capacity (on-demand or spot) per pod |
| Speed | Minutes (ASG lifecycle) | Often under a minute |
| Scale to zero | ASG min size 0, with caveats | NodePool `limits` and consolidation. A system pool must remain for the controller |
| Install | Deployment in the cluster | Controller in the cluster plus SQS interruption queue |

Use **one** of them for a given set of nodes. If both watch the same pending pods, you get two nodes for one pod.

**Helm-level Karpenter commands** are in [Install Karpenter on EKS](./eks-karpenter-install.md). This post is the design, the IAM, and the settings that decide whether scale-up works.

---

## Scenario

Cluster `payments-prod` in `us-east-1`. Two workloads:

- `coredns`, Karpenter or Cluster Autoscaler, and the AWS Load Balancer Controller must always have a place to run.
- `api` pods burst at lunch. Each pod requests `500m` CPU and `1Gi` memory. HPA scales pods from 2 to 20. Nodes must follow.

Pattern that stays supportable:

1. One **managed node group** `system`, min 2, max 2, tainted `CriticalAddonsOnly=true:NoSchedule`. Cluster Autoscaler is **not** allowed to scale this group to zero. Karpenter is **not** allowed to disrupt it.
2. Workload capacity is either a second managed node group driven by **Cluster Autoscaler**, or a **Karpenter NodePool**. Not both.

HPA still exists on `api`. Node scaling only reacts to pods that cannot schedule.

---

## Shared prerequisites

Console: **EKS** -> cluster `payments-prod`.

1. Kubernetes version noted. The Cluster Autoscaler image tag should match that minor version (`v1.31.x` autoscaler on cluster 1.31).
2. **OIDC provider** associated. Console: **Overview** -> OpenID Connect provider URL. If it is empty, IAM Roles for Service Accounts cannot work. Associate it before either controller.
3. Subnets used by nodes are **private**, tagged `kubernetes.io/cluster/payments-prod=shared` (EKS does this for subnets it knows). Karpenter also wants `karpenter.sh/discovery=payments-prod` on those subnets and on the node security group.
4. Pods show real requests. A pod with no CPU request does not drive either autoscaler in a useful way.

---

## Part A - Cluster Autoscaler

Cluster Autoscaler only understands **Auto Scaling groups**. On EKS those are the groups behind **managed node groups** or self-managed groups. It will not add Fargate capacity and it will not invent a new instance type.

### A1. Managed node group

Console: **EKS** -> **Compute** -> **Add node group**.

| Field | Workload group |
| --- | --- |
| Name | `api-ondemand` |
| Min / desired / max | `0` / `2` / `10` |
| Instance types | One family if you want predictable pods per node, for example `m6i.large` only. Mixed types in one group make bin-packing harder for CA |
| AMI | Amazon Linux 2023 EKS optimized |
| Subnets | Private, at least two AZs |
| Node IAM role | `AmazonEKSWorkerNodePolicy`, `AmazonEKS_CNI_Policy`, `AmazonEC2ContainerRegistryReadOnly` |

After the group is active, open the **Auto Scaling group** (link from the node group) -> **Tags**. These two tags are mandatory. EKS adds them for managed node groups. If someone created the ASG by hand, add them yourself:

| Key | Value |
| --- | --- |
| `k8s.io/cluster-autoscaler/enabled` | `true` |
| `k8s.io/cluster-autoscaler/payments-prod` | `owned` |

`owned` means this ASG belongs only to this cluster. Use `shared` only if you really share a group across clusters. The IAM policy below matches `owned`.

Also set ASG **instance scale-in protection** off. If every instance is protected, Cluster Autoscaler can scale out and never scale in.

### A2. IAM role for the controller

Console: **IAM** -> **Roles** -> **Create role** -> **Web identity**.

- Identity provider: the cluster OIDC provider.
- Audience: `sts.amazonaws.com`.
- Condition: `sub` = `system:serviceaccount:kube-system:cluster-autoscaler`.

Permissions policy (replace the cluster name in the tag condition):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "autoscaling:DescribeAutoScalingGroups",
        "autoscaling:DescribeAutoScalingInstances",
        "autoscaling:DescribeLaunchConfigurations",
        "autoscaling:DescribeScalingActivities",
        "autoscaling:DescribeTags",
        "ec2:DescribeImages",
        "ec2:DescribeInstanceTypes",
        "ec2:DescribeLaunchTemplateVersions",
        "ec2:GetInstanceTypesFromInstanceRequirements",
        "eks:DescribeNodegroup"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "autoscaling:SetDesiredCapacity",
        "autoscaling:TerminateInstanceInAutoScalingGroup"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/k8s.io/cluster-autoscaler/enabled": "true",
          "aws:ResourceTag/k8s.io/cluster-autoscaler/payments-prod": "owned"
        }
      }
    }
  ]
}
```

Without the tag condition, a typo in the autoscaler deployment can resize every ASG in the account.

### A3. Install the deployment

There is no EKS console add-on named Cluster Autoscaler in the standard add-on list. Install the upstream manifest and then set the role and flags.

```bash
curl -O https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml
```

Edit before apply:

- Image tag matches the cluster minor version, for example `registry.k8s.io/autoscaling/cluster-autoscaler:v1.31.2`.
- Command includes:
  - `--node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/payments-prod`
  - `--balance-similar-node-groups`
  - `--skip-nodes-with-local-storage=false` only if you accept evicting pods that use emptyDir
  - `--expander=least-waste`
- `ServiceAccount` annotation: `eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/cluster-autoscaler-payments-prod`
- Resources: requests `cpu: 100m`, `memory: 300Mi` so the system node can place it.
- Toleration for `CriticalAddonsOnly` if the only always-on nodes have that taint.

```bash
kubectl apply -f cluster-autoscaler-autodiscover.yaml
kubectl -n kube-system logs deploy/cluster-autoscaler | head
```

Healthy log line: it discovered ASG `eks-api-ondemand-...` and the min/max match the node group.

### A4. Prove scale-out and scale-in

```bash
kubectl create deploy inflate --image=public.ecr.aws/eks-distro/kubernetes/pause:3.5 \
  --replicas=0
kubectl set resources deploy inflate --requests=cpu=500m,memory=1Gi
kubectl scale deploy inflate --replicas=20
kubectl get pods -l app=inflate -o wide
kubectl -n kube-system logs deploy/cluster-autoscaler | grep -i scale
```

Expect new instances in the ASG, then pods leave `Pending`. Scale the deployment back to 0. Scale-in waits for `--scale-down-unneeded-time` (default 10 minutes) and respects PodDisruptionBudgets. A PDB of `minAvailable: 100%` means the node never drains.

### A5. Settings that look optional and are not

| Setting | Effect if wrong |
| --- | --- |
| ASG max size | CA cannot exceed it. HPA at 20 pods with max 2 nodes still pend |
| AZ rebalance on the ASG | ASG terminates a node CA just launched. Suspend `AZRebalance` on ASGs CA manages |
| Launch template tags versus ASG tags | Discovery uses **ASG** tags, not instance tags |
| `eks:DescribeNodegroup` denied | Managed node group discovery fails, log says it cannot find the group |
| Pods with a node selector the group does not have | CA does not scale that group. No error in the app. Log: "pod didn't trigger scale-up" |
| System pods on workload nodes without a PDB | Scale-in evicts CoreDNS if you did not pin it to the system group |

---

## Part B - Karpenter

Karpenter watches unschedulable pods and creates instances that match a **NodePool**. The controller must already be running on the system node group. Do not let Karpenter be the only thing that can create the node it itself runs on, or a bad NodePool consolidation loop removes the controller.

Version on this site's install notes: Karpenter **1.x** (`NodePool` and `EC2NodeClass`). Do not copy `Provisioner` or `AWSNodeTemplate` manifests. Those are the old beta API.

Full IAM, Helm, and discovery tagging commands: [Install Karpenter](./eks-karpenter-install.md). The pieces below are the ones that fail in real clusters.

### B1. What you create in AWS before Helm

| Object | Purpose |
| --- | --- |
| Node IAM role | Instance profile on instances Karpenter launches. Same three worker policies as a managed node group, plus `AmazonSSMManagedInstanceCore` if you want Session Manager |
| Controller IAM role | IRSA (or Pod Identity) for the Karpenter service account. Allows `ec2:RunInstances`, `CreateFleet`, `TerminateInstances`, PassRole to the **node** role, and scoped `iam:PassRole` |
| SQS queue `payments-prod` | Receives interruption events |
| EventBridge rules | Spot interruption, rebalance recommendation, instance state-change to shutting-down/terminated, AWS health scheduled change. Targets are that queue |
| Subnet and security group tags | `karpenter.sh/discovery=payments-prod` |

`iam:PassRole` must be limited to the node role. An unbounded PassRole is the mistake reviewers flag.

Interruption queue policy allows `events.amazonaws.com` and `sqs.amazonaws.com` to send messages. Karpenter's controller role needs `sqs:ReceiveMessage`, `DeleteMessage`, `GetQueueUrl` on that queue. Without the queue, on-demand still works. Spot nodes are not drained before AWS takes them, so jobs die mid-request.

### B2. EC2NodeClass and NodePool

After Helm is up:

```yaml
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: api
spec:
  role: KarpenterNodeRole-payments-prod
  amiSelectorTerms:
    - alias: al2023@latest
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: payments-prod
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: payments-prod
  metadataOptions:
    httpEndpoint: enabled
    httpTokens: required
    httpPutResponseHopLimit: 1
  blockDeviceMappings:
    - deviceName: /dev/xvda
      ebs:
        volumeSize: 40Gi
        volumeType: gp3
        encrypted: true
---
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: api
spec:
  template:
    spec:
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: api
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["on-demand"]
        - key: node.kubernetes.io/instance-type
          operator: In
          values: ["m6i.large", "m6i.xlarge"]
      expireAfter: 720h
  limits:
    cpu: "100"
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 5m
```

`httpTokens: required` is IMDSv2. `limits.cpu: "100"` is a budget so a runaway HPA cannot launch unbounded instances. `consolidateAfter` stops Karpenter from deleting a node in the same minute it created it.

Add a taint on the NodePool and a matching toleration on `api` if system pods must not land on these cheap or spot nodes.

### B3. Prove it

Same `inflate` deployment as in Part A, but **do not** leave Cluster Autoscaler managing an ASG that can also fit those pods.

```bash
kubectl get nodeclaims
kubectl get nodepools
kubectl -n kube-system logs deploy/karpenter | grep -i launched
```

`NodeClaim` should go to `Ready`, then a `Node` appears. If the claim stays at `Launching`, the controller log usually says subnet selector matched zero subnets or PassRole was denied.

### B4. Spot

Add `spot` to `karpenter.sh/capacity-type` only after the interruption queue is wired. Weight a second NodePool higher for on-demand if the API is latency sensitive, and keep spot for batch. Consolidation plus spot on a web API causes needless restarts.

---

## Running both without a fight

| Capacity | Controller |
| --- | --- |
| Managed node group `system` (min=max=2) | Neither. Fixed size |
| Managed node group `api-ondemand` | Cluster Autoscaler only. Karpenter NodePool must not select those nodes (no overlapping instance requirements that steal the same pending pods) |
| Karpenter NodePool `api` | Karpenter only. Set the workload ASG max to the same as min, or delete that group |

Practical choice for a new cluster: **system managed node group + Karpenter**. Keep Cluster Autoscaler only while older ASGs still exist, and taint those ASGs so new pods do not schedule there.

---

## HPA, VPA, and node scale

Order of events:

1. CPU rises. HPA adds pods.
2. Scheduler marks pods `Pending`.
3. Cluster Autoscaler or Karpenter adds nodes.
4. Kubelet registers. CNI attaches an IP. Pods bind.

If step 4 fails, the node joins and pods stay pending with `failed to assign an IP address`. That is the VPC CNI prefix or subnet free-IP problem, not the autoscaler. Check subnet free IPs before you raise ASG max.

VPA changes pod requests. It fights HPA if both manage the same resource metric. Do not put VPA and HPA on CPU for the same deployment.

---

## Mistakes

| Mistake | What you see |
| --- | --- |
| CA and Karpenter both eligible for the same pod | Two nodes, one pod, then scale-in churn |
| ASG tag cluster name typo | CA log: no node groups found |
| Karpenter on Fargate-only cluster | Controller never runs unless you also have a node |
| Spot with no SQS queue | Silent job loss at interruption |
| NodePool CPU limit smaller than one instance | Claim never launches |
| Missing discovery tag on the new subnet | Karpenter launches in the old subnets only, or nowhere |
| Scale-down blocked by a PDB | Nodes never leave. ASG desired stays high. Bill stays high |

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Pod Pending, no ASG activity | CA logs, ASG tags, max size, IAM `SetDesiredCapacity` deny in CloudTrail |
| Pod Pending, no NodeClaim | Karpenter logs, NodePool requirements versus pod nodeSelector |
| Node Ready, pod still Pending | Taints, affinity, CNI IP errors |
| Scale-up loop | Readiness probe failing, pod evicted, HPA keeps the replica count |
| Spot rebalance storm | Interruption queue depth, too-aggressive consolidation |

Docs: [Cluster Autoscaler on AWS](https://github.com/kubernetes/autoscaler/blob/master/cluster-autoscaler/cloudprovider/aws/README.md) · [EKS Cluster Autoscaler](https://docs.aws.amazon.com/eks/latest/userguide/autoscaling.html) · [Karpenter](https://karpenter.sh/docs/)

[<- Karpenter install commands](./eks-karpenter-install.md) · [<- EKS runbook](./eks-cluster-operations-runbook.md)
