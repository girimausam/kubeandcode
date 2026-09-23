---
title: "Hidden AWS settings competitions actually score"
description: "Console checkboxes and small services that decide a full-system build: encryption, IMDSv2, deletion protection, private DNS, DLQs, backups, and logging."
tags:
  - aws
  - exam-prep
  - security
  - devops
  - architecture
---

# Hidden AWS settings competitions actually score

A full-system task names the big boxes (VPC, EKS, pipeline, RDS). Scoring also checks settings that are one toggle deep. Turn these on while you build, not in the last ten minutes.

Related: [security patterns](./aws-security-implementation-patterns-console.md) · [roles map](./aws-cloud-roles-responsibility-map.md)

---

## Account and identity

| Setting | Console path | Why |
| --- | --- | --- |
| IAM Identity Center, not long-lived IAM users | IAM Identity Center | Admins get SSO. Access keys are for broken designs |
| Account alias and password policy | IAM -> Account settings | Minimum length, symbols |
| Access Analyzer | IAM -> Access Analyzer | External access findings on S3 and roles |
| Permission boundary on CI roles | IAM role -> Permissions boundary | Pipeline cannot create admin users |
| CloudTrail all Regions, log file validation, SSE-KMS | CloudTrail | One trail in one Region fails the audit question |
| AWS Config recorder on, include global resources | Config | Evidence that encryption and public access stay correct |
| GuardDuty enabled | GuardDuty | Detective control. Delegated admin if multi-account |
| Budget alarm | Billing -> Budgets | [Cost guide](./aws-cost-optimization-console-guide.md) |
| Default EBS encryption | EC2 -> Settings -> EBS encryption | New volumes encrypt even if the wizard is skipped |
| S3 Block Public Access at **account** level | S3 -> Block Public Access settings for this account | Bucket-level is not enough if someone creates a new bucket |

---

## Network

| Setting | Where | Missed effect |
| --- | --- | --- |
| DNS hostnames and DNS resolution | VPC -> Actions | Peering DNS and private hosted zones fail |
| **Private DNS** on interface endpoints | VPC endpoint -> Modify | SDK still goes to the public API and through NAT |
| Gateway endpoint for S3 on **private route tables** | Endpoint associations | Repos and artifacts still use NAT |
| Flow logs, REJECT or ALL, to S3 with a short retention | VPC -> Flow logs | No forensic answer during the review |
| NACLs not left at deny-by-accident | Subnet NACL | "SG is open" but traffic still dies |
| ALB security policy TLS 1.2 | Listener -> Security policy | Old TLS 1.0 policy left from a sample |
| Deletion protection on ALB and NAT if it is production | Load balancer attributes | One click removes ingress |
| VPC Lattice auth policy | Service network | Internal API is anonymous |

---

## Compute

| Setting | Where |
| --- | --- |
| **IMDSv2 required** (`HttpTokens=required`) | EC2 launch or template. Hop limit 1. Use 2 only if containers on the instance must reach IMDS |
| EBS encrypted, gp3 not gp2 by habit | Volume |
| Termination protection | Instance attributes |
| SSM Session Manager, no SSH from `0.0.0.0/0` | No port 22 in the SG. Instance profile has `AmazonSSMManagedInstanceCore` |
| Detailed monitoring only where alarms need 1 minute | EC2 monitoring |
| Auto Scaling health check type **ELB** not just EC2 | ASG |
| Target group health check path is the app `/health`, matcher 200 | Target group. A 302 to a login page marks targets unhealthy |
| ECS: circuit breaker and rollback | Service deployment configuration |
| EKS: control plane logs (api, audit, authenticator) | Cluster -> Logging. Off by default |
| EKS: secrets encryption with a CMK | Cluster encryption. Cannot be added casually later on old clusters |
| Fargate platform version current | Service |

---

## Data and storage

