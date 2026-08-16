---
title: "API Gateway Mapping Templates for DynamoDB"
description: "Velocity Template Language (VTL) examples for API Gateway proxy integrations with DynamoDB—PutItem, GetItem, and custom JSON responses."
tags:
  - api-gateway
  - dynamodb
  - vtl
  - velocity
  - serverless
  - aws
---

## Overview

Use API Gateway as a proxy to DynamoDB with **Velocity Template Language (VTL)** mapping templates. API Gateway transforms HTTP requests into DynamoDB API calls and maps responses back to JSON for clients.

**Reference:** [Using Amazon API Gateway as a proxy for DynamoDB](https://aws.amazon.com/blogs/compute/using-amazon-api-gateway-as-a-proxy-for-dynamodb/)

### Prerequisites

| Setting | Value |
| --- | --- |
| Integration type | AWS Service |
| AWS service | DynamoDB |
| Actions | `PutItem`, `GetItem`, `Scan` |
| Execution role | API Gateway IAM role with DynamoDB permissions |

**Table:** `Users`

**Partition key:** `userId` (String)

## Create user — `PUT /users`

### Request

```http
PUT /users
Content-Type: application/json
```

```json
{
  "userId": "u123",
  "name": "Mausam",
  "age": 24
}
```

### Integration request mapping template

Set **Content-Type** to `application/json`, then use this VTL for DynamoDB `PutItem`:

```velocity
{
  "TableName": "Users",
  "Item": {
    "userId": { "S": "$input.path('$.userId')" },
    "name": { "S": "$input.path('$.name')" },
    "age": { "N": "$input.path('$.age')" }
  }
}
```

### Integration response mapping template

DynamoDB `PutItem` returns `{}`. Return a friendly message to the client:

```velocity
{
  "message": "User created successfully"
}
```

## Get user — `GET /users/{id}`

### Request

```http
GET /users/u123
```

Path parameter: `id` = `u123`

### Integration request mapping template

```velocity
{
  "TableName": "Users",
  "Key": {
    "userId": { "S": "$input.params('id')" }
  }
}
```

### DynamoDB response (raw)

```json
{
  "Item": {
    "userId": { "S": "u123" },
    "name": { "S": "Mausam" },
    "age": { "N": "24" }
  }
}
```

### Integration response mapping template

Flatten DynamoDB attribute types into plain JSON:

```velocity
{
  "userId": "$input.path('$.Item.userId.S')",
  "name": "$input.path('$.Item.name.S')",
  "age": $input.path('$.Item.age.N')
}
```

### Client response

```json
{
  "userId": "u123",
  "name": "Mausam",
  "age": 24
}
```

## List users — `GET /users`

### Request

```http
GET /users
```

### Integration request mapping template

```velocity
{
  "TableName": "Users"
}
```

Use DynamoDB action **Scan** for this route.

### Integration response mapping template

```velocity
#set($items = [])

#foreach($item in $input.path('$.Items'))
  #set($dummy = $items.add({
    "userId": $item.userId.S,
    "name": $item.name.S,
    "age": $item.age.N
  }))
#end

$util.toJson($items)
```

### Client response

```json
[
  {
    "userId": "u123",
    "name": "Mausam",
    "age": 24
  }
]
```

> **Note:** `Scan` reads the entire table. For production APIs, prefer `Query` with a key condition or use a GSI.

## IAM policy for API Gateway

Grant the API Gateway execution role access to the `Users` table:

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:PutItem",
    "dynamodb:GetItem",
    "dynamodb:Scan"
  ],
  "Resource": "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/Users"
}
```

## Step Functions integration

### Integration request mapping template

Start a state machine execution from API Gateway:

```velocity
{
  "stateMachineArn": "arn:aws:states:REGION:ACCOUNT_ID:stateMachine:STATE_MACHINE_NAME",
  "input": "$util.escapeJavaScript($input.body)"
}
```

### Integration response mapping template

Parse and return the Step Functions output:

```velocity
#set($output = $util.parseJson($input.path('$.output')))

$output
```

## Quick reference

| Route | DynamoDB action | Path param | Key mapping |
| --- | --- | --- | --- |
| `PUT /users` | `PutItem` | — | Body → `Item` attributes |
| `GET /users/{id}` | `GetItem` | `id` | `$input.params('id')` |
| `GET /users` | `Scan` | — | Table name only |

**DynamoDB type suffixes:** `S` = String, `N` = Number, `B` = Binary. VTL maps client JSON into these typed attributes on the way in, and flattens them on the way out.
