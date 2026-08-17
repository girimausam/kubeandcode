---
title: "EKS Notes"
description: "EKS Notes"
tags: 
    - eks
    - notes
    - aws
---


# EKS Notes

| Resource              | Purpose                                            | Typical use                   |
| --------------------- | -------------------------------------------------- | ----------------------------- |
| **Deployment**        | Manages stateless Pods + ReplicaSets               | APIs, web apps                |
| **StatefulSet (STS)** | Manages stateful Pods with stable identity/storage | Databases, Kafka, etc.        |
| **DaemonSet (DS)**    | Runs a Pod on every/specific node                  | Log agents, monitoring agents |
| **Job**               | Runs a task to completion                          | Migration, batch processing   |
| **CronJob**           | Creates Jobs on a schedule                         | Backups, cleanup, reports     |
| **Probes**            | Determines application health                      | Restart/unready decisions     |
| **Requests/Limits**   | Controls resource scheduling/usage                 | CPU & memory management       |

### 1. Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: nginx:latest
          ports:
            - containerPort: 80
```

Deployment → ReplicaSet → Pods.

Use it when Pods are **interchangeable/stateless**.

---

### 2. StatefulSet

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql
  replicas: 2
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
        - name: mysql
          image: mysql:8
          env:
            - name: MYSQL_ROOT_PASSWORD
              value: password
```

Pods get stable identities:

```text
mysql-0
mysql-1
```

Unlike Deployment Pods:

```text
api-7d8f9c-x
api-7d8f9c-y
```

StatefulSet is useful when **identity, ordering, or persistent storage** matters.

For EKS, persistent workloads commonly use **EBS CSI** with PVCs.

---

### 3. DaemonSet

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: log-agent
spec:
  selector:
    matchLabels:
      app: log-agent
  template:
    metadata:
      labels:
        app: log-agent
    spec:
      containers:
        - name: agent
          image: fluent/fluent-bit:latest
```

If you have:

```text
Node 1
Node 2
Node 3
```

DaemonSet gives:

```text
Node 1 → log-agent
Node 2 → log-agent
Node 3 → log-agent
```

Classic EKS use cases:

* Fluent Bit
* Prometheus Node Exporter
* Security agents
* Monitoring agents

---

### 4. Job

A Job runs a workload **until successful completion**.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migration
          image: myapp:1.0
          command: ["python", "migrate.py"]
```

Flow:

```text
Job
 ↓
Pod
 ↓
Application completes
 ↓
Pod → Completed
 ↓
Job → Complete
```

Good for:

* DB migrations
* Data processing
* One-time initialization
* Batch workloads

---

### 5. CronJob

A CronJob creates Jobs according to a schedule.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: cleanup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: cleanup
              image: myapp:1.0
              command: ["python", "cleanup.py"]
```

```text
CronJob
   │
   ├── Job ── Pod ── Completed
   │
   ├── Job ── Pod ── Completed
   │
   └── Job ── Pod ── Completed
```

This runs every day at **02:00**.

---

# 6. Probes

Three important probes:

### Liveness

"Is the application alive?"

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
```

Failure → Kubernetes **restarts the container**.

---

### Readiness

"Can this Pod receive traffic?"

```yaml
readinessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

Failure → Pod is removed from the Service's ready endpoints.

**Container does not necessarily restart.**

This is particularly important behind an **EKS ALB/Ingress**.

```text
ALB
 ↓
Service
 ↓
Ready Pods
```

If readiness fails:

```text
ALB
 ↓
Service
 ↓
❌ Pod not ready
```

---

### Startup

Useful for applications that take a long time to initialize.

```yaml
startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  failureThreshold: 30
  periodSeconds: 10
```

Kubernetes waits for startup to succeed before enforcing liveness/readiness behavior.

---

# 7. Resource Requests & Limits

Example:

```yaml
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

### Request

Minimum resource requirement used by the **scheduler**.

```text
Pod requests:
CPU    = 250m
Memory = 256Mi
```

Scheduler looks for a node with sufficient allocatable resources.

### Limit

Maximum resource the container can consume.

```text
CPU    ≤ 500m
Memory ≤ 512Mi
```

Important distinction:

```text
requests → scheduling
limits   → runtime constraint
```

For memory, exceeding the limit can result in **OOMKilled**.

For CPU, throttling can occur.

---

## Recommended EKS Pod baseline

For a typical API:

```yaml
containers:
  - name: api
    image: my-api:1.0

    resources:
      requests:
        cpu: "250m"
        memory: "256Mi"
      limits:
        cpu: "500m"
        memory: "512Mi"

    startupProbe:
      httpGet:
        path: /healthz
        port: 8080
      failureThreshold: 30
      periodSeconds: 10

    readinessProbe:
      httpGet:
        path: /healthz
        port: 8080
      periodSeconds: 5

    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
      periodSeconds: 10
```

### The mental model to remember

```text
                    Kubernetes Workloads
                           │
          ┌────────────────┼────────────────┐
          │                │                │
     Deployment       StatefulSet       DaemonSet
     Stateless        Stateful           Per-node
          │                │                │
          └────────────────┴────────────────┘
                           │
                    Batch Workloads
                           │
                    ┌──────┴──────┐
                    │             │
                   Job         CronJob
                one-time       scheduled
```

And **every production Pod should make you think about three things**:

```text
                Pod
                 │
       ┌─────────┼─────────┐
       │         │         │
    Probes    Requests   Limits
       │         │         │
    Health    Scheduling  Runtime
```

For EKS specifically, I would learn these next in this order: **Deployment → Service → Ingress/ALB → StatefulSet/PVC/EBS CSI → DaemonSet → Job/CronJob → Probes → Requests/Limits → HPA → Cluster Autoscaler/Karpenter**.
