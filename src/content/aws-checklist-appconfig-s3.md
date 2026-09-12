---
title: "AWS Checklist: AppConfig Schema and S3 Bucket Hygiene"
description: "Short checklist: AppConfig JSON schema, S3 lifecycle / CRR / versioning / tags."
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