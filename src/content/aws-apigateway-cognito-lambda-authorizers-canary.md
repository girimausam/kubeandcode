---
title: "API Gateway: Cognito and Lambda authorizers, binary uploads, canary, and cache"
description: "REST API with Cognito and Lambda authorizers, binary media types to S3, stage canary with cache, CORS on proxy routes, and forwarding all traffic to a load balancer."
tags:
  - aws
  - api-gateway
  - cognito
  - lambda
  - s3
  - cors
  - canary
  - alb
---

# API Gateway: Cognito and Lambda authorizers, binary uploads, canary, and cache

**Northwind Media API** is one REST API that has to do five different jobs:

- Callers with a Cognito access token upload images and PDFs.
- A Lambda authorizer protects `/admin/*` with rules Cognito groups cannot express (office IP plus a custom `x-client-id`).
- The upload Lambda stores the bytes in S3 and returns `201` with a `Location` header.
- `GET /files/{id}` returns the object with the right `Content-Type` and status.
- `ANY /legacy/{proxy+}` forwards everything else to an internal load balancer.
- Stage `prod` caches safe GETs, and a canary sends 10 percent of traffic to a new build without serving yesterday's cached body.

Cognito user pools in more depth: [API Gateway with Cognito](./aws-apigateway-cognito-auth.md).

---

## What this post assumes

Almost every feature below is a **REST API** feature. HTTP APIs are cheaper and have a CORS panel, JWT authorizers, and Lambda authorizers, but they do **not** have stage cache clusters, canary releases, or binary media type lists. If the task says canary or cache, create a **Regional REST API**.

| Need | REST API | HTTP API |
| --- | --- | --- |
| Cognito user pool authorizer | Yes | JWT authorizer against the same user pool |
| Lambda authorizer | TOKEN or REQUEST | Payload format 2.0, simpler response optional |
| Two authorizers on one API | Yes. One authorizer **per method** | Same rule |
| Binary media types | API setting plus `isBase64Encoded` | `isBase64Encoded` on payload 2.0, no media type list |
| Stage canary | Yes | No |
| Cache cluster | Yes, per stage | No |
| Proxy to a private ALB | VPC link to an **NLB** (NLB targets the ALB or the tasks) | VPC link **directly to an ALB** |
| CORS | You build OPTIONS, method responses, and gateway responses | CORS is a single configuration |

One method cannot run Cognito and a Lambda authorizer together. Define both on the API, then attach Cognito to `/files` and the Lambda authorizer to `/admin`.

---

## How a request moves

```text
Client
  -> Method request (headers, auth type, binary types)
  -> Authorizer (Cognito or Lambda). Result cached by identity source
  -> Integration (Lambda proxy, or HTTP proxy via VPC link)
  -> Method response mapping only if integration is NOT Lambda proxy
  -> Stage (canary percent, cache, throttling, logs, stage variables)
```

Lambda proxy integration (`AWS_PROXY`) skips mapping templates. The function return value **is** the HTTP response. If `statusCode` or the headers are missing, clients see `502` and a body that says "Internal server error" even when your function logged a clean `200`.

---

## Console implementation order

Do this in order. Later steps fail if the Lambda resource policy or the deployment is missing.

| Step | Console | Done when |
| --- | --- | --- |
| 1 | Lambda: create `northwind-admin-authorizer`, `northwind-upload`, `northwind-download` | Each has a successful test event |
| 2 | Lambda: execution role can write logs and, for upload/download, S3 and KMS | IAM role shows those policies |
| 3 | Lambda: resource-based policy allows `apigateway.amazonaws.com` | Statement visible under Permissions |
| 4 | Cognito: user pool app client with scopes `files/read` and `files/write` | You can copy an access token |
| 5 | S3: bucket, block public access, SSE-KMS | Upload from the Lambda test succeeds |
| 6 | API Gateway: Regional REST API, resources, methods, two authorizers | Test invoke returns 200 or 201, not 500 from a missing permission |
| 7 | API Gateway: binary media types, OPTIONS, gateway CORS headers | Browser preflight returns 200 |
| 8 | Deploy to stage `prod`, then enable cache and canary | Stage URL works outside the console |

The API Gateway **Test** button on a method calls the integration. It does not send a browser preflight. Test CORS from a browser or curl, not only from that button.

---

## Lambda permissions: execution role and resource-based policy

These are different controls. Both must be right.

| | Execution role | Resource-based policy |
| --- | --- | --- |
| Question it answers | What may this function do? | Who may invoke this function? |
| Attached to | The role in **Configuration -> Permissions -> Execution role** | The function itself, **Resource-based policy statements** |
| Typical statements | `logs:CreateLogGroup`, `s3:PutObject`, `kms:Decrypt` | `lambda:InvokeFunction` for `apigateway.amazonaws.com` |
| If it is missing | The function runs and then fails on S3 or CloudWatch | API Gateway returns **500** with `Execution failed due to configuration error: Invalid permissions on Lambda function` |

