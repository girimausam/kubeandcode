---
title: "DynamoDB Accelerator (DAX) - Use and Integrate"
description: "Swap the DynamoDB client for a DAX client: cluster in a VPC, IAM, Lambda packaging, item vs query cache, write-through, and when to call DynamoDB directly for strong reads."
tags:
  - dynamodb
  - dax
  - lambda
  - caching
  - aws
  - notes
date: 2026-08-29
---

## Integration in one change

DAX is a **write-through** cache for DynamoDB **inside a VPC**. The API is the DynamoDB data-plane API. You do **not** invent cache keys: replace `boto3.client("dynamodb")` with `amazondax.AmazonDaxClient` (or the Java `ClusterDaxAsyncClient`) and keep `GetItem` / `PutItem` / `Query` as they are.

```text
App (same DynamoDB API)
        │
        ▼
 DAX cluster  (item cache + query cache)
        │  miss / write
        ▼
     DynamoDB
```

**Reference:** [`dir/lambda/lambda-dax.py`](./dir/lambda/lambda-dax.py) — eventual reads through DAX, strong reads through DynamoDB.

Not a general cache (lists, TTL keys, pub/sub). For that pattern see [Valkey + Lambda + DynamoDB](./elastic-cache-valkey-lambda.md).

---

## What gets cached

| Path | Cache | Hit key |
| --- | --- | --- |
| `GetItem`, `BatchGetItem` (eventual) | Item cache | Primary key |
| `Query`, `Scan` (eventual) | Query cache | Full request parameters |
| `ConsistentRead=true` | None | Passed to DynamoDB, **not** stored |
| `TransactGetItems` | None | Same — skip DAX |

Writes through DAX (`PutItem`, `UpdateItem`, `DeleteItem`, `BatchWriteItem`): DynamoDB first, then **item** cache. Success only if **both** succeed.

Writes through DAX **do not** refresh the **query** cache. Query/Scan results live until **TTL** (cluster default often 5 minutes) or eviction. Tune query TTL or avoid caching large scans.

Production: **≥ 3 nodes**. 1–2 nodes are not fault-tolerant.

---

## Cluster (once)

1. **Subnet group** — private subnets in the VPC the app (or Lambda ENIs) use.  
2. **Security group** — inbound **TCP 8111** (no TLS) or **9111** (encryption in transit) from the app SG.  
3. **IAM service role on the cluster** — DynamoDB `GetItem`/`PutItem`/… on the tables DAX will touch. DAX assumes this role to talk to DynamoDB.  
4. Create cluster: node type, size, encryption at rest, encryption in transit (set at **create**; cannot flip later). Copy the **cluster endpoint**.  
   - Unencrypted: `dax://…` port **8111**  
   - TLS: `daxs://…` port **9111**

TLS cannot be mixed on the same cluster. Client must match.

---

## App IAM vs cluster IAM

Calls go to **DAX**, not `dynamodb.amazonaws.com`.

| Principal | Actions | Resource |
| --- | --- | --- |
| Cluster role | `dynamodb:GetItem`, `PutItem`, `Query`, … | Table ARNs |
| App / Lambda role | `dax:GetItem`, `dax:PutItem`, `dax:Query`, … | Cluster ARN |

`dynamodb:GetItem` on the Lambda role does **not** authorize a DAX `GetItem`. Strong reads that bypass DAX still need `dynamodb:GetItem` on the table.

---

## Python client

Package is **not** in the Lambda runtime. `pip install amazon-dax-client` into the deployment zip or a layer (`# pip install amazon-dax-client -t package` in [`lambda-dax.py`](./dir/lambda/lambda-dax.py)).

Create the client **once** at module scope (warm starts reuse the connection).

```python
import amazondax
import boto3
import os

dax = amazondax.AmazonDaxClient(
    endpoints=[os.environ["DAX_ENDPOINT"]],
    region_name=os.environ["AWS_REGION"],
)
dynamodb = boto3.client("dynamodb")  # strong reads / transactions only
```

TLS endpoint example: `daxs://my-cluster.xxxx.dax-clusters.us-east-1.amazonaws.com`.

Java 2.x: `ClusterDaxAsyncClient` with `url` = cluster URL, then the same `getItem` calls — [modify an existing app](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.client.modify-your-app.html).

---

## Lambda

DAX has **no public endpoint**. Attach Lambda to the **same VPC**, private subnets that can reach the DAX SG, execution role `AWSLambdaVPCAccessExecutionRole` plus `dax:*` on the cluster.

Env: `TABLE_NAME`, `DAX_ENDPOINT`.

[`lambda-dax.py`](./dir/lambda/lambda-dax.py) routes:

| Path | Client | Why |
| --- | --- | --- |
| `/eventual` | `dax.get_item` | Cache hit or miss → DynamoDB, then item cache |
| `/strong` | `dynamodb.get_item(..., ConsistentRead=True)` | DAX would only proxy and not cache |

Do not send strong/transactional reads to DAX: extra hop, no cache benefit.

---

## Writes from the app

Use **`dax.put_item` / `update_item` / `delete_item`** so the item cache stays aligned. If another writer uses the DynamoDB API only, DAX item cache is stale until TTL. Query cache stays stale regardless until TTL.

---

## Fit

**Use DAX** for high `GetItem`/`BatchGetItem` (and simple Query) rate, eventual consistency OK, same DynamoDB API.

**Skip DAX** for mostly strong reads, transactions, write-heavy with many Query shapes, or cache-aside with custom keys — use DynamoDB directly or [Valkey](./elastic-cache-valkey-lambda.md).

---

## References

- [How DAX works](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.concepts.html)
- [Consistency, item vs query cache](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.consistency.html)
- [When DAX is a fit](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/evaluate-dax-suitability.html)
- [DAX clients](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.client.html)
- [Encryption in transit](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAXEncryptionInTransit.html)
- [Lambda + DAX (re:Post)](https://repost.aws/knowledge-center/dax-cluster-lambda-function)
