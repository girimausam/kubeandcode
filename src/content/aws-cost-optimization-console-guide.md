---
title: "Cloud cost optimization (console)"
description: "Tags, budgets, anomaly detection, Compute Optimizer, S3 lifecycle, and the charges competitions expect you to notice: NAT, data transfer, idle disks."
tags:
  - aws
  - cost
  - budgets
  - s3
  - architect
  - devops
---

# Cloud cost optimization (console)

**Scenario:** Northwind's first month on AWS is three times the estimate. The bill is not "EC2 is expensive". It is NAT Gateway hours, inter-AZ traffic, unattached EBS, CloudWatch log ingestion, and a DMS replication instance nobody stopped.

Cost work is an architect and DevOps job: tag, alarm, then change the architecture. A cheaper instance type does not fix a chatty NAT path.

Docs: [AWS Cost Management](https://docs.aws.amazon.com/cost-management/latest/userguide/what-is-costmanagement.html) · [Compute Optimizer](https://docs.aws.amazon.com/compute-optimizer/latest/ug/what-is-compute-optimizer.html)

---

## Step 1 - Tags before any report is useful

Console: **Billing and Cost Management** -> **Cost allocation tags**.

Activate user tags:

- `Environment` = prod | staging
- `Application` = northwind-store
- `Owner` = team name
- `Migration` = mgn | dms | steady

Tags do nothing in Cost Explorer until you **activate** them. Activation can take 24 hours. New resources still need the tag at create time. Use **Tag Editor** to backfill.

Hidden setting: **AWS generated tags** (`createdBy`) are off until you activate them too.

---

## Step 2 - Budget and anomaly detection

Console: **Budgets** -> **Create budget**.

| Field | Example |
| --- | --- |
| Type | Cost budget, monthly |
| Amount | Expected spend plus 10 percent |
| Filter | Tag `Application=northwind-store` if tags are active, else linked account |
| Alert | 80 percent actual, 100 percent forecast |
| Notify | SNS topic plus email. Confirm the SNS subscription. |

Second budget: **usage** budget on NAT Gateway hours or data transfer if the rubric names a limit.

Console: **Cost Anomaly Detection** -> create a monitor for that service or account, daily, SNS on alert. This catches a forgotten replication instance faster than a monthly budget.

---

## Step 3 - Read the bill like an architect

Console: **Cost Explorer**.

- Group by **Service**, then by **Usage type**.
- Look for `NatGateway-Hours`, `NatGateway-Bytes`, `DataTransfer-Regional-Bytes`, `EBS:VolumeUsage`, `CW:DataProcessing-Bytes`.
- Filter **Purchase option** to see On-Demand versus Savings Plans. Do not buy a Savings Plan during a 6 hour lab. Do know that steady EC2 and Fargate belong on one after the migration.

### Charges people miss

| Charge | Cause | Fix |
| --- | --- | --- |
| NAT Gateway | Private subnets pulling images, patches, and AWS APIs through NAT | VPC endpoints for S3, ECR (interface plus S3 gateway), SSM, CloudWatch Logs |
| Inter-AZ | App and DB in different AZs with chatty calls, or cross-AZ load balancing | Same-AZ where latency allows. Multi-AZ still required for the database itself |
| Idle EBS | MGN test instances terminated, volumes left | Delete available volumes. Snapshot first if unsure |
| Elastic IPs | Allocated and not attached | Release them |
| CloudWatch Logs | VPC flow logs on ALL traffic, no retention | Log REJECT only if that meets the goal. Retention 30 days, not never-expire |
| DMS / MGN | Left running after cutover | Finalize cutover, delete replication instance |
| S3 | Raw clickstream in Standard forever | Lifecycle to Intelligent-Tiering or Glacier. See ETL prefixes |

---

## Step 4 - Compute Optimizer

Console: **Compute Optimizer** -> opt in.

It needs a few days of CloudWatch metrics. **Detailed monitoring** (1 minute) on EC2 makes the recommendation less wrong. After opt-in, review:

- EC2 over-provisioned instance types
- EBS volumes that are gp2 and idle (move to gp3 in the EC2 console: volume -> **Modify**)
- Lambda functions with memory far above the power tuning suggestion

Do not downsize a burstable instance that credits are already exhausting. Check **CPUCreditBalance** first.

---

## Step 5 - S3 lifecycle (console)

Bucket -> **Management** -> **Lifecycle rules**.

Example for `northwind-raw`:

1. Transition current versions to **S3 Intelligent-Tiering** after 0 days for unknown access, or Standard-IA after 30 days if access is predictable.
2. Expire incomplete multipart uploads after 7 days. This checkbox is a common hidden saving.
3. Expire noncurrent versions after 30 days if versioning is on.

Intelligent-Tiering has a monitoring fee per object. Do not use it on millions of tiny objects. Compact with the Glue job first ([ETL walkthrough](./aws-etl-glue-kinesis-firehose-lambda.md)).

---

## Step 6 - Architecture choices that change the bill

| Choice | Cost note |
| --- | --- |
| One NAT per AZ | HA and a higher floor cost. One NAT is cheaper and a single failure domain |
| Interface VPC endpoints | Hourly cost per AZ per endpoint. Cheaper than NAT only when traffic volume is high. Gateway endpoints for S3 and DynamoDB have no hourly charge |
| Aurora Serverless v2 versus provisioned | Serverless for spiky labs. Provisioned for flat production |
| Fargate versus EC2 | Fargate wins on ops. EC2 plus Savings Plans wins on steady high CPU |
| Kinesis on-demand versus shards | On-demand until the pattern is known |
| Detailed monitoring | Small EC2 charge. Turn it on when you need 1 minute alarms, not on every instance by habit |

---

## Guardrails so cost work survives the team

- **AWS Config** rule or an SCP is heavier than needed in a lab. A budget alarm plus a weekly Cost Explorer filter is enough to show.
- Tag policy in Organizations if you have the org: require `Environment` and `Application`.
- Rightsizing is not security. Do not remove Multi-AZ or encryption to save money in a design review.

[<- Roles map](./aws-cloud-roles-responsibility-map.md) · [<- Checklist](./aws-devops-system-design-checklist.md)
