---
title: "AppSync Real-time Collaboration "
description: "Multi-user project tasks with Cognito auth, DynamoDB single-table design, pipeline resolvers with membership checks, and GraphQL subscriptions for live updates."
tags:
  - appsync
  - graphql
  - cognito
  - dynamodb
  - subscriptions
  - aws
  
date: 2026-08-23
---

## Overview

Extend the task manager into a **collaborative project workspace**. Multiple users belong to a project, share tasks, and receive **real-time updates** when another member creates or updates a task.

| Component | Role |
| --- | --- |
| Amazon Cognito User Pool | Authenticate users; identity via `ctx.identity.sub` |
| AWS AppSync | GraphQL API, pipeline resolvers, subscriptions |
| Amazon DynamoDB | Single-table store for projects, members, and tasks |

**End state:**

- Users authenticate with Cognito.
- Tasks belong to a **project**, not a single owner.
- Only project **members** can query or mutate project tasks.
- `createTask` and `updateTask` trigger subscriptions scoped by `projectId`.
- Subscribers receive live updates without polling.

---

## Target architecture

```text
                Cognito
                   │
                   ▼
User A ────────► AppSync ◄──────── User B
                   │  │
                   │  │ Subscription
                   │  └────────────────────► Real-time update
                   ▼
                DynamoDB
```

### Example project layout

```text
Project A
├── Alice    (member)
├── Bob      (member)
└── Charlie  (member)

Tasks
├── Task 1
├── Task 2
└── Task 3
```

### Mutation → subscription flow

```text
Alice
  │
  │ updateTask()
  ▼
AppSync
  │
  ├── DynamoDB update
  │
  └── onTaskUpdated(projectId)
          │
          ├── Bob receives update
          └── Charlie receives update
```

---

## DynamoDB single-table design

| Entity | PK | SK | Notes |
| --- | --- | --- | --- |
| Project | `PROJECT#<projectId>` | `METADATA` | Project record (optional) |
| Member | `PROJECT#<projectId>` | `MEMBER#<cognito-sub>` | Membership gate for auth |
| Task | `PROJECT#<projectId>` | `TASK#<taskId>` | Task items under a project |

Example keys:

```text
PK = PROJECT#project-001
SK = TASK#task-001
```

Task attributes stored on the item:

```text
projectId = project-001
id        = task-001
```

Entity types in this model:

- **Project**
- **Task**
- **Project membership**

---

## GraphQL schema

```graphql
type Project {
  id: ID!
  name: String!
  createdAt: AWSDateTime!
}

type Task {
  id: ID!
  projectId: ID!
  title: String!
  description: String
  status: TaskStatus!
  createdBy: String!
  createdAt: AWSDateTime!
  updatedAt: AWSDateTime!
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
}

input CreateTaskInput {
  projectId: ID!
  title: String!
  description: String
}

input UpdateTaskInput {
  projectId: ID!
  id: ID!
  title: String
  description: String
  status: TaskStatus
}

type Query {
  getProject(id: ID!): Project
  listProjectTasks(projectId: ID!): [Task!]!
}

type Mutation {
  createTask(input: CreateTaskInput!): Task!
    @aws_cognito_user_pools
  updateTask(input: UpdateTaskInput!): Task!
    @aws_cognito_user_pools
}

type Subscription {
  onTaskCreated(projectId: ID!): Task
    @aws_subscribe(mutations: ["createTask"])

  onTaskUpdated(projectId: ID!): Task
    @aws_subscribe(mutations: ["updateTask"])
}
```

`CreateTaskInput` has no `createdBy` field - `createdBy` is set from `ctx.identity.sub` in the resolver.

---

## Subscriptions

AppSync publishes subscription events when the linked mutation succeeds. Clients filter by `projectId`.

### Subscription definitions

```graphql
type Subscription {
  onTaskCreated(projectId: ID!): Task
    @aws_subscribe(mutations: ["createTask"])

  onTaskUpdated(projectId: ID!): Task
    @aws_subscribe(mutations: ["updateTask"])
}
```

### Client subscription example

```graphql
subscription {
  onTaskCreated(projectId: "project-001") {
    id
    projectId
    title
    status
    createdBy
  }
}
```

### End-to-end flow

