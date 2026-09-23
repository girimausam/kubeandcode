---
title: "ETL with Glue, crawlers, Kinesis, Firehose, and Lambda"
description: "Northwind Retail clickstream: Kinesis Data Streams, Firehose, Lambda transform, S3, Glue crawler, and Glue ETL job. Console steps, IAM, and mistakes."
date: 2026-09-23
tags:
 - aws
 - etl
 - glue
 - kinesis
 - firehose
 - lambda
 - s3
 - analytics
---

# ETL with Glue, crawlers, Kinesis, Firehose, and Lambda

This is a full pipeline, not a service glossary. The example is **Northwind Retail clickstream**: store apps and the website send click and purchase events. You land them in a data lake, catalog them, and produce a curated table for daily reporting.

**Map of other ETL tools:** [AWS ETL in brief](./aws-etl-overview.md)

**Checklist:** [DevOps system design checklist](./aws-devops-system-design-checklist.md)

---

## Scenario

Northwind needs same-day product analytics:

- Web and POS apps emit JSON events (view, add-to-cart, purchase).
- Events must survive bursts (Black Friday) and be queryable in Athena the next hour.
- Raw data stays immutable. A second stage writes Parquet partitioned by date and store.
- PII such as raw email is dropped before the lake.

```text
Apps ->  Kinesis Data Streams ->  Firehose ->  Lambda (transform)
 ->  S3 raw (JSON)
                                                    |
                                              Glue crawler
                                                    |
                                              Glue Data Catalog (raw)
                                                    |
                                              Glue ETL job (Spark)
                                                    |
                                              S3 curated (Parquet)
                                                    |
                                              Glue crawler (curated)
                                                    |
                                              Athena / QuickSight
```

| Stage | Service | Why this one |
| --- | --- | --- |
| Buffer and replay | **Kinesis Data Streams** | Ordered shards, multiple consumers, retention up to 365 days |
| Delivery to S3 | **Kinesis Data Firehose** | Managed batching, compression, S3 prefixes, retries |
| Light transform | **Lambda** | Drop PII, add `eventDate`, reject bad JSON (15 min / memory limits) |
| Schema discovery | **Glue crawler** | Builds tables from S3 prefixes |
| Heavy transform | **Glue ETL job** | JSON to Parquet, partition, job bookmarks |

Do not put Spark-sized joins in the Firehose Lambda. Keep Lambda under a few hundred milliseconds per record batch.

---

## Data contract

One event:

```json
{
  "eventId": "evt-1001",
  "eventType": "purchase",
  "storeId": "store-12",
  "sku": "SKU-440",
  "amountCents": 1999,
  "customerEmail": "a@example.com",
  "eventTime": "2026-09-23T14:05:00Z"
}
```

After Lambda, `customerEmail` is gone and `eventDate` is `2026-09-23`.

---

## Step 1 - S3 buckets and KMS

Console: **S3**.

1. Create `northwind-raw-ACCOUNT` and `northwind-curated-ACCOUNT` in the same Region as Kinesis (example `us-east-1`).
2. **Block all public access**.
3. **Default encryption:** SSE-KMS with a customer managed key `alias/northwind-lake`. See [S3 KMS guide](./aws-s3-kms-encryption-decryption-iam.md).
4. Enable **Bucket Key** to cut KMS request cost.
5. Prefix layout (created by writers, not by you as empty folders):
 - `s3://northwind-raw-ACCOUNT/clickstream/year=YYYY/month=MM/day=DD/`
 - `s3://northwind-curated-ACCOUNT/clickstream/event_date=YYYY-MM-DD/store_id=store-12/`

---

## Step 2 - Kinesis Data Streams

Console: **Kinesis** -> **Data streams** -> **Create data stream**.

| Setting | Value |
| --- | --- |
| Name | `northwind-clickstream` |
| Capacity mode | On-demand to start; switch to provisioned shards if you know peak |
| Encryption | Server-side with the lake CMK or `aws/kinesis` |
| Retention | 24 hours for a lab; 7 days if a consumer can fall behind |

