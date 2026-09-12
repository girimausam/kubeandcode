---
title: "Amazon EventBridge "
description: "EventBridge rules, event patterns, input transformers, archive/replay, pipes, scheduler, and DLQs."
tags:
- eventbridge
- serverless
- aws

- sqs
- dynamodb
---

## Overview

EventBridge is the **event bus** layer: producers publish events; **rules** match **event patterns** and route to **targets** (Lambda, SQS, SNS, Step Functions, API destinations, etc.).


| Feature               | Use when                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------ |
| **Rules + event bus** | Route events between AWS services or custom apps on a bus                                  |
| **Input transformer** | Reshape event JSON before it hits the target                                               |
| **Archive & replay**  | Store events and replay them for testing or recovery                                       |
| **Pipes**             | Point-to-point integration with optional filtering/enrichment (e.g. DynamoDB stream → SQS) |
| **Scheduler**         | Cron/rate schedules that invoke targets (one-off or recurring)                             |
| **DLQ (SQS)**         | Capture events a target failed to process                                                  |


See also: [Lambda event pipeline](/lambda-event-pipeline/) and [serverless order pipeline](/serverless-on-aws/) for end-to-end examples.

---

## Event pattern operators

Rules filter events with JSON **event patterns**. Values are usually arrays - a match if **any** value matches.

```json
{
  "source": ["aws.ec2", "aws.fargate"],
  "detail-type": ["EC2 Instance State-change Notification"]
}
```

**Common operators** (full list in [AWS docs](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-pattern-operators.html)):


| Operator       | Matches when                                   |
| -------------- | ---------------------------------------------- |
| *(default)*    | Field equals one of the values in the array    |
| `prefix`       | String starts with prefix                      |
| `suffix`       | String ends with suffix                        |
| `anything-but` | Value is **not** in the list                   |
| `numeric`      | Number comparisons (`=`, `<`, `>`, `<=`, `>=`) |
| `cidr`         | IP in CIDR range                               |
| `exists`       | Field present (`true`) or absent (`false`)     |


**Example - exclude test events:**

```json
{
  "source": [{ "anything-but": ["aws.test"] }]
}
```

### Pattern gotchas

**Dot notation** - EventBridge joins nested keys with `.` when compiling patterns. These two patterns are **equivalent**:

```json
{ "detail": { "state": { "status": ["running"] } } }
```

```json
{ "detail": { "state.status": ["running"] } }
```

Both match events whether the payload uses nested objects or flat dotted keys. Do not rely on this behavior staying identical forever - prefer one style consistently.

**Duplicate keys** - Invalid in practice. If a pattern repeats a key, EventBridge keeps only the **last** value:

```json
{
  "source": ["aws.s3"],
  "source": ["aws.sns"]
}
```

Behaves the same as `"source": ["aws.sns"]`.

---

## Input transformer

Reshape the event payload sent to a target without writing a Lambda in between.

**Where:** Rule → Target → **Input transformer**


| Field              | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| **Input paths**    | JSON map of placeholder names → JSONPath expressions     |
| **Input template** | Output shape; use `<placeholder>` for substituted values |


**Example**

Sample event (optional, for testing in console):

```json
{
  "detail": {
    "instance-id": "i-0123456789",
    "state": "RUNNING"
  }
}
```

Input paths:

```json
{
  "instance": "$.detail.instance-id",
  "state": "$.detail.state"
}
```

Template:

```json
{
  "instance": <instance>,
  "state": <state>
}
```

Output delivered to target:

```json
{
  "instance": "i-0123456789",
  "state": "RUNNING"
}
```

---

## Archive and replay

Use archives to **store** matching events and **replay** them later (debugging, backfills, demos).

### Steps

1. **Create an archive** - name it, pick the event bus, optional event pattern filter.
2. **Capture events** - archive uses its own rule; you can also attach a rule to the same pattern. Send a test event to verify.
3. **Replay** - pick archive, set start/end time window, start replay (events re-injected onto the bus).

### Send a test event (console)

1. EventBridge → **Event buses** → Default bus → **Actions** → **Send events**
2. Event source: `TestEvent`
3. Detail type: `customerCreated`
4. Event detail: `{}`
5. **Send**

