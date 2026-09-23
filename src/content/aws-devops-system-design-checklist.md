---
title: "AWS system design & DevOps prep checklist"
description: "Industry-level AWS topics for full-system implementations—commonly missed items, service combinations, and links to console-focused reference posts on this site."
tags:
  - aws
  - devops
  - checklist
  - exam-prep
  - architecture
  - security
  - networking
---

# AWS system design & DevOps prep checklist

Use this as a **coverage map** before a long hands-on build (multi-hour system tests, production cutovers, or architecture reviews). Items marked **missed** are frequent gap areas in real projects—not obscure trivia.

**How to use:** For each row, confirm you can explain **why**, **console path**, **IAM**, and **failure mode**. Deep dives link to posts on this site.

---

## 1. Identity, access, and secrets

| Topic | Industry use | Commonly missed | Reference |
|-------|----------------|-----------------|-----------|
| IAM roles vs users for workloads | Lambda, ECS, EKS use roles—no long-lived keys | Trust policy `sts:AssumeRole` conditions (`aws:SourceAccount`, `aws:ArnLike`) | [IAM policies triage](./aws-iam-policies-triage.md) |
| Permission boundaries & SCPs | Org-wide guardrails | SCP deny does not grant; member account admin can still misconfigure | [Security patterns (console)](./aws-security-implementation-patterns-console.md) |
| IAM policy conditions | `aws:SourceVpc`, `aws:PrincipalTag`, `kms:ViaService` | Missing `kms:EncryptionContext` alignment with S3/SNS | [IAM conditions](./aws-iam-policy-conditions.md) |
| EKS access (API + RBAC) | `aws eks update-cluster-config` access entries | Mixing `system:masters` with IRSA/Pod Identity | [EKS operations runbook](./eks-cluster-operations-runbook.md) |
| Cognito + external IdP (Keycloak) | Human login to apps and clusters | Token issuer URL, audience, separate admin vs app clients | [Cognito + Keycloak](./aws-cognito-keycloak-federation.md) · [EKS + Keycloak (console)](./eks-keycloak-production-console-guide.md) |
| Secrets Manager vs SSM Parameter Store | DB creds, API keys | Rotation Lambda not in same VPC/SG as RDS | [RDS IAM auth](./aws-lambda-rds-iam-auth.md) |

---

## 2. Networking (VPC, hybrid, edge)

| Topic | Industry use | Commonly missed | Reference |
|-------|----------------|-----------------|-----------|
| VPC design (subnets, NAT, endpoints) | Private workloads + controlled egress | Interface endpoints without **private DNS** on SG | [Networking overview](./aws-networking-overview.md) |
| **VPC peering** | Simple two-VPC connectivity | **No transitive routing**; CIDR overlap; DNS resolution checkbox | [VPC peering (console)](./aws-vpc-peering-console-guide.md) |
| **Site-to-Site VPN** | On-prem to AWS | VGW vs **TGW** attachment; route propagation; overlapping CIDR | [Site-to-Site VPN (console)](./aws-site-to-site-vpn-console-guide.md) |
| **Transit Gateway** | Hub for many VPCs/VPN/DX | TGW route tables per segment; **appliance mode** for stateful FW | [Transit Gateway](./aws-vpc-transit-gateway.md) |
| Network Firewall / centralized egress | Inspection VPC | Asymmetric routing when return path bypasses firewall | [Centralized egress](./aws-network-firewall-centralized-egress.md) |
| **VPC Lattice** | Service-to-service across accounts/VPCs | Lattice **service network** vs ALB; auth policy on association | [Lattice app networking](./aws-vpc-lattice-application-networking.md) · [EKS Ingress + Lattice (console)](./eks-ingress-vpc-lattice-console-guide.md) |
| PrivateLink | SaaS-style consumer/provider | NLB target type; endpoint service permissions | [Networking overview](./aws-networking-overview.md) |

