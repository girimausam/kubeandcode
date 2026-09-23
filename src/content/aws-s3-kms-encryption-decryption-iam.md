---
title: "S3 encryption with KMS - console, policies, and access"
description: "SSE-KMS on S3 buckets - default encryption, bucket policies, KMS key policies, and decryption paths for apps and analytics."
tags:
 - aws
 - s3
 - kms
 - encryption
 - iam
 - security
 - devops
---

# S3 encryption with KMS - console, policies, and access

S3 is the default artifact store for **CodePipeline**, **logs**, **data lakes**, and **backups**. **SSE-KMS** is required when you need **key policies**, **CloudTrail audit of key use**, and **separation of duties**.

**Checklist:** [DevOps checklist](./aws-devops-system-design-checklist.md)

---

## Use cases

| Case | Encryption choice |
|------|-------------------|
| Pipeline artifacts | SSE-KMS CMK per env |
| App uploads | SSE-KMS + bucket policy deny unencrypted put |
| Cross-account data share | CMK policy + bucket policy principal |
| Athena on S3 | KMS decrypt on workgroup role |

---

## Console - bucket default encryption

1. **S3** → bucket → **Properties** → **Default encryption**.
2. **Encryption type:** **SSE-KMS**.
3. Choose **AWS managed key (`aws/s3`)** or **CMK** (preferred for prod).
4. **Bucket Key:** enable to reduce KMS API costs ([S3 Bucket Keys](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html)).

---

## Console - block public access & versioning

1. **Permissions** → **Block public access** - all four ON for private data.
2. **Versioning** - enable for recovery and lifecycle compliance.

---

## Bucket policy - deny insecure transport & unencrypted puts

```json
{
  "Sid": "DenyInsecureTransport",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}
```

Require SSE-KMS on upload:

```json
{
  "Sid": "DenyUnencryptedObjectUploads",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::my-bucket/*",
  "Condition": {
    "StringNotEquals": {
      "s3:x-amz-server-side-encryption": "aws:kms"
    }
  }
}
```

---

## KMS key policy - S3 usage

CMK must allow:

- **Administrators** - `kms:*` management (separate role).
- **S3 service** - via IAM roles used by apps (`kms:Decrypt`, `kms:GenerateDataKey`).
- Optional: `kms:ViaService` condition `s3.region.amazonaws.com`.

---

## IAM for application roles

Minimal app role for read/write:

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
  "Resource": "arn:aws:s3:::my-bucket/*"
},
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "arn:aws:kms:region:account:key/KEY_ID"
}
```

---

## Decryption paths

| Consumer | Needs |
|----------|--------|
| Lambda in VPC | Role KMS + S3; VPC endpoint for S3/KMS optional |
| Cross-account | CMK policy `Principal` other account + bucket policy |
| Athena | Workgroup role `kms:Decrypt` on CMK used by objects |
| Replication | Destination CMK permissions for replication role |

---

## Commonly missed

- **Bucket owner enforced** object ownership for cross-account uploads.
- **Grantee** confusion on ACLs (prefer bucket policies).
- Pipeline artifact bucket **not** in same region as KMS key.
- Forgetting **ListBucket** when only object actions granted.

---

## Troubleshooting

| Error | Likely fix |
|-------|------------|
| `Access Denied` on PutObject | Bucket policy, encryption header, or KMS key policy |
| `KMS.DisabledException` | Key state or scheduled deletion |
| Cross-account copy fails | Destination encryption + role on both sides |

Docs: [S3 encryption](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html) · [KMS key policies](https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html)

[← Checklist](./aws-devops-system-design-checklist.md) · [IAM conditions](./aws-iam-policy-conditions.md)
