---
title: "AppSync GraphQL Task Manager — Notes"
description: "Cognito-authenticated AppSync GraphQL API with DynamoDB, JavaScript resolvers, user-scoped task access, and Admins group authorization."
tags:
  - appsync
  - graphql
  - cognito
  - dynamodb
  - aws
date: 2026-08-22
---

## Overview

Build a task manager API where users authenticate with Cognito, own their tasks, and members of an **Admins** group can read any task.


| Component                | Role                                        |
| ------------------------ | ------------------------------------------- |
| Amazon Cognito User Pool | Sign-in, JWT issuance, `Admins` group       |
| AWS AppSync              | GraphQL API with Cognito authorization      |
| Amazon DynamoDB          | Task storage (`owner` + `id` composite key) |


**End state:**

- Users authenticate with Cognito.
- Each task has an owner (`ctx.identity.sub`).
- Normal users manage only their own tasks.
- The **Admins** Cognito group can view and manage all tasks.
- Resolvers use **AppSync JavaScript** (`APPSYNC_JS`), not VTL.
- Test from the AppSync console and AWS CLI.



### Target architecture

```text
Client / GraphQL Explorer
        │
        ▼
Amazon Cognito User Pool
        │ JWT
        ▼
AWS AppSync GraphQL API
        │
        ▼
Amazon DynamoDB
```



### Authorization model

```text
                         Cognito User Pool
                                │
                   ┌────────────┼────────────┐
                   ▼            ▼            ▼
                 Alice          Bob         Admin
                   │             │             │
                   └─────────────┼─────────────┘
                                 ▼
                              AppSync
                                 │
                   ┌─────────────┴──────────────┐
                   │                            │
                   ▼                            ▼
              User resolvers              Admin resolvers
                   │                            │
                   │ ctx.identity.sub           │ groups includes Admins
                   ▼                            ▼
            owner = caller                 privileged operation
                   │                            │
                   └─────────────┬──────────────┘
                                 ▼
                              DynamoDB
```

---



## Prerequisites

Set shell variables before running CLI commands:

```bash
export AWS_REGION=us-east-1
export USER_POOL_ID=<your-user-pool-id>
export CLIENT_ID=<your-app-client-id>
export APPSYNC_URL=<your-appsync-graphql-url>
export TABLE_ARN=<your-dynamodb-table-arn>
```

---



## Cognito User Pool



### App client (SPA)

Create an app client **without** a client secret.

**Allowed auth flows:**

- `ALLOW_ADMIN_USER_PASSWORD_AUTH`
- `ALLOW_REFRESH_TOKEN_AUTH`



### Users

Create three users for testing: `alice`, `bob`, and `admin`.

### Create user

```bash
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username alice@example.com \
  --user-attributes Name=email,Value=alice@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region $AWS_REGION
```

Repeat for `bob@example.com` and `admin@example.com`, setting `email_verified` to `true` on each.

### Set permanent password

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username alice@example.com \
  --password "$ALICE_PASSWORD" \
  --permanent \
  --region $AWS_REGION
```



### Create Admins group

```bash
aws cognito-idp create-group \
  --group-name Admins \
  --user-pool-id $USER_POOL_ID \
  --region $AWS_REGION
```



### Add user to Admins group

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --group-name Admins \
  --region $AWS_REGION
```



### Get authentication token

```bash
aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $CLIENT_ID \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters \
    USERNAME=alice@example.com,PASSWORD="$ALICE_PASSWORD" \
  --region $AWS_REGION
```

The response includes:

- **Access token**
- **ID token**
- **Refresh token**

Use the **ID token** consistently when sending Cognito authentication to AppSync.

```bash
export ALICE_ID_TOKEN=$(echo "$AUTH_RESULT" | jq -r '.AuthenticationResult.IdToken')
```



### Get user identity (sub)

```bash
aws cognito-idp admin-get-user \
  --user-pool-id $USER_POOL_ID \
  --username alice@example.com \
  --region $AWS_REGION
```

```bash
export ALICE_SUB="<alice-cognito-sub>"
export ALICE_TASK_ID="<alice-task-id>"
```

---



## DynamoDB table

Use as the AppSync data source.


| Attribute | Key | Value              |
| --------- | --- | ------------------ |
| `owner`   | PK  | Cognito user `sub` |
| `id`      | SK  | UUID               |


