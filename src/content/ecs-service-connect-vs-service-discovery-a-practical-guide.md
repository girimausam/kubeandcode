# ECS Service Connect vs Service Discovery: A Practical Guide

When you run multiple services on Amazon ECS, they need a way to find each other. AWS offers two related but different mechanisms: **ECS Service Connect** and **ECS Service Discovery** (Cloud Map). They look similar in the console, but they solve different problems and fail in different ways.

This guide explains what each one does, when to choose which, how to wire them up, and the caveats that usually cause "nothing works" in real clusters.

---

## TL;DR

| | **Service Connect** | **Service Discovery (Cloud Map)** |
|---|---|---|
| **Best for** | Microservice-to-microservice HTTP/gRPC inside ECS | Any workload that needs a stable DNS name (ECS or not) |
| **DNS style** | Short names injected into task (`orders`, `payments`) | FQDN in a private zone (`my-service.my-namespace`) |
| **Proxy / mesh** | Yes - Envoy sidecar per task | No - plain DNS A/AAAA records |
| **Observability** | Built-in metrics, retries, outlier detection | DNS only |
| **Works across ECS only?** | Yes (same SC namespace) | Yes - any resource in the VPC can query DNS |

**Rule of thumb:** Use **Service Connect** when ECS services call each other by name and you want AWS-managed connectivity. Use **Service Discovery** when you need a DNS record that anything in the VPC can resolve - or when the caller is not part of Service Connect.

---

## What Is ECS Service Connect?

Service Connect is a **service mesh layer** built into ECS. When enabled on a service, ECS adds an **Envoy-based sidecar** (`ecs-service-connect-*` container) to each task.

That sidecar:

1. Registers the service in a Cloud Map **HTTP namespace**
2. Injects **DNS aliases** into the task (via `/etc/hosts` and local DNS)
3. Proxies traffic between services using the aliases you define

### Example topology

```
frontend-service  ──http://orders:8081──►  orders-service
orders-service    ──http://payments:8082──► payments-service
```

Each **server** service declares a client alias:

```json
{
  "portName": "orders-8081-tcp",
  "discoveryName": "orders",
  "clientAliases": [
    { "port": 8081, "dnsName": "orders" }
  ]
}
```

Each **client** service enables Service Connect on the **same namespace** but leaves `services: []` empty.

### Requirements

- Fargate platform 1.4+ or compatible EC2 capacity
- `awsvpc` network mode
- Named port mappings on the task definition (`name`, `appProtocol: http`)
- All communicating services in the **same Service Connect namespace**
- Service Connect enabled on **both** client and server services

---

## What Is ECS Service Discovery?

Service Discovery uses **AWS Cloud Map** to register task IP addresses and expose them as **DNS records** in a private hosted zone.

When you attach a service registry to an ECS service:

```
ecs-app-service.ecs-app  →  10.0.151.157
```

Any resource in the associated VPC that uses the VPC DNS resolver (`169.254.169.253` at `AmazonProvidedDNS`) can resolve that name - including ECS tasks, EC2 instances, and Lambda functions in the VPC.

Service Discovery does **not** add a sidecar. It does **not** proxy traffic. It is DNS + health-checked registration, full stop.

---

## When to Use Service Connect

Choose Service Connect when:

- **All callers are ECS services** in the same cluster/namespace
- You want **short, stable names** (`orders`, `payments`) instead of FQDNs
- You need **L7 features**: retries, timeouts, outlier detection, request metrics
- You are building an **internal microservice mesh** (API → API → API)
- You use **HTTP or gRPC** and port names are already on your task definitions

### Good fit

- Frontend → Orders → Payments chain on Fargate
- Internal REST/gRPC APIs with no public load balancer
- Replacing hard-coded IPs or manual `/etc/hosts` entries

### Poor fit

- Legacy apps outside ECS that cannot use Service Connect DNS injection
- Non-HTTP protocols where SC's L7 proxy adds no value
- Services that must be reachable by name from on-prem over VPN without ECS involvement

---

## When to Use Service Discovery

Choose Service Discovery when:

