---
title: "AWS security implementation patterns (console)"
description: "Organization guardrails, KMS, logging, detective controls, and network isolation - patterns commonly combined in production and system-design exercises."
tags:
 - aws
 - security
 - kms
 - cloudtrail
 - guardduty
 - config
 - iam
 - devops
---

# AWS security implementation patterns (console)

Security in AWS is **layered**: identity, network, data encryption, detective controls, and governance. System designs should name **who can do what** and **what is logged**.

**Checklist:** [DevOps checklist](./aws-devops-system-design-checklist.md)

---

## Pattern 1 -  Organization guardrails (SCPs)

**Use:** Prevent disabling logging, restrict regions, deny public S3.

1. **AWS Organizations** → **Policies** → **Service control policies**.
2. Attach to **OU** (e.g. `Production`), not only root for testing OUs.

Example deny (conceptual): `ec2:RunInstances` unless `ec2:InstanceType` in allowed list.

**Missed:** SCPs do not affect management account the same way; test in member account.

---

## Pattern 2 -  KMS hierarchy

| Key | Purpose |
|-----|---------|
| `alias/aws/s3` | Default, low friction |
| CMK per domain | `prod-data`, `prod-logs`, `prod-artifacts` |

Console: **KMS** → create CMK → strict key policy → enable **automatic rotation** where supported.

Link: [S3 KMS](./aws-s3-kms-encryption-decryption-iam.md), [SQS/SNS KMS](./aws-messaging-sqs-sns-kms-encryption-iam.md).

---

## Pattern 3 -  Audit logging

1. **CloudTrail** → **Trails** → multi-region, log file validation, SSE-KMS to dedicated bucket.
2. **AWS Config** → record **global resources** + conformance packs (e.g. CIS).
3. S3 bucket policy **deny** `s3:DeleteObject` without MFA for security role.

---

## Pattern 4 -  Detective services

1. **GuardDuty** → enable in all regions (delegated admin in org).
2. **Security Hub** → enable standards (FSBP, CIS).
3 Route findings → **EventBridge** → **SNS** → ticketing.

---

## Pattern 5 -  Network zero-trust basics

- No public IPs on app tier; **ALB** or **API Gateway** only.
- **VPC endpoints** for SSM, ECR, S3, KMS to avoid internet egress for AWS APIs.
- **Security groups** as stateful firewall; **NACLs** for subnet-level deny lists.

Networking deep dives: [Peering](./aws-vpc-peering-console-guide.md), [VPN](./aws-site-to-site-vpn-console-guide.md), [TGW](./aws-vpc-transit-gateway.md).

---

## Pattern 6 -  Workload identity

| Compute | Identity |
|---------|----------|
| Lambda | Execution role |
| ECS | Task role + execution role |
| EKS | IRSA / Pod Identity + RBAC |

Never embed access keys in AMIs or task defs.

Reference: [IAM triage](./aws-iam-policies-triage.md), [IAM roles & endpoints](./aws-iam-roles-and-endpoints.md).

---

## Pattern 7 -  Edge protection

1. **WAF** on ALB/CloudFront - managed rule groups + rate limiting.
2. **Shield Advanced** for DDoS-sensitive workloads (optional).

---

## Commonly missed in implementations

- CloudTrail **not** on all regions
- Config recorder stopped in one region
- KMS key policy only has admins, no service roles
- EBS/RDS **unencrypted** legacy resources
- `AdministratorAccess` for CI/CD roles

---

## Troubleshooting security denials

1. **IAM policy simulator** + **CloudTrail `AccessDenied` event**.
2. **KMS** `ViaService` and encryption context mismatches.
3. **SCP** explicit deny vs identity policy allow.

Docs: [AWS Security Hub](https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html) · [Well-Architected Security pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)

[← Checklist](./aws-devops-system-design-checklist.md)
