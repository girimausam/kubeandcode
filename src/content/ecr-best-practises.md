---
title: "Amazon ECR repository settings and lifecycle policy"
description: "Scan on push, tag mutability, resource tags, and a lifecycle policy that expires untagged, branch, and excess production images — with prefix rules split (ECR matches all prefixes on a rule)."
tags:
  - ecr
  - lifecycle
  - container-security
  - aws
  - notes
date: 2026-08-29
---

## Repository

| Setting | Lab / prod |
| --- | --- |
| Scan on push | `true` (basic). Registry-level **enhanced** scanning (Inspector) is the current default to configure at the registry, not only per repo. |
| Resource tags | `Environment=Prod`, `ManagedBy=Manual` |
| Tag mutability | **Immutable** for prod (retag fails with `ImageTagAlreadyExistsException`). **Mutable** only if you need overwrite (e.g. pull-through cache). Mutability is repo-wide. |

```bash
aws ecr create-repository \
  --repository-name myapp \
  --image-scanning-configuration scanOnPush=true \
  --image-tag-mutability IMMUTABLE \
  --tags Key=Environment,Value=Prod Key=ManagedBy,Value=Manual
```

---

## Lifecycle policy

Rules run by `rulePriority` (lower first). `expire` deletes the **image**, not a single tag.

**Do not** put `test-`, `dev-`, and `feature-` in one `tagPrefixList`. ECR selects images that match **all** prefixes on that rule. Same for `prod-` and `v`. One prefix per tagged rule.

| Priority | Match | Action |
| --- | --- | --- |
| 1 | Untagged | Expire after **7** days |
| 2 | Tags `test-*` | Expire after **14** days |
| 3 | Tags `dev-*` | Expire after **14** days |
| 4 | Tags `feature-*` | Expire after **14** days |
| 5 | Tags `prod-*` | Keep **20** newest (`imageCountMoreThan`) |
| 6 | Tags `v*` (prefix `v`) | Keep **20** newest |

Prefix `v` matches `v1.2.3` and also `vendor-foo`. Use `v` only if that is acceptable, or switch to `tagPatternList` (e.g. `v[0-9]*`) if the registry supports it for your rule.

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Untagged images (dangling layers) after 7 days",
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
      "description": "test- tags after 14 days",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["test-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 3,
      "description": "dev- tags after 14 days",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["dev-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 4,
      "description": "feature- tags after 14 days",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["feature-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 5,
      "description": "Keep 20 newest prod- tags",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["prod-"],
        "countType": "imageCountMoreThan",
        "countNumber": 20
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 6,
      "description": "Keep 20 newest tags with prefix v",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["v"],
        "countType": "imageCountMoreThan",
        "countNumber": 20
      },
      "action": { "type": "expire" }
    }
  ]
}
```

```bash
aws ecr put-lifecycle-policy \
  --repository-name myapp \
  --lifecycle-policy-text file://ecr-lifecycle.json
```

---

## References

- [Lifecycle policies](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html)
- [Policy properties](https://docs.aws.amazon.com/AmazonECR/latest/userguide/lifecycle_policy_parameters.html)
- [Tag immutability](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-tag-mutability.html)
- [Enhanced scanning](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning-enhanced.html)
- [EKS-oriented notes](./eks-ecr-best-practices.md)