### Start a replay (console)

1. EventBridge → **Replays** → **Start new replay**
2. Name: e.g. `ReplayTest`
3. Source: your archive
4. Time frame: start **before** test events were sent; end = now
5. **Start replay**

[Tutorial: archive and replay](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-tutorial-archive-replay.html)

---

## EventBridge Pipes

**Pipe** = single-source, single-target integration with optional filter, enrichment, and input transformation.


| vs Rules                | Pipes                                                         |
| ----------------------- | ------------------------------------------------------------- |
| Many targets per rule   | One source → one target                                       |
| Event bus in the middle | Direct connect (lower latency, simpler for streaming sources) |


**Common source:** DynamoDB streams, Kinesis, SQS, MQ.

**Shortcut:** DynamoDB stream → filter → SQS (no Lambda poller boilerplate).

**Quick example (SAM)** - stream on table, pipe to queue:

```yaml
OrderPipe:
  Type: AWS::Pipes::Pipe
  Properties:
    Name: order-ddb-to-sqs
    RoleArn: !GetAtt PipeRole.Arn
    Source: !GetAtt OrdersTable.StreamArn
    SourceParameters:
      DynamoDBStreamParameters:
        StartingPosition: LATEST
        BatchSize: 10
      FilterCriteria:
        Filters:
          - Pattern: '{"eventName": ["INSERT"]}'
    Target: !GetAtt OrderQueue.Arn
```

`PipeRole` needs trust for `pipes.amazonaws.com` plus `dynamodb:DescribeStream`, `dynamodb:GetRecords`, `dynamodb:GetShardIterator`, `dynamodb:ListStreams`, and `sqs:SendMessage` on the queue.

[Tutorial: DynamoDB stream to SQS](https://docs.aws.amazon.com/eventbridge/latest/userguide/pipes-tutorial-create-dynamodb-sqs.html)

---

## EventBridge Scheduler

Managed **cron/rate** scheduling that invokes targets directly (Lambda, SQS, SNS, EventBridge bus, etc.).


| vs CloudWatch Events / old rules | Scheduler                                                                |
| -------------------------------- | ------------------------------------------------------------------------ |
| Rule on default bus              | Dedicated scheduler with flexible windows, time zones, one-off schedules |
| Good for event routing           | Good for **when** to fire, not **what** matched on the bus               |


Use Scheduler when you need recurring jobs or one-time delayed invocations without maintaining EventBridge rules on a cron pattern.

---

## Dead-letter queue (DLQ)

When a target fails after retries, EventBridge can send the failed event to an **SQS standard queue**.


| Rule       | Detail                                                          |
| ---------- | --------------------------------------------------------------- |
| Queue type | **Standard SQS only** - FIFO is not supported                   |
| Permission | EventBridge service principal must be allowed `sqs:SendMessage` |


**Queue policy snippet** (replace account, queue, rule ARNs):

```json
{
  "Sid": "Dead-letter queue permissions",
  "Effect": "Allow",
  "Principal": {
    "Service": "events.amazonaws.com"
  },
  "Action": "sqs:SendMessage",
  "Resource": "arn:aws:sqs:us-west-2:123456789012:MyEventDLQ",
  "Condition": {
    "ArnEquals": {
      "aws:SourceArn": "arn:aws:events:us-west-2:123456789012:rule/MyTestRule"
    }
  }
}
```

**Configure on rule:** Target → **Dead-letter queue** → select the SQS queue.


## EventBridge CLI Commands
Ref: https://docs.aws.amazon.com/cli/v1/userguide/cli_eventbridge_code_examples.html

List Rules
```bash
aws events list-rules
```

Put Rule
```bash
aws events put-rule --name "xyz-auto-recover-rule" --event-pattern "{\"detail-type\":[\"EC2 Instance State-change Notification\"],\"source\":[\"aws.ec2\"],\"detail\":{\"state\":[\"terminated\"]}}"
```

Put Target
```bash
aws events put-targets --rule "xyz-auto-recover-rule" --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:643461123615:function:xyz-auto-recover"
```