The authorizer function and the integration functions each need their own resource-based statement. A statement on `northwind-upload` does not allow API Gateway to call `northwind-admin-authorizer`.

### Execution role in the console

1. **Lambda** -> the function -> **Configuration** -> **Permissions**.
2. Open the role name. It opens IAM.
3. **Add permissions** -> **Create inline policy** -> JSON.

Upload and download functions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:us-east-1:ACCOUNT:log-group:/aws/lambda/northwind-*:*"
    },
    {
      "Sid": "MediaBucket",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::northwind-media/incoming/*"
    },
    {
      "Sid": "BucketKey",
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "arn:aws:kms:us-east-1:ACCOUNT:key/KEY_ID"
    }
  ]
}
```

The authorizer role only needs the logs statement. Do not put `s3:PutObject` on the authorizer.

### Resource-based policy in the console

1. **Lambda** -> function -> **Configuration** -> **Permissions**.
2. Scroll to **Resource-based policy statements** -> **Add permissions**.
3. Choose **AWS service**.
4. Fill the form. Repeat for each function.

| Field | Authorizer `northwind-admin-authorizer` | Integration `northwind-upload` |
| --- | --- | --- |
| Service | API Gateway | API Gateway |
| Statement ID | `apigw-authorizer-prod` | `apigw-post-files` |
| Principal | `apigateway.amazonaws.com` (the form sets this) | same |
| Source ARN | `arn:aws:execute-api:us-east-1:ACCOUNT:API_ID/authorizers/AUTHORIZER_ID` | `arn:aws:execute-api:us-east-1:ACCOUNT:API_ID/*/POST/files` |
| Action | `lambda:InvokeFunction` | `lambda:InvokeFunction` |

`API_ID` is the id in the API Gateway URL (`https://API_ID.execute-api...`), not the API name. `AUTHORIZER_ID` is on the authorizer page after you create it. If you add the permission before the authorizer exists, use a wildcard source ARN and tighten it after:

- Authorizer, any id on this API: `arn:aws:execute-api:us-east-1:ACCOUNT:API_ID/authorizers/*`
- Any method and stage for one path: `arn:aws:execute-api:us-east-1:ACCOUNT:API_ID/*/GET/files/*`
- Download path parameter: `arn:aws:execute-api:us-east-1:ACCOUNT:API_ID/*/GET/files/*`

The trailing `/*` on `/files/*` is required for `GET /files/{id}`. A source ARN that ends at `/files` does not match `/files/incoming/abc`.

Download function statement, same console form, statement id `apigw-get-files`, source ARN `arn:aws:execute-api:us-east-1:ACCOUNT:API_ID/*/GET/files/*`.

### Statement JSON you should see

After saving, **View policy** shows:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "apigw-post-files",
      "Effect": "Allow",
      "Principal": { "Service": "apigateway.amazonaws.com" },
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:us-east-1:ACCOUNT:function:northwind-upload",
      "Condition": {
        "ArnLike": {
          "AWS:SourceArn": "arn:aws:execute-api:us-east-1:ACCOUNT:API_ID/*/POST/files"
        }
      }
    }
  ]
}
```

`AWS:SourceArn` is the condition key Lambda stores. It is not `aws:SourceArn` in this policy. If you edit the JSON by hand in **Add permissions -> JSON**, keep that key.

A source ARN of `*` or no condition lets every API in the account invoke the function. Use that only for a short lab, then replace it.

### Let the API Gateway console add the statement

On the integration screen, when you select the Lambda function, the console asks **Add permission to Lambda function**. Choose **OK**. That calls `AddPermission` for you.

Check the statement afterward. The console often uses a wide source ARN (`.../*/*` or `.../authorizers/*`). For a graded build, edit it to the method ARN above. If you click **OK** twice you get two statements. Delete the duplicate. Statement IDs must be unique per function. `ResourceConflictException` means that id already exists.

The authorizer dialog has the same prompt when you attach the function. The integration prompt does not cover the authorizer, and the authorizer prompt does not cover `POST /files`.

### Alias and version

If the integration points at `northwind-upload:live`, the resource policy must be on that **alias**, or the statement `Resource` must include `:live`. A policy only on the unqualified function name does not allow `function:northwind-upload:live`. Console: Lambda -> **Aliases** -> `live` -> **Permissions** -> add the same API Gateway statement.

---

## Console: create the API and the two authorizers

1. **API Gateway** -> **Create API** -> **REST API** (not private, not HTTP) -> Regional -> name `northwind-media`.
2. **Authorizers** -> **Create authorizer**.

### Cognito authorizer

| Field | Value |
| --- | --- |
| Name | `northwind-users` |
| Type | Cognito |
| Cognito user pool | the app pool |
| Token source | `Authorization` |
| Token validation | blank unless you must match an `aud` claim. Access tokens use `client_id`, not `aud` |

Attach this authorizer on `POST /files` and `GET /files/{id}`. On each method, **Method Request** -> **Authorization** = `northwind-users`, **OAuth scopes** = `files/write` for upload and `files/read` for get.

Use the **access token**, not the ID token. Scopes exist on the access token. An ID token passes a Cognito authorizer that has no scopes and then fails as soon as you add a scope. The header is `Authorization: Bearer <access_token>` with a space after `Bearer`.

### Create the pool, the scopes, and an access token

Do this in the Cognito console before you test the method. The scope string API Gateway expects is `identifier/scopeName`. With identifier `files` and scope name `write`, the method scope is `files/write`.

**1. User pool**

1. **Cognito** -> **User pools** -> **Create user pool**.
2. Sign-in: **Email**.
3. Password policy: the default is fine for a lab. MFA: optional.
4. Self-registration: off if you will create the user yourself.
5. Pool name: `northwind-users`.

**2. Resource server (this is what creates `files/read` and `files/write`)**

1. Open the pool -> **Branding** is not the right menu. Go to **App integration** -> **Resource servers** (wording may be **Domain** nearby, resource servers are under app integration).
2. **Create resource server**.
3. Name: `Northwind files`. Identifier: `files`. The identifier is the prefix in the scope.
4. Scopes:

| Scope name | Description |
| --- | --- |
| `read` | `GET /files/{id}` |
| `write` | `POST /files` |

5. Save. Cognito now has scopes `files/read` and `files/write`.

**3. Domain, or the token endpoint does not exist**

1. Same pool -> **App integration** -> **Domain**.
2. **Cognito domain** -> prefix `northwind-media-ACCOUNT` (must be unique in the Region).
3. Save. The base URL is `https://northwind-media-ACCOUNT.auth.us-east-1.amazoncognito.com`.

**4. App client that is allowed to request those scopes**

1. **App integration** -> **App clients** -> **Create app client**.
2. Name: `northwind-media-web`.
3. Client secret: **generate a secret** if you will use the token endpoint with `client_secret` (the curl below). A public client with no secret is for the hosted UI with PKCE. Do not mix both styles in one test.
4. Auth flows: enable **Authorization code grant**. You do not need `USER_PASSWORD_AUTH` for the token that contains custom scopes.
5. Allowed callback URL: `http://localhost:8080/callback`. Allowed sign-out URL: `http://localhost:8080`.
6. OAuth scopes: `openid` plus custom scopes **`files/read`** and **`files/write`**. If the custom scopes are not listed, the resource server was not saved.
7. Save and copy **Client ID** and **Client secret**.

**5. A user who can sign in**

1. Pool -> **Users** -> **Create user**.
2. Email and username: `user@northwind.example`. Invitation or set a password.
3. If the user status is `FORCE_CHANGE_PASSWORD`, open the user -> **Actions** -> set a permanent password, or sign in once and change it. The token endpoint will not issue tokens for a user who still must change their password.

**6. Get the access token from the token endpoint**

`InitiateAuth` / `USER_PASSWORD_AUTH` returns an access token whose `scope` is `aws.cognito.signin.user.admin`. It does **not** include `files/read` or `files/write`. API Gateway then returns 401 as soon as the method lists those OAuth scopes. Use the OAuth token endpoint.

Browser (one time), logged in as that user. Open this URL and approve. After redirect, copy the `code` query parameter. It expires in minutes.

```text
https://northwind-media-ACCOUNT.auth.us-east-1.amazoncognito.com/oauth2/authorize?response_type=code&client_id=APP_CLIENT_ID&redirect_uri=http://localhost:8080/callback&scope=openid+files/read+files/write
```

Exchange the code:

```bash
curl -sS -X POST \
  "https://northwind-media-ACCOUNT.auth.us-east-1.amazoncognito.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "APP_CLIENT_ID:APP_CLIENT_SECRET" \
  -d "grant_type=authorization_code" \
  -d "code=AUTH_CODE" \
  -d "redirect_uri=http://localhost:8080/callback"
```

The JSON field you send to API Gateway is `access_token`, not `id_token`. Decode it at [jwt.io](https://jwt.io) or with `jq`. You should see:

```json
{
  "client_id": "APP_CLIENT_ID",
  "scope": "openid files/read files/write",
  "token_use": "access",
  "username": "user@northwind.example"
}
```

`token_use` must be `access`. `scope` must contain `files/write` before `POST /files` will pass. There is no `aud` claim. Leave API Gateway **Token validation** empty.

Header on every call:

```text
Authorization: Bearer eyJraWQiOiJ...
```

One space after `Bearer`. No quotes around the token.

**Machine token (no user):** create a second app client with **client credentials** only, a secret, and the same custom scopes. Then:

```bash
curl -sS -X POST \
  "https://northwind-media-ACCOUNT.auth.us-east-1.amazoncognito.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "M2M_CLIENT_ID:M2M_CLIENT_SECRET" \
  -d "grant_type=client_credentials" \
  -d "scope=files/read files/write"
```

Client credentials cannot be enabled on the same app client as authorization code. The access token has the scopes and no `username`.

Store the value:

```bash
export TOKEN='paste-access-token'
```

The upload curl later in this post uses `$TOKEN`.

### Lambda authorizer

| Field | Value |
| --- | --- |
| Name | `office-admin` |
| Type | Lambda |
| Lambda function | `northwind-admin-authorizer` |
| Lambda event payload | **Request** (you need headers and source IP, not only the token) |
| Identity sources | `method.request.header.Authorization`, `method.request.header.x-client-id` |
| Authorization caching | enabled, TTL **300** seconds |
| Invoke role | empty if the console adds `lambda:InvokeFunction` on the authorizer resource policy |

Identity sources are the cache key. If `x-client-id` is not an identity source, API Gateway reuses a cached Allow for a different client id. That is a real cross-tenant hole.

Attach `office-admin` only on `/admin` and `/admin/{proxy+}`.

### Console: resources and methods

1. API `northwind-media` -> **Resources**.
2. `/` -> **Create resource**. Resource path `files`. Create resource again under `files` with path `{id}` (parameter, not a literal).
3. Select `/files` -> **Create method** -> POST.
4. Method execution screen:
   - **Method request** -> Authorization `northwind-users`. Save. Open **Settings** on that method request if scopes are separate in your console revision, and set OAuth scopes to `files/write`.
   - **Integration request** -> Integration type **Lambda function** -> check **Use Lambda proxy integration** -> region `us-east-1` -> function `northwind-upload` -> Save -> **OK** on the permission prompt.
5. Select `/files/{id}` -> method GET -> same pattern with `northwind-download` and scope `files/read`.
6. Create resource `admin`, then child `{proxy+}`. On `/admin` and `/admin/{proxy+}` create method ANY. Authorization `office-admin`. Integration: Lambda proxy to the admin **business** function, not the authorizer function. The authorizer is only selected under Method request.
7. **Actions** -> **Deploy API** -> stage `prod` (New stage the first time). Copy the invoke URL.

Until you deploy, the stage URL returns `Missing Authentication Token` for unknown routes and does not show your latest method.

### Console: call it

**API Gateway test (no CORS):**

1. Resources -> POST on `/files` -> **Test**.
2. Header `Authorization` = `Bearer ACCESS_TOKEN`. Header `Content-Type` = `image/png`.
3. Body is text in the test pane. Binary tests from this pane are a poor fit. Use curl against the stage URL for the real PNG.

```bash
curl -sS -D - -o /tmp/out.json \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary @./sample.png \
  "https://API_ID.execute-api.us-east-1.amazonaws.com/prod/files"
```

`$TOKEN` is the `access_token` from the Cognito `/oauth2/token` exchange above, the one whose `scope` includes `files/write`. An `InitiateAuth` access token does not carry those scopes and this call returns 401.

Expect `HTTP/1.1 201` and a `Location` header. Then GET that path with `Accept: image/png` and the same token.

**Authorizer test:**

1. **Authorizers** -> `office-admin` -> **Test**.
2. Set `Authorization` and `x-client-id`. The test event does not always include `requestContext.identity.sourceIp`. A policy that requires source IP can Deny here and Allow from a real client, or the reverse. Check the execution log for the live `sourceIp`.

---

## How the Lambda authorizer works

API Gateway invokes the function **before** the integration. The function does not see the JSON body of a REQUEST authorizer in a useful parsed form. It sees the route, headers, query strings, and path parameters. It must return an IAM policy.

### Event (REQUEST type, REST)

```json
{
  "type": "REQUEST",
  "methodArn": "arn:aws:execute-api:us-east-1:123456789012:abc123/prod/GET/admin/reports",
  "headers": {
    "Authorization": "Bearer eyJ...",
    "x-client-id": "store-12"
  },
  "requestContext": {
    "identity": { "sourceIp": "203.0.113.10" }
  }
}
```

TOKEN type is smaller: `authorizationToken` and `methodArn` only. Use TOKEN when the only input is the bearer token. Use REQUEST when IP, a second header, or the path matters.

### Response the gateway accepts

```json
{
  "principalId": "user-42",
  "policyDocument": {
    "Version": "2012-10-17",
    "Statement": [{
      "Action": "execute-api:Invoke",
      "Effect": "Allow",
      "Resource": "arn:aws:execute-api:us-east-1:123456789012:abc123/prod/*/*"
    }]
  },
  "context": {
    "clientId": "store-12",
    "userId": "user-42"
  },
  "usageIdentifierKey": "optional-api-key-value"
}
```

Rules that fail closed or fail open by accident:

| Rule | Why |
| --- | --- |
| `Resource` must be a `methodArn` this API can invoke | A policy for `/dev/*` does not allow a call on stage `prod`. Cache then replays the Deny |
| Prefer `arn:...:apiId/stage/*/*` after you have checked the caller, or build the ARN from the incoming `methodArn` | A policy that only names the exact GET path forces a new authorizer call per path when caching is off, and a Deny cache when the cached resource does not match |
| `Effect: Deny` with the same resource | Gateway returns **403** |
| Throw, return nothing, or return malformed JSON | Gateway returns **401** Unauthorized |
| `context` values must be strings, numbers, or booleans | A nested object makes the authorizer fail with 500 and the client sees 401 or 500 |
| `context` is visible to the backend as `$context.authorizer.clientId` | Do not put secrets in `context`. It lands in logs if you print `$context` |

Caching: API Gateway caches the policy for the TTL, keyed by the identity sources. A Deny is cached too. During a lab, set TTL to **0** until the policy works, then set 300. Flush by changing the identity source or waiting. There is no "flush authorizer cache" button that is obvious. Redeploying the API does not always drop it.

Simple responses (`{ "isAuthorized": true }`) exist on **HTTP APIs** only. A REST API rejects that shape.

### Authorizer function

```python
import os

