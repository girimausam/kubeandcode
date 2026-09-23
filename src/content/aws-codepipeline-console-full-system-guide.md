---
title: "CodePipeline full-system console guide"
description: "Build a multi-stage CI/CD pipeline in the console - source, CodeBuild, approvals, ECS/EKS deploy, artifacts, KMS, and cross-service IAM."
tags:
 - aws
 - codepipeline
 - codebuild
 - codedeploy
 - cicd
 - devops
 - eks
 - ecs
---

# CodePipeline full-system console guide

End-to-end **CI/CD** appears in almost every full-system exercise: **source → build → test → approve → deploy → notify**. This guide follows the **AWS Console** path and ties to **ECR**, **ECS**, and **EKS** patterns on this site.

**CLI reference:** [CodePipeline / CodeBuild / CodeDeploy](./aws-cicd-codepipeline-codebuild-codedeploy.md) · [ECS pipeline](./aws-ecs-codepipeline-cicd.md)  
**Checklist:** [DevOps checklist](./aws-devops-system-design-checklist.md)

---

## Reference architecture

```text
CodeCommit/GitHub ──► CodePipeline ──► CodeBuild (docker build) ──► ECR
                              │
                              ├──► Manual approval
                              └──► CodeDeploy / ECS deploy / EKS GitOps trigger
S3 artifact bucket (SSE-KMS) ◄── encrypted artifacts between stages
```

---

## Console -  artifact bucket

1. **S3** → create `my-pipeline-artifacts-prod` with **SSE-KMS** ([S3 KMS guide](./aws-s3-kms-encryption-decryption-iam.md)).
2. Block public access; bucket policy allowing CodePipeline service.

---

## Console -  CodeBuild project

1. **CodeBuild** → **Create build project**.
2. **Source:** CodeCommit/GitHub connection.
3. **Environment:** Managed image, **Privileged** if building Docker.
4. **Service role:** allow ECR push, CloudWatch Logs, S3 artifacts.
5. **Buildspec** (inline or repo file): `pre_build` login ECR → `build` docker → `post_build` push + `imagedefinitions.json` for ECS.

VPC: only if build must reach private resources - add NAT/endpoints.

---

## Console -  CodePipeline

1. **CodePipeline** → **Create pipeline** → name `shopflow-release`.
2. **Source stage:** repository + branch.
3. **Build stage:** CodeBuild project.
4. **Deploy stage (ECS example):**
 - Deploy provider **Amazon ECS**
 - Cluster + service + imagedefinitions file from build output
5. **Add stage** → **Manual approval** before production deploy.
6. **Settings** → default artifact location = KMS-encrypted bucket.

### EKS variant

- Build pushes to ECR; deploy stage triggers **Lambda** to `kubectl set image` or commits to GitOps repo ([Argo pipeline](./eks-argocd-codecommit-pipeline.md)).

---

## IAM (pipeline service role)

Pipeline role typically needs:

- `codebuild:BatchGetBuilds`, `StartBuild`
- `s3:GetObject`, `PutObject` on artifact bucket
- `ecs:DescribeServices`, `UpdateService` (ECS deploy)
- `cod deploy:*` if using CodeDeploy
- `kms:Decrypt`, `kms:GenerateDataKey` for artifact CMK

Use AWS managed `AWSCodePipelineServiceRole` as template - **narrow** for prod.

---

## Security

- **OIDC** to GitHub instead of long-lived tokens where possible.
- Separate pipelines per environment (`staging` auto, `prod` approval).
- Scan images in CodeBuild ([ECR guide](./aws-ecr-access-lifecycle-console-guide.md)).
- CloudTrail on pipeline API calls.

---

## Commonly missed

| Miss | Impact |
|------|--------|
| Artifact bucket not KMS-aligned | Stage fails between build/deploy |
| CodeBuild not privileged | Docker build fails |
| Wrong `imagedefinitions.json` format | ECS deploy no-op |
| Pipeline role can deploy to any cluster | Blast radius |
| No notifications on failure | Silent broken prod |

---

## Notifications

1. **CodePipeline** → **Settings** → triggers or EventBridge rule on pipeline state.
2. Target **SNS** topic (optionally encrypted with KMS - [messaging guide](./aws-messaging-sqs-sns-kms-encryption-iam.md)).

---

## Troubleshooting

| Failure stage | Check |
|---------------|--------|
| Source | Connection auth, branch |
| Build | Buildspec paths, ECR login, IAM |
| Deploy | ECS service name, task def compat, image URI |
| Approval | SNS/email subscription confirmed |

Docs: [CodePipeline](https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html) · [CodeBuild](https://docs.aws.amazon.com/codebuild/latest/userguide/welcome.html)

[← CI/CD reference](./aws-cicd-codepipeline-codebuild-codedeploy.md) · [Checklist](./aws-devops-system-design-checklist.md)
