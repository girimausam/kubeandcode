---
title: "Lambda Event-Driven Pipeline"
description: "EventBridge, SQS, DynamoDB, and RDS event pipeline patterns."
categories:
  - Lambda
  - AWS
  - EventBridge
---
## Overview

Reference implementation for an event-driven order pipeline: EventBridge publishes events, SQS workers write to DynamoDB, and analytics Lambdas persist to RDS.

## Producer Lambda

Publishes an order event to EventBridge.

```python
import json
import boto3
import uuid

eventbridge = boto3.client("events")

def lambda_handler(event, context):
    order = {
        "orderId": str(uuid.uuid4()),
        "userId": "user-101",
        "amount": 250,
        "status": "CREATED",
    }

    eventbridge.put_events(
        Entries=[
            {
                "Source": "app.orders",
                "DetailType": "OrderCreated",
                "Detail": json.dumps(order),
                "EventBusName": "default",
            }
        ]
    )

    return {"statusCode": 200, "body": json.dumps(order)}
```

## SQS worker Lambda

Consumes from SQS and writes to DynamoDB. SNS wraps the message inside the SQS body.

```python
import json
import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("OrdersTable")

def lambda_handler(event, context):
    for record in event["Records"]:
        body = json.loads(record["body"])
        message = json.loads(body["Message"])

        table.put_item(
            Item={
                "orderId": message["orderId"],
                "userId": message["userId"],
                "amount": message["amount"],
                "status": message["status"],
            }
        )

    return {"statusCode": 200}
```

## DynamoDB table structure

```text
Table Name: OrdersTable
Partition Key: orderId (String)
```

## Analytics Lambda

Reads events from EventBridge and inserts into PostgreSQL or MySQL RDS.

```python
import json
import os
import pymysql

connection = pymysql.connect(
    host=os.environ["DB_HOST"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    database=os.environ["DB_NAME"],
)

def lambda_handler(event, context):
    detail = event["detail"]
    cursor = connection.cursor()

    query = """
        INSERT INTO order_analytics (order_id, user_id, amount, status)
        VALUES (%s, %s, %s, %s)
    """

    cursor.execute(
        query,
        (detail["orderId"], detail["userId"], detail["amount"], detail["status"]),
    )
    connection.commit()

    return {"statusCode": 200}
```

## RDS table

```sql
CREATE TABLE order_analytics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(255),
    user_id VARCHAR(255),
    amount INT,
    status VARCHAR(50)
);
```

## DynamoDB read Lambda

Fetch an order by ID.

```python
import json
import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("OrdersTable")

def lambda_handler(event, context):
    order_id = event["pathParameters"]["id"]
    response = table.get_item(Key={"orderId": order_id})

    return {
        "statusCode": 200,
        "body": json.dumps(response.get("Item", {})),
    }
```

## RDS read Lambda

Fetch analytics records.

```python
import json
import os
import pymysql

connection = pymysql.connect(
    host=os.environ["DB_HOST"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    database=os.environ["DB_NAME"],
)

def lambda_handler(event, context):
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM order_analytics LIMIT 10")
    rows = cursor.fetchall()

    return {"statusCode": 200, "body": json.dumps(rows, default=str)}
```

## Required IAM permissions

### DynamoDB Lambda role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem", "dynamodb:GetItem"],
      "Resource": "*"
    }
  ]
}
```

### EventBridge producer role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["events:PutEvents"],
      "Resource": "*"
    }
  ]
}
```

### SQS consumer Lambda role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "*"
    }
  ]
}
```