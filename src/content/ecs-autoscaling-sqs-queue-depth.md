---
title: "ECS service autoscaling from SQS queue depth"
description: "Scale an ECS service on messages waiting in SQS: backlog per task, Container Insights, step scaling to zero, and the capacity provider underneath."
tags:
  - ecs
  - sqs
  - autoscaling
  - fargate
  - cloudwatch
  - devops
---

# ECS service autoscaling from SQS queue depth

CPU target tracking is the wrong signal for a queue worker. The task can sit at 5 percent CPU while `ApproximateNumberOfMessagesVisible` climbs into the tens of thousands. Scale on **how many messages each task still has to do**.

**Scenario:** Northwind order workers. API Gateway writes one SQS message per paid order. An ECS service on Fargate runs `northwind-order-worker`. You want about **20 visible messages per running task**. At 200 messages the service should sit near 10 tasks. When the queue drains, scale back toward 1, not toward 0, unless you add a second policy. Cluster capacity (Fargate or EC2) must be able to place those tasks or the desired count rises and nothing starts.

Docs: [ECS service auto scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html) · [Target tracking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-targettracking.html)

---

## Two layers

```text
SQS visible messages
        |
        v
Application Auto Scaling  ->  ECS service desired count  ->  tasks
        |
        +-- if launch type is EC2, a capacity provider must raise
            instance count or the new tasks stay PROVISIONING
```

Fargate skips the second layer. EC2 does not.

| Layer | What changes | Metric |
| --- | --- | --- |
| Service auto scaling | `desiredCount` of the ECS service | SQS backlog per task, or CPU, or ALB requests |
| Capacity provider managed scaling | ASG desired for the cluster | ECS `CapacityProviderReservation` |

Turning on only the service policy on an EC2 cluster with a full ASG produces pending tasks and no extra instances.

---

## Step 1 - Queue

Console: **SQS** -> **Create queue** -> `northwind-orders`.

| Setting | Value | Why |
| --- | --- | --- |
| Type | Standard, unless order per customer must be FIFO | FIFO throughput is lower and the metric math is the same |
| Visibility timeout | Longer than the worst task runtime. Start at **120 seconds** if the worker finishes in 30 | Too short and another task receives the same message while the first is still working. The queue looks busy and you scale on duplicates |
| Receive wait time | **20 seconds** (long poll) | Fewer empty receives |
| DLQ | `northwind-orders-dlq`, max receive count **5** | Poison messages must not keep the backlog high forever |
| Encryption | SSE-KMS if the rest of the platform uses a CMK | [SQS and KMS](./aws-messaging-sqs-sns-kms-encryption-iam.md) |

The worker IAM role needs `sqs:ReceiveMessage`, `DeleteMessage`, `GetQueueAttributes`, `ChangeMessageVisibility`, and `kms:Decrypt` on that queue and key.

CloudWatch metric used below: `AWS/SQS` / `ApproximateNumberOfMessagesVisible` dimension `QueueName=northwind-orders`. It is published even when the queue is idle, but the period is about one minute. Do not expect scale-out in five seconds.

---

## Step 2 - Service that can actually grow

Console: **ECS** -> cluster `northwind` -> **Create service**.

- Launch type **Fargate**, or a **capacity provider** strategy.
- Task definition: the worker process, plus a container health check that fails if the process cannot reach SQS.
- Desired count **1** for the first deploy. Auto scaling will own it after the policy exists.
- Do not also set a fixed desired count in a pipeline on every deploy without passing the same min and max. A deploy that resets desired count to 1 while the policy wants 10 fights the scaler until the next evaluation.

**Container Insights** must be on if the backlog math uses `RunningTaskCount`.

Console: cluster -> **Update cluster** -> **Use Container Insights**. Metric namespace becomes `ECS/ContainerInsights`, metric `RunningTaskCount`, dimensions `ClusterName` and `ServiceName`.

Without Container Insights that metric does not exist. Target tracking then sees missing data and will not scale in. Scale-out can also stall.

---

## Step 3 - Target tracking on backlog per task

Backlog per task = visible messages / running tasks.

