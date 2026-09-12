---
title: "AWS AppConfig: Freeform Configuration"
description: "Daily playbook: Freeform profile, JSON Schema validators, hosted versions, deployment (release) with bake-time rollback."
tags:
  - appconfig
  - aws
  - configuration
  - json-schema
  - notes
date: 2026-09-06
links:
  - title: Creating feature flags and freeform configuration
    url: https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-configuration-and-profile.html
  - title: Validators
    url: https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-configuration-and-profile-validators.html
  - title: Deployment strategies
    url: https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-deployment-strategy.html
---

# AWS AppConfig - Freeform

Order: **Application** → **Environment** (`dev` / `prod`) → **Configuration profile** (`AWS.Freeform`) → **Hosted version** → **Start deployment**.

Prefer **hosted** store (URI `hosted`, ≤ 2 MB). Feature flags = on/off + attributes. Freeform = your JSON/YAML/text. This note = Freeform.

CloudWatch alarms on the **environment** → auto-rollback during deploy + bake time. Agent polls; apps do not hit GetConfiguration on every request.

| Piece | Job |
| --- | --- |
| Application | Namespace (folder) |
| Environment | Target group + alarms |
| Profile | Type + location + validators (max 2) |
| Version | Immutable snapshot of content |
| Deployment | Version + strategy + environment = **release** |

<details>
<summary>Create application + environment</summary>

```bash
export AWS_REGION=<region>

APP_ID=$(aws appconfig create-application \
  --name my-app \
  --query Id --output text)

ENV_ID=$(aws appconfig create-environment \
  --application-id "$APP_ID" \
  --name prod \
  --query Id --output text)
```

</details>

---

## Freeform

Profile type `AWS.Freeform`. Location URI `hosted` unless you point at S3 / SSM Parameter / SSM Document / Secrets Manager / CodePipeline.

Do not store secrets in Freeform JSON. Secrets Manager (or Parameter Store) for credentials; AppConfig for flags and tunables (`PORT`, `LOG_LEVEL`, `ENABLED`).

<details>
<summary>Create Freeform hosted profile</summary>

```bash
PROFILE_ID=$(aws appconfig create-configuration-profile \
  --application-id "$APP_ID" \
  --name app-settings \
  --location-uri hosted \
  --type AWS.Freeform \
  --query Id --output text)
```

Sample payload (`app-config.json`):

```json
{
  "PORT": 8080,
  "LOG_LEVEL": "INFO",
  "ENABLED": true
}
```

</details>

---

## Validators

Run **before** a version can deploy. Fail → no targets change.

| Type | Use |
| --- | --- |
| **JSON Schema** | Freeform only. Inline schema = **JSON Schema draft-04** (`4.X`). Feature flags already have a built-in schema. |
| **Lambda** | Freeform + feature flags. Semantic checks, other schema drafts, cross-field rules. Timeout **15 s** including cold start. Grant `appconfig.amazonaws.com` invoke. |

Need draft-07 → Lambda validator, not inline schema.

<details>
<summary>JSON Schema (draft-04) - PORT / LOG_LEVEL / ENABLED</summary>

```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "properties": {
    "PORT": {
      "type": "integer",
      "minimum": 1,
      "maximum": 65535
    },
    "LOG_LEVEL": {
      "type": "string",
      "enum": ["DEBUG", "INFO", "WARN", "ERROR"]
    },
    "ENABLED": {
      "type": "boolean"
    }
  },
  "required": ["PORT", "LOG_LEVEL", "ENABLED"],
  "additionalProperties": false
}
```

Attach on create (or update profile). `Content` = schema as a **string**.

```bash
aws appconfig create-configuration-profile \
  --application-id "$APP_ID" \
  --name app-settings \
  --location-uri hosted \
  --type AWS.Freeform \
  --validators '[{"Type":"JSON_SCHEMA","Content":"{\"\$schema\":\"http://json-schema.org/draft-04/schema#\",\"type\":\"object\",\"properties\":{\"PORT\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":65535},\"LOG_LEVEL\":{\"type\":\"string\",\"enum\":[\"DEBUG\",\"INFO\",\"WARN\",\"ERROR\"]},\"ENABLED\":{\"type\":\"boolean\"}},\"required\":[\"PORT\",\"LOG_LEVEL\",\"ENABLED\"],\"additionalProperties\":false}"}]'
```

Console: profile → **Validators** → JSON Schema → paste schema → save **before** first bad deploy.

</details>

---

## Version

Each `create-hosted-configuration-version` = new immutable number (`1`, `2`, …). You **release** a version; you do not edit in place.

Bad JSON vs schema → version create / deploy fails. Fix file, new version.

<details>
<summary>Publish hosted configuration version</summary>

```bash
aws appconfig create-hosted-configuration-version \
  --application-id "$APP_ID" \
  --configuration-profile-id "$PROFILE_ID" \
  --content-type application/json \
  --content fileb://app-config.json \
  hosted-version.json

aws appconfig list-hosted-configuration-versions \
  --application-id "$APP_ID" \
  --configuration-profile-id "$PROFILE_ID"
```

`hosted-version.json` → `VersionNumber`.

</details>

---

## Release (deployment)

`start-deployment` = version + environment + **strategy**.

Predefined: `AppConfig.AllAtOnce` (lab), `AppConfig.Linear50PercentEvery30Seconds`, `AppConfig.Canary10Percent20Minutes`. Prod: linear/canary + **bake time** + CloudWatch alarm on error rate / latency.

Rollback: alarm during rollout or bake → previous version. Manual stop if you catch it first. Deploy **dev** first, then **prod**.

<details>
<summary>Start deployment + watch</summary>

```bash
aws appconfig start-deployment \
  --application-id "$APP_ID" \
  --environment-id "$ENV_ID" \
  --deployment-strategy-id AppConfig.AllAtOnce \
  --configuration-profile-id "$PROFILE_ID" \
  --configuration-version 1 \
  --description "release v1"

aws appconfig list-deployments \
  --application-id "$APP_ID" \
  --environment-id "$ENV_ID"
```

Strategy knobs: growth factor (step %), deploy time, bake time, linear vs exponential (`G*(2^N)`).

</details>

---

## Daily checks

| Symptom | First look |
| --- | --- |
| Deploy blocked / validation error | Schema vs payload types (`ENABLED` boolean not `"true"`); draft-04 only inline |
| App still old config | Agent poll interval; wrong environment; deployment not `COMPLETE` |
| Auto-rollback | CloudWatch alarm on environment; AppConfig rollback IAM |
| Lambda validator timeout | 15 s cap; cold start |

Docs: [validators](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-configuration-and-profile-validators.html) · [strategies](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-deployment-strategy.html)
