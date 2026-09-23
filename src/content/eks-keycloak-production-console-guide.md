---
title: "EKS with Keycloak - production console walkthrough"
description: "Run Keycloak on EKS for OIDC - console and cluster steps, ALB ingress, database, HA, and integration with apps and Cognito federation."
tags:
 - eks
 - keycloak
 - oidc
 - ingress
 - security
 - devops
---

# EKS with Keycloak - production console walkthrough

**Keycloak** on **EKS** provides an **OIDC/OAuth2** identity provider for microservices, ingress auth, and human operators - common in enterprise and exam scenarios that mention **external IdP** + **Kubernetes**.

**Long-form federation:** [Cognito + Keycloak federation](./aws-cognito-keycloak-federation.md)  
**Checklist:** [DevOps checklist](./aws-devops-system-design-checklist.md)

---

## Use cases

| Case | Pattern |
|------|---------|
| Single sign-on for internal apps | Keycloak realm + clients per app |
| OIDC for ALB/Ingress | Authenticate at edge, pass JWT to pods |
| Bridge to Cognito | Federate Cognito → Keycloak ([federation doc](./aws-cognito-keycloak-federation.md)) |
| CI/CD human access | Keycloak groups → RBAC (with caution) |

---

## Architecture

```text
Users ──HTTPS──► ALB ──► Keycloak (EKS) ──► RDS PostgreSQL (realm data)
                │
                └──► App Ingress (JWT validation / oauth2-proxy)
```

Keycloak needs **persistent DB** - do not use embedded H2 in production.

---

## Console - prerequisites

1. **EKS cluster** with private API recommended ([getting started](./eks-getting-started.md)).
2. **RDS PostgreSQL** in same VPC ([DB guide](./aws-databases-networking-security-backup-console.md)).
3. **ACM certificate** for `auth.example.com`.
4. **Route 53** hosted zone (optional).

---

## Console - RDS for Keycloak

1. Create **PostgreSQL** Multi-AZ, private, encrypted.
2. SG: allow **5432** from **EKS node/pod SG** only.
3. Store credentials in **Secrets Manager**.

---

## Cluster - deploy Keycloak (Helm via console CloudShell or local)

Console does not install Helm charts directly; use **EKS console → Add-ons** for supporting pieces:

1. **EKS** → cluster → **Add-ons** → ensure **VPC CNI**, **CoreDNS**, **kube-proxy** healthy.
2. Install **AWS Load Balancer Controller** ([ALB ingress](./eks-alb-ingress-controller.md)) via console **Marketplace add-on** or documented Helm (one-time).

Deploy Keycloak with Helm (representative):

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install keycloak bitnami/keycloak -n keycloak --create-namespace \
 --set auth.adminUser=admin \
 --set externalDatabase.host=RDS_ENDPOINT \
 --set externalDatabase.database=keycloak \
 --set replicaCount=2
```

**Production:** pin chart version; use **PodDisruptionBudget**; externalize admin password via Secret.

---

## Console - ALB Ingress for Keycloak

1. Create **Ingress** resource with `ingressClassName: alb`, host `auth.example.com`, TLS cert ARN.
2. **Target type IP** for Fargate/EC2 backends.
3. Restrict admin console paths via **WAF** or separate internal hostname.

---

## Keycloak console (application UI)

After deploy, access Keycloak admin:

1. Create **realm** (not `master` for apps).
2. **Clients** for each app - confidential vs public, redirect URIs exact match.
3. **Roles/groups** mapped to app permissions.
4. Enable **brute force detection** and **events** logging.

---

## IAM & AWS integration

- **IRSA** for pods that call AWS APIs (e.g. external secrets).
- **Cognito** as broker: configure IdP in Cognito pointing to Keycloak OIDC ([federation](./aws-cognito-keycloak-federation.md)).

---

## Security

- TLS 1.2+ end-to-end; HSTS on ALB.
- No public RDS; rotate DB credentials.
- Limit Keycloak admin to VPN or SSO + IP allow list.
- Keep Keycloak updated - track CVEs.

---

## Commonly missed

| Miss | Impact |
|------|--------|
| Sticky sessions without shared cache | Logout/login loops on scale |
| Wrong redirect URI | OAuth failures |
| Realm on `master` for apps | Blast radius |
| JVM heap too small on Fargate | OOM kills |

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| 502 from ALB | Target health, pod readiness, SG |
| DB connection errors | RDS SG, secret, subnet |
| Token invalid issuer | `issuer` URL must match external hostname |

Docs: [Keycloak on Kubernetes](https://www.keycloak.org/operator/installation) · [EKS user guide](https://docs.aws.amazon.com/eks/latest/userguide/)

[← Checklist](./aws-devops-system-design-checklist.md)
