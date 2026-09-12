---
title: "ElastiCache for Valkey - Lambda Caching Pattern"
description: "Cache-aside with Lambda, ElastiCache for Valkey, and DynamoDB - VPC setup, TLS client, TTL keys, invalidation, and advanced caching patterns."
tags:
  - elasticache
  - valkey
  - lambda
  - dynamodb
  - caching
  - redis
  - aws
  - notes
date: 2026-08-24
---

## Overview

Cache product reads in **Amazon ElastiCache for Valkey** so Lambda does not hit **DynamoDB** on every request. On a cache miss, load from the database, store in Valkey with a TTL, then return.

```text
Client
   │
   ▼
API Gateway / ALB
   │
   ▼
Lambda (VPC - private subnet)
   │
   ├──────── Cache HIT ───────► ElastiCache for Valkey
   │
   └──────── Cache MISS
              │
              ▼
           DynamoDB  (via Gateway endpoint)
              │
              ▼
         Populate cache → return
```

**Example API**

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/products/{id}` | Cache-aside by `product:{id}` |
| `GET` | `/products?category=electronics` | Cache-aside by `category:{name}` |
| `PUT` | `/products/{id}` | Write DynamoDB, invalidate cache keys |
| `DELETE` | `/products/{id}` | Delete DynamoDB, invalidate cache key |

**Reference implementation:** [`dir/valkey/valkey-lambda-dynamdb.py`](./dir/valkey/valkey-lambda-dynamdb.py)

---

## Valkey basics (what you store)

Valkey is a **key/value** store. Values are usually JSON strings.

| Concept | Example in this pattern |
| --- | --- |
| Namespaced keys | `product:123`, `category:electronics` |
| TTL | `EX 300` → expire after 5 minutes |
| Serialization | `json.dumps()` on write, `json.loads()` on read |
| TLS | Required in transit for ElastiCache Serverless / encryption in transit |

**Key naming convention**

```text
product:123
category:electronics:page:1
user:456:preferences
```

Keep keys predictable - your invalidation logic depends on them.

---

## Infrastructure setup

Lambda runs in a **VPC private subnet** to reach Valkey. DynamoDB is a public AWS API, so add a **DynamoDB Gateway VPC endpoint** (no NAT required for DynamoDB traffic).

### 1. Subnets

| Subnet | Purpose |
| --- | --- |
| **Private subnet A** | Lambda ENI, ElastiCache subnet group |
| **Private subnet B** | Second AZ for ElastiCache multi-AZ (recommended) |

Lambda and Valkey must be in subnets that can route to each other inside the VPC.

### 2. Security groups (use separate SGs)

| Security group | Attached to | Inbound | Outbound |
| --- | --- | --- | --- |
| `sg-lambda` | Lambda | - | TCP `6379` → `sg-valkey` |
| `sg-valkey` | ElastiCache cluster | TCP `6379` from `sg-lambda` | - |

Rule of thumb: **only Lambda SG can talk to Valkey on 6379**. Do not expose Valkey to `0.0.0.0/0`.

### 3. ElastiCache for Valkey

| Setting | Value |
| --- | --- |
| Engine | Valkey |
| Subnet group | Private subnets above |
| Security group | `sg-valkey` |
| Port | `6379` (default) |
| Encryption in transit | Enabled (TLS) |

Note the **primary endpoint** hostname - Lambda uses it as `VALKEY_ENDPOINT`.

### 4. DynamoDB Gateway endpoint

Create a **Gateway** endpoint for `com.amazonaws.<region>.dynamodb` and associate it with the **private route tables** used by Lambda subnets.

Without this, a VPC Lambda cannot reach DynamoDB unless you add a NAT Gateway.

### 5. Lambda configuration

| Setting | Value |
| --- | --- |
| VPC | Private subnets |
| Security group | `sg-lambda` |
| Layer / package | `redis` (or `valkey-glide`) in deployment package |
| Env vars | `VALKEY_ENDPOINT`, `DYNAMODB_TABLE` |

Environment variables:

```bash
VALKEY_ENDPOINT=my-cluster.xxxxxx.use1.cache.amazonaws.com
VALKEY_PORT=6379
DYNAMODB_TABLE=ProductsTable
```

### 6. Python client (TLS)

```python
import os
import redis

cache = redis.Redis(
    host=os.environ.get("VALKEY_ENDPOINT"),
    port=int(os.environ.get("VALKEY_PORT", 6379)),
    ssl=True,
    ssl_cert_reqs="required",
    decode_responses=True,
    # socket_timeout=2,
    # socket_connect_timeout=2,
)
```

---

## Cache-aside - worked example

**Request:** `GET /products/123`

Think of it as a short conversation between Lambda and Valkey:

```text
Lambda:  GET product:123
Valkey:  (nil)          ← miss

