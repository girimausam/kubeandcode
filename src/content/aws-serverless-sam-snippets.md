---
title: "Serverless CLI and SAM Snippets"
description: "SAM build, deploy, local invoke, scaling policy, and CodeDeploy commands for the serverless order-events project."
tags:
  - serverless
  - sam
  - lambda
  - codedeploy
  - cli
  - snippets
  - aws
---
Copy-paste snippets for [Serverless on AWS](/blog/serverless-on-aws).

## SAM workflow

```bash
sam validate --lint
sam build
sam local invoke ProducerFunction --event events/create-order.json
sam local start-api
sam deploy --guided
sam deploy   # after samconfig.toml exists
```

## Combined template excerpt

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    MemorySize: 256
    Tracing: Active

Resources:
  OrderHttpApi:
    Type: AWS::Serverless::HttpApi

  OrdersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: orderId
          AttributeType: S
      KeySchema:
        - AttributeName: orderId
          KeyType: HASH

  OrderQueue:
    Type: AWS::SQS::Queue
    Properties:
      VisibilityTimeout: 60
```

## ECS CPU target tracking policy

```json
{
  "TargetValue": 70.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleInCooldown": 120,
  "ScaleOutCooldown": 60
}
```

## ECS SQS backlog policy

```json
{
  "TargetValue": 100.0,
  "CustomizedMetricSpecification": {
    "MetricName": "ApproximateNumberOfMessagesVisible",
    "Namespace": "AWS/SQS",
    "Dimensions": [
      { "Name": "QueueName", "Value": "order-events" }
    ],
    "Statistic": "Average"
  },
  "ScaleInCooldown": 120,
  "ScaleOutCooldown": 60
}
```

## Lambda alias and concurrency

```bash
aws lambda publish-version --function-name order-serverless-ProducerFunction
aws lambda create-alias \
  --function-name order-serverless-ProducerFunction \
  --name prod \
  --function-version 1

aws lambda put-function-concurrency \
  --function-name order-serverless-WorkerFunction \
  --reserved-concurrent-executions 25
```

## CodeDeploy canary deploy group

```bash
aws deploy create-deployment-group \
  --application-name order-serverless \
  --deployment-group-name prod \
  --service-role-arn arn:aws:iam::ACCOUNT:role/CodeDeployLambdaRole \
  --deployment-config-name CodeDeployDefault.LambdaCanary10Percent5Minutes
```