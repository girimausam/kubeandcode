---
title: "IAM Policy Conditions - Notes"
description: "Common IAM policy condition keys and copy-paste examples for S3 encryption, date/time, tags, IP, MFA, region, and other scenarios."
tags:
  - iam
  - policies
  - conditions
  - s3
  - security
  - aws
---

## Overview

IAM policies evaluate **Effect**, **Action**, **Resource**, and optionally **Condition**. On  condition blocks are the differentiator - same Allow/Deny structure, different keys.

**Evaluation order (simplified):**

1. Explicit **Deny** always wins.
2. **Allow** applies only if no matching Deny exists.
3. Default is implicit deny.

See also the broader [IAM Policy Examples and Triage Guide](/iam-policies) for trust policies, SCPs, boundaries, and service-specific blocks.

## Condition operators (quick reference)

| Operator | Use when |
| --- | --- |
| `StringEquals` / `StringNotEquals` | Exact string match (region, tag value, encryption header) |
| `StringLike` / `StringNotLike` | Wildcards (`*`, `?`) - ARNs, prefixes, principal patterns |
| `StringEqualsIfExists` | Apply only if the key is present in the request |
| `Bool` / `BoolIfExists` | True/false flags (`aws:SecureTransport`, MFA) |
| `IpAddress` / `NotIpAddress` | Source IP CIDR allow/deny |
| `DateGreaterThan` / `DateLessThan` / `DateEquals` | Time windows (`aws:CurrentTime`) |
| `NumericLessThan` / `NumericGreaterThan` | Numbers (MFA age, access key age) |
| `Null` | Key missing from request (`true` = must be absent) |
| `ArnEquals` / `ArnLike` | ARN matching (`aws:SourceArn`) |
| `ForAllValues:*` | Every value in a multi-value key must match |
| `ForAnyValue:*` | At least one value must match |

**Common global condition keys:**

- `aws:CurrentTime` - ISO 8601 timestamp (e.g. `2026-01-01T00:00:00Z`)
- `aws:SourceIp` - caller IP
- `aws:SecureTransport` - `true` when request uses HTTPS/TLS
- `aws:RequestedRegion` - target region of the API call
- `aws:PrincipalArn` / `aws:userid` - who is calling
- `aws:MultiFactorAuthPresent` - MFA used for this session
- `aws:MultiFactorAuthAge` - seconds since MFA (often paired with `NumericLessThan`)
- `aws:PrincipalTag/<key>` - tag on the IAM principal
- `aws:RequestTag/<key>` - tag being applied in the request (create/tag operations)
- `aws:ResourceTag/<key>` - tag on the resource being accessed
- `aws:SourceVpce` - VPC endpoint ID (gateway or interface)
- `aws:SourceAccount` - account that owns the calling resource
- `aws:PrincipalOrgID` - AWS Organizations ID

---

## S3 - require encryption on upload

Bucket policy pattern: **Deny** `PutObject` unless the correct encryption header is present. Two statements cover wrong header and missing header.

### SSE-S3 (AES256)

```json
{
  "Version": "2012-10-17",
  "Id": "PutObjPolicy",
  "Statement": [
    {
      "Sid": "DenyIncorrectEncryptionHeader",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        }
      }
    },
    {
      "Sid": "DenyUnencryptedObjectUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "Null": {
          "s3:x-amz-server-side-encryption": "true"
        }
      }
    }
  ]
}
```

### SSE-KMS

```json
{
  "Version": "2012-10-17",
  "Id": "PutObjPolicy",
  "Statement": [
    {
      "Sid": "DenyIncorrectEncryptionHeader",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "aws:kms"
        }
      }
    },
    {
      "Sid": "DenyUnencryptedObjectUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "Null": {
          "s3:x-amz-server-side-encryption": "true"
        }
      }
    }
  ]
}
```

