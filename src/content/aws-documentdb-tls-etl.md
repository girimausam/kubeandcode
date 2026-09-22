---
title: "Amazon DocumentDB: TLS in Transit with the RDS CA Bundle, plus AWS ETL in Brief"
description: "Connect to DocumentDB with encryption in transit using global-bundle.pem, cluster TLS settings, and CA rotation notes—then a concise map of AWS ETL options (Glue, EMR, DMS, and orchestration)."
date: 2026-09-22
tags:
  - aws
  - documentdb
  - mongodb
  - tls
  - security
  - glue
  - etl
resources:
  - title: Encrypting data in transit (DocumentDB)
    url: https://docs.aws.amazon.com/documentdb/latest/developerguide/security.encryption.ssl.html
  - title: Connecting programmatically to DocumentDB
    url: https://docs.aws.amazon.com/documentdb/latest/developerguide/connect_programmatically.html
  - title: Updating your TLS certificates (CA rotation)
    url: https://docs.aws.amazon.com/documentdb/latest/devguide/ca_cert_rotation.html
  - title: What is AWS Glue?
    url: https://docs.aws.amazon.com/glue/latest/dg/what-is-glue.html
  - title: What is AWS Database Migration Service?
    url: https://docs.aws.amazon.com/dms/latest/userguide/Welcome.html
---

Two topics that often show up together: **getting DocumentDB connections right under TLS**, and **where ETL lives on AWS** when you need to move or reshape that data.

---

## Part 1 — DocumentDB and TLS in transit

Amazon DocumentDB (with MongoDB compatibility) encrypts data **in transit** with **TLS** by default. Clients must use TLS unless you explicitly disable it on the cluster (not recommended for production).

At a high level:

1. The cluster presents a **server certificate** signed by an AWS **CA**.
2. Your application downloads the **CA bundle** (`global-bundle.pem`) and uses it to **verify** the server during the TLS handshake.
3. Traffic on port **27017** is encrypted; identity verification fails if the CA file is missing, wrong, or outdated.

```mermaid
flowchart LR
  APP[Application / Lambda / EKS]
  CA[global-bundle.pem on client]
  DOC[(DocumentDB cluster)]
  APP -->|"TLS + verify server cert"| DOC
  CA --> APP
```

### Download the CA bundle

AWS publishes the same trust store used across RDS-family engines:

```bash
curl -o global-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

On Windows, PKCS#7 is also available: `https://truststore.pki.rds.amazonaws.com/global/global-bundle.p7b`.