Target **20** means: 200 messages and 10 tasks is "enough". 200 messages and 2 tasks scales out. 10 messages and 5 tasks scales in.

Console: service -> **Update** -> **Service auto scaling**.

| Field | Value |
| --- | --- |
| Use service auto scaling | On |
| Minimum tasks | 1 |
| Maximum tasks | 20 |
| IAM role | `ecsAutoscaleRole` or the AWSServiceRoleForApplicationAutoScaling_ECSService role the console creates |
| Policy type | Target tracking |
| Policy name | `northwind-orders-backlog` |
| Metric | Custom metric with math, not CPU |

The console custom metric editor is easy to mis-click. The same policy as JSON:

```json
{
  "TargetValue": 20,
  "ScaleOutCooldown": 60,
  "ScaleInCooldown": 180,
  "CustomizedMetricSpecification": {
    "Metrics": [
      {
        "Id": "m1",
        "Label": "Visible messages",
        "ReturnData": false,
        "MetricStat": {
          "Metric": {
            "Namespace": "AWS/SQS",
            "MetricName": "ApproximateNumberOfMessagesVisible",
            "Dimensions": [{ "Name": "QueueName", "Value": "northwind-orders" }]
          },
          "Stat": "Sum",
          "Unit": "Count"
        }
      },
      {
        "Id": "m2",
        "Label": "Running tasks",
        "ReturnData": false,
        "MetricStat": {
          "Metric": {
            "Namespace": "ECS/ContainerInsights",
            "MetricName": "RunningTaskCount",
            "Dimensions": [
              { "Name": "ClusterName", "Value": "northwind" },
              { "Name": "ServiceName", "Value": "northwind-order-worker" }
            ]
          },
          "Stat": "Average"
        }
      },
      {
        "Id": "e1",
        "Expression": "IF(m2 > 0, m1 / m2, m1)",
        "Label": "Backlog per task",
        "ReturnData": true
      }
    ]
  }
}
```

`IF(m2 > 0, m1 / m2, m1)` avoids divide-by-zero if the service is briefly at zero tasks. With minimum 1 you should not hit that. If you do scale to zero, this expression treats the whole queue as the backlog so scale-out still happens.

Register it:

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/northwind/northwind-order-worker \
  --min-capacity 1 \
  --max-capacity 20

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/northwind/northwind-order-worker \
  --policy-name northwind-orders-backlog \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://backlog-policy.json
