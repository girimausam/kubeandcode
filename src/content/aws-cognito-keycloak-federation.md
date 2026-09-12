---
title: "Amazon Cognito and Keycloak Federation"
description: "Keycloak on EKS with RDS PostgreSQL, Cognito OIDC federation, and how app pods validate Cognito JWTs."
tags:
  - keycloak
  - eks
  - cognito
  - auth
  - oidc
  - rds
links:
  - title: AWS workshop — third-party IdP authentication
    url: https://catalog.workshops.aws/workshops/137bc34c-33d9-43a8-bf8f-2d4f6c22c333/en-US/60-third-party-idp-authentication
  - title: Cognito — OIDC identity providers
    url: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-idp.html
  - title: Keycloak — Configuring the database
    url: https://www.keycloak.org/server/db
  - title: Keycloak — Securing applications and services
    url: https://www.keycloak.org/docs/latest/securing_apps/
  - title: Amazon RDS for PostgreSQL
    url: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html
---

## Overview

**Goal:** Employees sign in with **Keycloak** (your IdP). Your product still issues **Cognito** JWTs so API Gateway, ALB, and pods validate one issuer.

```text
 Browser / SPA          Amazon Cognito              Keycloak on EKS              RDS
      │                        │                         │                      │
      │  /oauth2/authorize     │                         │                      │
      ├───────────────────────►│                         │                      │
      │                        │  redirect (OIDC)        │                      │
      │                        ├────────────────────────►│ ALB → pods           │
      │                        │                         ├─────────────────────►│ PostgreSQL
      │                        │  auth code back         │   realms, users,     │ (private)
      │                        │◄────────────────────────┤   sessions           │
      │  Cognito JWT           │                         │                      │
      │◄───────────────────────┤                         │                      │
      ▼                        │                         │                      │
  App pods (same/other EKS) ◄── Bearer Cognito access token (not Keycloak token)
```

| Piece | Role |
| --- | --- |
| **Keycloak (EKS)** | Corporate IdP UI + OIDC endpoints behind **ALB + HTTPS** |
| **Amazon RDS (PostgreSQL)** | Durable store for Keycloak data (users, realms, clients) — **only Keycloak talks to RDS** |
| **Cognito User Pool** | OAuth/OIDC front door for *your* app; federates to Keycloak |
| **App client** | OAuth client registered in Cognito (callback URLs, secrets) |
| **Hosted UI** | Cognito login page with “Sign in with Keycloak” button |
| **EKS app workload** | Validates **Cognito** JWT (JWKS). Does **not** query RDS for login |

**Pods:** Human login goes Browser → Cognito → Keycloak. Pods trust **Cognito JWKS** only. For machine identity (no human), use a **separate** Cognito app client (client credentials) or **IRSA** for AWS APIs — Keycloak federation is for people, not kube ServiceAccounts.

---

## Keycloak words (30-second map)

Think of Keycloak like a mini “company login server.”

| Term | Plain meaning | Tiny example |
| --- | --- | --- |
| **Realm** | Isolated tenant (users, clients, themes). | `corp` = one company; `demo` = lab sandbox |
| **Client** | An application allowed to use OAuth/OIDC. | `cognito-federation` = Cognito is the OAuth client |
| **Client authentication** | Client has a **secret** (confidential client). | Cognito needs `client_secret` at token endpoint |
| **Redirect URI** | Where Keycloak sends the browser after login. | `https://YOUR_DOMAIN.auth.REGION.amazoncognito.com/oauth2/idpresponse` |
| **Standard flow** | Authorization code flow (browser login). | Always **on** for Cognito federation |
| **Scopes** | What user info Keycloak may release. | `openid email profile` |
| **User** | Account that can sign in. | `alice` / password in dev only |
| **Issuer** | Base URL of the realm for OIDC discovery. | `https://keycloak.example.com/realms/corp` |
| **OpenID Endpoint Configuration** | `.well-known/openid-configuration` JSON. | Cognito reads this when you set **Issuer URL** |

**Cognito words that pair with the above:**