```text
User B subscribes:

  onTaskUpdated(projectId: "project-001")
            │
            ▼
User A executes:

  updateTask(projectId: "project-001", ...)
            │
            ▼
Matching subscribers receive the update
```

When Alice creates a task:

```text
Alice creates task
       ↓
createTask mutation succeeds
       ↓
AppSync publishes subscription event
       ↓
Bob receives the new task
```

---

## Resolvers and pipeline functions

Every query and mutation runs a **membership check** before touching task data. Pipeline resolvers chain `checkMembership` first, then the operation function.

| Function | File | Purpose |
| --- | --- | --- |
| `checkMembership` | [`dir/appsync/pr3/checkMembership.js`](./dir/appsync/pr3/checkMembership.js) | `GetItem` on `MEMBER#<sub>`; reject if not a member |
| `createTask` | [`dir/appsync/pr3/createTask.js`](./dir/appsync/pr3/createTask.js) | `PutItem` with `TASK#<generated-id>` |
| `listProjectTasks` | [`dir/appsync/pr3/listProjectTasks.js`](./dir/appsync/pr3/listProjectTasks.js) | `Query` where `SK begins_with TASK#` |
| Pipeline passthrough | [`dir/appsync/pr3/resolver-code.js`](./dir/appsync/pr3/resolver-code.js) | Returns `ctx.prev.result` between pipeline stages |

### Membership check

`checkMembership` reads:

```text
PK = PROJECT#<projectId>
SK = MEMBER#<caller-sub>
```

If the item does not exist, the resolver returns a `MembershipError`.

### Pipeline resolver pattern

Every GraphQL resolver using a pipeline runs two functions in order:

```text
GraphQL Resolver
      │
      ▼
Function 1: Check Membership
      │
      ├── Not member → Unauthorized
      │
      └── Member
            │
            ▼
Function 2: Perform operation
```

### Cognito → pipeline → subscription

Mutations and queries go through the membership pipeline. Successful mutations fan out to subscribers on the same API:

```text
                 Cognito
                    │
                    ▼
                 AppSync
                    │
        ┌───────────┴────────────┐
        │                        │
        ▼                        ▼
Pipeline Resolver           Subscription
        │                        ▲
        ▼                        │
Check Membership              Mutation
        │                        │
        ▼                        │
DynamoDB Operation ────────────┘
```

### Create task flow

```text
checkMembership
   ↓
Alice's MEMBER item exists
   ↓
createTask function
   ↓
TASK#<generated-id> created
```

### List project tasks - pipeline resolver (Bob)

```text
Bob
 │
 ▼
listProjectTasks(projectId: "project-001")
 │
 ▼
Pipeline resolver
 │
 ├── 1. checkMembership
 │      │
 │      ├── GetItem:
 │      │   PK = PROJECT#project-001
 │      │   SK = MEMBER#<Bob-sub>
 │      │
 │      └── Item exists ✅
 │
 └── 2. listProjectTasks
        │
        └── DynamoDB Query:
            PK = PROJECT#project-001
            AND SK begins_with TASK#
                    │
                    ▼
               Task items (or empty)
                    │
                    ▼
            GraphQL returns [Task!]!
```

Attach pipeline functions in order: **checkMembership → operation function**.

---

## Authorization summary

| Caller | Requirement | Operations |
| --- | --- | --- |
| Cognito user | `MEMBER#<sub>` item exists for `projectId` | `listProjectTasks`, `createTask`, `updateTask` |
| Project member | Active subscription to `projectId` | `onTaskCreated`, `onTaskUpdated` |

Subscribers must be authenticated Cognito users. AppSync delivers events only to clients subscribed to the matching `projectId` argument.

---

## Notes

- **Single-table keys:** Resolver code uses `PROJECT#` / `TASK#` / `MEMBER#` prefixes - keep PK/SK patterns consistent across all functions.
- **`checkMembership` args:** Reads `projectId` from `ctx.args.projectId` or `ctx.args.input.projectId` so the same function works for queries and mutations.
- **Empty task list:** A valid member with no tasks yet returns an empty array, not an error.
- **Subscription auth:** Configure the API authorization mode (Cognito User Pools) on the subscription endpoint so only signed-in users can subscribe.