ALLOWED_IPS = set(os.environ.get("ALLOWED_IPS", "203.0.113.10").split(","))

def lambda_handler(event, context):
    method_arn = event["methodArn"]
    # arn:partition:execute-api:region:account:apiId/stage/VERB/resource
    api_arn_prefix = method_arn.split("/")[0]
    stage = method_arn.split("/")[1]
    resource = f"{api_arn_prefix}/{stage}/*/*"

    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    token = headers.get("authorization", "")
    client_id = headers.get("x-client-id", "")
    source_ip = event.get("requestContext", {}).get("identity", {}).get("sourceIp", "")

    if not token.startswith("Bearer ") or not client_id or source_ip not in ALLOWED_IPS:
        return _policy("anonymous", "Deny", resource, client_id)

    user_id = token[7:15] or "user"
    return _policy(user_id, "Allow", resource, client_id)

def _policy(principal, effect, resource, client_id):
    return {
        "principalId": principal,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [{
                "Action": "execute-api:Invoke",
                "Effect": effect,
                "Resource": resource,
            }],
        },
        "context": {"clientId": client_id, "userId": principal},
    }
```

Replace the token slice with a real JWT check (signature, `iss`, `exp`, `token_use`). The sample only shows the policy contract. Cognito's built-in authorizer already checks the token. Do not reimplement that on the public file routes.

Authorizer timeout is **10 seconds**. The integration timeout is **29 seconds**. An authorizer that calls a slow database will 401 the client.

---

## Binary media types and the upload Lambda

Console path:

1. API -> **API settings** (or **Settings** in the left nav) -> **Binary media types** -> **Manage media types** -> Add each type -> **Save changes**.
2. **Resources** -> **Deploy API** again. Binary settings are not on the method. They apply only after a new deployment.
3. Confirm the upload function's resource policy source ARN is `.../POST/files` and the execution role can `s3:PutObject`.

Add each type the client will send **or** accept:

- `image/png`
- `image/jpeg`
- `application/pdf`
- `multipart/form-data`
- `application/octet-stream`

If the request `Content-Type` matches this list, API Gateway base64-encodes the body and sets `isBase64Encoded: true` on the Lambda proxy event. If the type is not listed, the body is a UTF-8 string and a PNG is corrupted before your code runs.

Also list types you **return**. A `GET` that should yield `image/png` looks at the `Accept` header. When `Accept` matches a binary media type, you must return `isBase64Encoded: true` or the browser downloads a base64 text file.

`multipart/form-data` is a poor fit. API Gateway does not give you file parts. Either accept one binary body (`Content-Type: image/png`) or parse the multipart yourself from the decoded bytes. The first option is the one that works in a time limit.

### Method

`POST /files`

- Authorization: Cognito, scope `files/write`
- Integration: Lambda proxy, `northwind-upload`
- Do not turn on request validation that expects JSON.

```python
import base64
import os
import uuid
import boto3

