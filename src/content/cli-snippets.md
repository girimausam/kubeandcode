---
title: "AWS and Kubernetes CLI Snippets"
description: "Quick-reference kubectl, eksctl, ECR, FSx, EBS, and VPC Flow Logs commands for EKS day-2 operations."
tags:
  - cli
  - kubectl
  - eksctl
  - eks
  - ecr
  - snippets
  - aws
---
## Purpose

Short command snippets only. Move long scripts or project-specific samples into dedicated pages.

## kubectl triage

```bash
kubectl get nodes -o wide
kubectl get pods -A
kubectl get svc -A
kubectl describe pod <pod>
kubectl logs deployment/<deployment> -f
kubectl get events -A --sort-by=.lastTimestamp
```

## EKS context

```bash
aws eks update-kubeconfig --region <region> --name <cluster>
kubectl config current-context
aws sts get-caller-identity
```

## eksctl cluster

```bash
eksctl create cluster \
  --name <cluster> \
  --region <region> \
  --nodegroup-name <nodegroup> \
  --node-type t3.medium \
  --nodes 2
```

## ECR login

```bash
aws ecr get-login-password --region <region> | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.<region>.amazonaws.com
```

## Cross-links

- [Kubernetes on AWS](/blog/kubernetes-on-aws) - EKS operations runbook
- [ShopSphere on Amazon EKS](/shopsphere-on-eks/) - full walkthrough with Pod Identity

## FSx and EBS setup

### Mount FSx ONTAP

> **Note:** Allow inbound NFS port 2049 from the EC2 security group on the FSx security group.

```bash
mkdir -p /mnt/fsx
sudo mount -t nfs -o nfsvers=4.1 <fsx-dns-name>:/vol1 /mnt/fsx
```

### Mount EBS

```bash
## Attach volume on device, e.g. /dev/sdf
lsblk

sudo mkfs.ext4 /dev/nvme1n1
sudo mkdir -p /mnt/ebs && sudo mount /dev/nvme1n1 /mnt/ebs
sudo chmod 777 /mnt/ebs
```

### Sync directories

```bash
sudo rsync -av /mnt/fsx/ /mnt/ebs/
```

See the [rsync guide](https://linuxize.com/post/how-to-use-rsync-for-local-and-remote-data-transfer-and-synchronization/) for options.

## DynamoDB capacity units

Quick reference. Full details: [AWS read/write capacity units](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html#read-write-capacity-units).

**Read capacity**

- 1 RCU = 1 strongly consistent read per second for items up to 4 KB
- 2 eventually consistent reads per second consume 1 RCU for items up to 4 KB
- Items larger than 4 KB: round up (item size / 4 KB) reads

**Write capacity**

- 1 WCU = 1 write per second for items up to 1 KB
- Items larger than 1 KB: round up (item size / 1 KB) writes

**Example (5 KB average item size)**

- Eventually consistent read: 1 RCU/s
- Strongly consistent read: 2 RCU/s
- Standard write: 5 WCU/s

## VPC Flow Logs

### Create log group and IAM role

```powershell
aws logs create-log-group --log-group-name "/aws/vpc/vpc-b-flowlogs"

$TrustPolicy = '{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"Service":"vpc-flow-logs.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
$RoleArn = aws iam create-role --role-name "VPCFlowLogsToCloudWatchRole" --assume-role-policy-document $TrustPolicy --query "Role.Arn" --output text

$PermissionsPolicy = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["logs:CreateLogStream","logs:PutLogEvents","logs:DescribeLogGroups","logs:DescribeLogStreams"],"Resource":"*"}]}'
aws iam put-role-policy --role-name "VPCFlowLogsToCloudWatchRole" --policy-name "VPCFlowLogsPolicy" --policy-document $PermissionsPolicy
```

### Create flow logs

```powershell
## CloudWatch Logs
aws ec2 create-flow-logs `
    --resource-type VPC `
    --resource-ids $VpcB `
    --traffic-type ALL `
    --log-destination-type cloudwatch-logs `
    --log-group-name "<cloudwatch-log-group-name>" `
    --deliver-logs-permission-arn $RoleArn `
    --max-aggregation-interval 60

## S3
aws ec2 create-flow-logs `
    --resource-type VPC `
    --resource-ids $VpcB `
    --traffic-type ALL `
    --log-destination-type s3 `
    --log-destination "arn:aws:s3:::<bucket-name>"
```

## Misc snippets

### Dockerfile (Tomcat on ECR public image)

```dockerfile
FROM public.ecr.aws/docker/library/tomcat:8.5.93-jdk8-corretto-al2
ADD ROOT.war /usr/local/tomcat/webapps/
EXPOSE 8080
CMD ["/usr/local/tomcat/bin/catalina.sh", "run"]
```

### SNS publish

```python
sns = boto3.client("sns")
sns.publish(
    TopicArn=SNS_TOPIC_ARN,
    Message=json.dumps(message),
    Subject="KMS Policy Change Proposed",
)
```