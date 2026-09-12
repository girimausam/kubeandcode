---
title: "ECS and Lambda CI/CD with CodePipeline"
description: "BuildSpec, AppSpec, and task definition patterns for ECS blue/green deployments and Lambda pipelines with Amazon ECR."
tags:
  - ecs
  - lambda
  - cicd
  - codepipeline
  - codebuild
  - codedeploy
  - ecr
  - aws
---
1. ECS CodePipeline (#ECS CodePipeline)
2. Lambda CodePipeline (#Lambda)

## ECS CodePipeline

https://docs.aws.amazon.com/codepipeline/latest/userguide/tutorials.html

```yaml
## buildspec.yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws --version
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
      # Updated to your repository name: my-org/app
      # Add $AWS_ACCOUNT_ID in CodeBuild environment
      - REPOSITORY_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/my-org/app
      - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
      - IMAGE_TAG=${COMMIT_HASH:=latest}
  build:
    commands:
      - echo Build started on `date`
      - echo Building the Docker image...
      - docker build -t $REPOSITORY_URI:latest .
      - docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG
  post_build:
    commands:
      - echo Build completed on `date`
      - echo Pushing the Docker images...
      - docker push $REPOSITORY_URI:latest
      - docker push $REPOSITORY_URI:$IMAGE_TAG
      - echo Writing image definitions file...
      # IMPORTANT: See the note below regarding the "name" field
      - printf '[{"name":"my-app-container","imageUri":"%s"}]' $REPOSITORY_URI:$IMAGE_TAG > imagedefinitions.json
artifacts:
    files: imagedefinitions.json
```

### To add Amazon ECR permissions to the CodeBuild role

1. Open the IAM console at https://console.aws.amazon.com/iam/.
2. In the left navigation pane, choose **Roles**.
3. In the search box, type **codebuild-** and choose the role that was created by the CodePipeline wizard. For this tutorial, the role name is **codebuild-hello-world-service-role**.
4. On the **Summary** page, choose **Attach policies**.
5. Select the box to the left of the **AmazonEC2ContainerRegistryPowerUser** policy, and choose **Attach policy**.
6.  You will need to add `AWS_ACCOUNT_ID` to your CodeBuild environment variables. (e.g., `123456789012`)

### With CodeBuild and CodeDeploy

1. **CodeBuild** builds the Docker image, pushes it to ECR, and outputs an `imageDetail.json` file containing the new image URI.
2. **CodeDeploy** takes that image URI, plugs it into your Task Definition, and handles the deployment to your ECS Service (usually doing a Blue/Green deployment to shift traffic safely).

To make this work, three files in the root of your repository: your `buildspec.yaml`, an `appspec.yaml`, and your `taskdef.json`.

### 1. `buildspec.yaml`

For CodeDeploy to ECS, the standard artifact is `imageDetail.json` rather than `imagedefinitions.json`.

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws --version
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
      - REPOSITORY_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/my-org/app
      - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
      - IMAGE_TAG=${COMMIT_HASH:=latest}
  build:
    commands:
      - echo Build started on `date`
      - echo Building the Docker image...
      - docker build -t $REPOSITORY_URI:latest .
      - docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG
  post_build:
    commands:
      - echo Build completed on `date`
      - echo Pushing the Docker images...
      - docker push $REPOSITORY_URI:latest
      - docker push $REPOSITORY_URI:$IMAGE_TAG
      - echo Writing image detail file for CodeDeploy...
      # CodeDeploy uses imageDetail.json to map the new image URI to task definition
      - printf '{"ImageURI":"%s"}' $REPOSITORY_URI:$IMAGE_TAG > imageDetail.json

artifacts:
    files:
      - imageDetail.json
      - appspec.yaml
      - taskdef.json
```

### 2. `appspec.yaml`

CodeDeploy requires an AppSpec file to know which Task Definition and Container to update. Must create this file in the root of your repository alongside your `buildspec.yaml`.

```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "<TASK_DEFINITION>" # CodeDeploy will automatically replace this dynamically
        LoadBalancerInfo:
          ContainerName: "my-app-container" # IMPORTANT: This must match the container name in your taskdef.json exactly
          ContainerPort: 80 # Update this to the port your app actually listens on (e.g., 80, 8080, 3000)
```

*(Note: Do not hardcode `my-app-taskdef` in the `<TASK_DEFINITION>` placeholder above. Leave it exactly as `<TASK_DEFINITION>`. CodeDeploy dynamically injects the correct ARN during the pipeline run).*

### 3. `taskdef.json`

Need your task definition saved as a JSON file in your repository. You can get your current one by running:
`aws ecs describe-task-definition --task-definition my-app-taskdef --query taskDefinition > taskdef.json`

Make sure the container name in this JSON matches the `ContainerName` in your `appspec.yaml` (e.g., `"name": "my-app-container"`). You can leave the `"image"` field as a placeholder (like `"<IMAGE1_NAME>"`); CodeDeploy will overwrite it with the URI from your `imageDetail.json`.

### 4. Tying it together in CodePipeline

When you set up your AWS CodePipeline via the console:

1. **Source Stage:** Connect to GitHub/Bitbucket/CodeCommit.
2. **Build Stage:** Point it to your CodeBuild project. Ensure the output artifact is named something like `BuildArtifact`.
3. **Deploy Stage:** * **Action Provider:** Choose **Amazon ECS (Blue/Green)** (which uses CodeDeploy under the hood).
    - **Input Artifacts:** Select `BuildArtifact`.
    - **Amazon ECS cluster:** `my-cluster`
    - **Amazon ECS service:** `my-app-service`
    - **AppSpec file:** Choose `BuildArtifact`, and type `appspec.yaml`.
    - **Task Definition:** Choose `BuildArtifact`, and type `taskdef.json`.
    - **Dynamically update task definition image:** Choose `BuildArtifact`, and enter `IMAGE1_NAME` as the placeholder, and select `imageDetail.json` as the file.

---

## Lambda CI/CD Pipeline 

## Step 1: Create IAM Roles

Create the following IAM roles.

<details>
<summary><strong>1. Lambda Execution Role</strong></summary>

Create a role named:

```text
lab-lambda-role
```

Attach managed policy:

```text
AWSLambdaBasicExecutionRole
```

Purpose:

Allows Lambda to write logs to CloudWatch.

</details>

---

<details>
<summary><strong>2. CodeBuild Role</strong></summary>

Create:

```text
lab-codebuild-role
```

Attach the following custom policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::lab-artifact-bucket-258109618781/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codecommit:GitPull"
      ],
      "Resource": "arn:aws:codecommit:us-east-1:258109618781:lab-sample-repo"
    },
    {
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:PublishVersion",
        "lambda:GetAlias"
      ],
      "Resource": "arn:aws:lambda:us-east-1:258109618781:function:lab-sample-lambda"
    }
  ]
}
```

Purpose:

* Pull source code from CodeCommit
* Package Lambda code
* Publish new Lambda versions
* Upload artifacts to S3

</details>

---

<details>
<summary><strong>3. CodeDeploy Role</strong></summary>

Create:

```text
lab-codedeploy-role
```

Attach AWS managed policy:

```text
AWSCodeDeployRoleForLambda
```

Additional S3 access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion"
      ],
      "Resource": "arn:aws:s3:::lab-artifact-bucket-258109618781/*"
    }
  ]
}
```

</details>

---

<details>
<summary><strong>4. CodePipeline Role</strong></summary>

Create:

```text
lab-codepipeline-role
```

Attach the following policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetBucketVersioning",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::lab-artifact-bucket-258109618781",
        "arn:aws:s3:::lab-artifact-bucket-258109618781/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "codecommit:GetBranch",
        "codecommit:GetCommit",
        "codecommit:GetUploadArchiveStatus",
        "codecommit:UploadArchive",
        "codecommit:GitPull"
      ],
      "Resource": "arn:aws:codecommit:us-east-1:258109618781:lab-sample-repo"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codebuild:BatchGetBuilds",
        "codebuild:StartBuild"
      ],
      "Resource": "arn:aws:codebuild:us-east-1:258109618781:project/lab-sample-build"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codedeploy:CreateDeployment",
        "codedeploy:GetDeployment",
        "codedeploy:GetDeploymentConfig",
        "codedeploy:GetApplicationRevision",
        "codedeploy:RegisterApplicationRevision",
        "codedeploy:GetApplication"
      ],
      "Resource": "*"
    }
  ]
}
```

