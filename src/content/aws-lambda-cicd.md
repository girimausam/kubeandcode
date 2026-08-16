---
title: "Lambda CI/CD with CodePipeline and CodeDeploy"
description: "End-to-end Lambda deployment pipeline using CodeCommit, CodeBuild, CodePipeline, and CodeDeploy canary traffic shifting."
tags:
  - lambda
  - cicd
  - codepipeline
  - codebuild
  - codedeploy
  - codecommit
  - aws
---
## Overview

Pipeline for Lambda deployments using CodePipeline, CodeBuild, and CodeDeploy canary traffic shifting.

## Resources

```text
AWS CodeCommit  → Source repository
AWS CodeBuild   → Build and package
CodeDeploy      → Lambda deployment
CodePipeline    → Pipeline orchestration
AWS Lambda      → Application
```

## Architecture

```text
Developer → CodeCommit → CodePipeline → CodeBuild
  → zip lambda code + appspec.yml → S3 artifact bucket
  → CodeDeploy → new Lambda version → alias (prod) with traffic shift
```

## Why use CodeDeploy with Lambda?

**Without CodeDeploy:** code push updates Lambda and routes 100% traffic immediately — bad deployments affect all users and rollback is manual.

**With CodeDeploy:** traffic shifts gradually (e.g. 10% → 50% → 100% over 10 minutes). Health check failures trigger automatic rollback.

## Repository structure

```text
lambda-api/
├── src/lambda_function.py
├── appspec.yml
├── buildspec.yml
└── requirements.txt
```

## Sample Lambda

```python
def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "body": "Hello from Lambda",
    }
```

## CodeDeploy AppSpec

```yaml
version: 0.0
Resources:
  - LambdaFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: shop-api
        Alias: prod
        CurrentVersion: 1
        TargetVersion: 2
```

CodeDeploy updates versions automatically during deployment.

## BuildSpec

```yaml
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.12
  build:
    commands:
      - pip install -r requirements.txt -t package
      - cp src/lambda_function.py package/
      - cd package && zip -r ../lambda.zip . && cd ..
artifacts:
  files:
    - lambda.zip
    - appspec.yml
```

## Create Lambda alias

CodeDeploy deploys to aliases, not `$LATEST`.

```bash
aws lambda publish-version --function-name shop-api
aws lambda create-alias \
  --function-name shop-api \
  --name prod \
  --function-version 1
```

## Create CodeDeploy application

```bash
aws deploy create-application \
  --application-name shop-api \
  --compute-platform Lambda
```

## Create deployment group

```bash
aws deploy create-deployment-group \
  --application-name shop-api \
  --deployment-group-name prod-group \
  --service-role-arn arn:aws:iam::<ACCOUNT>:role/CodeDeployRole \
  --deployment-config-name CodeDeployDefault.LambdaCanary10Percent5Minutes
```

### Deployment strategies

| Strategy | Description |
| --- | --- |
| `LambdaAllAtOnce` | 100% immediately |
| `LambdaCanary10Percent5Minutes` | 10% then wait 5 min |
| `LambdaCanary10Percent10Minutes` | 10% then wait 10 min |
| `LambdaLinear10PercentEvery1Minute` | Gradual linear rollout |

For production, `Canary10Percent5Minutes` is a sensible default.

## Pipeline stages

```text
Stage 1 — Source:  CodeCommit
Stage 2 — Build:   CodeBuild
Stage 3 — Deploy:  CodeDeploy Lambda
```

## Optional validation hook

```python
def lambda_handler(event, context):
    # health check
    return "success"
```

CodeDeploy invokes this validation Lambda before completing traffic shift. On failure: deployment fails, rollback starts, traffic restores.

## IAM roles needed

**CodePipeline role:** CodeCommit, CodeBuild, S3, CodeDeploy

**CodeBuild role:** CloudWatch Logs, S3, Lambda

**CodeDeploy role:** managed policy `AWSCodeDeployRoleForLambda`