---
title: "DocumentDB: TLS in Transit and Connecting with the CA Bundle"
description: "Enable and verify TLS to DocumentDB using global-bundle.pem—mongosh, Python, and Node examples, cluster parameters, CA rotation, and console checklist."
date: 2026-09-22
tags:
  - aws
  - documentdb
  - mongodb
  - tls
  - security
resources:
  - title: Encrypting data in transit (DocumentDB)
    url: https://docs.aws.amazon.com/documentdb/latest/developerguide/security.encryption.ssl.html
  - title: Connecting programmatically to DocumentDB
    url: https://docs.aws.amazon.com/documentdb/latest/developerguide/connect_programmatically.html
  - title: Updating your TLS certificates (CA rotation)
    url: https://docs.aws.amazon.com/documentdb/latest/devguide/ca_cert_rotation.html
---

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

## Download the CA bundle

AWS publishes the same trust store used across RDS-family engines:

```bash
curl -o global-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

On Windows, PKCS#7 is also available: `https://truststore.pki.rds.amazonaws.com/global/global-bundle.p7b`.

**Operational note:** The DocumentDB CA was updated in **2024**. The current `global-bundle.pem` includes **multiple** root CAs (legacy and new RSA/ECC roots). Trust the **bundle**, not an individual instance certificate—DocumentDB **rotates server certificates** automatically (~12 months); clients that pin only the leaf cert break after rotation. See [CA certificate rotation](https://docs.aws.amazon.com/documentdb/latest/devguide/ca_cert_rotation.html).

## Cluster-side TLS parameter

TLS is controlled by the **`tls`** parameter in a **cluster parameter group** (enabled by default on new clusters). To confirm:

```bash
aws docdb describe-db-cluster-parameters \
  --db-cluster-parameter-group-name default.docdb5.0 \
  --query "Parameters[?ParameterName=='tls']"
```

Use a custom parameter group if you need a deliberate change; reboot instances when the parameter is **pending-reboot**.

## Network prerequisites

DocumentDB runs in a **VPC**. Typical production layout:

| Check | Detail |
| --- | --- |
| Endpoint | Cluster endpoint (writer) or reader endpoint |
| Port | **27017** |
| Security group | Inbound from app SG only |
| Subnets | Private; no public access unless you have a specific reason |
| Auth | Username/password in Secrets Manager or IAM-aware patterns where supported |

## Connect with `mongosh` (CLI)

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

## Python (PyMongo)

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

## Node.js (MongoDB driver)

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

## Java (MongoDB driver)

Either import the PEM into a **JKS truststore** with `keytool`, or build an `SSLContext` from `global-bundle.pem` and attach it to `MongoClientSettings` (Option 2 in the [Java TLS connection guide](https://docs.aws.amazon.com/documentdb/latest/developerguide/java-pg-connect-mongo-driver.html)).

## TLS troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `certificate verify failed` | Missing/wrong CA file; outdated single-root PEM |
| `connection timed out` | SG, NACL, or wrong subnet / no route |
| `not authorized` | User, password, or auth database |
| Writes fail with retry errors | `retryWrites` left `true` |
| Breaks after AWS maintenance | Client pinned leaf cert instead of CA bundle |

## Console checklist

1. **DocumentDB** → Clusters → your cluster → note **Connectivity & security** (endpoint, VPC, SG).
2. Confirm **Encryption in transit** / TLS enabled (parameter group).
3. **EC2** → Security groups → inbound **27017** from application tier only.
4. Store credentials in **Secrets Manager**; rotate without embedding passwords in code.
5. For compliance, enable **encryption at rest** (KMS) separately from TLS—both are recommended.

## Summary

| Topic | Takeaway |
| --- | --- |
| TLS | On by default; use `global-bundle.pem` and `tlsCAFile` / driver TLS options |
| CA rotation | Trust the **bundle**; refresh client trust stores when AWS adds roots |
| Mongo API quirks | `retryWrites=false`, `replicaSet=rs0`, reader endpoint for read scaling |

Official references are linked in **Resources** at the top of this page.