</details>

---

## Step 2: Create an S3 Artifact Bucket

Create an S3 bucket.

```text
lab-artifact-bucket-258109618781
```

Purpose:

CodePipeline stores source code and build artifacts in this bucket.

---

## Step 3: Create the Lambda Function

Create a Lambda function.

```text
Name: lab-sample-lambda
Runtime: Python 3.9
Execution Role: lab-lambda-role
```

Sample code:

```python
def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "body": "Hello World"
    }
```

After creation:

1. Publish Version 1.
2. Create alias:

```text
Alias Name: live
Version: 1
```

The alias is important because CodeDeploy shifts traffic between versions using this alias.

---

## Step 4: Create a CodeCommit Repository

Create repository:

```text
lab-sample-repo
```

Clone it locally:

```bash
git clone <repository-clone-url>
cd lab-sample-repo
```

---

## Step 5: Add Lambda Source Code

Project structure:

```text
lab-sample-repo/
│
├── index.py
├── buildspec.yml
└── appspec.yml
```

---

## Step 6: Create buildspec.yml

This file tells CodeBuild what to do.

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      python: 3.9

  build:
    commands:
      - echo "Getting current version..."
      - export CURRENT_VERSION=$(aws lambda get-alias --function-name lab-sample-lambda --name live --query "FunctionVersion" --output text)

      - echo "Current version is $CURRENT_VERSION"

      - echo "Packaging Lambda function..."
      - zip -r lambda.zip index.py

      - echo "Updating Lambda code and publishing version..."
      - aws lambda update-function-code --function-name lab-sample-lambda --zip-file fileb://lambda.zip --publish > result.json

      - export NEW_VERSION=$(jq -r '.Version' result.json)

      - echo "New version is $NEW_VERSION"

      - sed -i "s/CURRENT_VERSION/$CURRENT_VERSION/g" appspec.yml
      - sed -i "s/TARGET_VERSION/$NEW_VERSION/g" appspec.yml

