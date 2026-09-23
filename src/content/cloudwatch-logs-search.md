---
title: "Search CloudWatch Logs"
description: "Current ways to search CloudWatch Logs: log group filter, Logs Insights, OpenSearch SQL and PPL, Live Tail, field indexes, and saved queries."
tags:
  - aws
  - cloudwatch
  - logs
  - observability
---

# Search CloudWatch Logs

CloudWatch Logs has more than one search box. Picking the wrong one is why a query returns nothing on data you can see in the stream.

| Tool | Use it when |
| --- | --- |
| Log stream scroll | You know the stream (one Lambda request, one Batch job attempt) and the window is short |
| Log group **Search log group** | A literal string or a filter pattern on one group, last few hours |
| **Logs Insights** | Counts, parses, stats, several groups, a saved query |
| **Live tail** | The process is running now and you want new lines as they arrive |
| **Metric filter** | You need an alarm later, not an answer right now |

Docs: [Filter and pattern syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html) · [CloudWatch Logs Insights query syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html) · [OpenSearch SQL and PPL](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_AnalyzeLogData_Languages.html) · [Live Tail](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogs_LiveTail.html)

---

## Scenario

Northwind API Lambda writes JSON to `/aws/lambda/northwind-upload`. Batch writes text to `/aws/batch/northwind`. You need 500 responses in the last day, and you need to watch a deploy as it happens.

---

## Log group filter

Console: **CloudWatch** -> **Log groups** -> `/aws/lambda/northwind-upload` -> **Search log group**.

Set the time range first. The default is often 1 hour or 30 minutes. A wide range on a busy group is slow and can hit the filter quota.

Search box examples:

| You type | What it matches |
| --- | --- |
| `"Invalid permissions"` | That phrase. Quotes mean the words together |
| `ERROR` | The token ERROR |
| `{ $.statusCode = 500 }` | JSON field. The line must be one JSON object |
| `{ $.statusCode = 500 && $.path = "/files" }` | Both fields |
| `?"AccessDenied" ?"timeout"` | Either term |

This filter does not do `stats` or `count`. It returns events. For a count, use Insights.

**Log class.** A group created as **Infrequent Access** is cheaper and does not support all Insights features or metric filters. The group details page shows the class. Do not put a group you must alarm on into Infrequent Access.

Retention: group -> **Actions** -> **Edit retention**. Search only sees events still inside the retention window.

---

## Logs Insights

Console: **CloudWatch** -> **Logs Insights**.

1. **Selection criteria** -> select `/aws/lambda/northwind-upload`. You can add `/aws/batch/northwind` in the same query. Up to 50 groups.
2. Time range: relative **1d** or an absolute range. The query does not look outside this range.
3. Query language: **Logs Insights QL** (the default), or **OpenSearch SQL**, or **OpenSearch PPL**. Start with QL. SQL and PPL are the newer languages on the same data. They are in the language dropdown on the Insights page, not a separate product.

### QL examples

All 500s, newest first:

```sql
fields @timestamp, @message, @logStream
| filter @message like /statusCode.: 500/ or statusCode = 500
| sort @timestamp desc
| limit 50
```

JSON that the Lambda printed as one object:

```sql
fields @timestamp, statusCode, path
| filter statusCode >= 500
| stats count() as errors by path
| sort errors desc
```

`filter statusCode >= 500` works when CloudWatch discovered the JSON field. If the query says the field does not exist, the line is not JSON or it is nested. Use `parse`:

```sql
fields @timestamp, @message
| parse @message '"statusCode": *,' as statusCode
| filter statusCode = 500
| stats count() as n by bin(1h)
```

Lambda duration from the platform line:

```sql
filter @type = "REPORT"
| stats avg(@duration), max(@duration), pct(@duration, 95) by bin(5m)
```

`@timestamp`, `@message`, `@logStream`, and `@log` are always there. Discovered fields show in the right-hand **Fields** list after the first query. Click a field to add it.