### Require a specific KMS key

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyPutObjectWithoutSpecificKmsKey",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption-aws-kms-key-id": "arn:aws:kms:REGION:ACCOUNT_ID:key/KEY_ID"
        }
      }
    }
  ]
}
```

---

## Date and time conditions

Restrict access to a maintenance window, temporary contractor access, or a compliance audit period.

### Allow only between two dates

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAccessDuringMaintenanceWindow",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "DateGreaterThan": {
          "aws:CurrentTime": "2026-06-01T00:00:00Z"
        },
        "DateLessThan": {
          "aws:CurrentTime": "2026-06-30T23:59:59Z"
        }
      }
    }
  ]
}
```

### Deny access after a cutoff date

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyAfterContractEnd",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "DateGreaterThan": {
          "aws:CurrentTime": "2026-12-31T23:59:59Z"
        }
      }
    }
  ]
}
```

**Note:** `aws:CurrentTime` uses **UTC** in `YYYY-MM-DDTHH:MM:SSZ` format. `DateGreaterThan` means "current time is after this value."

---

## Tag-based conditions

Tags appear in three contexts - know which key to use:

| Key pattern | Applies to |
| --- | --- |
| `aws:RequestTag/<key>` | Tag being set on create (`RunInstances`, `CreateRole`, etc.) |
| `aws:ResourceTag/<key>` | Tag already on the resource being accessed |
| `aws:PrincipalTag/<key>` | Tag on the IAM user or role making the call |
| `aws:TagKeys` | List of tag key names in the request |

### Require `Environment=Production` tag when launching EC2

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowRunInstancesWithEnvironmentTag",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/Environment": "Production"
        }
      }
    }
  ]
}
```

### Allow terminate only on instances tagged `Owner=TeamA`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowTerminateOwnedInstances",
      "Effect": "Allow",
      "Action": "ec2:TerminateInstances",
      "Resource": "arn:aws:ec2:REGION:ACCOUNT_ID:instance/*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/Owner": "TeamA"
        }
      }
    }
  ]
}
```

### Deny if request tries to remove the `CostCenter` tag

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUntagCostCenter",
      "Effect": "Deny",
      "Action": [
        "ec2:DeleteTags",
        "s3:DeleteObjectTagging",
        "s3:DeleteBucketTagging"
      ],
      "Resource": "*",
      "Condition": {
        "ForAnyValue:StringEquals": {
          "aws:TagKeys": "CostCenter"
        }
      }
    }
  ]
}
```

### Allow S3 access only when principal has `Department=Finance`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowFinancePrincipals",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::finance-reports",
        "arn:aws:s3:::finance-reports/*"
      ],
      "Condition": {
        "StringEquals": {
          "aws:PrincipalTag/Department": "Finance"
        }
      }
    }
  ]
}
```

**Note:** `aws:RequestTag` is checked at **creation** time. `ec2:ResourceTag` / `aws:ResourceTag` is checked on the **existing** resource.

---

## IP address and network conditions

### Allow only from corporate CIDR

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowFromCorporateNetwork",
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::BUCKET_NAME",
        "arn:aws:s3:::BUCKET_NAME/*"
      ],
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": ["203.0.113.0/24", "198.51.100.10/32"]
        }
      }
    }
  ]
}
```

### Deny access outside VPC endpoint (private S3 access)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnlessFromVpce",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::BUCKET_NAME",
        "arn:aws:s3:::BUCKET_NAME/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:sourceVpce": "vpce-0123456789abcdef0"
        }
      }
    }
  ]
}
```

### Require HTTPS (deny insecure transport)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::BUCKET_NAME",
        "arn:aws:s3:::BUCKET_NAME/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

**Note:** `aws:SourceIp` is the caller's IP. For API calls **through a VPC endpoint**, also consider `aws:sourceVpce`. Combine with `aws:SecureTransport` for defense in depth.

---

## MFA conditions

### Deny all actions unless MFA is present

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyAllExceptWithMfa",
      "Effect": "Deny",
      "NotAction": [
        "iam:CreateVirtualMFADevice",
        "iam:EnableMFADevice",
        "iam:ListMFADevices",
        "iam:ListUsers",
        "iam:ListVirtualMFADevices",
        "iam:ResyncMFADevice",
        "sts:GetSessionToken"
      ],
      "Resource": "*",
      "Condition": {
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "false"
        }
      }
    }
  ]
}
```