s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET"]
ALLOWED = {"image/png", "image/jpeg", "application/pdf"}

def lambda_handler(event, context):
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    content_type = headers.get("content-type", "").split(";")[0].strip()
    if content_type not in ALLOWED:
        return _resp(415, {"message": "unsupported media type"})
    if not event.get("isBase64Encoded"):
        return _resp(400, {"message": "expected binary body"})

    raw = base64.b64decode(event["body"])
    if not raw or len(raw) > 6 * 1024 * 1024:
        return _resp(413, {"message": "empty or too large"})

    key = f"incoming/{uuid.uuid4()}"
    s3.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=raw,
        ContentType=content_type,
        ServerSideEncryption="aws:kms",
    )
    return {
        "statusCode": 201,
        "headers": {
            "Content-Type": "application/json",
            "Location": f"/files/{key}",
            "Access-Control-Allow-Origin": "https://app.northwind.example",
            "Access-Control-Expose-Headers": "Location",
        },
        "body": '{"status":"stored"}',
    }

def _resp(code, payload):
    import json
    return {
        "statusCode": code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "https://app.northwind.example",
        },
        "body": json.dumps(payload),
    }
```

REST API payload limit is **10 MB**. Leave headroom under that. S3 presigned URLs are the production alternative when files are larger: the API returns a URL (`200`), and the browser uploads straight to S3. That skips binary media types. Use it when the rubric allows it. The Lambda path above is what the task asks for when it says the Lambda accepts the bytes and writes S3.

Lambda role: `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::northwind-media/*`, plus `kms:GenerateDataKey` and `kms:Decrypt` if the bucket uses a customer key.

### Returning the file

`GET /files/{id}` Lambda proxy:

```python
def lambda_handler(event, context):
    key = event["pathParameters"]["id"]
    try:
        obj = s3.get_object(Bucket=BUCKET, Key=key)
    except s3.exceptions.NoSuchKey:
        return _resp(404, {"message": "not found"})
    data = obj["Body"].read()
    return {
        "statusCode": 200,
        "isBase64Encoded": True,
        "headers": {
            "Content-Type": obj["ContentType"],
            "Cache-Control": "private, max-age=60",
            "Access-Control-Allow-Origin": "https://app.northwind.example",
        },
        "body": base64.b64encode(data).decode("ascii"),
    }
```

Call it with `Accept: image/png` (or `*/*`). If `Accept` does not match a configured binary media type, API Gateway treats the response as text.

---

## Status codes and headers the gateway requires

For **Lambda proxy**:

| Field | Required | Notes |
| --- | --- | --- |
| `statusCode` | Yes | Number. `200`, `201`, `204`, `400`, `401`, `403`, `404`, `415`, `500` |
| `headers` | Yes if the client or CORS needs them | Header names are passed through. `Set-Cookie` needs `multiValueHeaders` if you send more than one |
| `body` | Omit or `""` for 204 | String. Binary is base64 text in this field |
| `isBase64Encoded` | Yes for binary responses | `true` only when `body` is base64 |

`204` must not include a body. API Gateway can turn a 204 with a body into a 502.

Non-proxy integrations (AWS service, HTTP proxy with mapping) need a **Method Response** for every status you return (`200`, `201`, `4xx`) and an **Integration Response** that maps the backend status onto it. A status you did not declare becomes `500` with the default gateway body. Lambda proxy does not use those mappings. Declare them anyway if you also enable CORS in the console, because the CORS wizard adds method responses for OPTIONS and for the selected methods.

Headers the browser or a grader will look for:

| Header | When |
| --- | --- |
| `Content-Type` | Every response with a body |
| `Location` | `201` after create. Also list it under **Access-Control-Expose-Headers** |
| `Cache-Control` | `private` if the body depends on the user. `public` only for shared files |
| `Access-Control-Allow-Origin` | Every response a browser reads, including 4xx from Lambda |
| `Access-Control-Allow-Credentials` | Only if you use cookies. Then origin cannot be `*` |
| `Vary: Origin` | If you reflect the request origin dynamically |

Gateway-generated errors (authorizer Deny, throttling, expired token) **do not** pass through Lambda. Console: API -> **Gateway responses** -> select the response -> **Edit** -> **Add response header**. Add CORS headers on:

- `DEFAULT_4XX`
- `DEFAULT_5XX`
- `UNAUTHORIZED` (401)
- `ACCESS_DENIED` (403)
- `INTEGRATION_TIMEOUT`
- `INTEGRATION_FAILURE`

Response header on each: `Access-Control-Allow-Origin` = `'https://app.northwind.example'` (quotes are required in the gateway response header value).

Without this, the browser reports a CORS error and hides the real 401.

---

## CORS and proxy routes

A proxy route is a greedy path:

- Resource `/{proxy+}`
- Method **ANY**
- Lambda proxy or HTTP proxy

`{proxy+}` captures `a`, `a/b`, and `a/b/c`. A bare `{proxy}` captures one segment only. The integration path mapping is `{proxy}` (method.request.path.proxy).

### Why OPTIONS breaks

Browsers send `OPTIONS` with no `Authorization` header before `POST` and before any non-simple GET. If `ANY /{proxy+}` requires Cognito, the preflight is 401 and the real call never happens.

Fix:

1. Create method **OPTIONS** on `/{proxy+}` and on `/files` with authorization **NONE**.
2. Integration type **Mock**, mapping template `{"statusCode": 200}`.
3. Integration response headers:

| Header | Value |
| --- | --- |
| `Access-Control-Allow-Origin` | `'https://app.northwind.example'` |
| `Access-Control-Allow-Headers` | `'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,x-client-id'` |
| `Access-Control-Allow-Methods` | `'GET,POST,PUT,PATCH,DELETE,OPTIONS'` |
| `Access-Control-Max-Age` | `'600'` |

4. The actual `GET` and `POST` responses from Lambda must repeat `Access-Control-Allow-Origin`. OPTIONS headers are not copied onto POST.

Do not put the Lambda authorizer on OPTIONS.

`ANY` does not reliably include OPTIONS on every console version. Create OPTIONS as its own method so you can see it.

### Reflecting origins

If several frontends call the API, echo the request `Origin` only when it is in an allow-list. Never reflect `*` with credentials. Set `Vary: Origin` so the stage cache does not store one origin and serve it to another.

---

## Route all remaining traffic to a load balancer

Use this for the old Northwind app while new routes stay on Lambda.

```text
ANY /legacy/{proxy+}
  authorization: Cognito or NONE, your choice
  integration: HTTP proxy
  connection: VPC link
  endpoint URL: http://<nlb-dns>/{proxy}
