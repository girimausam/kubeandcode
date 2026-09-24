---
title: "Lab Notes: EventBridge, RDS, Backup, and JAM"
description: "Lab notes: RDS logs, EventBridge, Backup, SSM, EKS aws-auth from EC2, Gateway Load Balancer, Transit Gateway flow, and importing an externally signed certificate."
tags:
  - aws
  - labs
  - eventbridge
  - rds
  - cloudwatch
  - sqs
  - lambda
  - backup
  - jam
  - eks
  - transit-gateway
  - acm
date: 2026-09-24
---

## Cedar policy rules (AWS Amazon Verified Permissions)

Lab section for [Cedar](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/what-is-avp.html) policy syntax used with AWS Verified Permissions and similar services. Add policy examples from the lab here.

---

## RDS audit logs to CloudWatch

Publish MySQL/MariaDB logs from RDS to CloudWatch Logs.

1. Open the RDS instance in the console.
2. Under **Log exports**, choose which logs to publish (for example audit, error, general, slow query).

![RDS log exports](./images/rds-cloudwatch-log-exports.png)

Reference: [Publishing MySQL logs to CloudWatch](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_LogAccess.Procedural.UploadtoCloudWatch.html)

---

## Export CloudWatch Logs to S3

Create an export task from CloudWatch Logs to S3. The destination bucket needs a policy that allows the CloudWatch Logs service principal.

Reference: [Export log data to S3 (console)](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/S3ExportTasksConsole.html)

<details>
<summary>Bucket policy template</summary>

