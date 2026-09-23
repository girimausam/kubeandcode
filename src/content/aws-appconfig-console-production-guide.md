---
title: "AppConfig - production console guide"
description: "Hosted configuration and feature flags - applications, environments, deployment strategies, and safe rollouts for live systems."
tags:
 - aws
 - appconfig
 - feature-flags
 - devops
 - configuration
---

# AppConfig - production console guide

**AWS AppConfig** delivers **application configuration** and **feature flags** with **controlled deployment strategies** (linear, canary, all-at-once) - reducing risk vs editing SSM parameters by hand.

**Freeform patterns:** [AppConfig freeform](./aws-appconfig-freeform.md) · [Checklist S3/AppConfig](./aws-checklist-appconfig-s3.md)  
**Checklist:** [DevOps checklist](./aws-devops-system-design-checklist.md)

---

## Use cases

| Case | AppConfig feature |
|------|-------------------|
| Feature toggle | Boolean flag per environment |
| Config without redeploy | JSON/YAML hosted configuration |
| Emergency kill switch | Rapid deployment to 100% with validation |
| Lambda/ECS dynamic config | Poll AppConfig agent or API |

---

## Console - application & environment

1. **AWS Systems Manager** → **AppConfig** (or AppConfig console).
2. **Create application** → name `shopflow-api`.
3. **Create environment** → `production`, `staging`.
4. **Configuration profile** → hosted (freeform) or feature flags.

---

## Console - deployment strategy

1. **Deployment strategies** → **Create**.
2. Choose **Linear** (e.g. 20% every 10 minutes) or **Canary** for prod.
3. Attach strategy to environment deployment.

---

## Console - deploy configuration version

1. **Create hosted configuration version** (upload JSON).
2. **Start deployment** → select environment + strategy.
3. Monitor **Deployment status** until complete; **rollback** if validators fail.

### Example JSON (feature flags)

```json
{
  "checkoutEnabled": true,
  "maxCartItems": 50,
  "paymentProvider": "stripe"
}
```

---

## IAM

Application callers need:

```json
{
  "Effect": "Allow",
  "Action": [
    "appconfig:GetLatestConfiguration",
    "appconfig:StartConfigurationSession"
  ],
  "Resource": "*"
}
```

Scope by application ARN in production. CI role needs `appconfig:CreateHostedConfigurationVersion`, `StartDeployment`.

---

## Security

- Use **validators** (JSON Schema, Lambda) before rollout.
- Encrypt sensitive values - prefer **Secrets Manager** for secrets, AppConfig for non-secret toggles.
- CloudWatch alarms on deployment failure.

---

## Commonly missed

| Miss | Impact |
|------|--------|
| No deployment strategy in prod | Instant blast radius |
| Clients cache forever | Stale config - implement version polling |
| Same profile for all envs | Accidental prod toggle |
| Missing IAM on sidecar/agent | Silent default config |

---

## Troubleshooting

- Deployment stuck: validator Lambda errors in CloudWatch.
- App not picking up: session token expiry; confirm `application`, `environment`, `configuration profile` IDs.

Docs: [AppConfig](https://docs.aws.amazon.com/appconfig/latest/userguide/what-is-appconfig.html)

[← Freeform guide](./aws-appconfig-freeform.md) · [Checklist](./aws-devops-system-design-checklist.md)
