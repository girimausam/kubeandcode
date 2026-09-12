---
title: "IAM Policy Examples and Triage Guide"
description: "Copy-paste trust, identity, resource, boundary, SCP, session, and VPC endpoint policies with a rapid troubleshooting checklist."
tags:
  - iam
  - policies
  - security
  - kms
  - s3
  - sqs
  - sns
  - aws
---
## How to use

1. Identify the **service** (S3, SQS, SNS, KMS, STS, EC2, VPC endpoints, Organizations).
2. Decide the **policy type**: identity, resource, trust, or guardrail (boundary, SCP, session, endpoint).
3. Run the **rapid triage checklist** at the bottom before editing anything.

## Policy types

### 1) Identity-based policy (User/Group/Role permissions)

- Attached to IAM user/group/role
- Grants/denies API actions

### 2) Resource-based policy (resource permissions)

Common examples:

- S3 bucket policy
- SNS topic policy
- SQS queue policy
- KMS key policy
- Lambda permission policy (AddPermission)

### 3) Trust policy (AssumeRole policy)

- Controls **who can assume** a role
- Very common trick: correct principal but wrong condition (ExternalId/MFA/OIDC claims)

### 4) Permissions boundary

- Caps maximum permissions for a principal
- Common “why is my Allow not working?” cause

### 5) SCP (Service Control Policy) (Organizations)

- Org/OU/account-level deny guardrail
- **Deny wins** over everything

### 6) Session policy (AssumeRole session)

- Passed during AssumeRole; further restricts the session

### 7) VPC endpoint policy

- Restricts what can pass through an endpoint (Gateway or Interface)

### 8) KMS grants

- Temporary delegated permissions; common in services that need to use a CMK

## Policy blocks (copy/paste)

### A) Trust policies (AssumeRole)

#### A1) Cross-account trust (basic)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAssumeFromAccount",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

#### A2) Trust with ExternalId

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAssumeWithExternalId",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/competitor-runner" },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": { "sts:ExternalId": "challenge-external-id" }
      }
    }
  ]
}
```

#### A3) Deny AssumeRole unless MFA present

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyAssumeWithoutMfa",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "sts:AssumeRole",
      "Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } }
    }
  ]
}
```

### B) S3 bucket policy blocks

#### B1) Enforce TLS (deny non-HTTPS)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::BUCKET", "arn:aws:s3:::BUCKET/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

#### B2) Restrict to a VPC endpoint (gateway endpoint)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlyViaVpce",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::BUCKET", "arn:aws:s3:::BUCKET/*"],
      "Condition": { "StringNotEquals": { "aws:sourceVpce": "vpce-xxxxxxxx" } }
    }
  ]
}
```

#### B3) Require SSE-KMS on PutObject

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnencryptedUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET/*",
      "Condition": {
        "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
      }
    }
  ]
}
```

### C) SNS topic policy blocks

#### C1) Allow S3 to publish to SNS (with SourceArn + SourceAccount)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3Publish",
      "Effect": "Allow",
      "Principal": { "Service": "s3.amazonaws.com" },
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:REGION:ACCOUNT_ID:TOPIC",
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "ACCOUNT_ID" },
        "ArnLike": { "aws:SourceArn": "arn:aws:s3:::BUCKET" }
      }
    }
  ]
}
```

### D) SQS queue policy blocks

#### D1) Allow receive/delete for a role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowConsumerRole",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT_ID:role/consumer-role" },
      "Action": [
        "sqs:GetQueueUrl",
        "sqs:GetQueueAttributes",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:ChangeMessageVisibility"
      ],
      "Resource": "arn:aws:sqs:REGION:ACCOUNT_ID:QUEUE"
    }
  ]
}
```

#### D2) Require TLS for SQS (deny non-HTTPS)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "sqs:*",
      "Resource": "arn:aws:sqs:REGION:ACCOUNT_ID:QUEUE",
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

### E) KMS key policy blocks

#### E1) Allow an IAM role to use the key

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowRoleUseKey",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT_ID:role/app-role" },
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:DescribeKey"
      ],
      "Resource": "*"
    }
  ]
}
```

#### E2) Allow CreateGrant for AWS resources

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowGrantForAwsResource",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT_ID:role/app-role" },
      "Action": ["kms:CreateGrant", "kms:ListGrants", "kms:RevokeGrant"],
      "Resource": "*",
      "Condition": { "Bool": { "kms:GrantIsForAWSResource": "true" } }
    }
  ]
}
```

### F) Permissions boundary patterns

#### F1) Allow role creation only when boundary is attached

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCreateRoleWithBoundaryOnly",
      "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:PutRolePermissionsBoundary"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT_ID:policy/BoundaryPolicy"
        }
      }
    }
  ]
}
```

### G) SCP blocks (Org guardrails)

#### G1) Deny disabling CloudTrail

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyDisableCloudTrail",
      "Effect": "Deny",
      "Action": ["cloudtrail:StopLogging", "cloudtrail:DeleteTrail", "cloudtrail:UpdateTrail"],
      "Resource": "*"
    }
  ]
}
```

#### G2) Deny S3 public ACLs

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyPublicAcls",
      "Effect": "Deny",
      "Action": ["s3:PutBucketAcl", "s3:PutObjectAcl"],
      "Resource": "*",
      "Condition": {
        "StringEquals": { "s3:x-amz-acl": ["public-read", "public-read-write", "authenticated-read"] }
      }
    }
  ]
}
```

## Rapid triage checklist

- [ ]  Confirm identity: `aws sts get-caller-identity`
- [ ]  Check explicit **Deny** (IAM, bucket/queue/topic policy, SCP, permission boundary)
- [ ]  If AssumeRole: trust policy principal + conditions (ExternalId/MFA/OIDC)
- [ ]  If resource access: resource policy + KMS key policy (if encrypted)
- [ ]  If in VPC: endpoint policy + DNS + SG/NACL return traffic
- [ ]  Validate by simulating: IAM Policy Simulator (when available)