Replace bucket name, account IDs, Region, and log group ARN.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudWatchLogsGetBucketAcl",
      "Action": "s3:GetBucketAcl",
      "Effect": "Allow",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket",
      "Principal": { "Service": "logs.us-east-1.amazonaws.com" },
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": ["<ACCOUNT_ID>"]
        },
        "ArnLike": {
          "aws:SourceArn": [
            "arn:aws:logs:<REGION>:<ACCOUNT_ID>:log-group:/aws/rds/instance/<DB_INSTANCE>/audit:*"
          ]
        }
      }
    },
    {
      "Sid": "AllowCloudWatchLogsPutObject",
      "Action": "s3:PutObject",
      "Effect": "Allow",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/*",
      "Principal": { "Service": "logs.us-east-1.amazonaws.com" },
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control",
          "aws:SourceAccount": ["<ACCOUNT_ID>"]
        },
        "ArnLike": {
          "aws:SourceArn": [
            "arn:aws:logs:<REGION>:<ACCOUNT_ID>:log-group:/aws/rds/instance/<DB_INSTANCE>/audit:*"
          ]
        }
      }
    }
  ]
}
```

</details>

---

## DynamoDB stream to SQS (EventBridge Pipes)

Point-to-point pipe from DynamoDB streams to SQS without a custom poller Lambda.

![Serverless order fulfillment workflow (payment queue and Step Functions)](./images/serverless-order-fulfillment-workflow.png)

See also: [EventBridge notes](/aws-eventbridge-patterns/) for pipes, filters, and IAM.

---

## Notifications: EventBridge → FIFO SQS → Lambda

**Task checklist**

1. A FIFO queue exists with content-based deduplication enabled.
2. An EventBridge rule targets the FIFO queue with `MessageGroupId` set.
3. Lambda is triggered by the FIFO queue.
4. The old standard queue is not in the active pipeline.

```python
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

events_client = boto3.client("events")


def lambda_handler(event, context):
    for record in event.get("Records", []):
        body = json.loads(record["body"])
        detail = body.get("detail", {})
        match_id = detail.get("matchId", "unknown")
        users = detail.get("users", [])

        logger.info(f"MATCH! Processing notification for matchId={match_id}, users={users}")

        # BUG: detail-type is "matchCompleted" but downstream rule
        # rt-log-notification-sent expects "notificationSent"
        events_client.put_events(
            Entries=[{
                "Source": "redthread.notifications",
                "DetailType": "matchCompleted",
                "Detail": json.dumps({
                    "matchId": match_id,
                    "users": users,
                    "status": "sent",
                }),
            }]
        )

    return {"statusCode": 200}
```

**Fix:** align `DetailType` with the downstream rule (`notificationSent` if that is what the rule matches).

---

## EventBridge rules (`put-rule`)

References:

- [Create a rule](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-rule.html)
- [Event pattern operators](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-pattern-operators.html)
- [Pattern best practices](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-patterns-best-practices.html)

Custom event bus: `register-device-event-bus`

### Single-device registration

**Requirement:**

```json
{
  "registration-type": "single-device",
  "device-count": 1
}
```

- All the requests that are having `registration-type` starting with `single` **AND**
- The requests having `device-count` equals to `1`

**Rule:**

```json
{
  "detail": {
    "registration-type": [{ "prefix": { "equals-ignore-case": "single" } }],
    "device-count": [1]
  }
}
```

```bash
aws events put-rule \
  --name "eb-register-single-device-rule" \
  --event-bus-name "register-device-event-bus" \
  --event-pattern '{"detail":{"registration-type":[{"prefix":{"equals-ignore-case":"single"}}],"device-count":[1]}}'
```

### Bulk device - count 1–99 in any region, or any count in `eu-west-1`

**Requirement:**

```json
{
  "registration-type": "bulk-device",
  "device-count": 99,
  "region": "us-east-1"
}
```

**AND**

```json
{
  "registration-type": "bulk-device",
  "device-count": 100,
  "region": "eu-west-1"
}
```

- All requests that are having `registration-type` value starting with `bulk` **AND**
- The device-count value between `1 and 99` for `any region` **OR** the requests having region value `eu-west-1` (i.e., in case of eu-west-1 the `device-count` value can exceed 100)

**Rule:**

```json
{
  "detail": {
    "registration-type": [{ "prefix": { "equals-ignore-case": "bulk" } }],
    "$or": [
      { "device-count": [{ "numeric": [">=", 1, "<=", 99] }] },
      { "region": ["eu-west-1"] }
    ]
  }
}
```

```bash
aws events put-rule \
  --name "eb-register-bulk-device-rule" \
  --event-bus-name "register-device-event-bus" \
  --event-pattern '{"detail":{"registration-type":[{"prefix":{"equals-ignore-case":"bulk"}}],"$or":[{"device-count":[{"numeric":[">=",1,"<=",99]}]},{"region":["eu-west-1"]}]}}'
```

### Bulk device - count greater than 100 outside `eu-west-1`

**Requirement:**

```json
{
  "registration-type": "bulk-device",
  "device-count": 100,
  "region": "us-east-1"
}
```

**AND**

```json
{
  "registration-type": "bulk-device",
  "device-count": 100,
  "region": "ap-southeast-1"
}
```

- The requests having registration-type value starting with bulk
- The requests having device-count greater than 100 **AND** requests having region value other than eu-west-1

**Rule:**

```json
{
  "detail": {
    "registration-type": [{ "prefix": { "equals-ignore-case": "bulk" } }],
    "device-count": [{ "numeric": [">=", 100] }],
    "region": [{ "anything-but": "eu-west-1" }]
  }
}
```

```bash
aws events put-rule \
  --name "eb-register-bulk-device-with-priority-rule" \
  --event-bus-name "register-device-event-bus" \
  --event-pattern '{"detail":{"registration-type":[{"prefix":{"equals-ignore-case":"bulk"}}],"device-count":[{"numeric":[">=",100]}],"region":[{"anything-but":"eu-west-1"}]}}'
```

### Privileged customers → Lambda

**Requirement:**

```json
{
  "privileged": "true"
}
```

- Route the requests containing the `privileged` property to lambda function mentioned above

**Rule:**

```json
{
  "detail": {
    "privileged": ["true"]
  }
}
```

```bash
aws events put-rule \
  --name "eb-reward-privileged-customer-rule" \
  --event-bus-name "register-device-event-bus" \
  --event-pattern '{"detail":{"privileged":["true"]}}'
```

### Image URL validation

**Requirement:**

```json
{
  "image-url": "https://sampleurl.com/sample.png"
}
```

- The value for image-url should have a value **AND**
- The value for image-url property should end with `.png` / `.jpeg` / `.jpg` / `.gif`

**Rule:**

```json
{
  "detail": {
    "image-url": [
      { "suffix": ".png" },
      { "suffix": ".jpeg" },
      { "suffix": ".jpg" },
      { "suffix": ".gif" }
    ]
  }
}
```

```bash
aws events put-rule \
  --name "eb-save-image-rule" \
  --event-bus-name "register-device-event-bus" \
  --event-pattern '{"detail":{"image-url":[{"suffix":".png"},{"suffix":".jpeg"},{"suffix":".jpg"},{"suffix":".gif"}]}}'
```

---

## Backup and restore

### AWS Backup IAM policies

| Action | AWS managed policy |
| --- | --- |
| Backup | `AWSBackupServiceRolePolicyForBackup` |
| Restore | `AWSBackupServiceRolePolicyForRestores` |

### EventBridge target (auto-recover)

```bash
aws events put-targets \
  --rule "xyz-auto-recover-rule" \
  --targets "Id"="1","Arn"="arn:aws:lambda:<REGION>:<ACCOUNT_ID>:function:xyz-auto-recover"
```

### Flows (lab step numbers)

**Backup:** EC2 enters `running` → EventBridge Rule 1 → Backup Lambda → backup in vault  
`1 → 4 → 2 → 6`

**Restore:** EC2 terminated → EventBridge Rule 2 → Recover Lambda → retrieve from vault → new EC2  
`1 → 5 → 3 → 6 → 1`


---

## Windows / RDP and IMDS

Symptom: Windows instance cannot reach IMDS at `169.254.169.254`.

Gateway IP is the subnet default route for `0.0.0.0` in `route print`. Prefer [IMDSv2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html).

```powershell
route print
route DELETE 169.254.169.254
route -p ADD 169.254.169.254 MASK 255.255.255.255 <SUBNET_GATEWAY_IP>

iwr -Uri 'http://169.254.169.254/latest/meta-data/'

netsh winhttp reset proxy
W32tm /resync /force
Restart-Service AmazonSSMAgent
```

Always restart the SSM agent after network/proxy changes: `Restart-Service AmazonSSMAgent`.

---

## Systems Manager (SSM)

RDP down, SSM up (or SSM instead of RDP): agent on the AMI, instance role `AmazonSSMManagedInstanceCore`, outbound **TCP 443** via NAT or Interface endpoints.

SSM agent **offline**: missing role, no path to SSM APIs, no VPC endpoints on a private subnet, SG/NACL blocking 443.

| Need | What |
| --- | --- |
| Role | `AmazonSSMManagedInstanceCore` on the instance |
| Endpoints | `ssm`, `ec2messages`, `ssmmessages` in `com.amazonaws.<region>.*` |
| Endpoint SG | Inbound **443** from instance SG / VPC CIDR |
| Placement | Endpoints in the instance’s subnets (or routed to them) |

Template: [`dir/ssm-vpc-endpoint.yaml`](./dir/ssm-vpc-endpoint.yaml)

---

## CloudWatch Agent

Instance role: `CloudWatchAgentServerPolicy`. [IAM](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/create-iam-roles-for-cloudwatch-agent.html) · [Install](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/install-CloudWatch-Agent-on-EC2-Instance.html)

Linux (AL2 / yum):

```bash
sudo yum install amazon-cloudwatch-agent
cd /opt/aws/amazon-cloudwatch-agent/bin
sudo ./amazon-cloudwatch-agent-ctl -a start -m ec2 -c default -s
```

Windows: install from the same install doc; start the **Amazon CloudWatch Agent** service.

---

## ACM Private CA

CA chain (trust store):

```bash
aws acm-pca get-certificate-authority-certificate \
  --certificate-authority-arn arn:aws:acm-pca:<region>:<account-id>:certificate-authority/<ca-id> \
  --output text > ca_certificate.pem
```

Issued cert:

```bash
aws acm-pca get-certificate \
  --certificate-authority-arn "<CA_ARN>" \
  --certificate-arn "<CERT_ARN>" \
  --query 'Certificate' --output text > cert.pem
```

Chain for that cert: `--query 'CertificateChain'` → `cert_chain.pem`.

[get-certificate-authority-certificate](https://docs.aws.amazon.com/cli/latest/reference/acm-pca/get-certificate-authority-certificate.html) · [get-certificate](https://docs.aws.amazon.com/cli/latest/reference/acm-pca/get-certificate.html)

---

## AWS Config (Guard)

SG open to the world (`0.0.0.0/0` / `::/0`). Managed check for CodeBuild plaintext AWS creds in env: [`codebuild-project-envvar-awscred-check`](https://docs.aws.amazon.com/config/latest/developerguide/codebuild-project-envvar-awscred-check.html).

<details>
<summary>Guard rules (lab)</summary>

```guard
rule check_ip_protocol_and_port_range_validity
{
    let any_ip_permissions = this.configuration.ipPermissions[
        some ipv4Ranges[*].cidrIp == "0.0.0.0/0" or
        some ipv6Ranges[*].cidrIpv6 == "::/0"
        ipProtocol != "udp"
    ]

    when %any_ip_permissions !empty
    {
        %any_ip_permissions {
            this.ipProtocol != "-1"
            this.InputParameters.TcpBlockedPorts[*] {
                this.fromPort > this or
                this.toPort < this
                <<
                    result: NON_COMPLIANT
                    message: Blocked TCP port was allowed in range
                >>
            }
        }
    }
}

rule ipv4_unrestricted_inbound when this.configuration.ipPermissions[*].ipv4Ranges !empty {
    this.configuration.ipPermissions[*].ipv4Ranges[*].cidrIp != "0.0.0.0/0"
    <<
        result: NON_COMPLIANT
        message: IPv4 Source address cannot be 0.0.0.0/0
    >>
}

rule ipv6_unrestricted_inbound when this.configuration.ipPermissions[*].ipv6Ranges !empty {
    this.configuration.ipPermissions[*].ipv6Ranges[*].cidrIpv6 != "::/0"
    <<
        result: NON_COMPLIANT
        message: IPv6 Source address cannot be ::/0
    >>
}
```

</details>

---

## Traffic mirroring

VXLAN to the target: target SG inbound **UDP 4789**. Session Manager → monitor host:

```bash
sudo tcpdump -lnvX icmp
```

---

## KMS grant (CodeBuild)

```bash
aws kms create-grant \
  --key-id KEY_ARN \
  --grantee-principal arn:aws:iam::ACCOUNT_ID:role/locksmith-codebuild-role \
  --operations Decrypt GenerateDataKey \
  --name locksmith-codebuild-s3-access \
  --region us-east-1
```

---

## DynamoDB (boto3)

```python
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeDeserializer

d = TypeDeserializer()
item = {k: d.deserialize(value=v) for k, v in raw.items()}

results = dynamo_table.query(KeyConditionExpression=Key("CustID").eq(cust_id))
row = results["Items"][0] if results["Items"] else None

dynamo_table.put_item(Item=cust_profile)
```

---

## FSx ONTAP and EBS

FSx SG: inbound **NFS 2049** from the EC2 SG.

```bash
sudo mkdir -p /mnt/fsx
sudo mount -t nfs -o nfsvers=4.1 <fsx-dns-name>:/vol1 /mnt/fsx
```

EBS: attach volume, `lsblk` for the device (often `/dev/nvme1n1`, not `/dev/sdf`). `mkfs` **wipes** the volume.

```bash
lsblk
sudo mkfs.ext4 /dev/nvme1n1
sudo mkdir -p /mnt/ebs
sudo mount /dev/nvme1n1 /mnt/ebs
```

Copy FSx → EBS: `sudo rsync -av /mnt/fsx/ /mnt/ebs/`

---

## Redshift COPY (JSON)

[COPY JSON examples (`auto ignorecase`)](https://docs.aws.amazon.com/redshift/latest/dg/r_COPY_command_examples.html#copy-from-json-examples-using-auto-ignorecase)

---

## Jam EKS (`app` ns)

Cluster: `jam-eks-cluster`. Four breaks. DNS ok ≠ traffic ok ≠ IAM ok.

### 1. Frontend CrashLoop → bad `DATABASE_HOST`

Cause: env `DATABASE_HOST=wrong-db-host` → hostname no resolve → exit 1.

```bash
kubectl set env deployment/frontend-app DATABASE_HOST=database-service -n app
kubectl rollout status deployment/frontend-app -n app
```

### 2. Service 0 endpoints → selector mismatch

Cause: Service `backend-api-svc` selector `app: backend`. Pods = `app: backend-api`.

```bash
kubectl patch svc backend-api-svc -n app --type=json \
  -p='[{"op":"replace","path":"/spec/selector","value":{"app":"backend-api"}}]'
kubectl get endpoints backend-api-svc -n app
```

Expect: pod IPs under `ENDPOINTS`.

### 3. DNS ok, wget hang → NetworkPolicy

Cause: `backend-network-policy` on `app: backend-api`. Ingress only from `app: admin-panel`. Frontend = `app: frontend` → drop.

```bash
kubectl patch networkpolicy backend-network-policy -n app --type=json \
  -p='[{"op":"add","path":"/spec/ingress/1","value":{"from":[{"podSelector":{"matchLabels":{"app":"frontend"}}}],"ports":[{"port":8080,"protocol":"TCP"}]}}]'

FE=$(kubectl get pod -n app -l app=frontend -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n app "$FE" -- wget -T 5 -qO- http://backend-api-svc.app.svc.cluster.local:8080
```

Expect: `catalog: 42 products ready`.

### 4. S3 `AccessDenied` → IRSA `sub` wrong SA

Cause: role `jam-eks-backend-pod-role` trust `sub` = `system:serviceaccount:app:backend`. Pods use SA `backend-api`. STS no match.

```bash
aws eks describe-cluster --name jam-eks-cluster --query "cluster.identity.oidc.issuer" --output text
```

```bash
aws iam update-assume-role-policy \
  --role-name jam-eks-backend-pod-role \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/oidc.eks.<REGION>.amazonaws.com/id/<OIDC_ID>"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
          "StringEquals": {
            "oidc.eks.<REGION>.amazonaws.com/id/<OIDC_ID>:aud": "sts.amazonaws.com",
            "oidc.eks.<REGION>.amazonaws.com/id/<OIDC_ID>:sub": "system:serviceaccount:app:backend-api"
          }
        }
      }
    ]
  }'
```

No restart. Config-loader retry ~30s.

```bash
kubectl logs -n app -l app=backend-api --tail=20
```

Expect: `[config-loader] SUCCESS`.

---

## EKS access for another user, from EC2 (`aws-auth`)

You are on an EC2 instance that can already run `kubectl`. Another IAM user, or another instance role, gets API access by a mapping in `kube-system/aws-auth`. The mapping is the permission. An IAM policy alone is not enough.

On the EC2 that already works:

```bash
aws sts get-caller-identity
aws eks update-kubeconfig --name jam-eks-cluster --region us-east-1
aws eks describe-cluster --name jam-eks-cluster \
  --query "cluster.accessConfig.authenticationMode" --output text
kubectl get configmap aws-auth -n kube-system -o yaml
```

`CONFIG_MAP` and `API_AND_CONFIG_MAP` honor this ConfigMap. `API` ignores it. On `API`, stop here and create an access entry instead (commands at the bottom of this section).

Save the ConfigMap, then add a block. Do not delete the existing node role (`system:nodes` / `system:bootstrappers`). Deleting it sets every node to `NotReady`.

The value under `rolearn` is the **IAM role ARN** (`arn:aws:iam::ACCOUNT:role/NAME`). It is not the instance profile ARN, and it is not the `assumed-role/.../i-...` ARN from `get-caller-identity`.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapRoles: |
    - rolearn: arn:aws:iam::111122223333:role/eks-node-role
      username: system:node:{{EC2PrivateDNSName}}
      groups:
        - system:bootstrappers
        - system:nodes
    - rolearn: arn:aws:iam::111122223333:role/lab-other-ec2-role
      username: lab-other-ec2
      groups:
        - lab-viewers
  mapUsers: |
    - userarn: arn:aws:iam::111122223333:user/lab-user
      username: lab-user
      groups:
        - lab-viewers
```

```bash
kubectl apply -f aws-auth.yaml
kubectl get configmap aws-auth -n kube-system -o yaml
```

`system:masters` is cluster-admin. Fine for a lab. For anyone else, use a group you actually bind:

```bash
kubectl create clusterrolebinding lab-viewers \
  --clusterrole=view --group=lab-viewers
```

The other identity still needs IAM that can read the cluster endpoint, then a kubeconfig on **their** EC2 (the instance role must be the one you mapped):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["eks:DescribeCluster"],
      "Resource": "arn:aws:eks:us-east-1:111122223333:cluster/jam-eks-cluster"
    }
  ]
}
```

```bash
aws sts get-caller-identity
aws eks update-kubeconfig --name jam-eks-cluster --region us-east-1
kubectl auth can-i get pods -A
kubectl get ns
```

That second EC2 must reach the API on TCP 443. Private-only endpoint: the instance has to sit in the cluster VPC (or a peered/TGW network that can route to it). Public endpoint: its public IP has to be in the endpoint allow list.

| Symptom | What is wrong |
| --- | --- |
| `Unauthorized` / "You must be logged in to the server" | ARN missing, instance-profile ARN used instead of role ARN, or YAML indent broke `mapRoles` so the new block never parsed |
| `Forbidden` | Mapping worked. RBAC did not. The group has no RoleBinding or ClusterRoleBinding |
| `configmaps "aws-auth" not found` | Authentication mode is `API`. ConfigMap edits do nothing |
| `AccessDenied` on `update-kubeconfig` | Instance role is missing `eks:DescribeCluster` |
| Timeout on 443 | Private endpoint, or public endpoint CIDR does not include this EC2 |
| Nodes `NotReady` right after the edit | The node role block was removed or the `username` lost `{{EC2PrivateDNSName}}` |
| SSO user still denied | `mapRoles` needs the reserved SSO role ARN (`aws-reserved/sso.amazonaws.com/...`), not the permission-set name |

Access entry when the mode is `API` (or when you do not want to keep using the ConfigMap):

```bash
aws eks create-access-entry \
  --cluster-name jam-eks-cluster \
  --principal-arn arn:aws:iam::111122223333:role/lab-other-ec2-role \
  --type STANDARD

aws eks associate-access-policy \
  --cluster-name jam-eks-cluster \
  --principal-arn arn:aws:iam::111122223333:role/lab-other-ec2-role \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy \
  --access-scope type=cluster
```

---

## Gateway Load Balancer

A Gateway Load Balancer (GWLB) sits in front of a firewall or IDS fleet. The consumer subnet route points at a **GWLB endpoint** (`vpce-`). The load balancer wraps the packet in GENEVE and sends it to the appliance on **UDP 6081**. The appliance must send the packet back out the same tunnel. Small pings can work while real traffic fails, so test both.

```bash
aws elbv2 describe-load-balancers \
  --query "LoadBalancers[?Type=='gateway'].[LoadBalancerName,LoadBalancerArn,State.Code,AvailabilityZones[].ZoneName]" \
  --output table

aws elbv2 describe-target-groups \
  --query "TargetGroups[?Protocol=='GENEVE'].[TargetGroupName,TargetGroupArn,Protocol,Port,HealthCheckProtocol,HealthCheckPort]" \
  --output table

aws elbv2 describe-target-health --target-group-arn TARGET_GROUP_ARN
```

| Check | Expected |
| --- | --- |
| Target group | Protocol `GENEVE`, port `6081` |
| Health check | TCP, HTTP, or HTTPS on the port the appliance actually listens on. Health is not GENEVE |
| Appliance SG | Inbound UDP 6081 from the GWLB subnet CIDR, plus the health-check port |
| Source/dest check | **Disabled** on each appliance instance. On, the instance drops packets that are not addressed to it |
| Consumer route | The CIDR you want inspected (often `0.0.0.0/0`, or a spoke CIDR) targets the endpoint `vpce-`, in the route table of the subnet where traffic enters |
| Return route | The other direction also targets a GWLB endpoint. One-way inspection blackholes the flow |
| Endpoint state | `available`, and the endpoint service is the GWLB service |
| AZs | An appliance in the same AZ as the endpoint, or cross-zone load balancing turned on |
| MTU | GENEVE adds overhead. Ping works, a large download stalls: lower the client MTU (8500 is the usual starting point) or allow jumbo frames on the appliance |

```bash
aws ec2 describe-instances --instance-ids i-appliance \
  --query "Reservations[].Instances[].SourceDestCheck"

aws ec2 describe-vpc-endpoints \
  --filters Name=vpc-endpoint-type,Values=GatewayLoadBalancer \
  --query "VpcEndpoints[].[VpcEndpointId,State,ServiceName,SubnetIds]" \
  --output table

aws ec2 describe-route-tables \
  --filters Name=route.gateway-id,Values=vpce-ENDPOINT_ID \
  --query "RouteTables[].Routes"
```

Flow logs on the consumer subnet, the endpoint subnet, and the appliance subnet. You want `ACCEPT` toward the endpoint, then UDP 6081 between the GWLB and the appliance, then `ACCEPT` toward the real destination. `REJECT` on 6081 is the security group or the NACL. Targets `unhealthy` with no 6081 packets means the health-check port, not GENEVE.

---

## Transit Gateway and the network path

A packet crosses a Transit Gateway only when **both** VPC route tables and the **TGW** route table agree. Check them in that order before you touch security groups.

Spoke A `10.1.0.0/16` to spoke B `10.2.0.0/16`:

1. Instance subnet route table in A: `10.2.0.0/16` → `tgw-xxxxxxxx`.
2. Attachment A is **associated** with a TGW route table.
3. That TGW route table has `10.2.0.0/16` → attachment B, state `active` (not `blackhole`).
4. Same three checks in the reverse direction.
5. Destination security group allows the **source CIDR**. A security group ID from the other VPC is not a valid source across a TGW.
6. NACLs are stateless. Allow the return ephemeral range as well as the service port.

```bash
aws ec2 describe-transit-gateway-vpc-attachments \
  --filters Name=transit-gateway-id,Values=tgw-xxxxxxxx \
  --query "TransitGatewayVpcAttachments[].[TransitGatewayAttachmentId,VpcId,State,SubnetIds]" \
  --output table

aws ec2 get-transit-gateway-route-table-associations \
  --transit-gateway-route-table-id tgw-rtb-xxxxxxxx

aws ec2 get-transit-gateway-route-table-propagations \
  --transit-gateway-route-table-id tgw-rtb-xxxxxxxx

aws ec2 search-transit-gateway-routes \
  --transit-gateway-route-table-id tgw-rtb-xxxxxxxx \
  --filters Name=state,Values=active,blackhole
```

| Symptom | Where to look |
| --- | --- |
| `blackhole` on the TGW route | The attachment was deleted, is still `pending`, or was never accepted (shared TGW via Resource Access Manager) |
| Route exists on the TGW, instances still use the internet | The **subnet** route table has no route to the TGW, or a longer prefix points somewhere else. The main route table is not the one the subnet uses |
| One direction works | The return VPC or the return TGW route table has no route. Reply packets are a second lookup |
| Works inside one AZ, dies through a firewall VPC | Enable **appliance mode** on the inspection VPC attachment so the TGW keeps the flow in one AZ. Stateful appliances drop the other direction otherwise |
| Security group "looks open" and still rejects | The rule references a security group in the other VPC. Replace it with the spoke CIDR |
| DNS name resolves to a public IP, or does not resolve | The private hosted zone is not associated with the other VPC. `enableDnsSupport` and `enableDnsHostnames` must be on |
| Overlapping CIDRs | The TGW cannot pick a unique attachment. Renumber or use a more specific non-overlapping prefix |
| `0.0.0.0/0` on the spoke goes nowhere | The TGW default route is missing, blackholed, or points at an egress VPC whose NAT subnet does not route back to the spoke |

Flow logs: turn them on for the source ENI, the destination ENI, and the Transit Gateway itself.

- Source ENI `ACCEPT` toward the TGW, destination ENI no packet: the drop is inside the TGW (route, attachment, blackhole).
- Destination ENI `REJECT`: security group or NACL on the destination subnet.
- Destination ENI `ACCEPT` and the source never sees the reply: return route or appliance mode.

VPC Reachability Analyzer, path from the source ENI to the destination ENI, reports the first route or security group that drops it. Use that when the two route tables look right and the packet still dies.

---

## Externally signed certificate, and importing the CA

Two different imports get mixed up.

- A **server certificate** goes into ACM with its private key and the chain that signed it. ACM can then attach it to a load balancer.
- A **CA certificate** has no private key on your side. It goes into a trust store (the instance, a client VPN, or an ACM Private CA as the signer of a subordinate). Importing a CA into ACM with `import-certificate` fails because that API requires a private key.

### Server certificate signed outside AWS

On the instance, create the key and the request. The common name and every SAN must be the name clients type. Send **only** the CSR to the external CA.

```bash
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
  -subj "/CN=app.example.com" \
  -addext "subjectAltName=DNS:app.example.com"
```

When the CA returns the leaf and the chain, check them **before** calling ACM. The two MD5 lines must match. `openssl verify` must print `OK`.

```bash
openssl x509 -in server.crt -noout -subject -issuer -dates -ext subjectAltName
openssl x509 -noout -modulus -in server.crt | openssl md5
openssl rsa -noout -modulus -in server.key | openssl md5
openssl verify -CAfile ca-chain.pem server.crt
```

`ca-chain.pem` is intermediates first, root last. The leaf stays in `server.crt` and is **not** pasted into the chain file.

```bash
aws acm import-certificate \
  --certificate fileb://server.crt \
  --private-key fileb://server.key \
  --certificate-chain fileb://ca-chain.pem \
  --region us-east-1
```

Re-import onto the same ARN when you renew (same key algorithm). The load balancer keeps the ARN.

```bash
aws acm import-certificate \
  --certificate-arn arn:aws:acm:us-east-1:111122223333:certificate/CERT_ID \
  --certificate fileb://server.crt \
  --private-key fileb://server.key \
  --certificate-chain fileb://ca-chain.pem
```

The certificate has to live in the **same Region as the load balancer**. CloudFront only reads certificates from `us-east-1`.

| Symptom | Fix |
| --- | --- |
| Private key does not match the certificate | Wrong key file, or the CA issued a cert for a different CSR. The modulus check above catches this |
| Chain is not valid | Leaf was included in the chain, order is backwards, or an intermediate is missing. `openssl verify` must pass first |
| PEM parse error | DER file, or a Windows-edited file. `openssl x509 -inform DER -in cert.der -out server.crt` and `dos2unix server.crt` |
| Encrypted key rejected | `openssl rsa -in server.key -out server.key.unencrypted` and import that file |
| Import succeeds, browser still warns | SAN does not contain the hostname, the clock is wrong, or clients do not trust the external CA |
| `AccessDenied` | Caller is missing `acm:ImportCertificate` |
| Load balancer cannot see the cert | Imported in another Region |

Clients that do not already trust that CA need the CA certificate too, not the server private key:

```bash
sudo cp ca-certificate.pem /etc/pki/ca-trust/source/anchors/lab-ca.pem
sudo update-ca-trust
openssl s_client -connect app.example.com:443 -showcerts </dev/null
```

Ubuntu uses `/usr/local/share/ca-certificates/lab-ca.crt` and `sudo update-ca-certificates`.

### Subordinate CA signed by that same external CA

ACM Private CA stays in `PENDING_CERTIFICATE` until you import the certificate the external CA issued for **its** CSR.

```bash
aws acm-pca get-certificate-authority-csr \
  --certificate-authority-arn CA_ARN \
  --output text > subordinate.csr
```

The external CA must sign that CSR as a CA: basic constraint `CA:TRUE`. A normal server certificate will not import.

```bash
openssl x509 -in subordinate-ca.pem -noout -text | grep -A2 "Basic Constraints"
aws acm-pca import-certificate-authority-certificate \
  --certificate-authority-arn CA_ARN \
  --certificate fileb://subordinate-ca.pem \
  --certificate-chain fileb://external-root.pem
```

`subordinate-ca.pem` is only the cert that matches the CSR. `external-root.pem` is the CA that signed it, plus that CA's chain if one exists. After import, status moves to `ACTIVE`.

| Symptom | Fix |
| --- | --- |
| Stays `PENDING_CERTIFICATE` | Import never succeeded. Read the error from the import call. There is nothing else to wait for |
| Basic constraints are not CA | The external CA issued an end-entity cert. Re-sign the same CSR with `CA:TRUE` |
| Chain does not link | Issuer of `subordinate-ca.pem` is not the subject of the first cert in the chain file |
| Import says the CA already has a certificate | This CA is past pending. You cannot import a second CA cert onto it |