---



## AppSync GraphQL API

Console path: **AWS AppSync → Create API → GraphQL APIs**


| Setting            | Value                    |
| ------------------ | ------------------------ |
| API name           | `TaskManagerAPI`         |
| Authorization mode | Amazon Cognito User Pool |
| User pool          | Select your pool         |




### Schema (`schema.graphql`)

```graphql
type Task {
  id: ID!
  owner: String!
  title: String!
  description: String
  completed: Boolean!
  createdAt: AWSDateTime!
  updatedAt: AWSDateTime!
}

input CreateTaskInput {
  title: String!
  description: String
}

input UpdateTaskInput {
  id: ID!
  title: String
  description: String
  completed: Boolean
}

type Query {
  getMyTask(id: ID!): Task
  listMyTasks: [Task!]!

  getTaskAsAdmin(owner: String!, id: ID!): Task
  listAllTasks: [Task!]!
}

type Mutation {
  createTask(input: CreateTaskInput!): Task!
  updateMyTask(input: UpdateTaskInput!): Task!
  deleteMyTask(id: ID!): Task!
}

type Schema {
  query: Query
  mutation: Mutation
}
```

`CreateTaskInput` intentionally omits `owner: String!`. The owner comes from `ctx.identity.sub`, not from client input.

### Operations


| Type     | Operation        | Scope        |
| -------- | ---------------- | ------------ |
| Mutation | `createTask`     | Current user |
| Query    | `getMyTask`      | Current user |
| Query    | `listMyTasks`    | Current user |
| Mutation | `updateMyTask`   | Current user |
| Mutation | `deleteMyTask`   | Current user |
| Query    | `getTaskAsAdmin` | Admins only  |
| Query    | `listAllTasks`   | Admins only  |




### Data access flow

```text
AppSync
   │ assumes
   ▼
IAM Role (AppSyncTaskManagerDynamoDBRole)
   │
   ▼
DynamoDB Tasks table
```

---



## IAM role for AppSync

Role name: `AppSyncTaskManagerDynamoDBRole`

Trust policy

```bash
cat << 'EOF' > appsync-iam-role-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "appsync.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
```



Permission policy (replace `TABLE_ARN`)

```bash
cat << 'EOF' > appsync-dynamodb-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TaskTableAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "TABLE_ARN"
      ]
    }
  ]
}
EOF
```

Create the role and attach the inline policy:

```bash
aws iam create-role \
  --role-name AppSyncTaskManagerDynamoDBRole \
  --assume-role-policy-document file://appsync-iam-role-trust-policy.json

aws iam put-role-policy \
  --role-name AppSyncTaskManagerDynamoDBRole \
  --policy-name TaskManagerDynamoDBAccess \
  --policy-document file://appsync-dynamodb-policy.json
```



---



## Data source

Console: attach DynamoDB as a data source on the API.


| Setting          | Value                                            |
| ---------------- | ------------------------------------------------ |
| Data source type | Amazon DynamoDB table                            |
| Data source name | `TasksDataSource`                                |
| Region           | `us-east-1`                                      |
| Table            | `Tasks`                                          |
| IAM role         | `AppSyncTaskManagerDynamoDBRole` (existing role) |


---



## Resolvers (AppSync JavaScript)

Attach unit resolvers with runtime **APPSYNC_JS** and data source **TasksDataSource**.

Console path: **Schema → Mutation/Query → operation → Attach**


| Schema field            | Resolver file                                                              | DynamoDB operation                        |
| ----------------------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| `Mutation.createTask`   | `[dir/appsync/pr2/createTask.js](./dir/appsync/pr2/createTask.js)`         | `PutItem` — owner from `ctx.identity.sub` |
| `Query.getMyTask`       | `[dir/appsync/pr2/getMyTask.js](./dir/appsync/pr2/getMyTask.js)`           | `GetItem` — key scoped to caller          |
| `Query.listMyTasks`     | `[dir/appsync/pr2/listMyTasks.js](./dir/appsync/pr2/listMyTasks.js)`       | List caller's tasks                       |
| `Mutation.updateMyTask` | `[dir/appsync/pr2/updateTask.js](./dir/appsync/pr2/updateTask.js)`         | `UpdateItem` — key scoped to caller       |
| `Mutation.deleteMyTask` | `[dir/appsync/pr2/deleteMyTask.js](./dir/appsync/pr2/deleteMyTask.js)`     | `DeleteItem` — key scoped to caller       |
| `Query.getTaskAsAdmin`  | `[dir/appsync/pr2/getTaskAsAdmin.js](./dir/appsync/pr2/getTaskAsAdmin.js)` | `GetItem` — any `owner` + `id`            |
| `Query.listAllTasks`    | `[dir/appsync/pr2/listAllTasks.js](./dir/appsync/pr2/listAllTasks.js)`     | `Scan` — all tasks                        |


