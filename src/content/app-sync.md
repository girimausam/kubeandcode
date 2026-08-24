---
title: "AppSync Ticket API - Multi-Auth & EventBridge"
description: "Support ticket API with Cognito and IAM auth, Lambda-backed createTicket, DynamoDB pipeline for updateTicketStatus, and EventBridge event publishing."
tags:
  - appsync
  - graphql
  - cognito
  - iam
  - dynamodb
  - lambda
  - eventbridge
  - aws
  - notes
date: 2026-08-24
---

## Overview

Build a **support ticket API** where frontend users authenticate with Cognito, a trusted backend uses IAM, ticket creation runs through Lambda for validation, and status changes publish events to EventBridge.

- **Cognito** - `createTicket`, `getTicket`, `updateTicket`
- **IAM (SigV4)** - `updateTicketStatus` (backend / AWS service caller)
- **Simple CRUD** → DynamoDB resolver
- **Validation / business rules** → Lambda resolver

```text
Frontend (Cognito JWT)  →  createTicket / getTicket / updateTicket
Backend (IAM SigV4)     →  updateTicketStatus
```

---

## DynamoDB

```bash
export TICKETS_TABLE=Tickets
```

| Key | Type |
| --- | --- |
| `ticketId` | PK (String) |

Operations: get by ID, create, update status.

---

## Multi-auth setup

| Mode | Caller | Operations |
| --- | --- | --- |
| **Default** - Cognito User Pools | Frontend user | `createTicket`, `getTicket`, `updateTicket` |
| **Additional** - AWS IAM | Trusted backend / AWS service | `updateTicketStatus` |

Annotate fields in the schema:

```graphql
createTicket(input: CreateTicketInput!): Ticket!
  @aws_cognito_user_pools

updateTicketStatus(input: UpdateTicketStatusInput!): Ticket!
  @aws_iam
```

### Enable IAM on the API

Console: **AppSync → your API → Settings → Authorization**

1. **Default authorization mode** - Amazon Cognito User Pool
2. **Additional authorization modes** - add **AWS IAM**

Or when creating the API, set `authenticationType: AMAZON_COGNITO_USER_POOLS` and add a second auth provider with `authenticationType: AWS_IAM`.

Only fields annotated with `@aws_iam` accept SigV4-signed requests. Cognito-only fields reject IAM callers and vice versa.

---

## Setup steps

### 1. Create the Lambda function

Deploy [`dir/appsync/pr4/lambda-TicketLambda.py`](./dir/appsync/pr4/lambda-TicketLambda.py) as `TicketLambda` (Python 3.12+).

Environment variable:

```bash
TICKETS_TABLE=Tickets
```

IAM policy on the Lambda execution role - allow `dynamodb:PutItem` on the `Tickets` table.

Grant AppSync permission to invoke the function:

```bash
aws lambda add-permission \
  --function-name TicketLambda \
  --statement-id appsync-invoke \
  --action lambda:InvokeFunction \
  --principal appsync.amazonaws.com \
  --source-arn "arn:aws:appsync:$AWS_REGION:$ACCOUNT_ID:apis/$TICKET_API_ID/*"
```

### 2. Create data sources

Console: **AppSync → Data sources → Create data source**

| Name | Type | Notes |
| --- | --- | --- |
| `TicketsDataSource` | DynamoDB | Table `Tickets`; use an IAM role AppSync can assume |
| `TicketLambdaDataSource` | Lambda | Function `TicketLambda` |
| `EventBridgeDataSource` | Amazon EventBridge | Event bus (default or custom) |

AppSync creates a service role per data source (or reuse one role with combined policies). The EventBridge role needs `events:PutEvents` on the target bus.

### 3. Create AppSync functions (pipeline building blocks)

Console: **AppSync → Functions → Create function**

Create one function per pipeline stage. Runtime **APPSYNC_JS**, each bound to the correct data source:

| Function name | Data source | Code file |
| --- | --- | --- |
| `UpdateTicketStatusFn` | `TicketsDataSource` | [`updateTicketStatus.js`](./dir/appsync/pr4/updateTicketStatus.js) |
| `GetUpdatedTicketFn` | `TicketsDataSource` | [`getTicketUpdatedTicket.js`](./dir/appsync/pr4/getTicketUpdatedTicket.js) |
| `PublishTicketStatusChangedFn` | `EventBridgeDataSource` | [`publishTicketStatusChanged.js`](./dir/appsync/pr4/publishTicketStatusChanged.js) |

Functions are reusable resolver steps - they do not map to a GraphQL field until attached in a pipeline.

### 4. Attach `createTicket` resolver (Lambda, Cognito)

Console: **Schema → Mutation → `createTicket` → Attach**

