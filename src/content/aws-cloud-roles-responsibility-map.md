---
title: "Cloud roles mapped to real AWS work"
description: "How Cloud Architect, DevOps, Cloud Developer, and Cloud Security map to console work: architecture, migration, cost, cloud-native apps, and security."
tags:
  - aws
  - architecture
  - devops
  - security
  - exam-prep
---

# Cloud roles mapped to real AWS work

The job is not four isolated titles. A full system test mixes them: design the landing zone, move the old app, run it as containers or serverless, lock it down, and keep the bill explainable. None of these roles train new ML models. They **call existing AI services** when the business needs text, vision, or documents.

**Start here for coverage:** [DevOps system design checklist](./aws-devops-system-design-checklist.md)

---

## What each role actually does on AWS

| Role | Owns in a build | Does not own |
| --- | --- | --- |
| **Cloud Architect** | VPC layout, account boundaries, service choice, HA, DR, how AI APIs fit the flow | Training a custom model, day-to-day YAML commits |
| **DevOps Engineer** | Pipelines, IaC or repeatable console, observability, rollbacks, environment promotion | Product feature code |
| **Cloud Developer** | Lambda, containers, API contracts, event-driven code, SDK use of managed services | Org SCPs, Transit Gateway design |
| **Cloud Security Engineer** | IAM, KMS, encryption, logging, GuardDuty, edge controls, evidence for auditors | Feature velocity |

In a 6 hour system you will be asked to play all four. The hidden marks are usually a checkbox (encryption, deletion protection, private DNS on an endpoint, a budget alarm), not a new service name.

---

## Responsibilities and where to read

| Responsibility | Practical shape | Read |
| --- | --- | --- |
| Design the architecture | Private subnets, ingress, east-west, data tier | [Networking overview](./aws-networking-overview.md), [peering](./aws-vpc-peering-console-guide.md), [VPN](./aws-site-to-site-vpn-console-guide.md), [TGW](./aws-vpc-transit-gateway.md), [ECS ShopFlow](./ecs-shopflow-production-walkthrough.md) |
| Run infrastructure | EKS or ECS, patching via SSM, backups | [EKS runbook](./eks-cluster-operations-runbook.md), [databases](./aws-databases-networking-security-backup-console.md) |
| Cloud-native apps | API + Lambda or containers, queues, config | [serverless SAM](./aws-serverless-sam-guide.md), [SQS/SNS KMS](./aws-messaging-sqs-sns-kms-encryption-iam.md), [AppConfig](./aws-appconfig-console-production-guide.md) |
| Security | Identity, encryption, detective controls | [security patterns](./aws-security-implementation-patterns-console.md), [S3 KMS](./aws-s3-kms-encryption-decryption-iam.md), [IAM triage](./aws-iam-policies-triage.md) |
| Migrate workloads | Servers, databases, files | [Migration console guide](./aws-workload-migration-mgn-dms-datasync.md) |
| Optimize cost | Tags, budgets, right-size, storage class | [Cost console guide](./aws-cost-optimization-console-guide.md) |
| Use existing AI | Textract, Comprehend, Rekognition, Bedrock | [Managed AI console](./aws-managed-ai-services-console.md), [Nova](./building-with-nova.md) |
| Hidden exam settings | The boxes people skip | [Competition hidden settings](./aws-competition-hidden-settings.md) |

---

## One system that uses every role

**Northwind** moves an on-prem store app to AWS:

1. **Architect:** hub VPC on Transit Gateway, app VPC, data VPC, Site-to-Site VPN during migration, ALB in public subnets, RDS private.
2. **Migration:** Application Migration Service for the app VM, DMS for MySQL, DataSync for the file share.
3. **Developer:** new checkout path on API Gateway, Lambda, DynamoDB, SQS. Invoices go to Textract. No custom model.
4. **DevOps:** CodePipeline builds the container, ECR lifecycle expires old images, AppConfig toggles the new checkout.
5. **Security:** CMK on S3, RDS, SQS. CloudTrail on. GuardDuty on. IMDSv2 required. Flow logs on.
6. **Cost:** cost allocation tags, a budget alarm, S3 lifecycle on raw invoices, Compute Optimizer after two weeks.

If a step has no owner, that is the part the scoring rubric still checks.

[Hidden settings](./aws-competition-hidden-settings.md) · [Checklist](./aws-devops-system-design-checklist.md)
