---
title: EKS + AWS Load Balancer Controller (ALB Ingress)
description: Expose services on EKS via the AWS Load Balancer Controller and ALB Ingress.
tags:
  - eks
  - alb
  - ingress
  - load-balancer
---

# EKS + AWS Load Balancer Controller (ALB Ingress) Notes

Personal setup notes for exposing services on EKS via the AWS Load Balancer
Controller (ALB Ingress). Steps: tag subnets → install controller → deploy
ingress → variations.

---

## 1. Tag VPC & Subnets

The controller auto-discovers subnets using these tags. Replace
`<my-cluster>`, `<subnet-id>` with real values.

**VPC add tag for Cluster**
- Key: `kubernetes.io/cluster/<my-cluster>`
- Value: `shared` (cluster doesn't own the VPC) or `owned` (cluster owns the VPC)

```bash
aws ec2 describe-vpcs \
  --query "Vpcs[*].{VpcId: VpcId, Name: Tags[?Key=='Name'].Value | [0]}" \
  --output json

aws ec2 create-tags \
  --resources <vpc-xxxxxxxxx> \
  --tags Key=kubernetes.io/cluster/<my-cluster>,Value=shared
```

**List Subnets**
```bash
#all
aws ec2 describe-subnets \
  --query "Subnets[*].{SubnetId: SubnetId, VpcId: VpcId, Name: Tags[?Key=='Name'].Value | [0], CidrBlock: CidrBlock}" \
  --output json

# specific vpc
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=vpc-xxxxxxxxx" \
  --query "Subnets[*].{SubnetId: SubnetId, Name: Tags[?Key=='Name'].Value | [0]}" \
  --output json
```

**Private subnets** (for internal load balancers)
- Key: `kubernetes.io/role/internal-elb`
- Value: `1`

```bash
aws ec2 create-tags \
  --resources <subnet-id> \
  --tags Key=kubernetes.io/role/internal-elb,Value=1
```

**Public subnets** (for internet-facing load balancers)
- Key: `kubernetes.io/role/elb`
- Value: `1`

```bash
aws ec2 create-tags \
  --resources <subnet-id> \
  --tags Key=kubernetes.io/role/elb,Value=1
```

> Note: if the cluster/VPC was created with `eksctl`, these tags are usually
> applied automatically — check before re-tagging.

---

## 2. Install the AWS Load Balancer Controller

### 2.1 Create IAM Policy

```bash
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.14.1/docs/install/iam_policy.json

# China regions use a different policy:
# https://github.com/kubernetes-sigs/aws-load-balancer-controller/blob/main/docs/install/iam_policy_cn.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json
```

### 2.2 Create IAM Service Account

```bash
eksctl create iamserviceaccount \
  --cluster=<cluster-name> \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=arn:aws:iam::<AWS_ACCOUNT_ID>:policy/AWSLoadBalancerControllerIAMPolicy \
  --override-existing-serviceaccounts \
  --region <aws-region-code> \
  --approve
```

### 2.3 Install via Helm

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update eks

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=<cluster-name> \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=<region-code> \
  --set vpcId=<vpc-id> \
  --version 1.14.0
```

### 2.4 Verify

```bash
kubectl get deployment -n kube-system aws-load-balancer-controller
```

Expect `READY 2/2` (two controller replicas) once it's up.

---

## 3. Deploy an Ingress

### 3.1 Service (ClusterIP, targeted by the ALB)

```yaml
apiVersion: v1
kind: Service
metadata:
  namespace: game-2048
  name: service-2048
spec:
  ports:
    - port: 80
      targetPort: 80
      protocol: TCP
  type: ClusterIP
  selector:
    app.kubernetes.io/name: app-2048
```

### 3.2 Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: game-2048
  name: ingress-2048
  annotations:
    alb.ingress.kubernetes.io/load-balancer-name: <name>
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: service-2048
                port:
                  number: 80
```

### Key annotations reference

| Annotation | Purpose |
|---|---|
| `alb.ingress.kubernetes.io/scheme` | `internet-facing` or `internal` |
| `alb.ingress.kubernetes.io/target-type` | `ip` (pod IP, needs VPC CNI) or `instance` (NodePort) |
| `alb.ingress.kubernetes.io/load-balancer-name` | Custom ALB name |
| _`kubernetes.io/ingress.class: alb`_ | _Legacy way to select the ALB controller (older `Ingress` API, pre-`ingressClassName`)_ |
| `alb.ingress.kubernetes.io/ip-address-type: dualstack` | Enables IPv6 + IPv4. **Note:** IPv6 load balancing only works with `target-type: ip`, not `instance`. Without this, the ALB is IPv4-only. |

---

## 4. Ingress Variations

### 4.1 Multiple routes (path-based, incl. non-k8s targets like Lambda)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mixed-routing-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.aws/scheme: internet-facing
    # Map rules to standard services or external/lambda targets via annotations/plugin groups
    alb.ingress.kubernetes.aws/actions.lambda-route: |
      {
        "Type": "forward",
        "TargetGroupARN": "arn:aws:elasticloadbalancing:region:account:targetgroup/my-lambda-tg/xxxx"
      }
spec:
  rules:
    - http:
        paths:
          - path: /service
            pathType: Prefix
            backend:
              service:
                name: my-eks-app-service
                port:
                  number: 80
          - path: /lambda
            pathType: Prefix
            backend:
              service:
                name: lambda-route
                port:
                  number: use-annotations

```

### 4.2 Host-based routing

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: game-2048
  name: ingress-2048
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  ingressClassName: alb
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: service-2048
                port:
                  number: 80
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 8080
```

### 4.3 Health check annotations

```yaml
metadata:
  annotations:
    alb.ingress.kubernetes.io/healthcheck-protocol: HTTP
    alb.ingress.kubernetes.io/healthcheck-path: /healthz
    alb.ingress.kubernetes.io/healthcheck-port: <port>
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: '15'
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: '5'
    alb.ingress.kubernetes.io/success-codes: '200'
    alb.ingress.kubernetes.io/healthy-threshold-count: '2'
    alb.ingress.kubernetes.io/unhealthy-threshold-count: '2'
```

---

## Gotchas / Things I forgot before

- `target-type: ip` requires pods to have routable VPC IPs (default with the
  VPC CNI) — no extra config needed on standard EKS.
- Dualstack (IPv6) only works with `target-type: ip`.
- Subnet tags are how the controller *discovers* subnets automatically — if
  they're missing/wrong, the ALB either fails to provision or lands in the
  wrong subnets.
- `kubernetes.io/ingress.class: alb` is the old annotation-based way to pick
  the controller; prefer `spec.ingressClassName: alb` on newer clusters.


## 5. Examples

### 5.1 Ingress ( Grafana and Prometheus )

Assumes `kube-prometheus-stack` installed in the `prometheus` namespace
(services `prometheus-grafana` on port 80 and
`prometheus-kube-prometheus-prometheus` on port 9090 — check your actual
service names with `kubectl get svc -n monitoring`).

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: prometheus
  name: monitoring-ingress
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
          - path: /grafana
            pathType: Prefix
            backend:
              service:
                name: prometheus-grafana
                port:
                  number: 80

          - path: /prometheus
            pathType: Prefix
            backend:
              service:
                name: prometheus-kube-prometheus-prometheus
                port:
                  number: 9090
```

**Configure Prometheus and Grafana**

```yaml
cat > monitoring-values.yaml <<'EOF'
 prometheus:
   prometheusSpec:
     externalUrl: "http://alb-153229186.us-east-1.elb.amazonaws.com/prometheus/"
     routePrefix: "/prometheus/"
 
 grafana:
   grafana.ini:
     server:
       root_url: "%(protocol)s://%(domain)s/grafana/"
       serve_from_sub_path: true
EOF
```
```bash
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  -n prometheus \
  -f monitoring-values.yaml
```

```bash
curl -I http://alb-153229186.us-east-1.elb.amazonaws.com/prometheus/
curl -v http://alb-153229186.us-east-1.elb.amazonaws.com/grafana/
```

> Gotcha: Grafana's default service port is `80` (proxies to container port
> `3000`) — don't point the Ingress at `3000` directly unless you changed
> the Service to expose it that way.

### 5.2 Ingress ( ArgoCD )

ArgoCD's `argocd-server` serves both gRPC and HTTPS on the same port by
default (unless it's running with `--insecure`), so the ALB needs to talk
HTTPS to the backend or the UI/API will fail with protocol errors.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: argocd
  name: argocd-server-ingress
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/backend-protocol: HTTPS
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/certificate-arn: <acm-cert-arn>
    alb.ingress.kubernetes.io/ssl-redirect: '443'
spec:
  ingressClassName: alb
  rules:
    - host: argocd.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 443
```

> Gotcha: if you run `argocd-server` with `--insecure` (TLS terminated at
> the ALB instead), switch `backend-protocol` to `HTTP` and target port
> `80` instead — otherwise the ALB will fail health checks trying HTTPS
> against a plaintext backend.

---

## 6. Ingress ( Group )

By default every `Ingress` resource provisions its **own** ALB. That gets
expensive/messy fast if you have several apps (Grafana, Prometheus,
ArgoCD, …) each wanting their own ingress — you end up paying for and
managing N load balancers.

`IngressGroup` lets multiple `Ingress` resources share a single ALB. The
controller merges all rules from every Ingress with the same
`group.name` into one ALB, keyed by listener/host/path.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: monitoring
  name: grafana-ingress
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/group.name: shared-alb
    alb.ingress.kubernetes.io/group.order: '10'
spec:
  ingressClassName: alb
  rules:
    - host: grafana.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: kube-prometheus-stack-grafana
                port:
                  number: 80
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: argocd
  name: argocd-ingress
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/backend-protocol: HTTPS
    alb.ingress.kubernetes.io/group.name: shared-alb
    alb.ingress.kubernetes.io/group.order: '20'
spec:
  ingressClassName: alb
  rules:
    - host: argocd.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 443
```

Both Ingresses above (in different namespaces) get merged into **one**
ALB named after the group.

### Key group annotations

| Annotation | Purpose |
|---|---|
| `alb.ingress.kubernetes.io/group.name` | Ingresses sharing this name share one ALB. Must be unique per ALB across the cluster. |
| `alb.ingress.kubernetes.io/group.order` | Evaluation priority within the group (lower = evaluated first). Matters when rules could overlap. |

> Gotchas:
> - Annotations like `load-balancer-name`, `scheme`, `ip-address-type`,
>   `certificate-arn`, etc. must be **consistent** across all Ingresses in
>   the group — the controller merges them, and conflicts cause errors.
> - Deleting one Ingress in the group only removes its rules from the
>   shared ALB, not the whole ALB — it stays up as long as at least one
>   Ingress in the group exists.
> - Group name is cluster-scoped, not namespace-scoped, so it's fine (and
>   expected) for member Ingresses to live in different namespaces, as in
>   the Grafana/ArgoCD example above.