**IAM for producers** (app role): `kinesis:PutRecord`, `kinesis:PutRecords` on the stream ARN, plus `kms:GenerateDataKey` if a CMK is used.

Test with the console **Custom partition key** is not required for this example. Partition key in the SDK should be `storeId` so one store stays ordered on a shard.

Docs: [Kinesis Data Streams](https://docs.aws.amazon.com/streams/latest/dev/introduction.html)

---

## Step 3 - Transform Lambda

Console: **Lambda** -> **Create function** -> Python 3.12 -> name `northwind-firehose-transform`.

Firehose calls this function with a batch. The handler must return records with `result`: `Ok`, `Dropped`, or `ProcessingFailed`.

```python
import base64
import json
from datetime import datetime


def lambda_handler(event, context):
    output = []
    for record in event["records"]:
        payload = base64.b64decode(record["data"])
        try:
            body = json.loads(payload)
            body.pop("customerEmail", None)
            event_time = body.get("eventTime", "")
            body["eventDate"] = event_time[:10] if len(event_time) >= 10 else datetime.utcnow().strftime("%Y-%m-%d")
            encoded = base64.b64encode((json.dumps(body) + "\n").encode()).decode()
            output.append({
                "recordId": record["recordId"],
                "result": "Ok",
                "data": encoded,
            })
        except Exception:
            output.append({
                "recordId": record["recordId"],
                "result": "ProcessingFailed",
                "data": record["data"],
            })
    return {"records": output}
```

**Execution role:** CloudWatch Logs only. Firehose invokes the function; the function does not need Kinesis permissions unless it calls other APIs.

**Timeout:** 60 seconds. **Memory:** 256 MB. Raise if batches are large.

**Resource policy:** Firehose adds permission to invoke this function when you attach it in the delivery stream. If you create the function in another account, add `lambda:InvokeFunction` for `firehose.amazonaws.com`.

---

## Step 4 - Kinesis Data Firehose

Console: **Kinesis** -> **Delivery streams** -> **Create delivery stream**.

| Setting | Value |
| --- | --- |
| Source | Amazon Kinesis Data Streams |
| Stream | `northwind-clickstream` |
| Destination | Amazon S3 |
| Transform | Enabled, function `northwind-firehose-transform` |
| S3 bucket | `northwind-raw-ACCOUNT` |
| Prefix | `clickstream/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/` |
| Error prefix | `clickstream-errors/!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/` |
| Buffer | 64 MB or 60 seconds (lab: 1 MB / 60 seconds so you see files quickly) |
| Compression | GZIP |
| Encryption | Same CMK as the bucket |

**IAM role** created by the console (review it):

- `kinesis:DescribeStream`, `kinesis:GetShardIterator`, `kinesis:GetRecords` on the stream
- `s3:AbortMultipartUpload`, `s3:GetBucketLocation`, `s3:ListBucket`, `s3:PutObject` on the raw bucket
- `kms:Decrypt`, `kms:GenerateDataKey` on the CMK
- `lambda:InvokeFunction` on the transform function
- `logs:PutLogEvents` if CloudWatch error logging is on

Turn on **CloudWatch error logging**.

Docs: [Firehose](https://docs.aws.amazon.com/firehose/latest/dev/what-is-this-service.html) · [Dynamic partitioning](https://docs.aws.amazon.com/firehose/latest/dev/dynamic-partitioning.html) (optional later: partition by `storeId` from the record instead of arrival time)

---

## Step 5 - Prove the path before Glue

1. Put one record (console is limited; use CloudShell):

```bash
aws kinesis put-record \
 --stream-name northwind-clickstream \
 --partition-key store-12 \
 --data "$(echo -n '{"eventId":"evt-1001","eventType":"purchase","storeId":"store-12","sku":"SKU-440","amountCents":1999,"customerEmail":"a@example.com","eventTime":"2026-09-23T14:05:00Z"}' | base64)"
```

2. Wait for the buffer interval.
3. In S3, open the object. Email must be absent. `eventDate` must be present.
4. If the object lands under `clickstream-errors/`, open Firehose logs. Common cause: Lambda returned invalid base64 or omitted `recordId`.

---

## Step 6 - Glue Data Catalog database

Console: **AWS Glue** -> **Data Catalog** -> **Databases** -> **Add database**.

- Name: `northwind_analytics`
- Location: optional URI `s3://northwind-curated-ACCOUNT/`

---

## Step 7 - Glue crawler on raw JSON

Console: **Glue** -> **Crawlers** -> **Create crawler**.

| Setting | Value |
| --- | --- |
| Name | `northwind-raw-clickstream` |
| Data source | S3, `s3://northwind-raw-ACCOUNT/clickstream/` |
| Subsequent crawler runs | Crawl new folders only |
| IAM role | `AWSGlueServiceRole-northwind` (create in the wizard) |
| Database | `northwind_analytics` |
| Table prefix | `raw_` |
| Schedule | On demand first, then hourly |

**Role extras** beyond the managed `AWSGlueServiceRole`:

- `s3:GetObject`, `s3:ListBucket` on raw and curated buckets
- `kms:Decrypt` on the lake CMK (crawlers fail on SSE-KMS without this)
- `logs:CreateLogGroup`, `logs:PutLogEvents`

Run the crawler. Expect table `raw_clickstream`. Open it and confirm columns `eventid`, `eventtype`, `storeid`, `sku`, `amountcents`, `eventdate`, `eventtime`. Glue lowercases names from JSON.

If the crawler creates one table per day folder, the prefixes are not Hive-style enough or the classifier did not group them. Keep `year=/month=/day=` and set **Create a single schema for each S3 path**.

Docs: [Glue crawlers](https://docs.aws.amazon.com/glue/latest/dg/add-crawler.html)

---

## Step 8 - Glue ETL job (raw JSON to curated Parquet)

Console: **Glue** -> **ETL jobs** -> **Visual ETL** or **Script editor**.

Job settings:

| Setting | Value |
| --- | --- |
| Name | `northwind-curate-clickstream` |
| IAM role | same Glue role, plus `s3:PutObject` on curated |
| Glue version | 4.0 or 5.0 |
| Worker type | G.1X |
| Number of workers | 2 for a lab |
| Job bookmark | Enable (so reruns do not reprocess old files) |
| Timeout | 30 minutes |

Script outline (Spark):

```python
import sys
from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext

args = getResolvedOptions(sys.argv, ["JOB_NAME"])
sc = SparkContext()
glue = GlueContext(sc)
job = Job(glue)
job.init(args["JOB_NAME"], args)

dyf = glue.create_dynamic_frame.from_catalog(
    database="northwind_analytics",
    table_name="raw_clickstream",
    transformation_ctx="raw_clickstream",
)

# Keep purchase and view events only; drop null store ids
filtered = dyf.filter(lambda r: r["eventtype"] in ("purchase", "view", "add_to_cart") and r["storeid"])

glue.write_dynamic_frame.from_options(
    frame=filtered,
    connection_type="s3",
    connection_options={
        "path": "s3://northwind-curated-ACCOUNT/clickstream/",
        "partitionKeys": ["eventdate", "storeid"],
    },
    format="parquet",
    transformation_ctx="curated_clickstream",
)
job.commit()
```

Partition column names in the script must match the DynamicFrame field names after the crawler (`eventdate`, `storeid`), not the original camelCase, unless you rename them.

**Run the job** once from the console. Check **Run status** and CloudWatch logs under `/aws-glue/jobs/output`.

---

## Step 9 - Crawler on curated Parquet

Second crawler:

| Setting | Value |
| --- | --- |
| Name | `northwind-curated-clickstream` |
| Path | `s3://northwind-curated-ACCOUNT/clickstream/` |
| Database | `northwind_analytics` |
| Prefix | `curated_` |

Run it after the job. Table `curated_clickstream` should show **partition keys** `eventdate` and `storeid`.

In **Athena**, workgroup output location must be an S3 bucket the user can write, encrypted with a key they can use:

```sql
SELECT eventdate, storeid, count(*) AS events
FROM northwind_analytics.curated_clickstream
WHERE eventdate = '2026-09-23'
GROUP BY 1, 2;
```

---

## Step 10 - Orchestration

Console options, pick one:

1. **Glue trigger** on crawler success -> start ETL job -> start curated crawler. **Glue** -> **Workflows** -> add the three nodes.
2. **EventBridge** rule on `Glue Crawler State Change` = Succeeded.

Do not schedule the ETL job every five minutes if the crawler has not finished. The workflow order is: raw crawler, job, curated crawler.

---

## IAM summary

| Principal | Needs |
| --- | --- |
| App producer | `kinesis:PutRecords`, KMS generate data key |
| Firehose role | Read stream, invoke Lambda, write raw S3, KMS |
| Transform Lambda | Logs only |
| Glue role | Read raw, write curated, KMS decrypt/generate, catalog read/write |
| Athena user | `glue:Get*`, `s3:GetObject` curated, `s3:PutObject` query results, `kms:Decrypt` |

---

## Security

- No public buckets. Deny `aws:SecureTransport` = false on both buckets.
- Separate CMKs if raw contains more sensitive fields than curated. This example strips email before S3, so one CMK is acceptable for a lab.
- VPC: Kinesis, Firehose, Glue, and Lambda in this design use public AWS APIs. If the producer runs in a private subnet, add a **Kinesis interface endpoint** or NAT.
- Glue job bookmarks plus immutable raw prefixes let you replay a bad transform by resetting the bookmark, not by asking stores to resend.

---

## Common mistakes

| Mistake | What you see |
| --- | --- |
| Lambda does not append newline between JSON objects | Crawler sees one giant line or fails classification |
| Firehose buffer left at 128 MB in a demo | No S3 objects for a long time |
| Glue role missing `kms:Decrypt` | Crawler error on encrypted objects |
| Crawler path includes the error prefix | Bad records mixed into the raw table |
| Job writes partitions the crawler has not been told to update | Athena misses new dates until `MSCK REPAIR` or a second crawl |
| Using Glue for per-event latency under one second | Wrong tool; query the stream or use Lambda consumers instead |
| Putting email in curated "just in case" | Compliance failure; drop it in Lambda |

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Stream incoming bytes, no S3 files | Firehose status, Lambda errors, IAM on delivery role |
| S3 files but crawler table empty | Path, classifier, GZIP (Glue reads gzip JSON if the extension is `.gz`) |
| Job succeeds, Athena empty | Partition projection or crawler not rerun; `SHOW PARTITIONS` |
| `AccessDeniedException` on KMS | Key policy must allow the Glue and Firehose roles |
| Duplicate curated rows | Job bookmark disabled and the job rerun on the same raw files |

Metrics: Kinesis `IncomingRecords`, Firehose `DeliveryToS3.Success`, Glue job failed count. Alarm all three.

---

## What belongs in a different tool

| Need | Use instead |
| --- | --- |
| CDC from Aurora | [DMS](./aws-etl-overview.md), then this lake pattern |
| SQL only, small files already in S3 | Athena CTAS, skip Spark |
| Sub-second fan-out to many apps | Kinesis enhanced fan-out or Lambda event source mapping, not Firehose |

---

## References

- [What is AWS Glue?](https://docs.aws.amazon.com/glue/latest/dg/what-is-glue.html)
- [Kinesis Data Firehose data transformation](https://docs.aws.amazon.com/firehose/latest/dev/data-transformation.html)
- [Populating the Data Catalog](https://docs.aws.amazon.com/glue/latest/dg/populate-data-catalog.html)
- [Job bookmarks](https://docs.aws.amazon.com/glue/latest/dg/monitor-continuations.html)

[<- ETL overview](./aws-etl-overview.md) · [<- Checklist](./aws-devops-system-design-checklist.md)
