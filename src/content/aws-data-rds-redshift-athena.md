---
title: "Data on AWS: RDS, Redshift, and Athena"
description: "Operational runbooks for Amazon RDS day-2 checks, Redshift COPY loads from S3, and Athena tables for VPC Flow Logs forensics."
tags:
  - rds
  - redshift
  - athena
  - s3
  - databases
  - analytics
  - aws
---

## Overview

Operational checklists and copy-paste patterns for three common data workflows on AWS:

| Section | Use when |
| --- | --- |
| [Amazon RDS](#amazon-rds) | Connecting to managed databases, backups, SSL, and performance triage |
| [Redshift COPY from S3](#redshift-copy-from-s3) | Loading warehouse data from S3 with IAM roles |
| [Athena forensics](#athena-forensics) | Querying VPC Flow Logs stored in S3 |

---

## Amazon RDS

Day-2 checklist for connectivity, backups, SSL, and performance triage on Amazon RDS.

### Connectivity checklist

- **Publicly accessible** alone is not enough - verify subnet routes, security groups, and NACL return traffic.
- Prefer **private subnets** with inbound rules from the application security group only.
- Confirm **SSL** requirements and engine-specific parameters such as `rds.force_ssl` when enforced.

### Operations checklist

- Set **backup retention**, deletion protection, and final snapshot behavior deliberately.
- Track parameter group changes that enter `pending-reboot`.
- Enable **CloudWatch metrics** plus Database Insights or Performance Insights depending on engine support.

### Export data with the MySQL client

```bash
mysql -h <endpoint> -P 3306 -u <user> -p --ssl-ca=global-bundle.pem <db> \
  -e "SELECT * FROM products" > products.csv
```

### References

- [RDS Performance Insights](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PerfInsights.html)
- [Connecting to an RDS DB instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_CommonTasks.Connect.html)

---

## Redshift COPY from S3

Load data from Amazon S3 into Amazon Redshift using the `COPY` command and an IAM role (no long-lived access keys).

### Recommended `COPY` pattern

```sql
COPY target_table
FROM 's3://bucket/prefix/'
IAM_ROLE 'arn:aws:iam::<account-id>:role/<redshift-copy-role>'
FORMAT AS JSON 'auto'
REGION '<bucket-region>';
```

Replace `FORMAT AS JSON 'auto'` with `CSV`, `PARQUET`, or other formats as needed.

### Pre-flight checklist

| Check | Why it matters |
| --- | --- |
| Use `IAM_ROLE` | Avoids embedding access keys in SQL or secrets |
| Grant `s3:GetObject` and `s3:ListBucket` | Role must read the source prefix |
| Include KMS permissions | Required when objects use SSE-KMS |
| Use manifest files | Controlled, repeatable multi-file loads |
| Load via staging tables | Validate rows before merging to production tables |
| Set `REGION` | Required when the S3 bucket is in a different Region than the cluster |

### References

- [Redshift COPY command](https://docs.aws.amazon.com/redshift/latest/dg/r_COPY.html)
- [COPY from Amazon S3](https://docs.aws.amazon.com/redshift/latest/dg/copy-parameters-data-source-s3.html)
- [COPY credentials and permissions](https://docs.aws.amazon.com/redshift/latest/dg/loading-data-access-permissions.html)

---

## Athena forensics

Query **VPC Flow Logs** (and similar log data) in S3 with Amazon Athena. For full OrderFlow query samples, see [OrderFlow snippets](/orderflow-snippets/).

### VPC Flow Logs external table

Point the table `LOCATION` at your log prefix. Partition by `date` to limit scan cost.

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS vpc_flow_logs (
  version int,
  account_id string,
  interface_id string,
  srcaddr string,
  dstaddr string,
  srcport int,
  dstport int,
  protocol bigint,
  packets bigint,
  bytes bigint,
  start bigint,
  `end` bigint,
  action string,
  log_status string
)
PARTITIONED BY (`date` date)
ROW FORMAT DELIMITED FIELDS TERMINATED BY ' '
LOCATION 's3://DOC-EXAMPLE-BUCKET/AWSLogs/{account_id}/vpcflowlogs/{region_code}/'
TBLPROPERTIES ("skip.header.line.count"="1");
```

After creating the table, add partitions (or use partition projection) before running queries:

```sql
ALTER TABLE vpc_flow_logs ADD IF NOT EXISTS
  PARTITION (`date`='2026-06-01')
  LOCATION 's3://DOC-EXAMPLE-BUCKET/AWSLogs/123456789012/vpcflowlogs/us-east-1/2026/06/01/';
```

### Example query - top talkers by bytes

```sql
SELECT srcaddr, dstaddr, SUM(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE `date` = DATE '2026-06-01'
  AND action = 'ACCEPT'
GROUP BY srcaddr, dstaddr
ORDER BY total_bytes DESC
LIMIT 20;
```
