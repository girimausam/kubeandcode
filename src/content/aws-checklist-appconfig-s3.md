---
title: "AWS AppConfig & S3 Checklist: Schema & Bucket Hygiene"
description: "Production readiness checklist for AWS AppConfig configuration profiles, JSON schema validation, and Amazon S3 bucket security baselines."
tags:
  - aws
  - appconfig
  - s3
  - notes
date: 2026-09-06
---

## APP CONFIG

- JSON Validator and Schema
- Version Control
```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
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

---


## S3 Bucket

- Lifecycle Policy (IA or Archive)
- Cross-Region Replication
- Bucket Version
- Tags

---