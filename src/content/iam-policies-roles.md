---
title: "IAM Policies & Roles - Identity, Resource, and VPC Endpoints"
description: "Identity and resource-based IAM policies, cross-account AssumeRole, sts:AssumeRole allow/deny patterns, and VPC endpoint policies for S3 and DynamoDB."
tags:
  - iam
  - policies
  - roles
  - sts
  - s3
  - lambda
  - dynamodb
  - vpc-endpoint
  - aws
  - notes
date: 2026-08-25
---

## Overview

AWS authorization uses several policy types that work together. An **identity-based policy** says what a user or role *can do*. A **resource-based policy** says who can access *this resource*. A **VPC endpoint policy** adds a boundary for traffic that goes through a private endpoint.


| Policy type        | Attached to                              | Answers                              |
| ------------------ | ---------------------------------------- | ------------------------------------ |
| **Identity-based** | User, group, role                        | What can this principal do?          |
| **Resource-based** | S3 bucket, Lambda function, SNS topic, … | Who can access this resource?        |
| **Trust policy**   | IAM role                                 | Who can assume this role?            |
| **VPC endpoint**   | Gateway / Interface endpoint             | What can pass through this endpoint? |


See also: [IAM Policy Examples and Triage Guide](/iam-policies/) for SCPs, boundaries, and troubleshooting.

---



## Identity-based policies

JSON documents that control which actions an identity (user, group, or role) can perform on which resources, under optional conditions.

### Managed vs inline


| Type                 | Description                                                      |
| -------------------- | ---------------------------------------------------------------- |
| **AWS managed**      | AWS-maintained; attach to users, groups, roles                   |
| **Customer managed** | Your reusable policy; attach to multiple identities              |
| **Inline**           | Embedded on one user, group, or role; deleted with that identity |


---



## Grant access to assume a role

To let a user **switch into** another role, the originating account attaches an identity policy that allows `sts:AssumeRole` on the target role ARN.

### Developers can assume `UpdateData`

Attach to role **Developer** (or group `Developers`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::111122223333:role/UpdateData"
    }
  ]
}
```



### Analysts cannot assume `UpdateData`

Attach to role **Analyst**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::111122223333:role/UpdateData"
    }
  ]
}
```

**Result:** `Developers` can switch to `UpdateData`; `Analyst` cannot. Explicit **Deny** wins over Allow.

The target role also needs a **trust policy** allowing the originating account or principal - identity policy alone is not enough.

### Switch role (CLI)

```bash
aws sts assume-role \
  --role-arn "arn:aws:iam::999999999999:role/UpdateData" \
  --role-session-name "David-ProdUpdate"
```

Export the temporary credentials from the response:

```json
{
  "Credentials": {
    "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
    "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "SessionToken": "AQoDYXdzEGcaEXAMPLE...",
    "Expiration": "2014-12-11T23:08:07Z"
  }
}
```

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
```

---



## Resource-based policies

JSON documents attached **to a resource** (not to a user). They grant a specified **principal** permission to perform actions on **that resource**.

Evaluation: both the identity policy **and** the resource policy must allow the action (unless the principal is in the same account and the resource policy alone is sufficient for some services).

### S3 bucket - allow an application role to read objects

**Use case:** A Lambda execution role needs read access to a specific bucket. You can grant it in the bucket policy (resource-based) instead of (or in addition to) the role's identity policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAppRoleRead",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111122223333:role/MyAppLambdaRole"
      },
      "Action": [
        "s3:ListBucket",
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::my-app-bucket",
        "arn:aws:s3:::my-app-bucket/*"
      ]
    }
  ]
}
```



### Lambda - allow API Gateway to invoke a function

**Use case:** REST API integration invokes a Lambda. The function resource policy trusts API Gateway as principal.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAPIGatewayInvoke",
      "Effect": "Allow",
      "Principal": {
        "Service": "apigateway.amazonaws.com"
      },
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:us-east-1:111122223333:function:MyFunction",
      "Condition": {
        "ArnLike": {
          "AWS:SourceArn": "arn:aws:execute-api:us-east-1:111122223333:abc123/*"
        }
      }
    }
  ]
}
```

Console and CLI (`aws lambda add-permission`) create the same resource-based statement on the function.

---



## VPC endpoint policies

A **resource-based policy on the endpoint** controls which principals can use the endpoint and which destination actions/resources are reachable **through that endpoint**.

Endpoint policies do **not** replace identity or destination resource policies - they add an extra gate for traffic entering via the endpoint.

### S3 Gateway endpoint



#### Allow access to one bucket

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow-access-to-specific-bucket",
      "Effect": "Allow",
      "Principal": "*",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::bucket_name",
        "arn:aws:s3:::bucket_name/*"
      ]
    }
  ]
}
```



#### Restrict to a specific IAM role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow-access-to-specific-IAM-role",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "ArnEquals": {
          "aws:PrincipalArn": "arn:aws:iam::111122223333:role/role_name"
        }
      }
    }
  ]
}
```



#### Restrict to callers from one account

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow-callers-from-specific-account",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "*",
      "Resource": "*",
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



### DynamoDB Gateway endpoint



#### Deny unless traffic comes from a specific endpoint

Use on the **DynamoDB table resource policy** (or identity policy) with `aws:sourceVpce`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow-access-from-specific-endpoint",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "dynamodb:*",
      "Resource": "arn:aws:dynamodb:us-east-1:111111111111:table/*",
      "Condition": {
        "StringNotEquals": {
          "aws:sourceVpce": "vpce-11aa22bb"
        }
      }
    }
  ]
}
```