- Callers may **not** have Service Connect enabled (mixed environments)
- You need a **real DNS name** in Route 53 (`service.namespace`)
- The workload is registered from ECS but consumed by **other VPC resources**
- You already have an **ALB/NLB** and only need stable backend discovery
- You want the simplest possible "give me a DNS name for this task IP" setup

### Good fit

- Pipeline-deployed app reachable at `ecs-app-service.ecs-app:8000`
- Shared services consumed by ECS, batch jobs, and EC2 in the same VPC
- Gradual migration: old apps use Cloud Map DNS while new apps adopt Service Connect

### Poor fit

- You need automatic retries, circuit breaking, or per-route metrics (use SC or add app-level logic)
- You expect DNS to update in running containers without redeploying clients (same limitation as SC for dynamic discovery)

---

## How to Set Up Service Connect (Step by Step)

### 1. Create a Cloud Map HTTP namespace

In the ECS console or CLI, create a namespace (e.g. `my-app`, type **HTTP**). Service Connect uses this as its registry.

```bash
aws servicediscovery create-http-namespace --name my-app --region us-east-1
```

### 2. Define named port mappings on task definitions

Port mappings must have a **name** and **appProtocol**:

```json
{
  "containerPort": 8081,
  "hostPort": 8081,
  "protocol": "tcp",
  "name": "orders-8081-tcp",
  "appProtocol": "http"
}
```

The `portName` in Service Connect config must match this name exactly.

### 3. Enable Service Connect on the server service

For `orders-service`:

```bash
aws ecs update-service \
  --cluster ecs-app-cluster \
  --service orders-service \
  --task-definition orders:4 \
  --service-connect-configuration file://sc-orders.json \
  --force-new-deployment
```

`sc-orders.json`:

```json
{
  "enabled": true,
  "namespace": "arn:aws:servicediscovery:REGION:ACCOUNT:namespace/ns-xxxxx",
  "services": [
    {
      "portName": "orders-8081-tcp",
      "discoveryName": "orders",
      "clientAliases": [
        { "port": 8081, "dnsName": "orders" }
      ]
    }
  ]
}
```

### 4. Enable Service Connect on client services

For `frontend-service` (client only):

```json
{
  "enabled": true,
  "namespace": "arn:aws:servicediscovery:REGION:ACCOUNT:namespace/ns-xxxxx",
  "services": []
}
```

### 5. Deploy in the right order

1. Deploy **server** services first (orders, payments)
2. Wait until they are stable
3. Deploy **client** services last (frontend)

See caveats below - order matters.

### 6. Verify from inside a task

```bash
aws ecs execute-command \
  --cluster ecs-app-cluster \
  --task TASK_ID \
  --container frontend \
  --interactive \
  --command '/bin/sh'
```

Inside the container:

```sh
cat /etc/hosts          # should list orders, payments
curl http://orders:8081/
curl http://payments:8082/
```

---

## How to Set Up Service Discovery (Step by Step)

### 1. Create a Cloud Map private DNS namespace

Type **DNS_PRIVATE**, associated with your VPC (e.g. namespace `ecs-app`).

```bash
aws servicediscovery create-private-dns-namespace \
  --name ecs-app \
  --vpc VPC_ID \
  --region us-east-1
```

### 2. Create a Cloud Map service

Note the **service name** - it becomes the left part of the DNS record.

- Service name: `ecs-app-service`
- Full DNS: `ecs-app-service.ecs-app`

### 3. Attach the registry to your ECS service

```bash
aws ecs create-service \
  --cluster ecs-app-cluster \
  --service-name ecs-app-td-service \
  --task-definition ecs-app-td:4 \
  --service-registries registryArn=arn:aws:servicediscovery:...:service/srv-xxxxx \
  ...
```

Or in the console: **Service discovery** → select namespace + service name during service creation.

### 4. Verify DNS from any task in the VPC

```sh
nslookup ecs-app-service.ecs-app
curl http://ecs-app-service.ecs-app:8000/health
```

### 5. Match the name your app expects

If your code or docs say `ecs-service-app.ecs-app` but Cloud Map registered `ecs-app-service`, DNS will fail with **NXDOMAIN**. The fix is either rename the Cloud Map service or update the client.