```

REST API private integrations terminate on a **Network Load Balancer**. The NLB target group can point at an internal ALB (ALB as an IP target) or at the tasks. HTTP APIs can target an ALB with a VPC link directly. Do not point a REST API VPC link at an ALB DNS name and expect it to work.

Console:

1. **VPC Links** -> create -> VPC link for REST -> pick the NLB.
2. Resource `/legacy/{proxy+}`, method ANY.
3. Integration type **HTTP proxy** (not Lambda). Check **Use proxy integration** so status and headers from the app pass through.
4. Endpoint URL `http://nlb-internal-dns/{proxy}`.
5. Connection type **VPC link**, select the link.
6. Method request path `{proxy}` mapped from `method.request.path.proxy`.

Stage variable form, useful for canary against a second NLB:

`http://${stageVariables.legacyHost}/{proxy}`

Prod stage variable `legacyHost` = current NLB DNS. Canary override = new NLB DNS.

The load balancer security group must allow the VPC link ENIs. Those ENIs appear in your account. A target group health check path of `/health` on the ALB still matters. API Gateway returns **503** when the NLB has no healthy targets.

Timeouts: the integration still dies at **29 seconds**. Long downloads do not belong on this proxy. Increase the ALB idle timeout above 29 only if you also accept that API Gateway will cut the call first. For long work, return `202` and poll.

