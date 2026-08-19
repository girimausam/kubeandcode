---
title: "API Gateway with Cognito"
description: "Runbook for securing REST and HTTP APIs with Cognito User Pools (JWT authorizer) and Identity Pools (IAM/SigV4), including OAuth grants, trust policies, and scopes."
tags:
  - aws
  - cognito
  - user pools
  - identity pools
  - api gateway
  - oauth
  - iam
---

## Overview

Amazon Cognito splits into two services that solve different problems:


| Service           | Purpose                                           | Typical API Gateway auth                                                    |
| ----------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| **User Pool**     | Sign-up, sign-in, OAuth/OIDC tokens               | `COGNITO_USER_POOLS` authorizer (REST API) or **JWT authorizer** (HTTP API) |
| **Identity Pool** | Exchange tokens for **temporary AWS credentials** | `AWS_IAM` authorization + SigV4-signed requests                             |


**User Pools** answer *who is the caller* and issue JWTs. **Identity Pools** answer *what AWS resources can this caller access* by mapping federated identities to IAM roles.

```text
                    ┌──────────────────────┐
                    │   Cognito User Pool  │
                    │  Users · Groups      │
                    │  OAuth / OIDC        │
                    │  ID / Access tokens  │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌────────────────┐ ┌─────────────┐ ┌──────────────────┐
     │  API Gateway   │ │  Identity   │ │  Other AWS APIs  │
     │  JWT authorizer│ │  Pool       │ │  (S3, DynamoDB)  │
     │  (Bearer token)│ │  → IAM creds│ │                  │
     └────────┬───────┘ └──────┬──────┘ └──────────────────┘
              │                │
              ▼                ▼
         Lambda / ECS      SigV4 to API Gateway
                          (AuthorizationType: AWS_IAM)
```



### Four concepts to keep straight

1. **Authentication** - Who is the caller? (User Pool sign-in)
2. **OAuth grant** - How does the app obtain a token?
3. **Scopes** - What is the access token allowed to do? (resource server + method scopes)
4. **IAM / Identity Pool** - What AWS APIs can the caller invoke with temporary credentials?

---



## Choose an authorization pattern



### Pattern A - User Pool authorizer (most common)

Use when you want clients to send a **Bearer JWT** in the `Authorization` header.

- **REST API:** `AuthorizationType: COGNITO_USER_POOLS`
- **HTTP API:** JWT authorizer (`authorizer-type JWT`)

Client flow: sign in → get token → `Authorization: Bearer <token>` → API Gateway validates JWT → backend runs.

**Token choice on REST API methods:**


| Method configuration                       | Token type       | What API Gateway checks                         |
| ------------------------------------------ | ---------------- | ----------------------------------------------- |
| No **Authorization scopes** on the method  | **ID token**     | Valid signature, issuer, expiry; user identity  |
| **Authorization scopes** set on the method | **Access token** | Valid token + at least one matching OAuth scope |


- **Access Token** — The standard choice for API authorization. Contains custom scopes (`PetStore/Read`, `PetStore/Write`). However, the Cognito authorizer only accepts access tokens when **OAuth Scopes** are configured on the API method.
- **ID Token** — Contains user identity claims. When no OAuth Scopes are configured on a method (as in our current setup), the Cognito authorizer treats the supplied token as an identity token.

> The Cognito authorizer's behavior depends on whether **OAuth Scopes** are configured on the API method. With **no scopes** (current setup), the authorizer runs in **identity token mode** — it validates an ID token's signature and issuer, and rejects access tokens. When you add scopes (e.g., `PetStore/Read`), the authorizer switches to **access token mode** — it validates the access token's scopes and rejects ID tokens. See ++[Control access to REST APIs using Amazon Cognito user pools as an authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html)++  for details.

**Tip:** The REST API console test invoke for a Cognito authorizer requires an **ID token**. To test access-token scope validation, call the deployed API with a real client.

**Token validation regex** on the authorizer matches the `aud` claim - this only works with **ID tokens**. Access tokens do not contain `aud` in the same way; using the regex with an access token rejects the request.

References: [Integrate REST API with Cognito](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-enable-cognito-user-pool.html), [HTTP API JWT authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html), [Accessing resources after sign-in](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-accessing-resources-api-gateway-and-lambda.html)

### Pattern B - Identity Pool + IAM (SigV4)

Use when API methods use `AuthorizationType: AWS_IAM` and you need **IAM-level** access control (for example `execute-api:Invoke` on specific paths).

Client flow:

1. Sign in to User Pool → obtain **ID token**
2. Call `GetId` with the ID token in `Logins`
3. Call `GetCredentialsForIdentity` → temporary `AccessKeyId`, `SecretKey`, `SessionToken`
4. **Sign the HTTP request** with SigV4 (`service: execute-api`) and call API Gateway

**Important:** Identity Pool federation uses the **ID token** in the `Logins` map, not the access token:

```text
cognito-idp.<region>.amazonaws.com/<USER_POOL_ID>=<ID_TOKEN>
```

References: [Control access with IAM policies](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-control-access-using-iam-policies-to-invoke-api.html), [Cognito IAM roles](https://docs.aws.amazon.com/cognito/latest/developerguide/role-trust-and-permissions.html)

---



## OAuth 2.0 grants (User Pool)

Cognito supports these grants via the hosted UI `/oauth2/authorize` and `/oauth2/token` endpoints (enabled when you add a Cognito domain).


| Grant                         | Use case                               | Tokens returned              | Notes                                           |
| ----------------------------- | -------------------------------------- | ---------------------------- | ----------------------------------------------- |
| **Authorization code**        | Web/mobile apps with a backend or PKCE | ID, access, refresh          | **Recommended** for interactive users           |
| **Authorization code + PKCE** | SPA, mobile (public clients)           | ID, access, refresh          | Successor to implicit grant                     |
| **Client credentials**        | Machine-to-machine (M2M)               | Access token only            | Requires app client **secret**; no user context |
| **Implicit**                  | Legacy browser apps                    | ID, access (in URL fragment) | **Deprecated** - use authorization code + PKCE  |


**App client rules (favorite):**

- **Client credentials** cannot share the same app client as authorization code or implicit grants.
- M2M scopes come from a **resource server** you define in the user pool (format: `identifier/scope`).
- Implicit grant exposes tokens in the URL fragment; AWS recommends disabling it on new app clients.

Reference: [OAuth grants in Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints-oauth-grants.html)

---



## REST API - create a Cognito authorizer



### Console / API settings

1. Create a User Pool and app client.
2. Add a Cognito domain (for OAuth endpoints).
3. In API Gateway → **Authorizers** → type **Cognito**.
4. Set **Token source** to `Authorization` (default).
5. On each method: `Authorization: COGNITO_USER_POOLS`, select authorizer, optionally set **Authorization scopes**.



### CLI example

```bash
aws apigateway create-authorizer \
  --rest-api-id API_ID \
  --name CognitoAuthorizer \
  --type COGNITO_USER_POOLS \
  --provider-arns "arn:aws:cognito-idp:REGION:ACCOUNT_ID:userpool/REGION_POOL_ID" \
  --identity-source "method.request.header.Authorization"
```

Up to **1,000 user pools** can be attached to a single `COGNITO_USER_POOLS` authorizer.

### CloudFormation (minimal)

```yaml
CogAuthorizer:
  Type: AWS::ApiGateway::Authorizer
  Properties:
    Name: CognitoAuthorizer
    RestApiId: !Ref Api
    Type: COGNITO_USER_POOLS
    IdentitySource: method.request.header.Authorization
    ProviderARNs:
      - !GetAtt UserPool.Arn

ApiGET:
  Type: AWS::ApiGateway::Method
  Properties:
    HttpMethod: GET
    RestApiId: !Ref Api
    ResourceId: !GetAtt Api.RootResourceId
    AuthorizationType: COGNITO_USER_POOLS
    AuthorizerId: !Ref CogAuthorizer
    # AuthorizationScopes: ["my-api/read"]  # uncomment for access-token scope checks
```

Reference: [Cognito authorizer with CloudFormation](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-cognito-authorizer-cfn.html)

### Lambda proxy - access token claims

With Lambda proxy integration, validated claims are available at:

```text
event.requestContext.authorizer.claims
```

Use **ID token** claims for user profile (`sub`, `email`, `cognito:groups`). Use **access token** when method scopes are configured.

---



## HTTP API - JWT authorizer

HTTP APIs use a **JWT authorizer** (not `COGNITO_USER_POOLS`). Configure issuer and audience from Cognito:

```bash
aws apigatewayv2 create-authorizer \
  --name cognito-jwt \
  --api-id API_ID \
  --authorizer-type JWT \
  --identity-source '$request.header.Authorization' \
  --jwt-configuration Audience=APP_CLIENT_ID,Issuer=https://cognito-idp.REGION.amazonaws.com/USER_POOL_ID
```

- **Issuer:** `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`
- **Audience:** app client ID (for access tokens, API Gateway falls back to `client_id` claim when `aud` is absent)
- Route-level `authorizationScopes` enforce OAuth scopes in the token

AWS recommends configuring scopes on routes so API Gateway treats tokens as **access tokens** rather than guessing token type.

---



## Obtain tokens



### M2M - client credentials grant

Requires a **dedicated app client** with client secret and client-credentials grant enabled. Define a resource server first, then request scopes like `my-api/read`.

```bash
# Option 1: client_secret_post (credentials in body)
curl -X POST "https://YOUR_DOMAIN.auth.REGION.amazoncognito.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=APP_CLIENT_ID" \
  -d "client_secret=APP_CLIENT_SECRET" \
  -d "scope=my-api/read%20my-api/write"

# Option 2: client_secret_basic (recommended)
curl -X POST "https://YOUR_DOMAIN.auth.REGION.amazoncognito.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "APP_CLIENT_ID:APP_CLIENT_SECRET" \
  -d "grant_type=client_credentials" \
  -d "scope=my-api/read"
```

Response (access token only - no ID or refresh token):

```json
{
  "access_token": "eyJra...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Use the access token as `Authorization: Bearer <access_token>` when the API method has matching **Authorization scopes**.

Reference: [Token endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html)

### Interactive users - authorization code + PKCE (recommended)

1. Redirect to `/oauth2/authorize?response_type=code&client_id=...&redirect_uri=...&scope=openid+my-api/read&code_challenge=...&code_challenge_method=S256`
2. Exchange `code` at `/oauth2/token` with `grant_type=authorization_code` and `code_verifier`.

Returns ID, access, and refresh tokens. Prefer [Amplify Auth](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-integrate-apps.html) or an OIDC library instead of hand-rolling PKCE.

### API-based sign-in - `USER_PASSWORD_AUTH` (InitiateAuth)

Use for testing, legacy apps, or server-side auth. The app client must allow `ALLOW_USER_PASSWORD_AUTH` (and typically `ALLOW_REFRESH_TOKEN_AUTH`).

This calls the **regional IdP API**, not the OAuth domain:

```bash
aws cognito-idp initiate-auth \
  --region REGION \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id APP_CLIENT_ID \
  --auth-parameters USERNAME=user@example.com,PASSWORD='YourPassword'
```

Equivalent raw request:

```http
POST https://cognito-idp.REGION.amazonaws.com/
Content-Type: application/x-amz-json-1.1
X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth

{
  "AuthFlow": "USER_PASSWORD_AUTH",
  "ClientId": "APP_CLIENT_ID",
  "AuthParameters": {
    "USERNAME": "user@example.com",
    "PASSWORD": "YourPassword"
  }
}
```

Response includes `AccessToken`, `IdToken`, `RefreshToken`, `ExpiresIn`, and `TokenType`.

**Note:** Tokens from `InitiateAuth` include the scope `aws.cognito.signin.user.admin` unless you use the OAuth `/oauth2/token` flow with custom resource-server scopes.

---



## Identity Pool - IAM roles and trust policies

Identity pools issue temporary credentials by assuming IAM roles. Each role needs:

1. A **trust policy** allowing `cognito-identity.amazonaws.com` with required conditions
2. A **permissions policy** granting AWS actions (for example `execute-api:Invoke`)



### Required trust policy conditions (2025+)

IAM **requires** `cognito-identity.amazonaws.com:aud` matching your identity pool ID. Wildcard `aud` values are rejected. AWS also recommends restricting `amr` to `authenticated` or `unauthenticated`.

#### Authenticated users

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "REGION:IDENTITY_POOL_ID"
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "authenticated"
        }
      }
    }
  ]
}
```



#### Guest (unauthenticated) users

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "REGION:IDENTITY_POOL_ID"
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "unauthenticated"
        }
      }
    }
  ]
}
```

**Security note:** Anyone who knows your identity pool ID can request guest credentials. Keep unauthenticated role permissions minimal.

Use the **enhanced authentication flow** (default) so Cognito - not the client app - selects the IAM role and applies scope-down policies.

Reference: [Identity pool security best practices](https://docs.aws.amazon.com/cognito/latest/developerguide/identity-pools-security-best-practices.html)

### Save trust policies locally

```bash
cat > cognito-authenticated-trust-policy.json <<'EOF'
{ ... paste authenticated trust policy ... }
EOF