**Save** the query. Saved queries are per Region, under **Saved and sample queries**. Sample queries include Lambda and VPC flow logs. Start from a sample if the group is a known AWS format.

Run. The **Logs** tab is the rows. The **Visualization** tab charts a `stats` query that has `bin()`.

Export: **Export results** -> CSV. Large exports belong in a report to S3, not in the browser.

### OpenSearch SQL

Same page, language **OpenSearch SQL**. The log group is the table. A group name with slashes needs backticks.

```sql
SELECT count(*) AS errors
FROM `/aws/lambda/northwind-upload`
WHERE statusCode = 500
```

SQL is stricter about types. If `statusCode` was parsed as a string, compare to `'500'`. Use QL if the SQL editor says the field is missing. Discovery is the same data.

### OpenSearch PPL

```sql
source = `/aws/lambda/northwind-upload`
| where statusCode = 500
| stats count() as errors by path
```

PPL is useful if you already know OpenSearch pipe syntax. It does not see events outside the time range picker.

---

## Field indexes

On a busy group, Insights scans a lot of bytes. **Field indexes** let filters on chosen fields skip data.

Console: log group -> **Field indexes** (or Logs Insights -> **Index management** / **Create index**, depending on the console revision) -> index `statusCode` and `path`.

Indexes apply to new ingestion after the index exists. They do not rewrite old events. The first query after you add an index can still be slow. A later query filtered on `statusCode` should scan fewer bytes. The query result shows **Records scanned**.

Do not index every field. Each index has a cost. Index the fields you filter on every day.

---

## Live Tail

Console: **CloudWatch** -> **Live tail** -> select the log group -> optional filter `"ERROR"` -> **Start**.

Live tail shows events that arrive after you start. It does not search yesterday. Use it during a deploy. Stop it when you leave the page. A filter that is too broad on a busy group will throttle the session.

There is also **Live tail** inside a log group. Same feature.

---

## Metric filter when search is not enough

A search does not page you at 3am. Console: log group -> **Metric filters** -> **Create**.

Filter pattern `{ $.statusCode = 500 }`. Metric namespace `Northwind/Api`, metric name `Upload500`, value `1`. Then an alarm on `Sum >= 5` in 5 minutes.

The pattern uses the same syntax as **Search log group**, not Insights QL. `stats` is not valid here.

---

## Cross-account and encryption

If the group is in another account, the account must be a **monitoring account** (CloudWatch **Settings** -> **Cross-account**) and the source must share logs. Insights can query linked source accounts from the monitoring account. A normal IAM role in account A cannot see account B's log groups.

Customer managed KMS on the log group: the reader needs `kms:Decrypt`. Insights returns an access error, not an empty chart, when the key policy blocks `logs.amazonaws.com` or your user.

---

## Mistakes

| Mistake | What you see |
| --- | --- |
| Time range still on 30 minutes | "No data" for an error you saw yesterday |
| Insights QL pasted into the log group search box | No matches. That box is not Insights |
| `stats` in a metric filter | Create filter fails |
| Infrequent Access log group | Insights or metric filters unavailable |
| JSON filter on a line that has a prefix before `{` | No match. The event must be JSON, or you `parse` in Insights |
| Field index expected to search old data | Only events ingested after the index |
| Looking at the wrong Region | The group is in `us-east-1` and the console is `eu-west-1` |

---

## A path that works

1. Log group, right Region, right time range, retention not already expired.
2. Search log group for a literal you know is there (`"Task timed out"` or the request id).
3. Logs Insights QL with `fields` and `filter`, then `stats` once the filter returns rows.
4. Save the query.
5. If you run it every day, add a field index on the filtered field.
6. If you need to watch a deploy, Live tail, not Insights.

[<- CloudWatch agent metrics](./cloudwatch-agent-ec2-metrics.md)
