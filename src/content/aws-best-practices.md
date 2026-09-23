---
title: "Service Best Practices"
description: "Operational and security best practices by AWS service—S3 versioning and lifecycle, IAM least privilege, RDS backups, EKS logging, and more."
tags:
  - aws
  - best-practices
  - security
  - well-architected
  - s3
  - iam
  - rds
resources:
  - title: AWS Well-Architected Framework
    url: https://aws.amazon.com/architecture/well-architected/
  - title: S3 security best practices
    url: https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html
---

Actionable defaults for production workloads. Apply what fits your risk tier; use **account-level** baselines (SCPs, Config rules, Security Hub) to enforce them consistently.

## Quick index

| Service | Topics |
| --- | --- |
| [S3](#amazon-s3) | Versioning, lifecycle, replication, encryption, access |
| [IAM](#iam) | Least privilege, roles, boundaries |
| [EC2 & VPC](#ec2-and-vpc) | Networking, instances, EBS |
| [RDS & Aurora](#rds-and-aurora) | Backups, encryption, HA |
| [DynamoDB](#dynamodb) | PITR, encryption, capacity |
| [Lambda](#lambda) | Concurrency, VPC, errors |
| [ECS & EKS](#ecs-and-eks) | Tasks, clusters, observability |
| [ECR](#ecr) | Scanning, lifecycle, immutability |
| [ELB](#elastic-load-balancing) | TLS, health checks, WAF |
| [CloudFront](#cloudfront) | HTTPS, OAC, logging |
| [API Gateway](#api-gateway) | Auth, throttling, logging |
| [ElastiCache](#elasticache) | Auth, subnets, backups |
| [EFS](#efs) | Encryption, access points |
| [Auto Scaling](#auto-scaling) | AZ spread, health checks |
| [CloudWatch](#cloudwatch-and-logs) | Alarms, retention |
| [Secrets Manager](#secrets-manager) | Rotation, access |
| [SNS & WAF](#sns-and-waf) | Encryption, rules |
| [CI/CD](#cicd-codebuild-and-codedeploy) | Build hygiene, rollback |

---

## Amazon S3

### Data protection and recovery

- **Enable versioning** on buckets that hold user data, configs, or anything you cannot recreate from source. Recover from accidental deletes and overwrites; pair with lifecycle rules so old versions do not grow forever.
- **Use S3 Object Lock** (Governance or Compliance) for audit logs, regulatory archives, and ransomware-resistant retention when requirements demand immutability. Object Lock must be enabled at bucket creation (or on existing buckets that support it) before you rely on it.
- **Turn on MFA Delete** only where policy requires it; it complicates automation—document who holds MFA for production buckets.

### Lifecycle and cost

- **Lifecycle management**: transition infrequent data to **S3 Standard-IA**, **Glacier**, or **Glacier Deep Archive**; expire incomplete multipart uploads; expire noncurrent versions after N days when versioning is on.
- **Intelligent-Tiering** for unpredictable access patterns when you do not want to hand-tune tiers.
- **Abort incomplete multipart uploads** after 7 days (common default) to avoid silent storage charges.

### Replication and resilience

- **Cross-Region Replication (CRR)** for disaster recovery or locality; use **Same-Region Replication (SRR)** for log aggregation or compliance copies in the same region.
- Enable **replication metrics and notifications** when RPO/RTO matter; replicate **delete markers** only if your DR runbook expects them.
- For critical buckets, consider **Multi-Region Access Points** only when you have a clear active/active or failover design (added complexity and cost).

### Security and access

- **Block Public Access** at account and bucket level unless a single bucket is intentionally public (prefer CloudFront + OAC instead).
- **Default encryption**: SSE-S3 or **SSE-KMS** (prefer KMS when you need key policies, rotation audit, and separation of duties).
- **Bucket policy**: deny `aws:SecureTransport` (HTTPS only); restrict principals to expected roles/accounts.
- **Use VPC endpoints** (Gateway for S3, Interface where needed) so traffic stays on the AWS network from private subnets.
- **Access Points** for shared buckets: one access point per application team; restrict to VPC where possible.
- **S3 Object Lambda** or **prefix-level IAM** when one bucket serves many tenants with different prefixes.

### Observability and governance

- **Server access logging** or **CloudTrail data events** for sensitive buckets (data events have cost—scope to prefixes).
- **Event notifications** to SQS, SNS, or Lambda for ingest pipelines, virus scan, or index updates.
- **Inventory** and **Storage Class Analysis** for large estates; **S3 Storage Lens** for organization-wide visibility.
- **Tags**: `Environment`, `Owner`, `CostCenter`, `DataClassification`, `Application`—feed into Cost Allocation Tags and backup policies.
- **AWS Backup** for centralized backup plans when S3 is in scope for your compliance framework.

### Example: versioning + lifecycle (CLI)

```bash
aws s3api put-bucket-versioning \
  --bucket my-app-data \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-lifecycle-configuration \
  --bucket my-app-data \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "expire-noncurrent",
      "Status": "Enabled",
      "Filter": {},
      "NoncurrentVersionExpiration": { "NoncurrentDays": 90 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }]
  }'
```

---

## IAM

- **No long-lived access keys** for humans; use **IAM Identity Center (SSO)** or federation.
- **Least privilege**: scoped actions and resources; prefer **managed policies** per job function over `*:*`.
- **No inline `AdministratorAccess`** on daily roles; break glass account/role with MFA and session logging.
- **Permission boundaries** on roles that third parties or developers can edit.
- **Service control policies (SCPs)** at org level for guardrails (e.g. deny unencrypted S3, deny root API keys).
- **Separate roles per workload** (Lambda, EC2, ECS task role)—no shared “super role.”
- **Regular access reviews**; remove unused roles and policies; use **IAM Access Analyzer** for external access.
- **Tag IAM roles** (`Owner`, `Service`) for ownership and cleanup.

---

## EC2 and VPC

- **IMDSv2 required** (`HttpTokens: required`) on all instances; hop limit **1** unless containers on the host need **2**.
- **No SSH from 0.0.0.0/0**; use **SSM Session Manager** for shell access.
- **EBS encryption by default** enabled in the region; encrypt root and data volumes.
- **Disable public IPs** on private subnet instances; outbound via **NAT** or **egress-only** patterns.
- **Default VPC security group**: no inbound rules; do not use as application SG.
- **VPC Flow Logs** to S3 or CloudWatch for forensics and anomaly detection.
- **NACLs** as coarse guardrails; **security groups** for application rules—document why each port is open.
- **Stop or terminate** idle instances; use **Instance Scheduler** or Auto Scaling for variable load.
- **Launch templates** (not launch configurations) with **detailed monitoring** where metrics drive scaling.
- **Tags** on instances, volumes, ENIs for cost and automation.

---

## RDS and Aurora

- **Automated backups** with retention aligned to RPO (often 7–35 days); test restore quarterly.
- **Aurora**: enable **backtracking** (MySQL) where point-in-time undo within the window helps ops.
- **Encryption at rest** with KMS; **encryption in transit** (TLS) from applications.
- **Multi-AZ** for production RDS; **Aurora** with at least two instances across AZs for HA.
- **Deletion protection** on production clusters; snapshots before major changes.
- **Minor version auto-upgrade** during maintenance windows; pin major versions deliberately.
- **No public `PubliclyAccessible`** on production databases; access from VPC, bastion via SSM, or RDS Proxy.
- **IAM database authentication** where supported; secrets in **Secrets Manager** with rotation.
- **Performance Insights** and **Enhanced Monitoring** for production troubleshooting.
- **Parameter groups** per engine/version; avoid default max connections for heavy apps.
- **Copy tags to snapshots**; tag instances (`Environment`, `Application`).

---

## DynamoDB

- **Point-in-time recovery (PITR)** on production tables.
- **Encryption** with AWS owned or customer managed KMS keys per policy.
- **On-demand vs provisioned**: use **auto scaling** on provisioned; on-demand for spiky unknown load.
- **Deletion protection** on critical tables.
- **Global tables** only with a clear multi-region write model; understand replication lag.
- **DynamoDB Streams** + Lambda for CDC; **TTL** for ephemeral items.
- **Backup** via AWS Backup or on-demand snapshots before schema migrations.
- **Tags** for cost and environment.

---

## Lambda

- **Dead-letter queue (DLQ)** or **on-failure destination** for async invokes.
- **Reserved concurrency** for critical functions; **provisioned concurrency** for latency-sensitive paths.
- Set **timeout** and **memory** from load testing—not defaults.
- **VPC** only when accessing private resources (adds ENI cold start); use **RDS Proxy**.
- **No public function URLs** without auth; API Gateway or ALB with authorizers preferred.
- **Environment variables** for non-secret config; **Secrets Manager** / **Parameter Store** for secrets.
- **X-Ray** or **ADOT** tracing for distributed debugging.
- **Graviton** (`arm64`) when dependencies support it for cost.
- **Tag** functions with `Service` and `Environment`.

---

## ECS and EKS

### ECS

- **awsvpc** networking for Fargate and most new designs.
- **Task roles** (app) vs **execution roles** (pull image, logs)—never one role for both.
- **Read-only root filesystem** and **non-root user** in task definitions where possible.
- **Container Insights** or equivalent metrics; log drivers to CloudWatch.
- **Fargate platform version** current; pin only after regression testing.
- **Service Connect** or **Cloud Map** for service discovery; health checks on target groups.

### EKS

- **Control plane logging** (api, audit, authenticator) to CloudWatch.
- **Secrets encryption** with KMS for etcd.
- **Restrict public API endpoint**; private endpoint + VPN/SSO for admin.
- **IRSA** for pod AWS API access—not node instance role for app permissions.
- **Pod Security Standards** / admission policy (Kyverno, Gatekeeper) for baseline.
- **Tag** clusters and node groups for chargeback.

---

## ECR

- **Scan on push** (enhanced scanning where budget allows).
- **Lifecycle policies** to expire untagged images and keep last N tags per repo.
- **Tag immutability** on production repos to prevent overwrites.
- **KMS encryption** per org policy.
- **Repository policies** least privilege for CI roles and pull accounts.

---

## Elastic Load Balancing

- **TLS 1.2+** on listeners; use **ACM** certificates with auto renewal.
- **Deletion protection** on production load balancers.
- **Access logs** to S3 for ALB; enable **WAF** on internet-facing ALBs/APIs.
- **Cross-zone load balancing** for even traffic (default on ALB).
- **Drop invalid header fields** on ALB where supported.
- **Target group health checks** match application health (path, port, thresholds).
- **Idle timeout** aligned with long-lived connections (WebSockets, gRPC).

---

## CloudFront

- **HTTPS only** viewer policy; redirect HTTP to HTTPS.
- **Origin Access Control (OAC)** for S3 origins—no public S3 for static sites.
- **WAF** on distributions serving browsers.
- **Access logs** or real-time logs for security review.
- **Default root object** for SPA static hosting.
- **Disable deprecated SSL protocols** on custom certificates.

---

## API Gateway

- **Authorization** on every route (JWT/Cognito, IAM, Lambda authorizer)—no anonymous production APIs unless intentional.
- **Throttling** and **usage plans** for partner APIs.
- **Execution logging** and **access logging** to CloudWatch.
- **WAF** on HTTP APIs and REST API stages exposed to the internet.
- **Private APIs** + VPC endpoint when callers are only in your VPC.

---

## ElastiCache

- **Auth token** (Redis) and **TLS in transit** for production.
- **Custom subnet groups** in private subnets—not default.
- **Multi-AZ** with automatic failover for Redis replication groups.
- **Automatic backups** and snapshot window defined.
- **Encryption at rest**; security groups limited to application tiers.
- **Tags** for cluster ownership.

---

## EFS

- **Encryption at rest** and **encrypt in transit** (`tls`) for mounts.
- **Automatic backups** via AWS Backup or EFS backup policy.
- **Access points** with POSIX user enforcement per application.
- **No public mount targets**; security groups only from compute SGs.
- **Lifecycle management** to Infrequent Access for cold data.

---

## Auto Scaling

- **Multiple AZs** in every ASG tied to a load balancer.
- **ELB/target group health checks**—not EC2 status checks alone when behind ALB.
- **Launch templates** with current AMIs and instance metadata settings.
- **Predictive scaling** or scheduled scaling where traffic is predictable.
- **Instance refresh** for rolling AMI/security updates.

---

## CloudWatch and Logs

- **Alarms** on golden signals (latency, errors, queue depth, CPU credit) with SNS/PagerDuty routes.
- **Log retention** set per log group (avoid “never expire” by default).
- **Metric filters** on audit logs for security events.
- **Dashboards** per service and per incident runbook link in alarm description.

---

## Secrets Manager

- **Rotation** enabled for RDS and custom Lambdas where supported.
- **Resource policies** restrict which roles can read each secret.
- **No secrets in CodeBuild plaintext**—use Secrets Manager or SSM SecureString.
- **Tag** secrets with owning service.

---

## SNS and WAF

### SNS

- **Encryption at rest** with KMS for sensitive topics.
- **Topic policies** deny publishing from unexpected accounts.
- **DLQ** on Lambda subscriptions where fan-out failures must be captured.

### WAF

- **Managed rule groups** (Core, Known Bad Inputs) as baseline on public edges.
- **Rate-based rules** for abuse protection.
- **Logging** to S3 or CloudWatch; tune counts before blocking mode.
- **Scope** WAF to CloudFront, ALB, API Gateway, or AppSync as appropriate.

---

## CI/CD (CodeBuild and CodeDeploy)

- **CodeBuild**: no **privileged** mode unless building containers; enable CloudWatch logs.
- **CodeDeploy**: **auto rollback** on deployment failure and alarm triggers.
- **Artifacts** encrypted; least-privilege service roles per pipeline.
- **Separate accounts** for prod vs non-prod via CI role assumption.

---

## Security Hub and continuous compliance

- Enable **Security Hub** with **Foundational Security Best Practices** and relevant standards (CIS, PCI) for your industry.
- Map the practices above to **AWS Config** rules or **Conformance Packs** so drift is visible.
- Fix **critical** findings before **medium**; document accepted risk for exceptions with expiry dates.

---

## Tagging standard (all services)

Use a consistent key set so Cost Explorer, Resource Groups, and backup policies work:

| Key | Example | Use |
| --- | --- | --- |
| `Environment` | `prod`, `staging` | Blast radius, SCP conditions |
| `Owner` | `team-platform` | Escalation |
| `Application` | `checkout` | Mapping resources to systems |
| `CostCenter` | `CC-1042` | Finance allocation |
| `DataClassification` | `confidential` | Encryption and retention choices |

Enable **cost allocation tags** in the billing console for keys you report on.

---

## Related posts on this site

- [S3 securing buckets](./aws-checklist-appconfig-s3.md) (AppConfig + S3 patterns)
- [IAM policies triage](./aws-iam-policies-triage.md)
- [ECR lifecycle](./aws-ecr-lifecycle-policy.md)
- [Architecture reference links](./aws-architecture-reference-links.md)