cat > cognito-guest-trust-policy.json <<'EOF'
{ ... paste guest trust policy ... }
EOF
```

---



## Identity Pool - exchange ID token for AWS credentials

After User Pool sign-in, use the **ID token** to federate into the identity pool.

### Step 1 - Get identity ID

```bash
aws cognito-identity get-id \
  --identity-pool-id "REGION:IDENTITY_POOL_ID" \
  --logins "cognito-idp.REGION.amazonaws.com/USER_POOL_ID=$ID_TOKEN" \
  --region REGION
```



### Step 2 - Get temporary IAM credentials

```bash
aws cognito-identity get-credentials-for-identity \
  --identity-id "REGION:IDENTITY_ID" \
  --logins "cognito-idp.REGION.amazonaws.com/USER_POOL_ID=$ID_TOKEN" \
  --region REGION
```

Returns `Credentials.AccessKeyId`, `Credentials.SecretKey`, `Credentials.SessionToken`, and `Credentials.Expiration`.

### Step 3 - Call API Gateway with SigV4

Sign the request with:


| Field       | Value                                     |
| ----------- | ----------------------------------------- |
| Service     | `execute-api`                             |
| Region      | API region (for example `us-east-1`)      |
| Credentials | Temporary keys from step 2                |
| Host        | `API_ID.execute-api.REGION.amazonaws.com` |


Example URL:

```text
https://API_ID.execute-api.REGION.amazonaws.com/STAGE/resource-path
```

Use AWS SDK SigV4 signing (`@aws-sdk/signature-v4` in JavaScript, `botocore` in Python, etc.). Do not send the JWT in `Authorization` when using `AWS_IAM` - send a SigV4-signed request instead.

---



## IAM permissions for API invocation

Attach to the **authenticated** (or guest) identity pool role - not to end users directly.

### Allow invoke on a specific method

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:REGION:ACCOUNT_ID:API_ID/STAGE/*/data"
    }
  ]
}
```