Pass the authorizer context downstream with an integration HTTP header:

`x-user-id` = `context.authorizer.userId` or `context.authorizer.claims.sub` for Cognito.

The backend must not trust `x-user-id` from the public internet. Strip incoming `x-user-id` at the method request (**HTTP request headers** -> required / cache) or ignore any client-supplied value and only read the header API Gateway injects. A client who sends their own `x-user-id` can confuse a naive app if you map the wrong source.

---

## Stages

A deployment is an immutable snapshot. A stage is a pointer to a deployment plus settings.

Console: **Deploy API** -> new stage `prod`.

Set on the stage, not only on the method:

| Setting | Prod value |
| --- | --- |
| Throttling | account default is shared. Set stage rate and burst so one API cannot consume the account |
| CloudWatch logs | Execution logs at ERROR. INFO logs full payloads, including tokens |
| Access logging | JSON format with `$context.requestId`, `$context.status`, `$context.authorizerError`, `$context.integrationStatus`, `$context.integrationLatency` |
| X-Ray | on |
| Cache cluster | on, size **0.5 GB** for a lab |
| Stage variables | `legacyHost`, `bucket` if you pass them into mappings |

Client URL: `https://{restapi-id}.execute-api.{region}.amazonaws.com/prod/files`.

Custom domain: ACM certificate in the same Region for Regional APIs, base path mapping to `prod`.

