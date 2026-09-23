---
title: "SQS and SNS with KMS encryption and IAM"
description: "Console and policy patterns for encrypted SNS topics and SQS queues - key policies, subscriptions, and cross-service permissions teams miss."
tags:
 - aws
 - sqs
 - sns
 - kms
 - iam
 - encryption
 - devops
---

# SQS and SNS with KMS encryption and IAM

Event-driven systems use **SNS → SQS → Lambda/ECS** constantly. Encryption failures usually come from **KMS key policies**, not queue policies.

**Checklist:** [DevOps checklist](./aws-devops-system-design-checklist.md)

---

## Use cases

| Pattern | Flow |
|---------|------|
| Fan-out notifications | SNS topic → many SQS queues |
| Ordered processing | FIFO SNS/SQS with deduplication |
| Audit / compliance | CMK on all messages at rest |
| Cross-account events | Topic policy + queue policy + KMS grant |

---

## Architecture

```text
Publisher ──► SNS (SSE-KMS) ──► SQS (SSE-KMS) ──► Consumer (Lambda/ECS)
                    │                    │
                    └── CMK key policy must allow sns.amazonaws.com & sqs.amazonaws.com
```

---

## Console - KMS customer managed key (CMK)

1. **KMS** → **Create key** → Symmetric, encrypt/decrypt.
2. **Key administrators:** security team role.
3. **Key users:** application roles + **service principals** via key policy (below).

### Key policy essentials (SNS publishing)

Allow SNS to use the key on your account:

```json
{
  "Sid": "Allow SNS use of the key",
  "Effect": "Allow",
  "Principal": { "Service": "sns.amazonaws.com" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
  "Resource": "*",
  "Condition": {
    "StringEquals": { "kms:CallerAccount": "123456789012" }
  }
}
```

For **SQS** queue encryption, add similar for `sqs.amazonaws.com`.

---

## Console - SNS topic with encryption

1. **SNS** → **Topics** → **Create topic**.
2. **Type:** Standard or FIFO.
3. **Encryption:** **AWS KMS** → select CMK.
4. **Access policy:** restrict `Publish` to specific roles/accounts (not `*` in prod).

---

## Console - SQS queue with encryption

1. **SQS** → **Create queue**.
2. **Encryption:** enabled, same or dedicated CMK.
3. **Dead-letter queue:** create DLQ with **same KMS** if consumer uses KMS.

---

## Console - Subscribe SQS to SNS

1. Topic → **Create subscription** → protocol **Amazon SQS** → select queue.
2. SNS updates **queue policy** to allow `sns.amazonaws.com` `SendMessage` with `aws:SourceArn` condition on topic.

If encryption mismatches, subscription creation fails or messages never arrive.

---

## IAM for consumers (Lambda example)

Task role needs:

- `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`
- `kms:Decrypt`, `kms:GenerateDataKey` on CMK (if not covered by key policy user list)

---

## Security

- Enforce TLS: `aws:SecureTransport` in queue/topic policies where applicable.
- Separate CMKs per environment (`prod-events` vs `dev-events`).
- Least privilege on `sns:Publish` - use topic policy + IAM together.

---

## Commonly missed

| Miss | Symptom |
|------|---------|
| CMK missing SNS/SQS service principal | Publish/subscribe fails |
| FIFO topic → standard queue | Invalid subscription |
| Lambda role lacks `kms:Decrypt` | Messages visible but processing fails |
| DLQ without KMS permissions | Poison messages lost |
| Cross-account without CMK sharing | AccessDenied on decrypt |

---

## Troubleshooting

- **CloudWatch metrics:** `NumberOfMessagesPublished`, `ApproximateAgeOfOldestMessage`.
- **SNS delivery status logging** to S3 for failed fan-out.
- Test with **SNS → SQS → manual receive** in console before wiring Lambda.

Docs: [SNS encryption](https://docs.aws.amazon.com/sns/latest/dg/sns-server-side-encryption.html) · [SQS encryption](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-server-side-encryption.html)

[← Checklist](./aws-devops-system-design-checklist.md) · [EventBridge patterns](./aws-eventbridge-patterns.md)