Lambda:  read DynamoDB id=123
Lambda:  SET product:123 <json> EX 300
Lambda:  return product to client
```

**Next request (within 5 minutes):**

```text
Lambda:  GET product:123
Valkey:  {"id":"123",...}   ← hit
Lambda:  return immediately (no DynamoDB call)
```

### Step-by-step

1. Build key: `product:123`
2. `GET product:123` from Valkey
3. **HIT** → parse JSON, return `{ "source": "cache", ... }`
4. **MISS** → `GetItem` from DynamoDB
5. `SETEX product:123 300 <json>`
6. Return `{ "source": "db", ... }`

### Category query example

`GET /products?category=electronics`

```text
Key:     category:electronics
Miss:    Query GSI category-index on DynamoDB
Set:     SETEX category:electronics 300 <items-json>
```

On `PUT` or `DELETE`, delete related keys so clients never see stale data:

```text
PUT /products/123  →  DEL product:123, category:electronics
DELETE /products/123  →  DEL product:123
```

---

## Code walkthrough

[`dir/valkey/valkey-lambda-dynamdb.py`](./dir/valkey/valkey-lambda-dynamdb.py) implements the pattern above.

| Function | What it does |
| --- | --- |
| `cache_get` / `cache_set` / `cache_delete` | Thin wrappers; failures degrade gracefully (skip cache) |
| `get_product` | Cache-aside for `product:{id}` |
| `get_by_category` | Cache-aside for `category:{name}` |
| `put_product` | DynamoDB write + invalidate product and category keys |
| `delete_product` | DynamoDB delete + invalidate product key |
| `lambda_handler` | Routes `GET` / `PUT` / `DELETE` by path and query |

**TTL:** `cache_set` uses `setex(key, 300, ...)` - 5 minutes.

**Warm start:** `redis.Redis(...)` and `boto3.resource('dynamodb')` are created at module scope so subsequent invocations reuse connections.

---

## Advanced patterns (when to level up)

### Distributed lock (thundering herd)

Many concurrent misses on the same hot key can all hit DynamoDB at once. Use a short-lived lock:

```text
GET product:123  →  miss
SET lock:product:123 NX EX 10   ← only one winner

Winner:  read DB → populate cache → DEL lock
Losers:  wait/retry GET product:123
```

### Stale-while-revalidate

Serve slightly old data to protect the database under load.

| Window | Behavior |
| --- | --- |
| **Fresh** (0–5 min) | Return cached value |
| **Stale** (5–7 min) | Return stale value + refresh in background |
| **Expired** (>7 min) | Block on backend fetch |

Example TTL split: fresh **5 min**, stale window **+2 min**.

### Hot key mitigation

Add a local in-process cache (LRU) in front of Valkey for keys hit thousands of times per second:

```text
Request → in-memory cache → Valkey → DynamoDB
```

### Read-through vs cache-aside

| Pattern | Who loads on miss? |
| --- | --- |
| **Cache-aside** (this note) | Your application code |
| **Read-through** | Caching layer calls a loader automatically |

Cache-aside gives you full control; read-through reduces boilerplate in large apps.

### Write strategies

| Strategy | Flow | Best when |
| --- | --- | --- |
| **Write-around** | Write DB only; invalidate or ignore cache | Data rarely read after write |
| **Write-through** | Write cache, then DB | Next read must see new value immediately |
| **Write-behind** | Write cache, return; async worker persists to DB | High write throughput, brief durability lag OK |

This Lambda sample uses **write-around + explicit invalidation** on `PUT`/`DELETE`.

---

## Quick test checklist

1. Deploy Valkey in private subnets; confirm TLS endpoint.
2. Deploy Lambda in same VPC with `sg-lambda` → `sg-valkey` on port 6379.
3. Add DynamoDB Gateway endpoint to private route tables.
4. `GET /products/123` twice - first response `"source": "db"`, second `"source": "cache"`.
5. `PUT /products/123` - next `GET` should miss cache and reload from DynamoDB.

---

## Notes

- **Env var naming:** The sample code reads port from `VALKEY_HOST`; use `VALKEY_PORT` in new deployments for clarity.
- **Cache failures:** `cache_get` / `cache_set` swallow errors and fall back to DynamoDB - good for resilience, but log failures in production.
- **Category cache:** Invalidating `category:{name}` on every product update avoids stale list results; tune if categories are huge.
- **Serverless Valkey:** Same client pattern; ensure Lambda SG can reach the serverless cache endpoint on 6379 with TLS.