**Operational note:** The DocumentDB CA was updated in **2024**. The current `global-bundle.pem` includes **multiple** root CAs (legacy and new RSA/ECC roots). Trust the **bundle**, not an individual instance certificate—DocumentDB **rotates server certificates** automatically (~12 months); clients that pin only the leaf cert break after rotation. See [CA certificate rotation](https://docs.aws.amazon.com/documentdb/latest/devguide/ca_cert_rotation.html).

### Cluster-side TLS parameter

TLS is controlled by the **`tls`** parameter in a **cluster parameter group** (enabled by default on new clusters). To confirm:

```bash
aws docdb describe-db-cluster-parameters \
  --db-cluster-parameter-group-name default.docdb5.0 \
  --query "Parameters[?ParameterName=='tls']"
```

Use a custom parameter group if you need a deliberate change; reboot instances when the parameter is **pending-reboot**.

### Network prerequisites

DocumentDB runs in a **VPC**. Typical production layout:

| Check | Detail |
| --- | --- |
| Endpoint | Cluster endpoint (writer) or reader endpoint |
| Port | **27017** |
| Security group | Inbound from app SG only |
| Subnets | Private; no public access unless you have a specific reason |
| Auth | Username/password in Secrets Manager or IAM-aware patterns where supported |

### Connect with `mongosh` (CLI)

Replace host, user, and password:

```bash
export DOCDB_HOST="mycluster.cluster-xxxxx.us-east-1.docdb.amazonaws.com"
export DOCDB_USER="appuser"
export DOCDB_PASS="your-password"

mongosh "mongodb://${DOCDB_USER}:${DOCDB_PASS}@${DOCDB_HOST}:27017/?tls=true&tlsCAFile=global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false"
```

DocumentDB-specific connection flags you should remember:

| Option | Why |
| --- | --- |
| `tls=true` | Required when cluster TLS is on (default) |
| `tlsCAFile=global-bundle.pem` | Validates server against AWS CA |
| `replicaSet=rs0` | DocumentDB replica set name |
| `readPreference=secondaryPreferred` | Offload reads to replicas when safe |
| `retryWrites=false` | **Required** — DocumentDB does not support MongoDB retryable writes |

### Python (PyMongo)

```python
from pymongo import MongoClient

uri = (
    "mongodb://appuser:password@mycluster.cluster-xxxxx.us-east-1.docdb.amazonaws.com:27017/"
    "?tls=true&tlsCAFile=global-bundle.pem&replicaSet=rs0"
    "&readPreference=secondaryPreferred&retryWrites=false"
)

client = MongoClient(uri)
db = client["mydb"]
print(db.list_collection_names())
```

For **Lambda** or **ECS**, bake `global-bundle.pem` into the image or layer, or fetch it at startup from a trusted internal mirror (not from the public internet on every cold start unless you accept that dependency).

### Node.js (MongoDB driver)

```javascript
const { MongoClient } = require("mongodb");

const client = new MongoClient(
  "mongodb://appuser:password@mycluster.cluster-xxxxx.us-east-1.docdb.amazonaws.com:27017",
  {
    tls: true,
    tlsCAFile: "global-bundle.pem",
    replicaSet: "rs0",
    readPreference: "secondaryPreferred",
    retryWrites: false,
  }
);

await client.connect();
```

### Java (MongoDB driver)

Either import the PEM into a **JKS truststore** with `keytool`, or build an `SSLContext` from `global-bundle.pem` and attach it to `MongoClientSettings` (Option 2 in [Java TLS connection guide](https://docs.aws.amazon.com/documentdb/latest/developerguide/java-pg-connect-mongo-driver.html)).

### TLS troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `certificate verify failed` | Missing/wrong CA file; outdated single-root PEM |
| `connection timed out` | SG, NACL, or wrong subnet / no route |
| `not authorized` | User, password, or auth database |
| Writes fail with retry errors | `retryWrites` left `true` |
| Breaks after AWS maintenance | Client pinned leaf cert instead of CA bundle |

### Console checklist

1. **DocumentDB** → Clusters → your cluster → note **Connectivity & security** (endpoint, VPC, SG).
2. Confirm **Encryption in transit** / TLS enabled (parameter group).
3. **EC2** → Security groups → inbound **27017** from application tier only.
4. Store credentials in **Secrets Manager**; rotate without embedding passwords in code.
5. For compliance, enable **encryption at rest** (KMS) separately from TLS—both are recommended.

---

## Part 2 — AWS ETL in brief

**ETL** (extract, transform, load) on AWS is usually split into: **where data lives**, **how you transform it**, and **what orchestrates** the steps.

```mermaid
flowchart TB
  subgraph sources
    S3[(S3)]
    RDS[(RDS / DocumentDB)]
    SaaS[SaaS / APIs]
  end

  subgraph transform
    GLUE[AWS Glue ETL / Spark]
    EMR[Amazon EMR]
    LAM[Lambda]
  end

  subgraph targets
    RS[(Redshift)]
    LH[(Lake / Iceberg on S3)]
    DW[(OpenSearch / DynamoDB)]
  end

  subgraph orchestration
    WF[Glue Workflows / EventBridge / Step Functions]
    DP[AWS Data Pipeline]
  end

  sources --> transform --> targets
  orchestration --> transform
```

### Pick a tool (quick guide)

| Service | Best for | You manage |
| --- | --- | --- |
| **AWS Glue** | Serverless Spark/Python ETL, crawlers, **Data Catalog**, scheduled jobs | Job scripts, IAM, connections |
| **Amazon EMR** | Large or long-running Spark/Hive clusters, fine-grained tuning | Clusters, patching, capacity |
| **AWS DMS** | **CDC** and homogeneous/heterogeneous **database replication** (e.g. DocumentDB → S3, RDS → Aurora) | Replication instances, task mapping |
| **Lambda + S3** | Small files, event-driven transforms (CSV → Parquet) | Code limits, concurrency |
| **Athena + CTAS** | SQL transforms directly on S3 data | Table DDL, partition strategy |
| **Redshift `COPY` / Spectrum** | Warehouse load and query over the lake | WLM, sort keys, grants |
| **AWS Data Pipeline** | Legacy **schedule + dependency** orchestration across EMR, RDS, S3 | Pipeline definitions (many teams prefer Glue Workflows or Step Functions for new work) |
| **Amazon AppFlow** | SaaS → S3/Salesforce-style **managed** ingestion | Flow configuration |

For **DocumentDB → analytics**, common patterns are:

1. **DMS** (ongoing CDC or full load) to **S3** (Parquet/JSON) → **Glue** catalog → **Athena** or **Redshift Spectrum**.
2. **Glue ETL job** reading from a JDBC DocumentDB connection (with TLS connection properties and CA) → curated zone on S3.
3. **Application-level export** (batch job on ECS/EKS) when you need custom aggregation before landing in the lake.

### Minimal Glue mental model

1. **Crawler** (or manual table) → **Glue Data Catalog** metadata.
2. **ETL job** (Spark or Python shell) reads source, transforms, writes target.
3. **Trigger** (schedule or event) starts the job; **Workflow** chains crawlers + jobs.
4. Pay for **DPUs** (or Ray workers) while the job runs—no cluster to provision in the serverless model.

Example: nightly job lands denormalized collections from S3 raw prefix to `s3://data-lake/curated/docdb/orders/` partitioned by `dt=YYYY-MM-DD`, then Athena or Redshift loads from there.

### Design habits that age well

- **Land raw** in S3 (immutable), **curate** in a second stage—replay transforms without re-hitting DocumentDB.
- Use **IAM roles**, not access keys, for Glue, DMS, and Lambda.
- Align **encryption**: TLS to DocumentDB; **SSE-KMS** on S3; enforce TLS on Redshift and Glue connections.
- For DocumentDB sources, set JDBC/connection options for **SSL** and attach the same **CA bundle** trust store Glue uses in the job network.
- Monitor with **CloudWatch** job metrics, **DMS task** latency, and alarms on failed pipeline runs.

### When “ETL” is really “ELT”

Many teams **extract/load** raw data first (DMS, AppFlow, Firehose), then **transform in the warehouse or with Athena SQL** (ELT). Glue fits both models; choose based on whether Spark complexity is worth it versus SQL-only transforms.

---

## Summary

| Topic | Takeaway |
| --- | --- |
| DocumentDB TLS | Default on; use `global-bundle.pem` and `tlsCAFile` / driver TLS options |
| CA rotation | Trust the **bundle**; refresh client trust stores when AWS adds roots |
| Mongo API quirks | `retryWrites=false`, `replicaSet=rs0`, reader endpoint for read scaling |
| AWS ETL | **Glue** for serverless Spark catalog pipelines; **DMS** for DB replication; **EMR** for heavy Spark; orchestrate with Glue Workflows, EventBridge, or Step Functions |

Official references are linked in **Resources** at the top of this page.