---

## Common Caveats (Read These First)

### 1. Service Connect DNS is injected at startup - not live-updated

This is the most common production surprise.

Service Connect writes aliases to `/etc/hosts` (and related config) when the **task starts**. If a client task starts **before** a server registers its alias, the client will **not** see that name until it is **redeployed**.

**Symptom:** `socket.gaierror: Name or service not known` or `curl: (6) Could not resolve host`.

**Fix:** Force a new deployment on **client** services after all server services are healthy:

```bash
aws ecs update-service --cluster CLUSTER --service frontend-service --force-new-deployment
```

**Prevention:** Deploy servers first, clients last. In CloudFormation/Terraform, use explicit dependencies.

Reference: [AWS containers-roadmap #2692](https://github.com/aws/containers-roadmap/issues/2692)

---

### 2. Client alias must match what your app calls

Service Connect registers exactly the `dnsName` you configure - not what you wish you configured.

| Configured alias | App env var | Result |
|---|---|---|
| `payments.my-app` | `PAYMENTS_HOST=payments` | **Fails** |
| `payments` | `PAYMENTS_HOST=payments` | **Works** |
| `orders` | `ORDERS_HOST=orders` | **Works** |

Always align `clientAliases[].dnsName` with `ORDERS_HOST`, `PAYMENTS_HOST`, or hard-coded URLs in code.

---

### 3. `portName` must match the task definition port mapping name

Task definition:

```json
"name": "payments-8082-tcp"
```

Service Connect config must use the same string:

```json
"portName": "payments-8082-tcp"
```

A typo like `payments-8081-tcp` for container port 8082 will break registration silently or fail deployment validation.

---

### 4. Do not mix up namespace types

| Namespace type | Used by | DNS behaviour |
|---|---|---|
| **HTTP** | Service Connect | Aliases in task `/etc/hosts`, not Route 53 |
| **DNS_PRIVATE** | Service Discovery | Route 53 records in VPC (`*.namespace`) |

Using a DNS_PRIVATE namespace for Service Connect (or vice versa) leads to confusing failures. Keep them separate unless you know exactly what you are doing.

---

### 5. Service Discovery name ≠ ECS service name

Cloud Map service name defines DNS, not the ECS service name.

- ECS service: `ecs-app-td-service-tajcbsjq`
- Cloud Map service: `ecs-app-service`
- DNS: `ecs-app-service.ecs-app`

The random suffix on the ECS service name is irrelevant to DNS.

---

### 6. Both require network prerequisites

- Tasks in **same VPC** (or peered VPCs with DNS resolution enabled)
- **Security groups** must allow traffic on target ports between tasks
- Private subnets need **NAT** (or VPC endpoints) for image pull - unrelated to SC but often confused with "networking broken"
- VPC **enableDnsSupport** and **enableDnsHostnames** should be true for Service Discovery

---

### 7. Service Connect does not replace a load balancer for public traffic

Internal mesh:

```
frontend ──SC──► orders ──SC──► payments   ✅
```

Public browser access:

```
Internet ──???──► frontend   ❌ (no ALB attached)
```

Attach an ALB/NLB to services that need external ingress. Service Connect handles **east-west** traffic inside the mesh.

---

### 8. Health checks and base images matter

If you use container health checks with `curl`, the binary must exist in the image. `python:3.14-slim` does not include `curl`; `python:3.14` does.

Failed health checks cause task churn and can interrupt Service Connect registration timing - which feeds back into caveat #1.

---

### 9. Logging and debugging

- Service Connect sidecar logs go to the log group configured on the **service** SC config (e.g. `/ecs/frontend-service`)
- Application logs go to the task definition `logConfiguration`
- If the app container has no log config, you only see Envoy logs - not Flask/app errors

Enable app logging on every task definition you need to debug.

---

### 10. ECS Exec requires extra setup

Interactive debugging (`aws ecs execute-command`) needs:

- SSM Session Manager plugin on your machine
- `enableExecuteCommand: true` on the service
- Task role + execution role permissions for SSM

Without Exec, you are limited to CloudWatch logs and `describe-*` API calls.

---

## Use Case Matrix

| Scenario | Recommended approach |
|---|---|
| 3 Flask microservices calling each other on Fargate | **Service Connect** |
| CodePipeline app reachable from other VPC services by DNS | **Service Discovery** |
| Service A (ECS) calls Service B (ECS) with retries/timeouts | **Service Connect** |
| Lambda in VPC calls an ECS backend | **Service Discovery** (or ALB) |
| Public web app + internal APIs | **ALB** for public + **Service Connect** for internal |
| Multi-cluster or cross-account calls | **Cloud Map DNS** or **ALB** - SC namespace is per-cluster |
| gRPC between ECS services | **Service Connect** with `appProtocol: grpc` |

---

## Reference Architecture (Combined)

It is normal to use **both** in one cluster:

```
┌─────────────────────────────────────────────────────────────┐
│                     ecs-app-cluster                         │
│                                                             │
│  Service Connect namespace: my-app (HTTP)                   │
│  ┌──────────┐    SC     ┌──────────┐    SC    ┌──────────┐│
│  │ frontend │ ────────► │  orders  │ ───────► │ payments ││
│  └──────────┘           └──────────┘          └──────────┘│
│                                                             │
│  Service Discovery namespace: ecs-app (DNS_PRIVATE)         │
│  ┌──────────────────────┐                                 │
│  │ ecs-app-td-service     │  DNS: ecs-app-service.ecs-app   │
│  └──────────────────────┘                                 │
└─────────────────────────────────────────────────────────────┘
```

Microservices talk via **short SC names**. The pipeline app is reachable via **Cloud Map FQDN** from anywhere in the VPC.

---

## Deployment Checklist

Before declaring Service Connect "working":

- [ ] HTTP namespace created
- [ ] All services use named port mappings with `appProtocol`
- [ ] Server services have correct `clientAliases` (`dnsName` + `port`)
- [ ] Client services have SC enabled, same namespace, `services: []`
- [ ] App env vars match `dnsName` values
- [ ] Server services deployed and stable **before** clients
- [ ] Client services force-redeployed after servers exist
- [ ] Security groups allow ports 8080/8081/8082 (or your ports)
- [ ] `cat /etc/hosts` inside client task shows expected entries
- [ ] `curl http://orders:PORT/` works from client container
- [ ] ALB attached if external access is required

Before declaring Service Discovery "working":

- [ ] DNS_PRIVATE namespace associated with correct VPC
- [ ] Cloud Map service name matches what clients call
- [ ] ECS service has `serviceRegistries` attached
- [ ] Route 53 record visible: `aws route53 list-resource-record-sets --hosted-zone-id ZONE_ID`
- [ ] `nslookup your-service.your-namespace` resolves from a VPC task
- [ ] Security groups allow traffic on the target port

---

## Quick Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Name or service not known` for SC name | Client task started before server registered | Redeploy client service |
| `Name or service not known` for FQDN | Wrong Cloud Map service name | Fix name or update client URL |
| SC config looks right, still fails | `dnsName` mismatch with app env | Align alias and env vars |
| Tasks cycle unhealthy | Health check uses missing `curl` | Use full base image or install curl |
| DNS resolves, connection refused | Security group or wrong port | Open SG; verify containerPort |
| Works task-to-task by IP, not by name | SC not enabled on client or server | Enable SC on both sides |
| External users cannot reach service | No load balancer | Attach ALB/NLB |

---

## Further Reading

- [Amazon ECS Service Connect](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect.html)
- [Using service discovery](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-discovery.html)
- [Troubleshoot Service Connect (AWS re:Post)](https://repost.aws/knowledge-center/ecs-troubleshoot-service-connect)
- [Service Connect dynamic /etc/hosts feature request](https://github.com/aws/containers-roadmap/issues/2692)

---

*Based on a real ECS Fargate setup: `frontend-service` → `orders-service` → `payments-service` (Service Connect) and `ecs-app-td-service` (Service Discovery on `ecs-app-service.ecs-app`).*