### Require MFA refreshed within the last hour (3600 seconds)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyIfMfaTooOld",
      "Effect": "Deny",
      "Action": [
        "ec2:TerminateInstances",
        "rds:DeleteDBInstance"
      ],
      "Resource": "*",
      "Condition": {
        "NumericGreaterThan": {
          "aws:MultiFactorAuthAge": "3600"
        }
      }
    }
  ]
}
```

**Note:** Use `BoolIfExists` when the key may be absent (e.g. role sessions without MFA). `aws:MultiFactorAuthAge` only applies when MFA was used.

---

## Region and account restrictions

### Allow actions only in `eu-west-1` and `eu-central-1`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlyEuRegions",
      "Effect": "Allow",
      "Action": "ec2:*",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": ["eu-west-1", "eu-central-1"]
        }
      }
    }
  ]
}
```

### Deny access outside your Organization

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideOrg",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalOrgID": "o-abc1234567"
        }
      }
    }
  ]
}
```

### S3 bucket policy - allow only from a specific account

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCrossAccountFromTrustedAccount",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111122223333:root"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalAccount": "111122223333"
        }
      }
    }
  ]
}
```

---

## Instance type, ARN, and prefix conditions

### Restrict EC2 to `t3.micro` and `t3.small`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlySmallInstances",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "ec2:InstanceType": ["t3.micro", "t3.small"]
        }
      }
    }
  ]
}
```

### Allow S3 read only under `reports/` prefix

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadReportsPrefix",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringLike": {
          "s3:prefix": "reports/*"
        }
      }
    }
  ]
}
```

### Allow assume role only for a specific role name pattern

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAssumeAppRoles",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::ACCOUNT_ID:role/app-*"
    }
  ]
}
```

---

## IAM-specific scenarios

### Deny access keys older than 90 days

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOldAccessKeys",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "NumericGreaterThan": {
          "iam:AccessKeyAge": "90"
        }
      }
    }
  ]
}
```

### Allow `PassRole` only to EC2 service

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPassRoleToEc2",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::ACCOUNT_ID:role/EC2InstanceRole",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ec2.amazonaws.com"
        }
      }
    }
  ]
}
```

### Require permissions boundary when creating a role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCreateRoleWithBoundary",
      "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:PutRolePermissionsBoundary"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT_ID:policy/DeveloperBoundary"
        }
      }
    }
  ]
}
```

---

## Cheat sheet

| Scenario | Condition key / operator |
| --- | --- |
| Time-bound access | `DateGreaterThan` / `DateLessThan` + `aws:CurrentTime` |
| Require tag at launch | `aws:RequestTag/<key>` + `StringEquals` |
| Control by resource tag | `aws:ResourceTag/<key>` or `ec2:ResourceTag/<key>` |
| Principal must have tag | `aws:PrincipalTag/<key>` |
| Corporate IP only | `IpAddress` + `aws:SourceIp` |
| HTTPS only | `Bool` + `aws:SecureTransport: false` (in a Deny) |
| VPC endpoint only | `StringEquals` / `StringNotEquals` + `aws:sourceVpce` |
| MFA required | `BoolIfExists` + `aws:MultiFactorAuthPresent` |
| MFA not too old | `NumericLessThan` + `aws:MultiFactorAuthAge` |
| Region lock | `StringEquals` + `aws:RequestedRegion` |
| Org membership | `StringEquals` + `aws:PrincipalOrgID` |
| S3 encryption header | `s3:x-amz-server-side-encryption` + `StringNotEquals` / `Null` |
| Specific KMS key on upload | `s3:x-amz-server-side-encryption-aws-kms-key-id` |
| Instance type limit | `ec2:InstanceType` + `StringEquals` |
| PassRole to a service | `iam:PassedToService` + `StringEquals` |