Requests not routed through `vpce-11aa22bb` are denied, even if other policies allow access.

#### Restrict endpoint policy to one role or account

Use the same **ArnEquals** / **PrincipalAccount** condition patterns as the S3 endpoint examples above.

#### Allow access to one table via endpoint policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow-access-to-specific-table",
      "Effect": "Allow",
      "Principal": "*",
      "Action": [
        "dynamodb:Batch*",
        "dynamodb:Delete*",
        "dynamodb:DescribeTable",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Update*"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/table_name"
    }
  ]
}
```

---

## Common Condition blocks (copy-paste)

Drop these into any statement's `"Condition"` key. Pair with your own `Effect`, `Action`, `Resource`, and `Principal`.

See also: [IAM Policy Conditions](/iam-policy/) for full statements and operator reference.

### Principal and account

**Specific IAM role only**

```json
"Condition": {
  "ArnEquals": {
    "aws:PrincipalArn": "arn:aws:iam::111122223333:role/MyAppRole"
  }
}
```

**Any principal in one account**

```json
"Condition": {
  "StringEquals": {
    "aws:PrincipalAccount": "111122223333"
  }
}
```

**Principal has a specific IAM tag**

```json
"Condition": {
  "StringEquals": {
    "aws:PrincipalTag/Department": "Engineering"
  }
}
```

**Caller is in an AWS Organization**

```json
"Condition": {
  "StringEquals": {
    "aws:PrincipalOrgID": "o-abc1234567"
  }
}
```

### Network and transport

**HTTPS / TLS only**

```json
"Condition": {
  "Bool": {
    "aws:SecureTransport": "true"
  }
}
```

**Allow from specific IP range**

```json
"Condition": {
  "IpAddress": {
    "aws:SourceIp": ["203.0.113.0/24", "198.51.100.10/32"]
  }
}
```

**Deny if not from corporate CIDR**

```json
"Condition": {
  "NotIpAddress": {
    "aws:SourceIp": "203.0.113.0/24"
  }
}
```

**Traffic must use a specific VPC endpoint**

```json
"Condition": {
  "StringEquals": {
    "aws:sourceVpce": "vpce-11aa22bb"
  }
}
```

**Deny if request did not come through the endpoint**

```json
"Condition": {
  "StringNotEquals": {
    "aws:sourceVpce": "vpce-11aa22bb"
  }
}
```

### Region, time, and MFA

**Restrict API calls to one Region**

```json
"Condition": {
  "StringEquals": {
    "aws:RequestedRegion": "us-east-1"
  }
}
```

**Allow only during a time window (UTC)**

```json
"Condition": {
  "DateGreaterThan": {
    "aws:CurrentTime": "2026-01-01T08:00:00Z"
  },
  "DateLessThan": {
    "aws:CurrentTime": "2026-01-01T18:00:00Z"
  }
}
```

**Require MFA for this session**

```json
"Condition": {
  "Bool": {
    "aws:MultiFactorAuthPresent": "true"
  }
}
```

**MFA must be fresh (within 1 hour = 3600 seconds)**

```json
"Condition": {
  "NumericLessThan": {
    "aws:MultiFactorAuthAge": "3600"
  }
}
```

### Source ARN (cross-service)

**Lambda invoke only from one API Gateway API**

```json
"Condition": {
  "ArnLike": {
    "AWS:SourceArn": "arn:aws:execute-api:us-east-1:111122223333:abc123/*"
  }
}
```

**Event only from one S3 bucket**

```json
"Condition": {
  "StringEquals": {
    "AWS:SourceArn": "arn:aws:s3:::my-app-bucket"
  }
}
```

**Source account that owns the calling resource**

```json
"Condition": {
  "StringEquals": {
    "aws:SourceAccount": "111122223333"
  }
}
```

### S3-specific

**List only objects under a prefix**

```json
"Condition": {
  "StringLike": {
    "s3:prefix": ["logs/*", "app/*"]
  }
}
```

**Require SSE-S3 on upload**

```json
"Condition": {
  "StringEquals": {
    "s3:x-amz-server-side-encryption": "AES256"
  }
}
```

**Deny upload when encryption header is missing**

```json
"Condition": {
  "Null": {
    "s3:x-amz-server-side-encryption": "true"
  }
}
```

### Tags on resources and requests

**Resource must have tag**

```json
"Condition": {
  "StringEquals": {
    "aws:ResourceTag/Environment": "Production"
  }
}
```

**Deny delete unless resource is tagged `Backup=true`**

```json
"Condition": {
  "StringNotEquals": {
    "aws:ResourceTag/Backup": "true"
  }
}
```

**Create request must include tag**

```json
"Condition": {
  "StringEquals": {
    "aws:RequestTag/CostCenter": "12345"
  }
}
```

### Operator cheat sheet

| Operator | Example use |
| --- | --- |
| `StringEquals` | Exact match - Region, account ID, tag value |
| `StringNotEquals` | Exclude a value - deny outside endpoint |
| `StringLike` | Wildcards - ARN prefix, S3 prefix |
| `ArnEquals` / `ArnLike` | Principal or source ARN |
| `Bool` | `aws:SecureTransport`, MFA present |
| `IpAddress` / `NotIpAddress` | Source IP CIDR |
| `DateGreaterThan` / `DateLessThan` | Time windows |
| `NumericLessThan` | MFA age, numeric limits |
| `Null` | Key must be absent (`"true"`) |