| Setting | Where |
| --- | --- |
| RDS: not public, deletion protection, encryption, automated backups, Multi-AZ | Create database. **Backup retention 0** disables point in time restore |
| RDS: IAM DB auth if the app is Lambda | Database authentication |
| Performance Insights | Optional but often on the rubric for "see slow queries" |
| DynamoDB: PITR, deletion protection, CMK if required | Table -> Backups. On-demand versus provisioned is a cost choice, not a security choice |
| S3: block public access, versioning, SSE-KMS, bucket key, object ownership **bucket owner enforced** | Bucket permissions and properties |
| S3: lifecycle abort incomplete multipart | Management |
| ECR: scan on push, immutable tags, lifecycle | [ECR console guide](./aws-ecr-access-lifecycle-console-guide.md) |
| EFS: encryption at rest and in transit | File system and the ECS/EKS mount |

---

## Application integration

| Setting | Where |
| --- | --- |
| SQS: SSE-KMS, DLQ, redrive max receive count, visibility timeout **longer than Lambda timeout** | Queue. A visibility timeout of 30 seconds with a 60 second function causes double processing |
| SNS: encryption plus the key policy allows `sns.amazonaws.com` | [Messaging guide](./aws-messaging-sqs-sns-kms-encryption-iam.md) |
| Lambda: reserved concurrency on the public function so a spike cannot consume the account | Function configuration |
| Lambda: DLQ or on-failure destination | Asynchronous invokes fail silently without this |
| Lambda: environment variables encrypted with a CMK if they hold config that is sensitive | Use Secrets Manager instead of env vars for passwords |
| API Gateway: throttling, access logs, execution logs at ERROR not INFO in prod (INFO leaks data), WAF associated | Stage settings |
| API Gateway: payload and timeout aligned with Lambda | 29 second integration timeout on REST |
| EventBridge: retry policy and DLQ on the target | Rule target |
| Step Functions: if you use it, logging level and X-Ray | State machine |
| CloudWatch log groups: retention not "never expire" | Log group |

---

## CI/CD and migration

| Setting | Where |
| --- | --- |
| Pipeline artifact bucket encrypted, not public | S3 |
| Manual approval before production | CodePipeline stage |
| CodeBuild privileged only if Docker build needs it | Project environment |
| MGN test launch before cutover | [Migration guide](./aws-workload-migration-mgn-dms-datasync.md) |
| DMS CloudWatch logs and validation on | Task |
| DataSync verify on | Task options |

---

## AI without training a model

Use the managed API. Do not stand up SageMaker training unless the task says "train".

| Need | Service |
| --- | --- |
| Invoices, forms | Textract |
| Sentiment, PII detection | Comprehend |
| Image labels, moderation | Rekognition |
| Chat or RAG on Bedrock | [Nova](./building-with-nova.md), [AgentCore](./bedrock-agentcore-production-guide.md) |

Console path and IAM: [Managed AI services](./aws-managed-ai-services-console.md).

Hidden: the runtime role needs the AI action **and** `s3:GetObject` on the input bucket **and** `kms:Decrypt` if the object is SSE-KMS. The demo role in the console wizard is often account-admin. Replace it.

---

## Ten minute sweep before you submit

1. Public access: S3 account block, RDS public flag, security groups with `0.0.0.0/0` on admin ports.
2. Encryption: EBS default, RDS, S3, SQS, EBS volumes already created.
3. Protection flags: deletion protection on RDS, ALB, DynamoDB. Termination protection on the bastion if one exists. Prefer no bastion.
4. Logging: CloudTrail, VPC flow logs, ALB access logs, RDS error logs if asked.
5. Alarms: ALB 5xx, RDS CPU and free storage, DLQ depth, budget.
6. Names and tags: `Environment`, `Application` on every resource you created.
7. Secrets: nothing in task definition environment plaintext. Secrets Manager or SSM.
8. Routes: private subnets default route is NAT or no route, not an internet gateway.

[<- Roles map](./aws-cloud-roles-responsibility-map.md)
