---
title: "AWS Batch in the current console"
description: "Current AWS Batch: wizard, Fargate and EC2 environments, fair-share scheduling, consumable resources, job definitions, and the console settings that are not resources."
tags:
  - aws
  - batch
  - fargate
  - ec2
  - ecs
  - cloudwatch
---

# AWS Batch in the current console

The Batch console in the screenshot is the current one: **Dashboard, Jobs, Job definitions, Job queues, Environments, Consumable resources, Scheduling policies, Wizard**, then a separate **Console settings** group. Console settings only change what the UI shows. They do not create a queue or a compute environment.

This guide follows that console and the current Batch model. Older write-ups still say `BEST_FIT` as the default allocation strategy. The supported strategy for new EC2 environments is **`BEST_FIT_PROGRESSIVE`** (or `SPOT_CAPACITY_OPTIMIZED` for Spot). `BEST_FIT` is legacy and prevents some newer features.

A short Fargate CLI path is already in [AWS Batch on Fargate](./aws-batch-fargate-quickstart.md). Use this post when you are clicking through the console.

Docs: [What is AWS Batch?](https://docs.aws.amazon.com/batch/latest/userguide/what-is-batch.html) · [Fair-share scheduling](https://docs.aws.amazon.com/batch/latest/userguide/fair-share-scheduling.html) · [Consumable resources](https://docs.aws.amazon.com/batch/latest/userguide/consumable-resources.html)

---

## What Batch is doing

```text
submit-job or console Submit job
        -> Job queue (priority, optional fair-share policy)
              -> Compute environment (Fargate, EC2, or EKS)
                    -> Container task
                          -> CloudWatch Logs
```

You do not SSH to a Batch instance to run work. You register a **job definition**, submit a **job** to a **queue**, and Batch places it on a **compute environment** that has room.

| Piece | Current role |
| --- | --- |
| Environment | Capacity: Fargate, Fargate Spot, EC2 On-Demand, EC2 Spot, or Amazon EKS |
| Job queue | Ordered list of environments. Higher priority queues are served first |
| Scheduling policy | Fair-share across teams so one share identifier cannot take the whole queue |
| Consumable resource | A counted thing the job needs (software licenses, GPUs you account for yourself). Batch will not start the job until the count is free |
| Job definition | Image, vCPU, memory, role, retry, timeout. Platform `ECS` or `EKS` |
| Job | One run, an array (`--array-properties size=100`), or a dependency on another job |

---

## Scenario

Northwind renders invoice PDFs at night. Each job reads one JSON from S3 and writes one PDF. Most jobs need 1 vCPU and 2 GB. A few need a license seat. Two teams share the queue. Team `retail` must not starve team `finance`.

---

## Before the wizard

1. **Region.** Batch, ECR, and the log group in the same Region.
2. **VPC.** Private subnets with a route to ECR. Use an ECR interface endpoint plus S3 gateway endpoint, or a NAT gateway. Fargate jobs cannot pull an image with no path to ECR.
3. **Security group.** Egress 443. No inbound.
4. **ECR image.** The container command must exit 0 on success. Batch marks a non-zero exit as `FAILED`.
5. **Service-linked role.** The first time you open Batch, the console creates `AWSServiceRoleForBatch`. If it cannot, an admin must allow `iam:CreateServiceLinkedRole` for `batch.amazonaws.com`.

Two IAM roles you create yourself:

| Role | Trust | Policies |
| --- | --- | --- |
| `northwind-batch-exec` | `ecs-tasks.amazonaws.com` | `AmazonECSTaskExecutionRolePolicy`. This role pulls the image and writes logs |
| `northwind-batch-job` | `ecs-tasks.amazonaws.com` | `s3:GetObject` on the input prefix, `s3:PutObject` on the output prefix, `kms:Decrypt` and `kms:GenerateDataKey` if the bucket uses a customer key |

The job role is not the execution role. The container credentials are the job role. If S3 access denied appears in the log, the job role is wrong. If the job never starts and the status reason mentions the image or the log driver, the execution role is wrong.

---

## Wizard

Console: **AWS Batch** -> **Wizard**.

Use the wizard once so the pieces exist and are connected. Then change them in the resource pages. The wizard asks:

1. **Compute environment.** Name `northwind-pdf-ce`. Choose **Fargate** for this scenario. Maximum vCPUs `16`. Subnets: private. Security group: the egress group. Execution role: `northwind-batch-exec`.
2. **Job queue.** Name `northwind-pdf`. Priority `1`. Connect the environment you just created. State **Enabled**.
3. **Job definition.** Name `northwind-render`. Platform **ECS on Fargate**. Image URI from ECR. vCPU `1`, memory `2048`. Job role `northwind-batch-job`. Command, for example `python render.py`. Log driver `awslogs`, group `/aws/batch/northwind`, region `us-east-1`, stream prefix `render`.
4. **Submit a job** at the end if the wizard offers it. Job name `render-test-1`. Queue `northwind-pdf`.

Open **Jobs**. States move `SUBMITTED` -> `PENDING` -> `RUNNABLE` -> `STARTING` -> `RUNNING` -> `SUCCEEDED`. `RUNNABLE` for more than a few minutes on Fargate means the image cannot be pulled, the execution role cannot write the log group, or the subnet has no route to ECR. Open the job and read **Status reason**.

---

## Environments

Console: **Environments**.

Fargate fields that matter:

| Field | Value |
| --- | --- |
| Type | Managed |
| Compute | Fargate, or Fargate Spot if the PDF can be redone |
| Max vCPUs | Cap the bill. Batch will not place a job that would exceed this |
| Subnets | At least two AZs |

EC2 managed environment, when the job needs a GPU, a large disk, or a specific AMI:

| Field | Current choice |
| --- | --- |
| Allocation strategy | `BEST_FIT_PROGRESSIVE` for On-Demand. `SPOT_CAPACITY_OPTIMIZED` for Spot |
| Instance types | `optimal` lets Batch pick from C, M, and R. Or a list such as `c6i.large,c6i.xlarge` |
| Spot fleet role | Required for Spot. The console can create `AmazonEC2SpotFleetTaggingRole` |
| Min vCPUs | `0` so the environment scales in. Min greater than 0 keeps instances running after the queue is empty |
| Launch template | Use one when you need a bigger EBS volume or extra user data. Do not install the Batch agent yourself on a managed environment |

**EKS** environments are a third type. The cluster must already exist. Batch creates pods. Use it when the platform standard is EKS and the job image is the same one CI already builds. Do not pick EKS only to get a queue.

Disable an environment before you delete it, and disconnect it from every queue first. Delete fails while a queue still references it.

---

## Job queues

Console: **Job queues** -> **Create**.

A queue has an ordered list of compute environments. Batch tries the first. If that environment is at max vCPUs, it tries the next. Put On-Demand first and Spot second only if you accept Spot for overflow. Put Spot first if cost matters more than a restart.

Priority is an integer. A queue at priority `10` is scheduled before a queue at priority `1` when they share an environment.

State **Enabled**. A disabled queue accepts jobs and leaves them `RUNNABLE`.

---

## Scheduling policies

Console: **Scheduling policies** -> **Create**.

Fair-share is how two teams share `northwind-pdf` without one submitting 10,000 jobs and blocking the other.

| Field | Example |
| --- | --- |
| Name | `northwind-fair` |
| Share decay seconds | `3600`. Recent usage counts more |
| Compute reservation | `0` to start. A non-zero reservation holds back a percent of capacity for shares that are not currently running |
| Share `retail` | Weight `1` |
| Share `finance` | Weight `2`. A higher weight gets a larger fraction of the queue over time |

Attach the policy on the queue: queue -> **Edit** -> scheduling policy `northwind-fair`.

On submit, set the share identifier to `retail` or `finance`. Console: **Submit job** -> **Scheduling** -> share identifier. A job with no share identifier sits outside the fair-share math and can still crowd the queue. Require the identifier in the runbook.

Fair-share does not raise max vCPUs. If the environment max is too small, both shares stay `RUNNABLE`.

---

## Consumable resources

Console: **Consumable resources** -> **Create**.

Use this for a license seat, not for vCPU. vCPU and memory are already on the job definition.

| Field | Example |
| --- | --- |
| Name | `pdf-license` |
| Total amount | `4` |

The compute environment must list that consumable resource, and the job definition must request it. A job that requests `1` of `pdf-license` stays `RUNNABLE` until fewer than 4 such jobs are running. When a job succeeds or fails, Batch returns the count.

If you forget to attach the resource to the environment, the job never becomes runnable and the status reason mentions the resource. If you set the job request higher than the environment total, that job can never start.

---

## Job definitions

Console: **Job definitions** -> **Create**. The wizard's definition is revision 1. A change creates revision 2. Jobs keep the revision they were submitted with.

| Field | Northwind |
| --- | --- |
| Name | `northwind-render` |
| Platform | Amazon Elastic Container Service |
| Orchestration | Fargate, same as the environment. An EC2 job definition will not run on a Fargate environment |
| Image | `ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/northwind-render:1.0.0` |
| vCPU / memory | `1` / `2048`. Fargate allows specific pairs. 1 vCPU cannot request 512 MB. The console rejects invalid pairs |
| Execution role | `northwind-batch-exec` |
| Job role | `northwind-batch-job` |
| Command | `["python","render.py"]` |
| Environment | `INPUT_BUCKET`, `OUTPUT_BUCKET`. Do not put keys here |
| Retry | `3` attempts. Add an evaluate-on-exit rule so exit code `42` (bad input) does not retry |
| Timeout | `1800` seconds. A hung renderer should not hold a license seat all night |
| Logs | `awslogs` to `/aws/batch/northwind` |

**Array job:** submit one job with array size `100`. The container reads `AWS_BATCH_JOB_ARRAY_INDEX` and picks the Nth invoice. The console shows a parent and children. Failed children can be retried without resubmitting the whole array.

**Dependencies:** submit the merge job with a dependency on the array job. Batch holds it in `PENDING` until the array succeeds.

---

## Submit and watch

Console: **Jobs** -> **Submit new job**.

1. Name `render-2026-09-23`.
2. Job definition `northwind-render:2` (pin the revision).
3. Queue `northwind-pdf`.
4. Share identifier `finance` if the queue uses fair-share.
5. Consumable `pdf-license` amount `1` if the definition did not already request it.
6. Parameters if the definition command uses `Ref::invoiceId`.

**Dashboard** shows runnable and failed counts. Open a failed job -> **Logs** (jumps to CloudWatch) and **Attempts**. The last attempt's status reason is the one that matters. Earlier attempts may be retries.

Stop a job from the job page. Batch sends `SIGTERM`, waits, then kills the container. The license is released after the attempt finishes.

---

## Console settings

The bottom of the nav (**Permissions, Jobs, Job definition, Job queues, Compute environment, Scheduling policies, Reset settings**) stores browser preferences: which columns you see and which fields the create forms emphasize. **Reset settings** restores the default layout. It does not delete Batch resources. If a field you expect is missing on a create form, check here before you assume the account is on an old API.

---

## Mistakes

| Mistake | What you see |
| --- | --- |
| Fargate job definition on an EC2 environment, or the reverse | Job stays `RUNNABLE` |
| No NAT and no ECR endpoint | Cannot pull image |
| Job role used as the execution role | Image pull or log driver fails |
| Min vCPU left at 4 | Instances keep running after the queue drains |
| `BEST_FIT` copied from an old template | Environment update rejected, or Spot features unavailable |
| Fair-share with empty share identifier | One client still fills the queue |
| Consumable request greater than the total | Job never starts |
| Log group missing and execution role cannot create it | Job fails at `STARTING` |
| Looking for resources under Console settings | Those pages are UI prefs |

---

## Troubleshooting

1. Job **Status reason** and the attempt's container reason.
2. Log group `/aws/batch/northwind` in the same Region. If the stream was never created, the process did not start.
3. Environment **Status**. `INVALID` usually means a deleted subnet, a broken instance role, or a service quota.
4. Service quotas for Fargate vCPU and for On-Demand vCPU. Batch cannot exceed the account quota even if max vCPUs on the environment is higher.
5. CloudTrail event `SubmitJob` if the console user can open the page but the pipeline role cannot submit.

[<- Fargate CLI quickstart](./aws-batch-fargate-quickstart.md)