---

## Canary with cache, with an example

Canary lives on the **stage**, not on Lambda aliases (that is CodeDeploy). Here `prod` points at deployment `d1`. You publish deployment `d2` (new upload Lambda). You send **10 percent** of requests to `d2`.

Console: stage `prod` -> **Canary** -> create.

| Field | Value |
| --- | --- |
| Percent | `10` |
| Deployment | `d2` |
| Stage variable overrides | `legacyHost=nlb-v2.internal` if the new build must hit the new balancer. Leave empty if only Lambda changed |
| Use stage cache | **false** for the canary |

### Why "use stage cache" matters

The stage cache key does not include the deployment id. A `GET /files/catalog.json` cached from `d1` can be returned to a request that was selected for the `d2` canary. You will think the new code is live. It is not. The cache is.

Example:

1. `d1` returns catalog body `version=1`. Cache TTL 300 seconds. Cache key is the path.
2. You enable a 10 percent canary to `d2`, which returns `version=2`.
3. With **use stage cache = true**, most canary calls still receive `version=1` until TTL expiry.
4. With **use stage cache = false**, canary calls skip that cluster and hit `d2`. The other 90 percent still use the cache.

Personalized responses must not share a cache entry. On `GET /files/{id}` -> **Method settings** (stage, not the method editor) -> caching:

- Override stage cache for this method if needed.
- Cache TTL **60** seconds for public images, **0** (caching off) for admin JSON.
- Cache key: include path parameter `id`. Include header `Accept` because PNG and PDF are different bodies for the same URL.
- Do **not** cache `POST /files`.
- Turn on **Require authorization** so a cached `200` is not returned before the authorizer runs. If this is off, a cached success can be served to a caller who would have been denied.

Flush the stage cache after a bad deploy: stage -> **Flush entire cache**. Canary promotion: set percent to 100, or update the stage to deployment `d2` and delete the canary. Then flush the cache so everyone leaves `version=1`.

Metrics: `CacheHitCount`, `CacheMissCount`, and `4XXError` / `5XXError` with dimension `Canary=true` versus the main stage. Roll back by deleting the canary. Traffic returns to `d1` immediately. Cached `d2` bodies can still be served if they were stored in the stage cache. Flush.

---

## What else gets marked down

| Topic | What to set |
| --- | --- |
| WAF | Associate a regional web ACL with the stage. Rate-based rule on the upload path |
| Resource policy | Deny `execute-api:Invoke` unless `aws:SourceVpce` or a known CIDR, if the API is internal |
| Usage plan | Throttle `POST /files` harder than `GET`. API key is not a secret. Do not use it instead of Cognito |
| Payload model | Skip it for binary methods. A JSON model on `POST /files` rejects the PNG |
| CORS on 401 | Gateway responses, not only the Lambda |
| Authorizer cache | Identity sources include every header the policy depends on |
| KMS | Bucket encryption. Lambda role needs the key. Presigned URL uploads need `kms:Decrypt` on the **caller** if they upload with the SDK |
| Logs | Do not log `Authorization`. Access logs should use `$context.authorizer.principalId`, not the raw header |
| Private API | Different from VPC link. Private API is `execute-api` interface endpoint. VPC link is the integration leaving the gateway toward your NLB |

---

## Mistakes

| Mistake | What you see |
| --- | --- |
| HTTP API when you needed canary or cache | The settings are not in the console |
| Cognito authorizer plus scopes, client sends the ID token | `401` unauthorized, authorizer error "invalid token" |
| Two authorizers stacked on one method | Console lets you pick one. The other never runs |
| Binary type missing | File in S3 is base64 text or mojibake |
| `isBase64Encoded` false on the GET response | Browser shows base64 |
| OPTIONS uses the Cognito authorizer | Browser CORS error, no POST |
| `DEFAULT_4XX` has no CORS header | Browser CORS error on 401, token problem hidden |
| Canary uses the stage cache | New deployment looks identical |
| Cached GET without `Authorization` in the key, auth not required | One user's file bytes served to another |
| REST VPC link pointed at an ALB | Integration failure, 500 |
| Policy resource stuck on `dev` | 403 only on `prod` |
| Authorizer TTL 300 while you edit the policy | You test a Deny and still get Allow |

---

## Troubleshooting order

1. API Gateway execution log for the request id. Read `authorizerError`, `integrationStatus`, and `status`.
2. Lambda logs for the authorizer and the upload function. If the authorizer log is empty, the gateway never invoked it (cached result, or wrong method auth).
3. CloudWatch metric `CacheHitCount` during the canary test.
4. S3 object size and `Content-Type` metadata after upload.
5. NLB healthy host count if `/legacy` returns 503.

Docs: [Lambda authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html) · [Binary media types](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-payload-encodings.html) · [Canary release](https://docs.aws.amazon.com/apigateway/latest/developerguide/canary-release.html) · [API caching](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html) · [Private integrations](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-private-integration.html)

[<- Cognito authorizer detail](./aws-apigateway-cognito-auth.md)