**Admin helper:** `[dir/appsync/pr2/isAdmin.js](./dir/appsync/pr2/isAdmin.js)` — checks `ctx.identity.groups` for membership. Import or inline in admin resolvers.

### Example: attach `Mutation.createTask`


| Setting       | Value             |
| ------------- | ----------------- |
| Data source   | `TasksDataSource` |
| Runtime       | `APPSYNC_JS`      |
| Resolver type | Unit              |
| Code          | `createTask.js`   |


Repeat for each field in the table above.

---



## Admin authorization

Admin queries read `ctx.identity.groups` from the Cognito JWT.

```text
Cognito JWT
   ↓
ctx.identity.groups
   ↓
Is caller in "Admins"?
   ├── Yes → continue
   └── No  → util.unauthorized()
```


| Caller                 | Allowed                          |
| ---------------------- | -------------------------------- |
| Admin (`Admins` group) | `getTaskAsAdmin`, `listAllTasks` |
| Normal user            | Own-task operations only         |




### Get admin ID token

```bash
ADMIN_AUTH=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $CLIENT_ID \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters \
    USERNAME=admin@example.com,PASSWORD="Test@123" \
  --region $AWS_REGION)

export ADMIN_ID_TOKEN=$(echo "$ADMIN_AUTH" \
  | jq -r '.AuthenticationResult.IdToken')
```



### Admin query example

```graphql
query {
  getTaskAsAdmin(
    owner: "ALICE_SUB"
    id: "ALICE_TASK_ID"
  ) {
    id
    owner
    title
    description
    completed
    createdAt
    updatedAt
  }
}
```

---



## CLI testing

1. Obtain an ID token from Cognito (user or admin).
2. POST a GraphQL operation to the AppSync URL with `Authorization: <ID_TOKEN>`.



### List my tasks (alice)

```bash
cat << 'EOF' > appsync-query.json
{
  "query": "query { listMyTasks { id owner title completed } }"
}
EOF

curl \
  -X POST \
  "$APPSYNC_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: $ALICE_ID_TOKEN" \
  --data @appsync-query.json
```



### List all tasks (admin)

```bash
cat << 'EOF' > list-all-query.json
{
  "query": "query { listAllTasks { id owner title completed } }"
}
EOF

curl \
  -X POST \
  "$APPSYNC_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: $ADMIN_ID_TOKEN" \
  --data @list-all-query.json
```



### Console testing

In the AppSync console **Queries** tab, sign in with user credentials and run operations against the schema.

---



## Pagination (extension)

To paginate `listMyTasks`, extend the schema and resolver to accept `limit` and `nextToken`.


| Argument    | First page           | Next page                    |
| ----------- | -------------------- | ---------------------------- |
| `limit`     | Page size (e.g. `2`) | Same                         |
| `nextToken` | `null`               | Token from previous response |


```graphql
query {
  listMyTasks(
    limit: 2
    nextToken: "PASTE_TOKEN_HERE"
  ) {
    items {
      id
      title
      completed
    }
    nextToken
  }
}
```

Update `listMyTasks` in the schema to return a connection type (`items` + `nextToken`) instead of `[Task!]!` before using this query shape.

---



## Notes

- **Group name casing:** Cognito group is `Admins`. Some resolver files check `'admins'` (lowercase). Align group name checks with the actual Cognito group name or authorization will fail silently.
- `listMyTasks` **resolver:** Verify the attached code queries by `ctx.identity.sub` (partition key), not a table `Scan` with an admin gate.
- **Token type:** AppSync Cognito auth expects the **ID token**, not the access token.