Official hub-and-spoke diagram: [AWS Transit Gateway](https://docs.aws.amazon.com/images/vpc/latest/tgw/images/transit-gateway.png) (VPC documentation).

---

## 3. Containers & Kubernetes (EKS)

| Topic | Industry use | Commonly missed | Reference |
|-------|----------------|-----------------|-----------|
| EKS cluster baseline | Private API, logging, add-ons | Control plane logs not enabled; outdated OIDC provider | [EKS getting started](./eks-getting-started.md) |
| **Ingress (ALB)** | HTTP(S) to pods | Subnet tags `kubernetes.io/role/elb`; IRSA for controller | [ALB Ingress Controller](./eks-alb-ingress-controller.md) |
| **Ingress + VPC Lattice** | Cross-VPC/account HTTP to K8s | Gateway API vs Ingress; Lattice target group health | [EKS Lattice (console)](./eks-ingress-vpc-lattice-console-guide.md) |
| **Kyverno** | Policy-as-code (labels, images, nets) | Webhook timeout; exclude system namespaces carefully | [Kyverno install](./eks-kyverno-install.md) · [Kyverno console prep](./eks-kyverno-console-production-guide.md) |
| **Keycloak on EKS** | OIDC for apps | Realm vs client; sticky sessions; DB for Keycloak HA | [EKS Keycloak (console)](./eks-keycloak-production-console-guide.md) |
| Storage (EBS/EFS/S3) | Stateful workloads | Fargate + EBS constraints; EFS access points | [EKS storage](./eks-storage-ebs-efs-s3.md) |
| GitOps / CD | Argo CD, pipelines to cluster | Cluster secret vs repo creds; sync waves | [Argo CD install](./eks-argocd-install.md) |

---

## 4. CI/CD and application delivery

| Topic | Industry use | Commonly missed | Reference |
|-------|----------------|-----------------|-----------|
| **CodePipeline** multi-stage | Build → test → approve → deploy | Artifact bucket KMS; cross-account roles | [CI/CD CodePipeline](./aws-cicd-codepipeline-codebuild-codedeploy.md) · [CodePipeline console system](./aws-codepipeline-console-full-system-guide.md) |
| CodeBuild | Docker build, tests | VPC build needs NAT/endpoints; privileged mode for Docker | Same as above |
| CodeDeploy (ECS/EC2/Lambda) | Blue/green | `appspec.yaml` hooks; listener rule duplication | [ECS CodePipeline](./aws-ecs-codepipeline-cicd.md) |
| **ECR** lifecycle + permissions | Image hygiene, pull from CI | Lifecycle **prefix AND** trap; repository policy for cross-account | [ECR lifecycle](./aws-ecr-lifecycle-policy.md) · [ECR console access](./aws-ecr-access-lifecycle-console-guide.md) |
| **AppConfig** | Safe feature flags & config rollout | Deployment strategy vs hosted configuration version | [AppConfig freeform](./aws-appconfig-freeform.md) · [AppConfig console](./aws-appconfig-console-production-guide.md) |

---

## 5. Data stores (networking, security, backup)

| Topic | Industry use | Commonly missed | Reference |
|-------|----------------|-----------------|-----------|
| RDS / Aurora | OLTP | SG only from app tier; **not** public; subnet group spans 2+ AZ | [Databases console guide](./aws-databases-networking-security-backup-console.md) |
| DynamoDB | Serverless app state | PITR; CMK vs AWS owned key; VPC endpoints for private access | Same + [DAX](./aws-dynamodb-dax.md) |
| Redis / Valkey (ElastiCache) | Cache, sessions | Auth token; in-transit encryption; same VPC as consumers | [Valkey + Lambda](./aws-elasticache-valkey-lambda.md) |
| Backup & DR | RPO/RTO | AWS Backup vault lock; cross-region copy; restore drill | [Databases console guide](./aws-databases-networking-security-backup-console.md) |

---

## 6. Messaging and integration

| Topic | Industry use | Commonly missed | Reference |
|-------|----------------|-----------------|-----------|
| **SQS + SNS** with **KMS** | Event-driven decoupling | SNS → SQS subscription needs CMK on **both**; key policy `ViaService` | [SQS/SNS KMS & IAM](./aws-messaging-sqs-sns-kms-encryption-iam.md) |
| EventBridge | Bus rules, schedules | Input transformer vs constant; dead-letter on rule target | [EventBridge patterns](./aws-eventbridge-patterns.md) |
| API Gateway + auth | BFF, WebSocket | Cognito authorizer cache; resource policy for private API | [API Gateway Cognito](./aws-apigateway-cognito-auth.md) |

---

## 7. Storage and encryption

| Topic | Industry use | Commonly missed | Reference |
|-------|----------------|-----------------|-----------|
| **S3** SSE-KMS & bucket policies | Data lake, artifacts | Deny `aws:SecureTransport`; `s3:x-amz-server-side-encryption` condition | [S3 KMS encryption](./aws-s3-kms-encryption-decryption-iam.md) |
| S3 access points / VPC endpoints | Multi-tenant buckets | AP policy + bucket policy intersection | [IAM triage](./aws-iam-policies-triage.md) |

---

## 8. Security, compliance, and observability

| Topic | Industry use | Commonly missed | Reference |
|-------|----------------|-----------------|-----------|
| KMS key policies + IAM | Encryption everywhere | Key admin ≠ key user; grant vs policy | [Security patterns](./aws-security-implementation-patterns-console.md) |
| CloudTrail / Config | Audit | Multi-region trail; log file validation | Security patterns post |
| GuardDuty / Security Hub | Threat & posture | Delegated admin account | Security patterns post |
| WAF + Shield | Edge protection | Rate-based rule scope; logging to S3/Kinesis | [API Gateway patterns](./aws-apigateway-cognito-auth.md) |
| Observability stack | Metrics, traces, logs | ADOT vs Fluent Bit; AMP remote write IAM | [Grafana/Prometheus](./aws-monitoring-grafana-prometheus.md) |

---

## 9. Full-system combinations (exam-style scenarios)

Practice explaining end-to-end flows—not isolated services:

| Scenario | Services typically combined |
|----------|----------------------------|
| Secure web app + API + DB | ALB, ECS/EKS, RDS, Secrets Manager, KMS, private subnets, NAT/endpoints |
| Hybrid reporting | Site-to-Site VPN or DX → TGW → VPC → RDS read replica / Redshift |
| Multi-account platform | Organizations SCPs, RAM shared subnets/TGW, CI/CD cross-account roles |
| Event-driven order flow | API Gateway → Lambda → DynamoDB → EventBridge → SQS → worker → SNS notify |
| Zero-trust internal APIs | VPC Lattice or PrivateLink, IAM auth, no public IPs on workloads |
| GitOps platform cluster | EKS, Keycloak/Cognito, Kyverno, Argo CD, ECR, CodePipeline |

**ECS reference implementation:** [ShopFlow walkthrough](./ecs-shopflow-production-walkthrough.md) (ALB + Service Connect + EFS + Lambda).

**GenAI platform:** [Bedrock AgentCore Part 4](./bedrock-agentcore-production-guide.md).

---

## 10. Console-first study order (suggested)

1. Networking: peering → VPN → TGW ([peering](./aws-vpc-peering-console-guide.md), [VPN](./aws-site-to-site-vpn-console-guide.md), [TGW](./aws-vpc-transit-gateway.md))
2. Security: KMS, S3, IAM ([S3](./aws-s3-kms-encryption-decryption-iam.md), [security patterns](./aws-security-implementation-patterns-console.md))
3. Messaging: SNS/SQS ([messaging](./aws-messaging-sqs-sns-kms-encryption-iam.md))
4. Data: RDS/Aurora ([databases](./aws-databases-networking-security-backup-console.md))
5. Delivery: ECR + CodePipeline ([ECR](./aws-ecr-access-lifecycle-console-guide.md), [pipeline](./aws-codepipeline-console-full-system-guide.md))
6. EKS: Lattice ingress, Kyverno, Keycloak ([Lattice](./eks-ingress-vpc-lattice-console-guide.md), [Kyverno](./eks-kyverno-console-production-guide.md), [Keycloak](./eks-keycloak-production-console-guide.md))
7. Config flags: AppConfig ([AppConfig](./aws-appconfig-console-production-guide.md))

---

## AWS official references

- [Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [AWS Architecture Center](https://aws.amazon.com/architecture/)
- [Prescriptive Guidance](https://aws.amazon.com/prescriptive-guidance/)

[Architecture links index](./aws-architecture-reference-links.md)
