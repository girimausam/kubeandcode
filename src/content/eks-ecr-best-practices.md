---
title: "Amazon ECR Best Practices for EKS"
description: "Repository hardening for EKS workloads—scan on push, immutable production tags, and lifecycle policies for cost control."
tags:
  - ecr
  - eks
  - container-security
  - image-scanning
  - lifecycle
  - aws
---
## Overview

Harden Amazon ECR repositories used by EKS workloads with scanning, immutable tags for production, and lifecycle rules that control storage cost.

## Repository settings

- **Scan on push:** `true` — catch CVEs before images reach the cluster
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