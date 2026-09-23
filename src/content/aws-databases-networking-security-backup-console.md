---
title: "Databases on AWS -  networking, security, backup (console)"
description: "RDS and Aurora production placement - subnet groups, security groups, encryption, backups, IAM auth, and hybrid access patterns."
tags:
 - aws
 - rds
 - aurora
 - database
 - security
 - backup
 - networking
 - devops
---

# Databases on AWS -  networking, security, backup (console)

In full-system labs, the database layer fails when **network placement**, **secrets**, or **backup** are treated as afterthoughts.

**Checklist:** [DevOps checklist](./aws-devops-system-design-checklist.md) · [Data services overview](./aws-data-rds-redshift-athena.md)

RDS architecture (subnets): [Amazon RDS inside a VPC](https://docs.aws.amazon.com/images/AmazonRDS/latest/UserGuide/images/VPCConcepts.png)

---

## Use cases

| Engine | Typical workload |
|--------|------------------|
| **Aurora PostgreSQL/MySQL** | HA OLTP, read replicas |
| **RDS PostgreSQL/MySQL** | Standard relational |
| **DynamoDB** | Serverless key-value/document |
| **DocumentDB** | Mongo-compatible ([TLS guide](./aws-documentdb-tls-ca-connection.md)) |

This post focuses **RDS/Aurora VPC relational** patterns; DynamoDB adds **VPC endpoints** and **IAM** instead of SG:3306.

---

## Architecture (relational)

```text
App tier (ECS/EKS/Lambda in VPC) ──SG:5432──► RDS in DB subnets (2+ AZ)
                     │
                     └── Secrets Manager (master creds) + optional IAM DB auth
```

**Rules:**

- **DB subnets** -  dedicated private subnets per AZ in **DB subnet group**.
- **No public accessibility** in production.
- **Multi-AZ** for prod RDS; Aurora storage is HA by design - still place instances across AZs.

---

## Console -  create DB subnet group

1. **RDS** → **Subnet groups** → **Create**.
2. Select **VPC** and **private subnets** in ≥2 AZs.
3. Name: `prod-db-subnets`.

---

## Console -  create RDS/Aurora instance

1. **RDS** → **Create database**.
2. **Engine:** Aurora or RDS.
3. **Templates:** Production → **Multi-AZ** where applicable.
4. **Connectivity:**
 - VPC + **DB subnet group**
 - **Public access:** **No**
 - **VPC security group:** create `rds-app-sg` allowing **only app SG** on DB port.
5. **Encryption:** enable at rest (KMS CMK).
6. **Authentication:** enable **IAM database authentication** if apps use IAM tokens ([Lambda RDS IAM](./aws-lambda-rds-iam-auth.md)).
7. **Backup:**
 - Retention (e.g. 7-35 days)
 - Backup window
 - **Copy tags to snapshots**

---

## Security groups (critical)

| SG | Inbound |
|----|---------|
| `rds-sg` | TCP 5432/3306 **from** `app-sg` only |
| `app-sg` | From ALB or mesh - not open to world |

**Hybrid:** add on-prem CIDR only if Site-to-Site VPN/DX exists ([VPN guide](./aws-site-to-site-vpn-console-guide.md)).

---

## Secrets & rotation

1. **Secrets Manager** → store master password or use RDS integration.
2. Enable **rotation** (Lambda in VPC with RDS SG access).
3. Applications read secret via **task role** - never bake passwords in images.

---

## Backup & DR

| Feature | Console |
|---------|---------|
| Automated backups | RDS → **Maintenance & backups** |
| Manual snapshot | **Snapshots** → **Take snapshot** |
| Cross-region copy | Snapshot → **Copy** |
| AWS Backup | Central vaults, legal hold, cross-account |

**Restore drill:** quarterly restore to staging cluster from snapshot.

---

## Commonly missed

| Miss | Risk |
|------|------|
| DB in single AZ subnet group mistake | Cannot enable Multi-AZ |
| App and DB different VPCs without peering/TGW | Connection timeout |
| SG allows entire VPC CIDR | Over-broad blast radius |
| `max_connections` vs app pool size | Exhaustion under load |
| Deletion protection off | Accidental destroy |

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Timeout | SG, subnet route, wrong endpoint (reader vs writer) |
| `password authentication failed` | Secret rotation drift |
| SSL required | Download RDS CA bundle; enforce `sslmode` |
| Storage full | Autoscaling max; alarms on `FreeStorageSpace` |

Docs: [RDS in VPC](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.html) · [Aurora best practices](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.BestPractices.html)

[← Checklist](./aws-devops-system-design-checklist.md)