| Setting | Value |
| --- | --- |
| Resolver type | Unit |
| Data source | `TicketLambdaDataSource` |
| Runtime | APPSYNC_JS |
| Code | [`createTicket.js`](./dir/appsync/pr4/createTicket.js) |

This resolver passes `ctx.args.input` and `ctx.identity.sub` to Lambda. Only Cognito callers can invoke it (`@aws_cognito_user_pools` on the schema field).

### 5. Attach `updateTicketStatus` pipeline resolver (IAM)

Console: **Schema → Mutation → `updateTicketStatus` → Attach**

| Setting | Value |
| --- | --- |
| Resolver type | Pipeline |
| Before mapping | [`updateTicketPipeline.js`](./dir/appsync/pr4/updateTicketPipeline.js) (request passthrough) |
| After mapping | [`updateTicketPipeline.js`](./dir/appsync/pr4/updateTicketPipeline.js) (returns `ctx.stash.ticket`) |
| Functions (in order) | `UpdateTicketStatusFn` → `GetUpdatedTicketFn` → `PublishTicketStatusChangedFn` |

Pipeline execution:

```text
IAM caller → AppSync → Pipeline
  1. updateTicketStatus      UpdateItem (status, updatedAt)
  2. getTicketUpdatedTicket  GetItem → ctx.stash.ticket
  3. publishTicketStatusChanged  PutEvents → TicketStatusChanged
  → return ctx.stash.ticket
```

Only IAM-signed callers can invoke this mutation (`@aws_iam` on the schema field).

### 6. Call `updateTicketStatus` from a backend (SigV4)

Use AWS SDK credentials (instance role, access keys, or assumed role) to sign the GraphQL request against the AppSync HTTP endpoint with **AWS Signature Version 4** - not a Cognito JWT.

```bash
# Example: IAM-authenticated mutation via awscurl or SDK
# POST $APPSYNC_URL with SigV4 signing region = API region
```

The caller's IAM policy must allow `appsync:GraphQL` on the API ARN.

---

## `createTicket` - Lambda resolver

[`dir/appsync/pr4/createTicket.js`](./dir/appsync/pr4/createTicket.js) invokes Lambda with `input` and `ctx.identity.sub`.

[`dir/appsync/pr4/lambda-TicketLambda.py`](./dir/appsync/pr4/lambda-TicketLambda.py) handles:

- Title required, max 200 chars
- `priority = HIGH` if title contains `"urgent"`, else `NORMAL`
- Writes ticket with `status: OPEN`, `owner` from Cognito `sub`

```python
ticket = {
    "ticketId": str(uuid.uuid4()),
    "title": title,
    "status": "OPEN",
    "owner": identity["sub"],
    "priority": priority,  # HIGH | NORMAL
    ...
}
table.put_item(Item=ticket)
```

---

## `updateTicketStatus` - pipeline reference

| Step | File | What it does |
| --- | --- | --- |
| 1 | [`updateTicketStatus.js`](./dir/appsync/pr4/updateTicketStatus.js) | `UpdateItem` on `ticketId`; stashes `ticketId`, `status`, `updatedAt`; `ConditionalCheckFailed` → `NotFoundError` |
| 2 | [`getTicketUpdatedTicket.js`](./dir/appsync/pr4/getTicketUpdatedTicket.js) | `GetItem` using stashed `ticketId`; stores full item in `ctx.stash.ticket` |
| 3 | [`publishTicketStatusChanged.js`](./dir/appsync/pr4/publishTicketStatusChanged.js) | `PutEvents` with `source: ticket.api`, `detailType: TicketStatusChanged` |
| Final | [`updateTicketPipeline.js`](./dir/appsync/pr4/updateTicketPipeline.js) | Returns `ctx.stash.ticket` |

EventBridge `detail` payload:

```json
{
  "ticketId": "...",
  "status": "...",
  "owner": "...",
  "priority": "...",
  "updatedAt": "..."
}
```

Downstream rules (notifications, analytics, workflows) subscribe to the `TicketStatusChanged` event on the bus.

---

## Inspect the pipeline resolver

```bash
aws appsync get-resolver \
  --api-id $TICKET_API_ID \
  --type-name Mutation \
  --field-name updateTicketStatus \
  --region $AWS_REGION \
  --query 'resolver.{Kind:kind,Pipeline:pipelineConfig.functions,Code:code}'
```

---

## Notes

- AppSync needs an **EventBridge data source** and IAM permission for `events:PutEvents` on the pipeline function.
- `updateTicketStatus` is IAM-only - frontend users cannot call it even with a valid Cognito token.
- Step 2 exists because `UpdateItem` returns only updated attributes; EventBridge needs the full ticket (owner, priority, etc.).