```

Application Auto Scaling creates two CloudWatch alarms (high and low). Do not delete them. They are the policy.

### Cooldowns

| Knob | Starting point | If you get it wrong |
| --- | --- | --- |
| Scale-out cooldown | 60 seconds | Too high and a sale stalls in the queue. Too low and you add tasks before the previous ones have called `ReceiveMessage` |
| Scale-in cooldown | 180 seconds | Too low and you kill tasks that just received a batch. In-flight work returns to the queue after the visibility timeout |

Scale-in also waits until the metric is under the target. A single stuck message does not hold 20 tasks if the target is 20 and one message remains. One message / one task is under the target, so it can scale to the minimum.

---

## Step 4 - Other useful metrics

Use a **second** target tracking policy only when it measures a different limit. Multiple target tracking policies scale out if **any** policy wants more tasks, and scale in only if **all** of them want fewer.

| Metric | When |
| --- | --- |
| `ApproximateAgeOfOldestMessage` | A few messages are stuck behind a slow one. Backlog count looks fine, customers still wait. Target example: 60 seconds |
| `ApproximateNumberOfMessagesNotVisible` | Messages a task already received. High not-visible and low visible means workers are busy, not that you need more tasks |
| CPU | Only as a safety cap if a poison message spins a core. Not the primary queue signal |
| ALB request count | The API service, not this worker |

Step scaling is the right tool when the mapping is not linear. Example: 0 messages for 15 minutes -> desired 0. Target tracking will not scale to zero reliably because a target of 20 messages per task is already satisfied at 1 task and 0 messages, and a minimum of 0 plus missing `RunningTaskCount` is a bad metric. Pattern:

1. Target tracking policy, min 0, max 20, expression `IF(m2 > 0, m1 / m2, m1)`.
2. Step scaling policy on alarm `ApproximateNumberOfMessagesVisible < 1` for 15 minutes, adjustment `-20` (or set desired to 0).
3. Step scaling alarm `visible >= 1` that sets a step to +1 so the first message wakes one task.

Test scale-from-zero. It is the path that fails in production at 3am.

---

## Step 5 - EC2 capacity providers

Skip this on Fargate.

Console: **ECS** -> **Capacity providers** -> provider attached to the cluster, associated with the service.

| Setting | Value |
| --- | --- |
| Managed scaling | On |
| Target capacity | **100** so the cluster does not keep spare instances hot. Use 80 if you need headroom for a sudden jump |
| Managed termination protection | On, so ECS does not let the ASG kill an instance that still runs tasks |
| ASG min / max | min 0 or 1, max large enough for 20 tasks. If each task needs 512 CPU units and the instance has 1024, max instances must be at least 10 |

Service **capacity provider strategy**: weight 1, base 0 on that provider. Base 1 pins one task on that provider before the strategy spreads the rest.

The ASG must use an ECS-optimized AMI and the instance role must include `AmazonEC2ContainerServiceforEC2Role`. Instances that never register look like "desired count went up, running count did not".

---

## Step 6 - Prove it

1. Note desired count = 1.
2. Send 200 messages. A small script or the SQS console **Send messages** in a loop.
3. Within a few minutes, CloudWatch alarm `TargetTracking-...-AlarmHigh-...` goes `ALARM`.
4. Service events show "has reached a steady state" at a higher desired count. Running count should follow.
5. Purge the queue only in a lab. Watch scale-in after the cooldown. Desired count should fall, not instantly to 0.
6. Push one message that throws until receive count hits 5. It should land in the DLQ and stop inflating the visible count.

Service events to read: **ECS** -> service -> **Events** and **Deployments**. Auto scaling activity: **Application Auto Scaling** is visible in CloudTrail as `PutScalingPolicy` and in the service's **Auto scaling** tab.

---

## IAM the scaler needs

The service-linked role `AWSServiceRoleForApplicationAutoScaling_ECSService` may update the service's desired count. Your user needs `application-autoscaling:RegisterScalableTarget`, `PutScalingPolicy`, and `iam:CreateServiceLinkedRole` the first time.

The task role is separate. Autoscaling does not grant the task permission to read the queue.

---

## Mistakes

| Mistake | Result |
| --- | --- |
| Scaling on `NumberOfMessagesSent` | That is a rate of arrivals, not the backlog. You scale during a short spike and scale in while a backlog remains |
| `Sum` of `RunningTaskCount` across a long period | You divide by an inflated denominator and under-scale. Use Average over 1 minute |
| Visibility timeout 30s, job runs 2 minutes | Duplicate processing, backlog never drops, max tasks pinned at 20 |
| Min 1, max 1 | Policy exists and does nothing |
| Container Insights off | Metric math is `INSUFFICIENT_DATA` |
| EC2 ASG max 2 | Desired count 10, running count 2, no alarm on the service looks "healthy" |
| Deploy resets desired count | Pipeline and scaler thrash |
| DLQ not configured | One bad message, five retries, still visible or cycling, scaler stays at max |

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Desired count unchanged | Alarms in CloudWatch. `INSUFFICIENT_DATA` means the metric name, namespace, or dimension does not match. Queue name is case sensitive |
| Desired count up, running count flat | Service events: `RESOURCE:ENI`, subnet IP exhaustion, cannot pull image, capacity provider reservation |
| Scale-in never happens | Another target tracking policy (CPU) still wants the higher count. Scale-in requires every policy to agree |
| Tasks start and stop | Health check failing, or scale-in cooldown shorter than the job |
| Bill grows overnight | Max too high, poison messages, or a policy on `NumberOfMessagesSent` |

Pair this worker with the queue encryption and IAM in [SQS and SNS with KMS](./aws-messaging-sqs-sns-kms-encryption-iam.md). Node scaling for Kubernetes is a different controller: [Cluster Autoscaler and Karpenter](./eks-cluster-autoscaler-and-karpenter.md).