Resource ARN format:

```text
arn:aws:execute-api:{region}:{account-id}:{api-id}/{stage}/{verb}/{resource-path}
```

- `*` for stage, verb, or path acts as a wildcard
- Method must have `AuthorizationType: AWS_IAM` or the policy has no effect (method stays public)

Reference: [IAM policies to invoke API](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-control-access-using-iam-policies-to-invoke-api.html)

---



## Resource servers and scopes

To use custom scopes (for example `blog/read`) in access tokens:

1. In the User Pool, create a **resource server** with identifier (for example `blog`) and scopes (`read`, `write`).
2. Enable those scopes on the app client.
3. Request scopes in OAuth flows: `scope=blog/read blog/write`
4. On the API Gateway method, set **Authorization scopes** to `blog/read` (full `identifier/scope` name).

Client credentials and authorization-code flows can both request resource-server scopes; `InitiateAuth` alone does not.

Reference: [Scopes, M2M, and resource servers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html)

---



## Backend integration example (DynamoDB via VTL)

When API Gateway integrates directly with DynamoDB (not Lambda proxy), map the request body in a **mapping template**:

```vtl
{
  "TableName": "$input.path('$.tableName')",
  "Item": {
    "userId": { "S": "$input.path('$.userId')" },
    "age": { "S": "$input.path('$.age')" }
  }
}
```

The caller still needs permission to invoke the API (via Cognito authorizer or IAM). DynamoDB access is granted to **API Gateway's execution role**, not the Cognito user directly.

---

## Enable Refresh Token Rotation

In the Amazon Cognito console , go to your Cognito User Pool.

Under `App clients`, select the `Managed Login` app client.

In the `App client` information section, click `Edit`.

Under `Authentication flows`, uncheck `ALLOW_REFRESH_TOKEN_AUTH` — rotation isn't compatible with this auth flow.

Under Advanced security configurations, check Enable refresh token rotation.

For Refresh token rotation grace period, enter 10 seconds. This brief grace period allows retries before the old token is revoked.

Reference: https://catalog.workshops.aws/workshops/137bc34c-33d9-43a8-bf8f-2d4f6c22c333/en-US/30-managed-login-authentication#step-7:-enable-refresh-token-rotation-(optional)

---

## References

- [Control access with Cognito user pools (REST API)](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html)
- [Call a REST API integrated with Cognito](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-invoke-api-integrated-with-cognito-user-pool.html)
- [HTTP API JWT authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
- [Cognito IAM roles and trust policies](https://docs.aws.amazon.com/cognito/latest/developerguide/role-trust-and-permissions.html)
- [OAuth 2.0 grants in Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints-oauth-grants.html)
- [Token endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html)
- [Resource servers and scopes](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html)