| Cognito term | Pairs with Keycloak |
| --- | --- |
| **User pool** | Your app’s user directory + token issuer |
| **Identity provider (OIDC)** | Registers Keycloak issuer + client id/secret |
| **Attribute mapping** | Copy `email`, `sub`, etc. from Keycloak token into Cognito profile |
| **Hosted UI domain** | `https://<prefix>.auth.<region>.amazoncognito.com` |
| **Federated username** | Often `<ProviderName>_<sub>` (e.g. `Keycloak_a1b2c3…`) |

---

## Part 1 — Keycloak on EKS + Amazon RDS

**Order:** RDS PostgreSQL (private) → store DB password in Secrets Manager → deploy Keycloak on **same VPC** as EKS → **ALB Ingress** + ACM → public hostname → Cognito OIDC issuer URL.

Cognito must reach Keycloak over **HTTPS** on the internet (or at least a URL AWS can call). App pods in EKS **never** connect to RDS for auth; only Keycloak pods use JDBC to RDS.

```text
Internet ──► ALB (ACM cert) ──► Keycloak Deployment (namespace keycloak)
                                      │
                                      └── JDBC :5432 ──► RDS PostgreSQL (private subnets)
```

| RDS choice | Notes |
| --- | --- |
| **Engine** | PostgreSQL 15+ (Keycloak [supports](https://www.keycloak.org/server/db) PostgreSQL, MariaDB, MySQL) |
| **Access** | **Not** publicly accessible; same VPC as EKS worker nodes |
| **HA** | Multi-AZ for production; single-AZ OK for lab |
| **Name / user** | DB `keycloak`, user `keycloak` (match Helm / `KC_DB_*` below) |

---

### Step 1 — Create RDS PostgreSQL (console)

1. **RDS** → **Create database** → **Standard create** → **PostgreSQL**.
2. **Templates:** Dev/Test for lab, Production for real use.
3. **Settings:** DB identifier `keycloak-db`, master username `keycloakadmin` (or use default `postgres` and create app user later).
4. **Credentials:** Secrets Manager or self-managed strong password.
5. **Instance:** `db.t4g.small` or larger if many users.
6. **Storage:** gp3, enable storage autoscaling if you expect growth.
7. **Connectivity**
   - VPC = **EKS cluster VPC**
   - **No** public access
   - DB subnet group = private subnets
   - Create or pick security group `rds-keycloak-sg`
8. **Additional configuration**
   - Initial database name: `keycloak`
9. Create database. Note **Endpoint** hostname.

**Security group rules**

| Direction | Rule |
| --- | --- |
| RDS `rds-keycloak-sg` inbound | TCP **5432** from **EKS node security group** (or cluster security group / pod ENI SG if you use custom networking) |
| RDS outbound | Default (or restrict to Keycloak SG only) |

<details>
<summary>AWS CLI — RDS PostgreSQL instance (minimal lab)</summary>

```bash
export AWS_REGION=us-east-1
export VPC_ID=vpc-xxxxxxxx
export EKS_NODE_SG=sg-xxxxxxxx   # SG attached to worker nodes

RDS_SG=$(aws ec2 create-security-group \
  --group-name rds-keycloak-sg \
  --description "Keycloak RDS" \
  --vpc-id "$VPC_ID" \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress \
  --group-id "$RDS_SG" \
  --protocol tcp --port 5432 --source-group "$EKS_NODE_SG"

aws rds create-db-instance \
  --db-instance-identifier keycloak-db \
  --engine postgres \
  --engine-version 16.4 \
  --db-instance-class db.t4g.small \
  --allocated-storage 20 \
  --master-username keycloak \
  --master-user-password 'Generate-Strong-Password-Here' \
  --db-name keycloak \
  --vpc-security-group-ids "$RDS_SG" \
  --no-publicly-accessible \
  --backup-retention-period 7

aws rds describe-db-instances \
  --db-instance-identifier keycloak-db \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

</details>

<details>
<summary>SQL — optional separate app user (if master user is postgres)</summary>

Connect from a bastion or `kubectl run` psql pod in the VPC:

```sql
CREATE USER keycloak WITH PASSWORD 'app-user-password';
CREATE DATABASE keycloak OWNER keycloak;
GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;
```

Keycloak creates its own tables on first start (`start` / `start-optimized`).

</details>

---

### Step 2 — Store DB password for Kubernetes

**Console:** **Secrets Manager** → **Store a new secret** → **Credentials for Amazon RDS database** → select `keycloak-db` → secret name `keycloak/rds`.

**In cluster:** sync with [External Secrets Operator](https://external-secrets.io/) or create a Secret manually before Helm install.

<details>
<summary>kubectl — DB secret (manual)</summary>

```bash
kubectl create namespace keycloak

kubectl create secret generic keycloak-db \
  --namespace keycloak \
  --from-literal=password='Generate-Strong-Password-Here'
```

</details>

---

### Step 3 — Deploy Keycloak on EKS (Helm + ALB)

Prerequisites: [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/) on the cluster, **public** subnets tagged for ALB, **ACM certificate** for `auth.example.com`.

1. `kubectl create namespace keycloak` (if not done).
2. Install chart with **embedded PostgreSQL disabled** and **externalDatabase** pointing at RDS.
3. Set public hostname so OIDC issuer is stable (Cognito caches discovery from this URL).
4. Wait for Ingress → ALB → target healthy → `https://auth.example.com` loads admin console.

<details>
<summary>Helm — Bitnami Keycloak + external RDS + ALB Ingress</summary>

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

export RDS_HOST=keycloak-db.xxxxxxxxxxxx.us-east-1.rds.amazonaws.com
export ACM_CERT_ARN=arn:aws:acm:us-east-1:ACCOUNT:certificate/xxxxxxxx

helm upgrade --install keycloak bitnami/keycloak \
  --namespace keycloak \
  --set auth.adminUser=admin \
  --set auth.adminPassword='ChangeMe-Admin-123' \
  --set production=true \
  --set proxy=edge \
  --set postgresql.enabled=false \
  --set externalDatabase.host="$RDS_HOST" \
  --set externalDatabase.port=5432 \
  --set externalDatabase.user=keycloak \
  --set externalDatabase.database=keycloak \
  --set externalDatabase.existingSecret=keycloak-db \
  --set externalDatabase.existingSecretPasswordKey=password \
  --set ingress.enabled=true \
  --set ingress.ingressClassName=alb \
  --set ingress.hostname=auth.example.com \
  --set ingress.annotations."alb\.ingress\.kubernetes\.io/scheme"=internet-facing \
  --set ingress.annotations."alb\.ingress\.kubernetes\.io/target-type"=ip \
  --set ingress.annotations."alb\.ingress\.kubernetes\.io/certificate-arn"="$ACM_CERT_ARN" \
  --set ingress.annotations."alb\.ingress\.kubernetes\.io/listen-ports"='[{"HTTPS":443}]'
```

Route 53 (or your DNS): **CNAME** `auth.example.com` → ALB DNS name from `kubectl get ingress -n keycloak`.

</details>

<details>
<summary>Manifest — official Keycloak image + env (RDS + hostname)</summary>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: keycloak
  namespace: keycloak
spec:
  replicas: 2
  selector:
    matchLabels:
      app: keycloak
  template:
    metadata:
      labels:
        app: keycloak
    spec:
      containers:
        - name: keycloak
          image: quay.io/keycloak/keycloak:26.0
          args: ["start"]
          env:
            - name: KC_DB
              value: postgres
            - name: KC_DB_URL_HOST
              value: keycloak-db.xxxxx.us-east-1.rds.amazonaws.com
            - name: KC_DB_URL_DATABASE
              value: keycloak
            - name: KC_DB_USERNAME
              value: keycloak
            - name: KC_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: keycloak-db
                  key: password
            - name: KC_HOSTNAME
              value: https://auth.example.com
            - name: KC_PROXY_HEADERS
              value: xforwarded
            - name: KC_HTTP_ENABLED
              value: "true"
            - name: KC_BOOTSTRAP_ADMIN_USERNAME
              value: admin
            - name: KC_BOOTSTRAP_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: keycloak-admin
                  key: password
          ports:
            - containerPort: 8080
```

Pair with Service + ALB Ingress (same annotations as Helm example). Run **at least two replicas** in production; sessions and realm data live in RDS so pods are disposable.

</details>

---

### Step 4 — Keycloak admin UI (realm bootstrap)

1. Open `https://auth.example.com/admin`.
2. Login with bootstrap admin user.
3. Realm dropdown → **Create realm** → name `corp` → **Create** (stay out of `master` for app config).
4. **Realm settings** → **OpenID Endpoint Configuration** → confirm issuer:

```text
https://auth.example.com/realms/corp
```

Use that exact value later in Cognito **Issuer URL** (Part 4).

<details>
<summary>Local Docker only — UI practice without EKS (not for Cognito federation)</summary>

```bash
docker run -d --name keycloak -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD='ChangeMe-Admin-123' \
  quay.io/keycloak/keycloak:26.0 start-dev
```

`start-dev` = in-memory DB, HTTP. Use only to learn Keycloak screens. **Cognito integration needs EKS (or EC2) + HTTPS issuer**, not laptop localhost.

</details>

---

## Part 2 — Keycloak setup for Cognito

Do these **inside realm `corp`**, before touching AWS.

### Step A — Create OIDC client for Cognito

1. **Clients** → **Create client**.
2. **General settings**
   - Client type: **OpenID Connect**
   - Client ID: `cognito-federation`
3. **Capability config**
   - Client authentication: **On** (confidential client)
   - Authorization: **Off** (unless you use Keycloak authorization services)
   - Authentication flow: enable **Standard flow** only
4. **Login settings** (you will fill redirect after Cognito domain exists)
   - Valid redirect URIs: placeholder `https://example.com/oauth2/idpresponse` for now
   - Web origins: `+` (allow redirect origin) or your Cognito domain origin
5. **Save** → open client → **Credentials** tab → copy **Client secret** (needed in Cognito).

### Step B — Test user

1. **Users** → **Create new user**
   - Username: `alice`
   - Email: `alice@example.com` (optional but helps mapping)
   - Email verified: **On**
2. **Credentials** tab → **Set password** → temporary **Off** → password e.g. `Alice-Dev-123`.

### Step C — Issuer URL (write this down)

**Realm settings** → **OpenID Endpoint Configuration** → note **issuer** (no trailing slash):

```text
https://auth.example.com/realms/corp
```

Must match what browsers and Cognito fetch from `/.well-known/openid-configuration` on your **ALB hostname** (Part 1).

<details>
<summary>Keycloak Admin CLI (kcadm) — create client + user</summary>

```bash
# Inside Keycloak container or with kcadm on PATH
/opt/keycloak/bin/kcadm.sh config credentials \
  --server https://auth.example.com \
  --realm master \
  --user admin \
  --password 'ChangeMe-Admin-123'

/opt/keycloak/bin/kcadm.sh create realms -s realm=corp -s enabled=true

/opt/keycloak/bin/kcadm.sh create clients -r corp \
  -s clientId=cognito-federation \
  -s protocol=openid-connect \
  -s publicClient=false \
  -s standardFlowEnabled=true \
  -s 'redirectUris=["https://YOUR_PREFIX.auth.us-east-1.amazoncognito.com/oauth2/idpresponse"]' \
  -s 'webOrigins=["+"]'

# Client secret (replace INTERNAL_ID from clients list)
/opt/keycloak/bin/kcadm.sh get clients -r corp -q clientId=cognito-federation --fields id,secret
```

</details>

---

## Part 3 — Cognito User Pool + Hosted UI

Region example: `us-east-1`. Replace `ACCOUNT`, `REGION`, and names.

### Step 1 — User pool

1. **Amazon Cognito** → **User pools** → **Create user pool**.
2. **Sign-in experience**
   - Cognito user pool sign-in: **Email** or **Username** (pick one; federation still works).
   - Federated sign-in: leave defaults.
3. **Security** — MFA off for lab.
4. **Sign-up** — disable self-registration if this pool is employees-only.
5. **Required attributes** — enable **email** if you map email from Keycloak.
6. Name pool e.g. `corp-federated` → create.

### Step 2 — Domain (Hosted UI)

1. Pool → **App integration** → **Domain**.
2. **Cognito domain** → prefix e.g. `corp-kc-demo` (must be unique).
3. Note full domain:

```text
https://corp-kc-demo.auth.us-east-1.amazoncognito.com
```

### Step 3 — App client (your SPA or test app)

1. **App integration** → **App clients** → **Create app client**.
2. Name: `web-spa`.
3. **Confidential client** if you have a backend that holds a secret; **Public client** for pure SPA + PKCE.
4. **Allowed callback URLs:** `https://jwt.io` (quick test) or `https://app.example.com/callback`.
5. **Allowed sign-out URLs:** same origin as app.
6. **OAuth 2.0 grant types:** Authorization code grant.
7. **OpenID Connect scopes:** `openid`, `email`, `profile` (and custom resource scopes later if needed).
8. Save **Client ID** (and secret if confidential).

### Step 4 — Hosted UI identity provider list

1. **App integration** → **App client** → **Edit hosted UI**.
2. **Identity providers:** enable **Cognito user pool** (optional) and your Keycloak provider (next section).
3. **OAuth 2.0 grant types** and scopes aligned with step 3.

<details>
<summary>AWS CLI — user pool, domain, app client</summary>

```bash
export AWS_REGION=us-east-1

POOL_ID=$(aws cognito-idp create-user-pool \
  --pool-name corp-federated \
  --policies 'PasswordPolicy={MinimumLength=8,RequireUppercase=false,RequireLowercase=false,RequireNumbers=false,RequireSymbols=false}' \
  --auto-verified-attributes email \
  --query 'UserPool.Id' --output text)

aws cognito-idp create-user-pool-domain \
  --domain corp-kc-demo-$(aws sts get-caller-identity --query Account --output text | tail -c 7) \
  --user-pool-id "$POOL_ID"

CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id "$POOL_ID" \
  --client-name web-spa \
  --generate-secret \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --callback-urls 'https://jwt.io' \
  --logout-urls 'https://jwt.io' \
  --supported-identity-providers COGNITO \
  --query 'UserPoolClient.ClientId' --output text)

echo "POOL_ID=$POOL_ID CLIENT_ID=$CLIENT_ID"
```

</details>

---

## Part 4 — Wire Keycloak as Cognito OIDC IdP

### Console

1. User pool → **Sign-in experience** → **Federated identity provider sign-in** → **Add identity provider** → **OpenID Connect (OIDC)**.
2. **Provider name:** `Keycloak` (appears on Hosted UI; used as `identity_provider=Keycloak`).
3. **Client ID:** `cognito-federation` (from Keycloak).
4. **Client secret:** from Keycloak client **Credentials**.
5. **Authorized scopes:** `openid email profile`.
6. **Issuer URL:** `https://auth.example.com/realms/corp` (Keycloak on EKS, Part 1).
   - Cognito fetches `/.well-known/openid-configuration` from this issuer.
7. **Attributes request method:** `GET` (Keycloak default). If token/userinfo fails, try `POST`.
8. **Attribute mapping** (minimum):

| User pool attribute | OpenID Connect attribute |
| --- | --- |
| email | email |
| username | sub |
| name | name |

9. **Save**.

### Fix Keycloak redirect URI (critical)

Back in Keycloak client **Valid redirect URIs**, set **exactly**:

```text
https://<your-cognito-domain-prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse
```

Example:

```text
https://corp-kc-demo.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
```

No trailing slash. Multiple pools → one URI per pool domain.

<details>
<summary>AWS CLI — create OIDC IdP + enable on app client</summary>

```bash
export POOL_ID=us-east-1_XXXXXXXXX
export CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
export KC_ISSUER='https://keycloak.example.com/realms/corp'
export KC_CLIENT_ID=cognito-federation
export KC_CLIENT_SECRET='paste-from-keycloak'

aws cognito-idp create-identity-provider \
  --user-pool-id "$POOL_ID" \
  --provider-name Keycloak \
  --provider-type OIDC \
  --provider-details \
    client_id="$KC_CLIENT_ID",client_secret="$KC_CLIENT_SECRET",oidc_issuer="$KC_ISSUER",authorize_scopes="openid email profile",attributes_request_method=GET \
  --attribute-mapping email=email,username=sub,name=name

aws cognito-idp update-user-pool-client \
  --user-pool-id "$POOL_ID" \
  --client-id "$CLIENT_ID" \
  --supported-identity-providers COGNITO Keycloak \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --callback-urls 'https://jwt.io' \
  --logout-urls 'https://jwt.io'
```

</details>

**Cognito requirement:** External OIDC IdPs must support **`client_secret_post`** at the token endpoint. Keycloak confidential clients do. See [Cognito OIDC IdP](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-idp.html).

---

## Part 5 — End-to-end test (browser)

### Hosted UI URL template

```text
https://<domain>.auth.<region>.amazoncognito.com/oauth2/authorize
  ?client_id=<CLIENT_ID>
  &response_type=code
  &scope=openid+email+profile
  &redirect_uri=<URL_ENCODED_CALLBACK>
  &identity_provider=Keycloak
```

- `identity_provider=Keycloak` skips Cognito local password and jumps to Keycloak.
- Omit it to show Cognito + federated buttons.

### What should happen

1. Browser opens Cognito Hosted UI → **Keycloak** (or direct redirect).
2. Keycloak login → `alice` / password.
3. Browser lands on `redirect_uri` with `?code=...`.
4. App exchanges code at Cognito **token endpoint** (server-side or PKCE from SPA).
5. Response includes **ID token**, **access token**, **refresh token** issued by **Cognito** (`iss` = Cognito pool).

### First login side effect

Cognito **creates a shadow user** in the pool (federated profile). Later tokens use Cognito signing keys even though password lives in Keycloak.

<details>
<summary>curl — token exchange (confidential client + secret)</summary>

```bash
export DOMAIN='corp-kc-demo.auth.us-east-1.amazoncognito.com'
export CLIENT_ID='...'
export CLIENT_SECRET='...'
export REDIRECT_URI='https://jwt.io'
export AUTH_CODE='paste-code-from-redirect'

curl -sS -X POST "https://${DOMAIN}/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=authorization_code" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" \
  -d "code=${AUTH_CODE}" \
  -d "redirect_uri=${REDIRECT_URI}" | jq .
```

</details>

---

## Part 6 — How EKS pods use this

Keycloak usually runs in namespace `keycloak` on the **same cluster** as your apps, but a **different** Deployment. App pods talk to **Cognito JWKS**; only Keycloak pods open **JDBC to RDS**.

Separate three cases. Mixing them causes “why is my pod calling Keycloak?” confusion.

### Case A — User-facing API in a pod (most common)

```text
User browser ──► Cognito (+ Keycloak login once) ──► access_token (Cognito)
       │
       └──► Ingress/ALB ──► Pod validates JWT with Cognito JWKS
```

| Do | Don’t |
| --- | --- |
| Validate `Authorization: Bearer <access_token>` | Send Keycloak token to the pod |
| Check `iss`, `exp`, `aud`/`client_id`, scopes | Mount Keycloak admin password in the pod |
| Cache JWKS from `https://cognito-idp.<region>.amazonaws.com/<poolId>/.well-known/jwks.json` | Assume `sub` format matches Keycloak’s raw `sub` without checking Cognito mapping |

**Username in Cognito** is often `Keycloak_<keycloak-sub>`. Authorize on `cognito:groups`, custom claims, or app roles — not on Keycloak group names unless you map them (advanced: SAML or custom Lambda triggers).

<details>
<summary>Pod Deployment — pass pool metadata as env (app validates JWT)</summary>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  template:
    spec:
      containers:
        - name: api
          image: your-api:latest
          env:
            - name: COGNITO_REGION
              value: us-east-1
            - name: COGNITO_USER_POOL_ID
              value: us-east-1_XXXXXXXXX
            - name: COGNITO_CLIENT_ID
              value: xxxxxxxxxxxxxxxxxxxxxxxxxx
          ports:
            - containerPort: 8080
```

Your framework middleware downloads JWKS once, validates every request. Reference pattern: [EKS microservice access tokens (Cognito)](https://aws.amazon.com/blogs/security/access-token-security-for-microservice-apis-on-amazon-eks/).

</details>

### Case B — Pod calls **AWS** APIs (S3, DynamoDB, etc.)

Use **IRSA** (IAM Roles for Service Accounts). Identity chain is **Kubernetes ServiceAccount → STS → IAM**, not Cognito and not Keycloak.

```text
Pod ── projected SA token (aud=sts.amazonaws.com) ──► AssumeRoleWithWebIdentity ──► AWS API
```

Humans may still use Cognito+Keycloak for the **web app**; batch workers use IRSA. No federation change required.

### Case C — Machine-to-machine HTTP (no human in browser)

Keycloak federation does **not** help nightly jobs. Options:

| Pattern | When |
| --- | --- |
| **Cognito app client** + client credentials (if enabled for your pool/client) | Service calls your API with Cognito-issued M2M token |
| **Keycloak service account** (client credentials to Keycloak) | Only if the **resource owner is Keycloak**, not Cognito |
| **IRSA** | AWS resource access from the cluster |

Do **not** embed `alice` password in a pod to “simulate” federation.

<details>
<summary>Optional — ALB authenticate with Cognito (ingress annotation idea)</summary>

ALB can authenticate users against Cognito before traffic hits pods. Users still federate to Keycloak at Cognito Hosted UI; pods receive requests only after ALB session is established (pattern varies by controller version). Prefer in-app JWT validation when you need fine-grained scopes inside the service.

</details>

---

## Troubleshooting (fast)

| Symptom | Likely fix |
| --- | --- |
| `redirect_uri_mismatch` at Keycloak | Cognito `/oauth2/idpresponse` URI exact match in Keycloak client |
| Cognito “Invalid issuer” | Issuer URL must match discovery document; HTTPS in prod; no trailing `/` |
| Login works, email empty | Keycloak user has email; scope includes `email`; attribute mapping `email=email` |
| Token rejected in pod | Validate **Cognito** JWT, not Keycloak; check `iss` and `token_use` (`access` vs `id`) |
| Cognito cannot reach localhost Keycloak | Keycloak on EKS + public ALB + ACM; issuer = `https://auth.example.com/realms/corp` |
| Keycloak pod `Connection refused` to RDS | RDS in same VPC; SG allows **5432** from node/pod SG; correct endpoint hostname |
| Keycloak starts but empty / migration errors | DB name `keycloak`, user has privileges; password matches Secret; use `start` not `start-dev` with RDS |
| Wrong issuer in tokens | `KC_HOSTNAME` / Ingress hostname must match DNS; check OpenID Endpoint Configuration in realm |

---

## Production checklist (short)

1. **RDS:** Multi-AZ, automated backups, encryption at rest, minor version auto-upgrade, enough storage for session/realm growth.
2. **EKS:** Keycloak ≥ 2 replicas, PDB, HPA optional; ALB TLS 1.2+; restrict admin console (IP allow list or VPN-only internal ALB + separate public hostname for `/realms/*` only if you split paths).
3. **Network:** RDS never public; rotate DB password via Secrets Manager + rolling restart.
4. Rotate Keycloak **Cognito federation** client secret; update Cognito IdP.
5. Restrict callback/logout URLs to real app origins (not `jwt.io`).
6. MFA in Keycloak (or corporate IdP upstream).
7. **App pods:** Cognito JWT validation only; IRSA for AWS APIs; no RDS credentials in application Deployments.

---

## References

- [AWS workshop — third-party IdP authentication](https://catalog.workshops.aws/workshops/137bc34c-33d9-43a8-bf8f-2d4f6c22c333/en-US/60-third-party-idp-authentication)
- [Cognito — OIDC identity providers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-idp.html)
- [Keycloak — Configuring the database](https://www.keycloak.org/server/db)
- [Keycloak — Securing applications](https://www.keycloak.org/docs/latest/securing_apps/)
- [Amazon RDS for PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