artifacts:
  files:
    - appspec.yml
```

What happens here?

1. Read current Lambda alias version.
2. Package source code.
3. Update Lambda code.
4. Publish a new Lambda version.
5. Replace placeholders in `appspec.yml`.
6. Send deployment artifact to CodeDeploy.

---

## Step 7: Create appspec.yml

CodeDeploy uses this file to know what to deploy.

```yaml
version: 0.0

Resources:
  - myLambdaFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: "lab-sample-lambda"
        Alias: "live"
        CurrentVersion: "CURRENT_VERSION"
        TargetVersion: "TARGET_VERSION"
```

During build:

```text
CURRENT_VERSION -> 1
TARGET_VERSION  -> 2
```

CodeDeploy then moves the alias from version 1 to version 2.

---

## Step 8: Create CodeBuild Project

Create project:

```text
Name: lab-sample-build
Source Provider: CodePipeline
Environment: Managed Image
Operating System: Amazon Linux
Runtime: Standard
Service Role: lab-codebuild-role
Artifacts: CodePipeline
```

No source repository needs to be specified because CodePipeline will supply it.

---

## Step 9: Create CodeDeploy Application

Create application.

```text
Name: lab-sample-deploy
Compute Platform: AWS Lambda
```

---

## Step 10: Create Deployment Group

Create deployment group.

```text
Name: lab-sample-dg
Application: lab-sample-deploy
Service Role: lab-codedeploy-role
Deployment Config:
CodeDeployDefault.LambdaAllAtOnce
```

Deployment style:

```text
Blue/Green
```

For production systems you may prefer:

```text
CodeDeployDefault.LambdaLinear10PercentEvery1Minute
```

or

```text
CodeDeployDefault.LambdaCanary10Percent5Minutes
```

---

## Step 11: Create CodePipeline

Create pipeline:

```text
Pipeline Name: lab-sample-pipeline
Role: lab-codepipeline-role
Artifact Store: lab-artifact-bucket-258109618781
```

Add stages:

## Source Stage

```text
Provider: AWS CodeCommit
Repository: lab-sample-repo
Branch: main
```

---

## Build Stage

```text
Provider: AWS CodeBuild
Project: lab-sample-build
```

---

## Deploy Stage

```text
Provider: AWS CodeDeploy
Application: lab-sample-deploy
Deployment Group: lab-sample-dg
```

Save pipeline.

---

## Step 12: Push Code

Commit and push.

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

The pipeline should start automatically.

---

## Step 13: Verify the Deployment

Open CodePipeline.

Expected flow:

```text
Source  -> Succeeded
Build   -> Succeeded
Deploy  -> Succeeded
```

Open Lambda.

You should see:

```text
Version 1
Version 2
Version 3
...
```

Alias:

```text
live -> latest deployed version
```

Invoke the Lambda:

```json
{
  "statusCode": 200,
  "body": "Hello from CI/CD Pipeline!"
}
```