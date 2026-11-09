---
title: "Amazon ECR Best Practices: Security, Scanning & Policies"
description: "Production security best practices for Amazon ECR: immutable image tags, enhanced vulnerability scanning, KMS encryption, and IAM access."
tags:
  - ecr
  - eks
  - container-security
  - image-scanning
  - lifecycle
  - aws
---
:::note[Primary Guide]
Looking for advanced lifecycle policy rules and prefix matching specifications? See our dedicated guide: [Amazon ECR Lifecycle Policies: Syntax & Retention Rules](/blogs/aws-ecr-lifecycle-policy/).
:::
## Overview

Harden Amazon ECR repositories used by EKS workloads with scanning, immutable tags for production, and lifecycle rules that control storage cost.

## Repository settings

- **Scan on push:** `true` - catch CVEs before images reach the cluster
- **Tags:** `Environment=Prod`, `ManagedBy=Manual` (or your standard tag set)
- **Tag mutability:** `Immutable` for production repos; `Mutable` only for dev/test if needed

## Lifecycle policy

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Cleanup untagged images after 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Expire dev/test branch builds after 14 days",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["test-", "dev-", "feature-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 3,
      "description": "Keep only last 20 production release tags",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["prod-", "v"],
        "countType": "imageCountMoreThan",
        "countNumber": 20
      },
      "action": { "type": "expire" }
    }
  ]
}
```
