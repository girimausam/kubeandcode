---
title: "Amazon Verified Permissions - Cognito Groups & API Gateway"
description: "Group-based API access with Amazon Verified Permissions, Cognito User Pool groups, Cedar policies, and API Gateway authorizers."
tags:
  - avp
  - verified-permissions
  - api-gateway
  - cognito
  - cedar
  - aws
  
date: 2026-08-24
---

## Overview

Use **Amazon Verified Permissions (AVP)** with **Amazon Cognito** groups to authorize API Gateway requests. Policies in Cedar define which user pool groups can call which routes.

| Component | Role |
| --- | --- |
| Cognito User Pool | Users, groups, JWT access tokens |
| API Gateway | REST routes with authorizer |
| Verified Permissions | Policy store, Cedar `permit` rules |

Reference: [Amazon Verified Permissions](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/what-is-avp.html)

---

## Users and groups

| User | Group |
| --- | --- |
| `admin@example.com` | `admins` |
| `alice@example.com` | - |
| `bob@example.com` | `employee` |

Groups: `admins`, `employee`

---

## API Gateway routes

API: `prod`

| Method | Path | Who can access |
| --- | --- | --- |
| `GET` | `/private` | `admins`, or users **not** in `admins` or `employee` |
| `GET` | `/private/admins` | `admins` only |
| `GET` | `/private/employees` | `admins` and `employee` |

```text
prod
 └── /
      └── private
            ├── GET  /private
            ├── GET  /private/admins
            └── GET  /private/employees
```

---

## Verified Permissions setup

### 1. Register API actions

Console: **AVP → Policy store → Schema → Actions**

Create actions that map to API Gateway operations:

| Action name | Principal types | Resource types |
| --- | --- | --- |
| `get /private` | `User` | `Application` |
| `post /private` | `User` | `Application` |
| `get /private/admins` | `User` | `Application` |
| `get /private/employees` | `User` | `Application` |

Example action: **post /private** - applies to principal type `User`, resource type `Application`.

Replace `us-east-1_du9KuRt50` in policies below with your User Pool ID.

### 2. Create Cedar policies

Console: **AVP → Policy store → Policies → Create policy**

#### Policy 1 - Users outside `admins` and `employee`

Allow `GET` and `POST` on `/private` when the principal is in neither group.

```cedar
permit(
  principal,
  action in [
    cognitoauth::Action::"get /private",
    cognitoauth::Action::"post /private"
  ],
  resource
)
when {
  !(principal in cognitoauth::UserGroup::"us-east-1_du9KuRt50|employee") &&
  !(principal in cognitoauth::UserGroup::"us-east-1_du9KuRt50|admins")
};
```

#### Policy 2 - Users in `admins`

Allow `GET` on `/private/admins` and `/private/employees`.

```cedar
permit(
  principal in cognitoauth::UserGroup::"us-east-1_du9KuRt50|admins",
  action in [
    cognitoauth::Action::"get /private",
    cognitoauth::Action::"get /private/admins",
    cognitoauth::Action::"get /private/employees"
  ],
  resource
);
```

Add a separate policy for the `employee` group on `get /private/employees` if employees should access that route without being admins.

---

## Testing

### Generate a Cognito access token

**App client settings**

- Authentication flow: `ALLOW_USER_PASSWORD_AUTH`

**Token request**

| Field | Value |
| --- | --- |
| URL | `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_du9KuRt50` |
| Method | `POST` |

Headers:

```http
Content-Type: application/x-amz-json-1.1
X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth
```

Body:

```json
{
  "AuthFlow": "USER_PASSWORD_AUTH",
  "ClientId": "3csb2ppugj180apt0pabrl52v3",
  "AuthParameters": {
    "USERNAME": "admin@example.com",
    "PASSWORD": "Test@123"
  },
  "ClientMetadata": {}
}
```

Use the **AccessToken** from the response (not the ID token) when calling API Gateway with a Cognito/AVP authorizer.

### Call API Gateway

Attach the authorizer to the API, then send:

```http
Authorization: <AccessToken>
```

Test each user (`admin@example.com`, `alice@example.com`, `bob@example.com`) against `/private`, `/private/admins`, and `/private/employees` to confirm allow/deny matches the Cedar policies.

---

## Notes

- **Policy 2 label in raw notes** said "employee" but the Cedar policy uses the `admins` group - the policy above matches the Cedar snippet.
- **Group ARN format:** `cognitoauth::UserGroup::"<region>_<userPoolId>|<groupName>"`.
- **Action names** must match the schema action strings exactly (method + path).
- Replace `ClientId`, User Pool ID, and passwords with your environment values before testing.
