---
title: "ECR lifecycle and repository policies - console guide"
description: "Production ECR - immutable tags, scanning, lifecycle expiration rules, and cross-account pull policies via the console."
tags:
 - aws
 - ecr
 - lifecycle
 - security
 - cicd
 - devops
---

# ECR lifecycle and repository policies - console guide

**Amazon ECR** is the hinge between **CI/CD** and **EKS/ECS**. Production setups combine **immutable tags**, **scanning**, **lifecycle cleanup**, and **repository policies** for cross-account pulls.

**Policy JSON reference:** [ECR lifecycle policy](./aws-ecr-lifecycle-policy.md) · [EKS ECR practices](./eks-ecr-best-practices.md)  
**Checklist:** [DevOps checklist](./aws-devops-system-design-checklist.md)

---

## Use cases

| Need | Control |
|------|---------|
| Prevent tag overwrite | Immutable tag mutability |
| Supply chain | Scan on push / enhanced scanning |
| Cost control | Lifecycle expire untagged/old SHAs |
| Central registry account | Repository policy for spoke accounts |

---

## Console - create repository

1. **ECR** → **Create repository**.
2. **Tag mutability:** **Immutable** (prod).
3. **Scan on push:** enable.
4. **KMS encryption:** CMK optional.

---

## Console - lifecycle policy

1. Repository → **Lifecycle policies** → **Create rule**.
2. Rules (separate per prefix - **do not** combine unrelated prefixes in one `tagPrefixList`):

| Priority | Rule |
|----------|------|
| 1 | Expire **untagged** images > 7 days |
| 2 | Keep last **30** images tagged `prod-*` |
| 3 | Expire `feature-*` > 14 days |

See [lifecycle doc](./aws-ecr-lifecycle-policy.md) for JSON.

---

## Console - repository permissions (cross-account)

1. Repository → **Permissions** → **Edit**.
2. JSON policy allowing `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer` for spoke account root or role.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowPullFromProdAccount",
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::SPOKE_ACCOUNT:root" },
    "Action": [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer"
    ]
  }]
}
```

Spoke roles still need `ecr:GetAuthorizationToken` on `*`.

---

## IAM for CI (push)

```json
{
  "Effect": "Allow",
  "Action": [
    "ecr:GetAuthorizationToken",
    "ecr:BatchCheckLayerAvailability",
    "ecr:PutImage",
    "ecr:InitiateLayerUpload",
    "ecr:UploadLayerPart",
    "ecr:CompleteLayerUpload"
  ],
  "Resource": "*"
}
```

Scope `PutImage` to repository ARN when possible.

---

## Security

- Block public repositories (account setting).
- Sign images (Notary/Cosign) in advanced pipelines.
- Deny `latest` in prod deploy - pin digest or semver tag.

---

## Commonly missed

| Miss | Impact |
|------|--------|
| Lifecycle prefix AND logic | Rule never matches |
| Immutable + deploy pipeline retags `latest` | Pipeline failures |
| No cross-account `GetAuthorizationToken` | Pull ImagePullBackOff |
| Scan findings ignored | CVEs ship to prod |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ImageTagAlreadyExistsException` | New tag or mutable repo |
| Pull 403 | Repository policy + IAM on node role |
| Disk cost spike | Lifecycle on untagged build layers |

Docs: [ECR lifecycle](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html) · [Private repository policies](https://docs.aws.amazon.com/AmazonECR/latest/userguide/repository-policies.html)

[← Lifecycle JSON](./aws-ecr-lifecycle-policy.md) · [Checklist](./aws-devops-system-design-checklist.md)
