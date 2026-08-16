---
title: AWS CI/CD Notes — CodePipeline, CodeBuild & CodeDeploy
description: Quick-reference patterns for CodePipeline, CodeBuild, and CodeDeploy setups.
tags:
  - codepipeline
  - codebuild
  - codedeploy
  - lambda
  - sam
  - ecs
  - ec2
  - s3
  - cloudfront
  - cicd
---

# AWS CI/CD Notes — CodePipeline, CodeBuild & CodeDeploy

Quick-reference patterns for common CodePipeline setups. Each example lists the stages, what each service does, and the minimum IAM/buildspec pieces.

---

## Core pattern

```text
Source → Build (CodeBuild) → [Manual approval] → Deploy (CodeDeploy) → [SNS notification]
```

| Service | Role |
|---|---|
| **CodePipeline** | Orchestrates stages and artifacts between steps |
| **CodeBuild** | Runs buildspec (compile, test, package, push) |
| **CodeDeploy** | Rolling/blue-green deploy to EC2, ECS, Lambda, on-prem |
| **Manual approval** | Human gate before production deploy |
| **SNS** | Email/Slack on pipeline state change |

**Typical pipeline stages:**

1. **Source** — CodeCommit, GitHub, or S3 zip
2. **Build** — CodeBuild project (buildspec.yml)
3. **Approval** — Manual approval action (optional)
4. **Deploy** — CodeDeploy application + deployment group
5. **Notification** — EventBridge rule → SNS on `FAILED` / `SUCCEEDED`

**SNS notification (EventBridge):**

```bash
aws events put-rule \
  --name codepipeline-state-change \
  --event-pattern '{"source":["aws.codepipeline"],"detail-type":["CodePipeline Pipeline Execution State Change"]}'

aws sns create-topic --name pipeline-notifications
# Subscribe email, then add SNS as EventBridge target
```

---

## appspec.yaml

CodeDeploy reads `appspec.yaml` (or `appspec.yml`) from the **root of the deployment artifact**. It defines what to deploy, where it goes, and which lifecycle hooks to run.

```text
CodeBuild artifact/
├── appspec.yaml      ← required at root
├── app files...
└── scripts/          ← hook scripts referenced below
```

**Deployment lifecycle (EC2):**

```text
BeforeInstall → Install (copy files) → AfterInstall
  → ApplicationStop → Start → ApplicationStart → ValidateService
```

### EC2 / on-premises

```yaml
# appspec.yaml
version: 0.0
os: linux
files:
  - source: /
    destination: /var/www/my-app
    file_exists_behavior: OVERWRITE
hooks:
  BeforeInstall:
    - location: scripts/before_install.sh
      timeout: 300
      runas: root
  ApplicationStop:
    - location: scripts/stop.sh
      timeout: 60
      runas: root
  ApplicationStart:
    - location: scripts/start.sh
      timeout: 60
      runas: root
  ValidateService:
    - location: scripts/validate.sh
      timeout: 120
      runas: root
```

Example hook script (`scripts/start.sh`):

```bash
#!/bin/bash
systemctl restart my-app
```

Include `appspec.yaml` and scripts in the CodeBuild artifact:

```yaml
# buildspec.yml
artifacts:
  files:
    - appspec.yaml
    - scripts/**/*
    - dist/**/*
```

### ECS (blue/green with ALB)

```yaml
# appspec.yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: <TASK_DEFINITION_ARN>
        LoadBalancerInfo:
          ContainerName: my-app
          ContainerPort: 8080
        PlatformVersion: LATEST
```

CodeBuild outputs `imagedefinitions.json`; CodeDeploy uses `appspec.yaml` alongside it to shift ALB traffic to the new task set.

### Lambda (alias traffic shifting)

```yaml
# appspec.yaml
version: 0.0
Resources:
  - MyFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: my-function
        Alias: live
        CurrentVersion: 1    # populated by CodeDeploy during deployment
        TargetVersion: 2
```

Used with SAM/CodeDeploy for blue/green Lambda deploys — traffic shifts from `live` alias current version to target version, with optional pre/post traffic hooks.

---

## 1. Lambda with SAM

```text
Source (CodeCommit/GitHub) → Build (sam build + sam package) → Deploy (CloudFormation / CodeDeploy for Lambda)
```

**With CodeBuild + CodeDeploy (full pipeline):**

```yaml
# buildspec.yml
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.12
    commands:
      - pip install aws-sam-cli
  build:
    commands:
      - sam build
      - sam package --s3-bucket <artifact-bucket> --output-template-file packaged.yaml
artifacts:
  files:
    - packaged.yaml
```

- **CodeDeploy** uses `appspec.yaml` for Lambda alias traffic shifting (blue/green). See [appspec.yaml](#appspecyaml).
- Deployment group type: **Lambda**.

**Without CodeDeploy — CloudFormation deploy stage:**

```yaml
# buildspec.yml (post_build)
post_build:
  commands:
    - sam deploy --no-confirm-changeset --no-fail-on-empty-changeset \
        --stack-name my-lambda-stack \
        --s3-bucket <artifact-bucket> \
        --capabilities CAPABILITY_IAM
```

CodePipeline deploy stage uses **CloudFormation** action instead of CodeDeploy. Simpler for small functions.

**Without CodeBuild — SAM CLI locally or in CodePipeline source only:**

```bash
sam build && sam deploy --guided
```

Fine for dev. No pipeline; no audit trail of builds.

**Minimal combo notes:**

| Skip | What you lose |
|---|---|
| CodePipeline | No orchestration, manual triggers |
| CodeBuild | No managed build environment; run SAM locally |
| CodeDeploy | No blue/green alias shifting; use `sam deploy` (direct CFN update) |

---

## 2. Static site — S3 zip → S3 dest → CloudFront invalidation

```text
Source (S3 zip) → Build (unzip + sync) → Deploy (S3 destination) → Invalidate CloudFront
```

Source bucket holds a zip with a `src/` folder of static assets.

```yaml
# buildspec.yml
version: 0.2
phases:
  install:
    commands:
      - yum install -y unzip
  build:
    commands:
      - unzip source.zip -d output/
      - aws s3 sync output/src/ s3://<destination-bucket>/ --delete
  post_build:
    commands:
      - aws cloudfront create-invalidation \
          --distribution-id <distribution-id> \
          --paths "/*"
```

**Pipeline stages:**

1. **Source** — S3 bucket `source-bucket`, object key `source.zip` (or trigger on upload)
2. **Build** — CodeBuild syncs extracted `src/` to `destination-bucket`
3. **No CodeDeploy** — S3 is the deploy target; buildspec handles it

**CodeBuild role needs:**

- `s3:GetObject` on source bucket
- `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on destination bucket
- `cloudfront:CreateInvalidation` on the distribution

**Variant — no CodeBuild:** Lambda triggered by S3 `ObjectCreated` on the zip, extracts and syncs. Good for small sites; CodeBuild better for larger builds and logs.

---

## 3. Deploy to ECS

```text
Source → Build (docker build + push ECR) → Deploy (CodeDeploy to ECS)
```

```yaml
# buildspec.yml
version: 0.2
phases:
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
      - IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
  build:
    commands:
      - docker build -t <ecr-repo>:$IMAGE_TAG .
      - docker push <ecr-repo>:$IMAGE_TAG
  post_build:
    commands:
      - printf '{"ImageURI":"<ecr-repo>:%s"}' $IMAGE_TAG > imagedefinitions.json
artifacts:
  files:
    - imagedefinitions.json
```

**CodeDeploy for ECS:**

- Create ECS application (compute platform: **ECS**)
- Deployment group references cluster + service + ALB listener (blue/green) or rolling update
- Pipeline deploy stage: **Amazon ECS (CodeDeploy-to-ECS)** action, input artifact = `imagedefinitions.json` + `appspec.yaml`

**Without CodeDeploy:** use **ECS deploy** action in CodePipeline (direct service update). Faster setup; no blue/green traffic shifting.

---

## 4. Deploy to EC2

```text
Source → Build (package artifact) → Deploy (CodeDeploy agent on EC2)
```

**Requires on each EC2 instance:**

- CodeDeploy agent installed and running
- Instance tagged to match the deployment group

```yaml
# buildspec.yml
version: 0.2
phases:
  build:
    commands:
      - npm ci && npm run build
artifacts:
  files:
    - appspec.yaml
    - scripts/**/*
    - '**/*'
  base-directory: dist
```

See [appspec.yaml](#appspecyaml) for the full EC2 example with lifecycle hooks.

**CodeDeploy setup:**

1. Create application (compute platform: **EC2 / on-premises**)
2. Create deployment group — tag filter e.g. `Environment=prod`
3. Pipeline deploy stage: **CodeDeploy** action

**Without CodeBuild:** push a pre-built zip to S3 as source; CodeDeploy deploys it directly (no compile step).

**Without CodeDeploy:** use SSM Run Command or user-data script in buildspec to `scp`/`rsync` to EC2. Loses rollback hooks and deployment history.

---

## Quick comparison

| Target | Build | Deploy mechanism | Blue/green |
|---|---|---|---|
| Lambda (SAM) | CodeBuild + `sam build` | CodeDeploy or CloudFormation | CodeDeploy alias shifting |
| Static site | CodeBuild unzip + `s3 sync` | S3 (in buildspec) | N/A |
| ECS | CodeBuild + Docker → ECR | CodeDeploy-to-ECS | Yes (with ALB) |
| EC2 | CodeBuild package | CodeDeploy agent | Rolling (in-place) |
