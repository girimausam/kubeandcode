---
title: "ShopSphere on Amazon EKS"
description: "Complete microservices lab on EKS—VPC, Flask backend, ALB ingress patterns, autoscaling, Prometheus, Grafana, GitOps, and secrets."
tags:
  - shopsphere
  - eks
  - kubernetes
  - microservices
  - alb
  - ingress
  - flask
  - gitops
  - aws
---

> End-to-end guide: build and operate a production-style microservices app on Amazon EKS — VPC, persistence, backend API, ingress, autoscaling, observability, GitOps, and secrets.

## Final architecture

```mermaid
graph TD
    Internet[Internet] --> ALB[Application Load Balancer]
    ALB -->|"/"| Frontend[Frontend Nginx]
    ALB -->|"/api/*"| Backend[Flask Backend]
    ALB -->|"/grafana"| Grafana[Grafana]
    Backend --> DB[PostgreSQL]
    DB --> EBS[(EBS Volume)]
    Grafana --> Prometheus[Prometheus]
    Prometheus --> Metrics[Cluster Metrics]
```

## Table of contents

| Phase | Topic |
| --- | --- |
| 01 | [Infrastructure setup](#phase-01-01-infrastructure-setup) |
| 02 | [EKS cluster](#phase-02-02-eks-cluster) |
| 03 | [EBS CSI driver](#phase-03-03-ebs-csi-driver) |
| 04 | [PostgreSQL persistence](#phase-04-04-postgresql-persistence) |
| 05 | [Application deployment](#phase-05-05-application-deployment) |
| 06 | [ConfigMaps and Secrets](#phase-06-06-configmaps-secrets) |
| 07 | [Backend and database integration](#phase-07-07-backend-database-integration) |
| 08 | [AWS Load Balancer Controller](#phase-08-08-aws-load-balancer-controller) |
| 09 | [Ingress configuration](#phase-09-09-ingress-configuration) |
| 10 | [Frontend application](#phase-10-10-frontend-application) |
| 11 | [Metrics Server](#phase-11-11-metrics-server) |
| 12 | [Horizontal Pod Autoscaler](#phase-12-12-horizontal-pod-autoscaler) |
| 13 | [Prometheus and Grafana](#phase-13-13-prometheus-grafana) |
| 14 | [Grafana access and dashboards](#phase-14-14-grafana-access-dashboards) |
| 15 | [Application metrics](#phase-15-15-application-metrics) |
| 16 | [Advanced autoscaling with Karpenter](#phase-16-16-advanced-autoscaling-karpenter) |
| 17 | [GitOps with Argo CD](#phase-17-17-gitops-argocd) |
| 18 | [DNS and TLS automation](#phase-18-18-dns-tls-automation) |
| 19 | [Security and secrets](#phase-19-19-security-secrets) |

Each phase follows the same layout: **Objective** → **Architecture** → **Commands** → **Manifests** → **Verification** → **Troubleshooting** (where applicable).

---

## Phase 01: 01-infrastructure-setup

## Objective

Create a production-ready VPC with public and private subnets, internet gateway, NAT gateway, and proper routing for EKS workloads.

## Architecture

```
VPC: 10.0.0.0/16
├── Public Subnets (us-east-1a, 1b)
│   ├── Internet Gateway
│   └── ALBs
│
├── Private Subnets (us-east-1a, 1b)
│   ├── NAT Gateway
│   └── EKS Worker Nodes
│
└── Route Tables
    ├── Public: 0.0.0.0/0 → IGW
    └── Private: 0.0.0.0/0 → NAT
```

## Commands

### Create VPC using eksctl (Recommended)

```bash
## Create VPC with eksctl
eksctl create cluster \
  --name shopsphere \
  --region us-east-1 \
  --version 1.27 \
  --without-nodegroup \
  --vpc-private-subnets=10.0.0.0/19,10.0.32.0/19 \
  --vpc-public-subnets=10.0.64.0/19,10.0.96.0/19 \
  --vpc-cidr=10.0.0.0/16
```

### Or using AWS CLI

```bash
## Create VPC
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications \
  'ResourceType=vpc,Tags=[{Key=Name,Value=shopsphere-vpc}]'

## Create Internet Gateway
aws ec2 create-internet-gateway --tag-specifications \
  'ResourceType=internet-gateway,Tags=[{Key=Name,Value=shopsphere-igw}]'

## Attach IGW to VPC
aws ec2 attach-internet-gateway --internet-gateway-id igw-xxx --vpc-id vpc-xxx

## Create NAT Gateway in public subnet
aws ec2 allocate-address --domain vpc
aws ec2 create-nat-gateway --subnet-id subnet-xxx --allocation-id eipalloc-xxx
```

## Manifests

### VPC Tags for Kubernetes

```yaml
## Required tags for ALB controller
kubernetes.io/cluster/shopsphere: shared
kubernetes.io/role/elb: "1"  # Public subnets
kubernetes.io/role/internal-elb: "1"  # Private subnets
```

## Verification

```bash
## Verify VPC setup
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=shopsphere-vpc"

## Verify subnets
aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-xxx"

## Verify route tables
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=vpc-xxx"
```

**Expected Output:**

```
VPC: 10.0.0.0/16
Public Subnets: 2
Private Subnets: 2
Internet Gateway: Attached
NAT Gateway: 1 (in public subnet)
```

## Troubleshooting

### Issue: Private nodes cannot pull images

**Symptoms:**

```bash
kubectl describe pod <pod-name>
## Events:
## Failed to pull image: request canceled while waiting for connection
## ErrImagePull / ImagePullBackOff
```

**Root Cause:**

```
❌ Missing NAT Gateway
❌ Private route table not pointing to NAT
```

**Fix:**

```bash
## Verify NAT Gateway exists
aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=vpc-xxx"

## Update private route table
aws ec2 create-route \
  --route-table-id rtb-private-xxx \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id nat-xxx
```



```bash
## Test internet connectivity from private subnet
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t2.micro \
  --subnet-id subnet-private-xxx \
  --security-group-ids sg-xxx \
  --query 'Instances[0].InstanceId'

## Connect and test
aws ec2 describe-instance-status --instance-ids i-xxx
```

---


---

## Phase 02: 02-eks-cluster

## Objective

Create an Amazon EKS cluster with managed node groups and verify node connectivity.

## Architecture

```
EKS Control Plane (AWS Managed)
├── API Server
├── etcd
└── Controllers

Managed Node Group
├── m5.large (2 vCPU, 8 GiB)
├── Auto-scaling: 2-4 nodes
└── Private subnets only
```

## Commands

### Create EKS Cluster

```bash
## Using eksctl (Recommended)
eksctl create cluster \
  --name shopsphere \
  --region us-east-1 \
  --version 1.27 \
  --nodegroup-name standard-workers \
  --node-type m5.large \
  --nodes 2 \
  --nodes-min 2 \
  --nodes-max 4 \
  --node-volume-size 20 \
  --ssh-access \
  --ssh-public-key my-key-pair \
  --managed \
  --with-oidc \
  --full-ecr-access \
  --appmesh-access \
  --alb-ingress-access
```

### Alternative: Terraform

```hcl
## main.tf
module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  version         = "~> 19.0"

  cluster_name    = "shopsphere"
  cluster_version = "1.27"

  vpc_id          = aws_vpc.main.id
  subnet_ids      = aws_subnet.private[*].id

  eks_managed_node_groups = {
    standard = {
      min_size     = 2
      max_size     = 4
      desired_size = 2

      instance_types = ["m5.large"]
      capacity_type  = "ON_DEMAND"
    }
  }
}
```

## Manifests

### Node Group Configuration

```yaml
## nodegroup.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: shopsphere
  region: us-east-1
  version: "1.27"

managedNodeGroups:
  - name: standard-workers
    instanceType: m5.large
    desiredCapacity: 2
    minSize: 2
    maxSize: 4
    volumeSize: 20
    privateNetworking: true
    labels:
      role: workers
    tags:
      environment: production
```

## Verification

```bash
## Update kubeconfig
aws eks update-kubeconfig --name shopsphere --region us-east-1

## Verify nodes
kubectl get nodes -o wide

## Verify system pods
kubectl get pods -n kube-system

## Check cluster info
kubectl cluster-info
```

**Expected Output:**

```bash
NAME                         STATUS   ROLES    AGE   VERSION
ip-10-0-128-1.ec2.internal   Ready    <none>   5m    v1.27.3-eks
ip-10-0-160-1.ec2.internal   Ready    <none>   5m    v1.27.3-eks
```

## Screenshots

**EKS Cluster Dashboard:**

```
🔗 Console Path: EKS → Clusters → shopsphere
✅ Status: ACTIVE
✅ Kubernetes version: 1.27
✅ Platform version: eks.5
```

**Node Group View:**

```
🔗 Console Path: EKS → Clusters → shopsphere → Configuration → Compute
✅ Desired: 2
✅ Current: 2
✅ Status: ACTIVE
```

## Troubleshooting

### Issue: Nodes never join cluster

**Symptoms:**

```bash
kubectl get nodes
## No resources found
## OR
kubectl get nodes
NAME     STATUS     ROLES    AGE   VERSION
node-1   NotReady   <none>   10m   v1.27.3
```

**Root Causes:**

```
❌ Wrong subnet selection (public instead of private)
❌ Missing IAM permissions for node role
❌ Security group blocking node-to-control-plane traffic
❌ CNI plugin not installed
```

**Fix:**

```bash
## Check node group status
aws eks describe-nodegroup \
  --cluster-name shopsphere \
  --nodegroup-name standard-workers

## Check events
kubectl get events --sort-by='.lastTimestamp'

## Verify security groups
aws ec2 describe-security-groups \
  --filters "Name=tag:aws:eks:cluster-name,Values=shopsphere"
```



```bash
## Describe nodes for detailed info
kubectl describe node <node-name>

## Check kubelet logs on node
aws ssm start-session --target <instance-id>
sudo journalctl -u kubelet -f

## Verify IAM role
aws iam get-role --role-name eksctl-shopsphere-nodegroup-NodeInstanceRole
```

---

## Phase 03: 03-ebs-csi-driver

## Objective

Install the Amazon EBS CSI driver to enable dynamic provisioning of persistent volumes for stateful workloads like databases.

## Architecture

```
Kubernetes Cluster
├── EBS CSI Controller (Deployment)
│   ├── csi-provisioner
│   ├── csi-attacher
│   └── ebs-plugin
│
└── EBS CSI Node (DaemonSet)
    ├── node-driver-registrar
    └── ebs-plugin

StorageClass (gp3)
    ↓
PVC Request
    ↓
EBS Volume (gp3, 10Gi)
    ↓
Pod Mount
```

## Commands

### Install EBS CSI Driver

```bash
## Method 1: Using eksctl (Easiest)
eksctl create addon \
  --name aws-ebs-csi-driver \
  --cluster shopsphere \
  --version latest \
  --force

## Method 2: Using Helm
helm repo add aws-ebs-csi-driver \
  <https://kubernetes-sigs.github.io/aws-ebs-csi-driver>

helm install aws-ebs-csi-driver aws-ebs-csi-driver/aws-ebs-csi-driver \
  --namespace kube-system \
  --set controller.serviceAccount.create=true \
  --set controller.serviceAccount.name=ebs-csi-controller-sa

## Method 3: Using kubectl (IAM role required)
kubectl apply -k "github.com/kubernetes-sigs/aws-ebs-csi-driver/deploy/kubernetes/overlays/stable/?ref=master"
```

### Create IAM Role for Service Account (if not using addon)

```bash
eksctl create iamserviceaccount \
  --name ebs-csi-controller-sa \
  --namespace kube-system \
  --cluster shopsphere \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
  --approve \
  --role-only \
  --role-name AmazonEKS_EBS_CSI_DriverRole
```

## Manifests

### StorageClass Configuration

```yaml
## storageclass.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
parameters:
  type: gp3
  fsType: ext4
  encrypted: "true"
  kmsKeyId: "arn:aws:kms:us-east-1:123456789012:key/xxxx"  # Optional
reclaimPolicy: Retain  # Keep data after PVC deletion
```

### Verify Installation

```yaml
## test-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ebs-test-claim
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: gp3
---
apiVersion: v1
kind: Pod
metadata:
  name: ebs-test-app
spec:
  containers:
  - name: app
    image: centos
    command: ["/bin/sh"]
    args: ["-c", "while true; do echo $(date -u) >> /data/out.txt; sleep 5; done"]
    volumeMounts:
    - name: persistent-storage
      mountPath: /data
  volumes:
  - name: persistent-storage
    persistentVolumeClaim:
      claimName: ebs-test-claim
```

## Verification

```bash
## Check CSI driver pods
kubectl get pods -n kube-system | grep ebs-csi

## Expected output:
## ebs-csi-controller-xxxxx   6/6     Running   0          5m
## ebs-csi-node-xxxxx         3/3     Running   0          5m

## Verify StorageClass
kubectl get storageclass

## Expected:
## NAME            PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
## gp3 (default)   ebs.csi.aws.com         Retain          WaitForFirstConsumer   true                   5m

## Test PVC creation
kubectl apply -f test-pvc.yaml
kubectl get pvc
kubectl get pv

## Expected:
## NAME             STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
## ebs-test-claim   Bound    pvc-12345678-1234-1234-1234-123456789012   1Gi        RWO            gp3            30s
```

## Screenshots

**EKS Add-ons View:**

```
🔗 Console Path: EKS → Clusters → shopsphere → Add-ons
✅ aws-ebs-csi-driver: Active
✅ Version: v1.20.0-eksbuild.1
```

**EC2 Volumes:**

```
🔗 Console Path: EC2 → Elastic Block Store → Volumes
✅ Volume ID: vol-0xxxx
✅ State: in-use
✅ Size: 1 GiB
✅ Type: gp3
✅ Attached to: i-0xxxx (EKS node)
```

## Troubleshooting

### Issue: PVC remains in Pending state

**Symptoms:**

```bash
kubectl get pvc
NAME             STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
postgres-pvc     Pending                                      gp3            5m

kubectl describe pvc postgres-pvc
Events:
  Warning  ProvisioningFailed  2m  ebs.csi.aws.com_gp3
  failed to provision volume with StorageClass "gp3":
  rpc error: code = Internal desc = Could not attach volume
```

**Root Causes:**

```
❌ EBS CSI Driver not installed
❌ IAM permissions missing
❌ No nodes available in AZ
❌ Volume limit reached (max 39 volumes per node)
```

**Fix:**

```bash
## Check if CSI driver is running
kubectl get pods -n kube-system | grep ebs-csi

## Check CSI driver logs
kubectl logs -n kube-system deployment/ebs-csi-controller

## Verify IAM role (if using IRSA)
kubectl get sa ebs-csi-controller-sa -n kube-system -o yaml

## Check node availability
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.labels.topology\.kubernetes\.io/zone}{"\n"}{end}'
```



```bash
## Check events for PVC
kubectl describe pvc <pvc-name>

## Check CSI controller logs
kubectl logs -n kube-system deployment/ebs-csi-controller -c csi-provisioner

## Check node plugin logs
kubectl logs -n kube-system <ebs-csi-node-pod-name> -c node-driver-registrar

## Verify AWS permissions
aws ec2 describe-volumes --filters "Name=tag:kubernetes.io/created-for/pvc/name,Values=<pvc-name>"
```

---

## Phase 04: 04-postgresql-persistence

## Objective

Deploy a production-ready PostgreSQL database with persistent storage, proper resource limits, and health checks.

## Architecture

```
PostgreSQL Deployment
├── 1 Replica (can scale to HA)
├── Resource Limits: 512Mi RAM, 500m CPU
└── Health Checks: liveness & readiness

PersistentVolumeClaim
├── 10Gi gp3 storage
├── ReadWriteOnce access
└── Retain policy

Service (ClusterIP)
└── Port 5432
```

## Commands

### Create Namespace

```bash
kubectl create namespace shopsphere
kubectl config set-context --current --namespace=shopsphere
```

### Deploy PostgreSQL

```bash
## Apply all resources
kubectl apply -f postgres/

## Or deploy individually
kubectl apply -f postgres/storageclass.yaml
kubectl apply -f postgres/pvc.yaml
kubectl apply -f postgres/deployment.yaml
kubectl apply -f postgres/service.yaml
kubectl apply -f postgres/configmap.yaml
kubectl apply -f postgres/secret.yaml
```

## Manifests

### PersistentVolumeClaim

```yaml
## postgres/pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: shopsphere
  labels:
    app: postgresql
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: gp3
```

### PostgreSQL Deployment

```yaml
## postgres/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: shopsphere
  labels:
    app: postgresql
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgresql
  template:
    metadata:
      labels:
        app: postgresql
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
          name: postgres
        env:
        - name: POSTGRES_DB
          valueFrom:
            configMapKeyRef:
              name: postgres-config
              key: database-name
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
          subPath: postgres
        livenessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - $(POSTGRES_USER)
            - -d
            - $(POSTGRES_DB)
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - $(POSTGRES_USER)
            - -d
            - $(POSTGRES_DB)
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
      securityContext:
        fsGroup: 999  # postgres user
```

### PostgreSQL Service

```yaml
## postgres/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: shopsphere
  labels:
    app: postgresql
spec:
  type: ClusterIP
  ports:
  - port: 5432
    targetPort: 5432
    protocol: TCP
    name: postgres
  selector:
    app: postgresql
```

### ConfigMap

```yaml
## postgres/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-config
  namespace: shopsphere
data:
  database-name: "shopsphere_db"
  database-host: "postgres"
  database-port: "5432"
```

### Secret (Base64 encoded)

```yaml
## postgres/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: shopsphere
type: Opaque
data:
  username: cG9zdGdyZXM=  # postgres (base64)
  password: c2VjdXJlcGFzc3dvcmQxMjM=  # securepassword123 (base64)
```

**Generate base64:**

```bash
echo -n "postgres" | base64
echo -n "your-secure-password" | base64
```

## Verification

```bash
## Check PVC status
kubectl get pvc -n shopsphere
## Expected: STATUS = Bound

## Check pods
kubectl get pods -n shopsphere -l app=postgresql
## Expected: STATUS = Running

## Check logs
kubectl logs -n shopsphere deployment/postgres

## Test database connection
kubectl run postgres-client --rm --it --image=postgres:15-alpine --namespace=shopsphere -- bash

## Inside pod:
psql -h postgres -U postgres -d shopsphere_db

## Run query:
\dt
SELECT version();
```

**Expected Output:**

```
PostgreSQL 15.3 on x86_64-pc-linux-musl
(1 row)
```

## Screenshots

**EBS Volume for PostgreSQL:**

```
🔗 Console Path: EC2 → Volumes
✅ Volume ID: vol-0xxxx
✅ Size: 10 GiB
✅ Type: gp3
✅ State: In-use
✅ Attached to: <EKS node>
✅ Tags: kubernetes.io/created-for/pvc/name=postgres-pvc
```

## Troubleshooting

### Issue: PVC remains Pending

**Symptoms:**

```bash
kubectl describe pvc postgres-pvc
Events:
  Warning  ProvisioningFailed  failed to provision volume:
  rpc error: code = Internal desc = Could not attach volume
```

**Root Cause:**

```
❌ EBS CSI Driver not installed (See Phase 3)
```

**Fix:**

```bash
kubectl apply -k "github.com/kubernetes-sigs/aws-ebs-csi-driver/deploy/kubernetes/overlays/stable/"
```

### Issue: Pod CrashLoopBackOff

**Symptoms:**

```bash
kubectl get pods -n shopsphere
NAME         READY   STATUS             RESTARTS   AGE
postgres-0   0/1     CrashLoopBackOff   5          10m
```

**Root Causes:**

```
❌ Wrong permissions on data directory
❌ Invalid password encoding
❌ Insufficient memory
```

**Fix:**

```bash
## Check logs
kubectl logs -n shopsphere deployment/postgres

## Common fix: Ensure fsGroup is set
## Add to deployment spec:
securityContext:
  fsGroup: 999
```



```bash
## Describe pod for events
kubectl describe pod -n shopsphere -l app=postgresql

## Check persistent volume
kubectl get pv
kubectl describe pv <pv-name>

## Test database connectivity from backend pod
kubectl exec -it -n shopsphere <backend-pod> -- bash
nc -zv postgres 5432

## Check PostgreSQL logs
kubectl logs -n shopsphere deployment/postgres --tail=100
```

---

## Phase 05: 05-application-deployment

## Objective

Deploy the Flask backend API and Nginx frontend application with proper service discovery and inter-pod communication.

## Architecture

```
Frontend (Nginx)
├── Port 80
├── Serves static HTML/JS
└── Proxies API calls to backend

Backend (Flask)
├── Port 5000
├── REST API endpoints
│   ├── GET /api/products
│   ├── POST /api/products
│   └── GET /api/health
└── Connects to PostgreSQL

Services
├── frontend-service (ClusterIP)
└── backend-service (ClusterIP)
```

## Commands

```bash
## Create namespace if not exists
kubectl create namespace shopsphere

## Deploy backend
kubectl apply -f backend/deployment.yaml
kubectl apply -f backend/service.yaml

## Deploy frontend
kubectl apply -f frontend/deployment.yaml
kubectl apply -f frontend/service.yaml

## Verify all pods
kubectl get pods -n shopsphere

## Check services
kubectl get svc -n shopsphere
```

## Manifests

### Backend Deployment

```yaml
## backend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: shopsphere
  labels:
    app: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: public.ecr.aws/myrepo/shopsphere-backend:latest
        ports:
        - containerPort: 5000
          name: http
        env:
        - name: DATABASE_URL
          value: "postgresql://postgres:$(POSTGRES_PASSWORD)@postgres:5432/shopsphere_db"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: FLASK_ENV
          value: "production"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 5000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Backend Service

```yaml
## backend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: shopsphere
  labels:
    app: backend
spec:
  type: ClusterIP
  ports:
  - port: 5000
    targetPort: 5000
    protocol: TCP
    name: http
  selector:
    app: backend
```

### Frontend Deployment

```yaml
## frontend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: shopsphere
  labels:
    app: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: public.ecr.aws/myrepo/shopsphere-frontend:latest
        ports:
        - containerPort: 80
          name: http
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Frontend Service

```yaml
## frontend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: shopsphere
  labels:
    app: frontend
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
    name: http
  selector:
    app: frontend
```

## Verification

```bash
## Check all resources
kubectl get all -n shopsphere

## Expected output:
## NAME                           READY   STATUS    RESTARTS   AGE
## pod/backend-6d8f9b7c4-abc12    1/1     Running   0          5m
## pod/backend-6d8f9b7c4-def34    1/1     Running   0          5m
## pod/frontend-5c7d8e9f0-ghi56   1/1     Running   0          5m
## pod/frontend-5c7d8e9f0-jkl78   1/1     Running   0          5m
## pod/postgres-xxxxx             1/1     Running   0          10m
#
## NAME              TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
## service/backend   ClusterIP   10.100.50.100   <none>        5000/TCP   5m
## service/frontend  ClusterIP   10.100.60.110   <none>        80/TCP     5m
## service/postgres  ClusterIP   10.100.70.120   <none>        5432/TCP   10m

## Test backend API
kubectl run test --rm -it --image=curlimages/curl --namespace=shopsphere -- bash
curl <http://backend:5000/api/health>

## Expected:
## {"status": "healthy", "database": "connected"}

## Test from outside cluster (after ingress setup)
curl http://<alb-dns>/api/products
```

## Application architecture

```
┌─────────────────────────────────────────────────┐
│              Application Load Balancer           │
│              (internet-facing)                   │
└─────────────────┬───────────────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
    ┌────▼────┐      ┌────▼────┐
    │         │      │         │
    │  /      │      │ /api/*  │
    │         │      │         │
    └────┬────┘      └────┬────┘
         │                 │
    ┌────▼────┐      ┌────▼────┐
    │ Frontend│      │ Backend │
    │  Nginx  │      │  Flask  │
    │  :80    │      │  :5000  │
    └─────────      └────────┘
                          │
                    ┌─────▼─────┐
                    │ PostgreSQL│
                    │   :5432   │
                    └───────────┘
```

## Troubleshooting

### Issue: Backend cannot connect to database

**Symptoms:**

```bash
kubectl logs -n shopsphere deployment/backend

## Error:
sqlalchemy.exc.OperationalError: (psycopg2.OperationalError)
could not translate host name "postgres" to address: Name or service not known
```

**Root Causes:**

```
❌ PostgreSQL service not running
❌ Wrong service name in DATABASE_URL
❌ Network policy blocking traffic
```

**Fix:**

```bash
## Verify PostgreSQL is running
kubectl get pods -n shopsphere -l app=postgresql

## Test DNS resolution
kubectl run dns-test --rm -it --image=busybox --namespace=shopsphere -- nslookup postgres

## Check service exists
kubectl get svc -n shopsphere postgres
```

### Issue: Frontend returns 502 Bad Gateway

**Symptoms:**

```bash
curl <http://frontend/api/products>
## 502 Bad Gateway
```

**Root Cause:**

```
❌ Backend service not found
❌ Wrong proxy configuration in Nginx
```

**Fix:**

```yaml
## Ensure Nginx config has correct upstream
## nginx.conf:
location /api/ {
    proxy_pass <http://backend:5000>;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```



```bash
## Check pod logs
kubectl logs -n shopsphere deployment/backend --tail=50
kubectl logs -n shopsphere deployment/frontend --tail=50

## Describe pods for events
kubectl describe pod -n shopsphere -l app=backend

## Test connectivity between pods
kubectl exec -it -n shopsphere deployment/frontend -- bash
curl -v <http://backend:5000/api/health>

## Check resource usage
kubectl top pods -n shopsphere

## Verify environment variables
kubectl exec -it -n shopsphere deployment/backend -- env | grep DATABASE
```

---

## Phase 06: 06-configmaps-secrets

## Objective

Externalize application configuration using ConfigMaps and securely manage sensitive data using Kubernetes Secrets.

## Architecture

```
ConfigMap (Non-sensitive)
├── database-name
├── database-host
├── database-port
├── app-settings
└── feature-flags

Secret (Sensitive - Base64 encoded)
├── username
├── password
├── api-keys
└── certificates

Injected into Pods as:
├── Environment Variables
└── Volume Mounts
```

## Commands

### Create ConfigMap

```bash
## From literal values
kubectl create configmap app-config \
  --from-literal=database-name=shopsphere_db \
  --from-literal=database-host=postgres \
  --from-literal=database-port=5432 \
  --from-literal=log-level=info \
  --namespace=shopsphere

## From file
kubectl create configmap nginx-config \
  --from-file=nginx.conf=./config/nginx.conf \
  --namespace=shopsphere

## From env file
kubectl create configmap app-env \
  --from-env-file=.env \
  --namespace=shopsphere
```

### Create Secret

```bash
## From literal values
kubectl create secret generic postgres-secret \
  --from-literal=username=postgres \
  --from-literal=password='SecureP@ssw0rd123!' \
  --namespace=shopsphere

## From file
kubectl create secret generic tls-secret \
  --from-file=tls.crt=./certs/tls.crt \
  --from-file=tls.key=./certs/tls.key \
  --type=kubernetes.io/tls \
  --namespace=shopsphere

## From env file
kubectl create secret generic app-secrets \
  --from-env-file=.env.secrets \
  --namespace=shopsphere
```

### View Secrets (Decoded)

```bash
## List secrets
kubectl get secrets -n shopsphere

## Get secret value (base64 encoded)
kubectl get secret postgres-secret -n shopsphere -o jsonpath='{.data.password}'

## Decode secret
kubectl get secret postgres-secret -n shopsphere -o jsonpath='{.data.password}' | base64 --decode

## Edit secret
kubectl edit secret postgres-secret -n shopsphere
```

## Manifests

### Complete ConfigMap

```yaml
## configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: shopsphere
data:
  # Database configuration
  database-name: "shopsphere_db"
  database-host: "postgres"
  database-port: "5432"

  # Application settings
  app-name: "ShopSphere"
  log-level: "info"
  max-connections: "100"

  # Feature flags
  enable-caching: "true"
  enable-metrics: "true"

  # Nginx configuration (multi-line)
  nginx.conf: |
    server {
        listen 80;
        server_name localhost;

        location / {
            root /usr/share/nginx/html;
            index index.html;
        }

        location /api/ {
            proxy_pass <http://backend:5000>;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
```

### Complete Secret

```yaml
## secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: shopsphere
type: Opaque
stringData:  # stringData allows plain text (auto base64 encoded)
  database-url: "postgresql://postgres:SecureP@ssw0rd123!@postgres:5432/shopsphere_db"
  api-key: "sk-prod-1234567890abcdef"
  jwt-secret: "super-secret-jwt-key-change-in-production"
data:  # data requires base64 encoding
  password: U2VjdXJlUEBzc3cwcmQxMjMh  # SecureP@ssw0rd123!
```

### Using ConfigMap in Deployment

```yaml
## deployment-with-configmap.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: shopsphere
spec:
  template:
    spec:
      containers:
      - name: backend
        image: shopsphere-backend:latest

        # Method 1: Environment variables from ConfigMap
        env:
        - name: DATABASE_HOST
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: database-host
        - name: DATABASE_PORT
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: database-port

        # Method 2: All ConfigMap keys as env vars
        envFrom:
        - configMapRef:
            name: app-config

        # Method 3: Volume mount
        volumeMounts:
        - name: config-volume
          mountPath: /etc/config
          readOnly: true

      volumes:
      - name: config-volume
        configMap:
          name: app-config
          items:
          - key: nginx.conf
            path: nginx.conf
```

### Using Secret in Deployment

```yaml
## deployment-with-secret.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: shopsphere
spec:
  template:
    spec:
      containers:
      - name: backend
        image: shopsphere-backend:latest

        # Environment variables from Secret
        env:
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password

        # All secret keys as env vars
        envFrom:
        - secretRef:
            name: app-secrets

        # Volume mount for sensitive files
        volumeMounts:
        - name: secret-volume
          mountPath: /etc/secrets
          readOnly: true

      volumes:
      - name: secret-volume
        secret:
          secretName: app-secrets
          defaultMode: 0400  # Read-only for owner
```

## Verification

```bash
## List ConfigMaps
kubectl get configmap -n shopsphere

## Describe ConfigMap
kubectl describe configmap app-config -n shopsphere

## List Secrets
kubectl get secret -n shopsphere

## Verify ConfigMap mounted in pod
kubectl exec -it -n shopsphere deployment/backend -- cat /etc/config/nginx.conf

## Verify environment variables
kubectl exec -it -n shopsphere deployment/backend -- env | grep DATABASE

## Verify Secret mounted
kubectl exec -it -n shopsphere deployment/backend -- ls -la /etc/secrets
kubectl exec -it -n shopsphere deployment/backend -- cat /etc/secrets/password
```

## Screenshots

**Secrets Manager Integration (Optional):**

```
🔗 Console Path: Secrets Manager → Secrets
✅ Create external secret
✅ Sync with Kubernetes Secret
✅ Automatic rotation enabled
```

## Troubleshooting

### Issue: CreateContainerConfigError

**Symptoms:**

```bash
kubectl describe pod -n shopsphere deployment/backend
Events:
  Warning  Failed  Error: configmap "app-config" not found
  Warning  Failed  Error: secret "postgres-secret" not found
```

**Root Cause:**

```
❌ ConfigMap/Secret not created before deployment
❌ Wrong namespace
❌ Typo in name reference
```

**Fix:**

```bash
## Create missing resources
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml

## Verify they exist
kubectl get configmap,secret -n shopsphere
```

### Issue: Permission denied reading secret

**Symptoms:**

```bash
kubectl exec -it -n shopsphere deployment/backend -- cat /etc/secrets/password
cat: /etc/secrets/password: Permission denied
```

**Root Cause:**

```
❌ Wrong defaultMode on secret volume
```

**Fix:**

```yaml
volumes:
- name: secret-volume
  secret:
    secretName: app-secrets
    defaultMode: 0400  # Read-only for owner (4 = read for owner)
```



```bash
## Check if ConfigMap exists
kubectl get configmap app-config -n shopsphere -o yaml

## Check if Secret exists
kubectl get secret postgres-secret -n shopsphere -o yaml

## Verify pod can resolve ConfigMap keys
kubectl exec -it -n shopsphere deployment/backend -- printenv | grep DATABASE

## Check volume mounts
kubectl describe pod -n shopsphere deployment/backend | grep -A 5 Mounts

## Test secret decoding
kubectl get secret postgres-secret -n shopsphere -o json | jq '.data | map_values(@base64d)'
```

---

## Phase 07: 07-backend-database-integration

## Objective

Implement a Flask REST API that connects to PostgreSQL, performs CRUD operations on products, and includes proper error handling and health checks.

## Architecture

```
Flask Application
├── app.py (Main application)
├── models.py (SQLAlchemy models)
├── config.py (Configuration)
└── requirements.txt

Database Schema
└── products
    ├── id (Serial, Primary Key)
    ├── name (VARCHAR 100)
    ├── description (TEXT)
    ├── price (DECIMAL 10,2)
    ├── stock (INTEGER)
    └── created_at (TIMESTAMP)

API Endpoints
├── GET    /api/health      - Health check
├── GET    /api/products    - List all products
├── GET    /api/products/:id - Get product by ID
├── POST   /api/products    - Create product
├── PUT    /api/products/:id - Update product
└── DELETE /api/products/:id - Delete product
```

## Commands

### Build and Push Docker Image

```bash
## Build image
docker build -t shopsphere-backend:latest ./backend

## Tag for ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

docker tag shopsphere-backend:latest \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/shopsphere-backend:latest

## Push to ECR
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/shopsphere-backend:latest
```

### Test API Locally

```bash
## Run PostgreSQL locally
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=shopsphere_db \
  -p 5432:5432 \
  postgres:15-alpine

## Run backend
cd backend
pip install -r requirements.txt
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shopsphere_db"
python app.py

## Test endpoints
curl <http://localhost:5000/api/health>
curl <http://localhost:5000/api/products>
curl -X POST <http://localhost:5000/api/products> \
  -H "Content-Type: application/json" \
  -d '{"name":"Laptop","price":999.99,"stock":10}'
```

## Manifests

### Application source (`app.py`)

```python
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
import os

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL',
    'postgresql://postgres:postgres@postgres:5432/shopsphere_db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class Product(db.Model):
    __tablename__ = 'products'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    stock = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'price': float(self.price),
            'stock': self.stock,
            'created_at': self.created_at.isoformat(),
        }

with app.app_context():
    db.create_all()

@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        db.session.execute('SELECT 1')
        return jsonify({'status': 'healthy', 'database': 'connected'}), 200
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 503

@app.route('/api/products', methods=['GET'])
def get_products():
    products = Product.query.all()
    return jsonify({'products': [p.to_dict() for p in products], 'count': len(products)}), 200

@app.route('/api/products', methods=['POST'])
def create_product():
    data = request.get_json()
    product = Product(
        name=data['name'],
        description=data.get('description', ''),
        price=data['price'],
        stock=data.get('stock', 0),
    )
    db.session.add(product)
    db.session.commit()
    return jsonify(product.to_dict()), 201

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
```

### Requirements (`requirements.txt`)

```text
Flask==2.3.3
Flask-SQLAlchemy==3.0.5
Flask-CORS==4.0.0
psycopg2-binary==2.9.7
python-dotenv==1.0.0
gunicorn==21.2.0
```

### Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "app:app"]
```

### Database initialization (`init.sql`)

```sql
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    stock INTEGER DEFAULT 0 CHECK (stock >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products (name, description, price, stock) VALUES
('Laptop', 'High-performance laptop', 999.99, 10),
('Mouse', 'Wireless mouse', 29.99, 50),
('Keyboard', 'Mechanical keyboard', 79.99, 30)
ON CONFLICT DO NOTHING;
```

### Backend deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: shopsphere
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
        - name: backend
          image: <account>.dkr.ecr.us-east-1.amazonaws.com/shopsphere-backend:latest
          ports:
            - containerPort: 5000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
```

## Verification

```bash
## Check backend logs
kubectl logs -n shopsphere deployment/backend --tail=50

## Expected output:
## * Serving Flask app 'app'
## * Running on <http://0.0.0.0:5000>
## 127.0.0.1 - - [07/Jun/2026 10:00:00] "GET /api/health HTTP/1.1" 200

## Test health endpoint
kubectl run test --rm -it --image=curlimages/curl --namespace=shopsphere -- \
  curl <http://backend:5000/api/health>

## Expected:
## {"database":"connected","status":"healthy","timestamp":"2026-06-07T10:00:00"}

## Test create product
kubectl run test --rm -it --image=curlimages/curl --namespace=shopsphere -- bash
curl -X POST <http://backend:5000/api/products> \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Product","price":99.99,"stock":5}'

## Expected:
## {"id":1,"name":"Test Product","description":"","price":99.99,"stock":5,"created_at":"..."}

## Test get products
curl <http://backend:5000/api/products>

## Expected:
## {"products":[{"id":1,"name":"Test Product",...}],"count":1}

## Connect to database directly
kubectl run postgres-client --rm -it --image=postgres:15-alpine --namespace=shopsphere -- \
  psql -h postgres -U postgres -d shopsphere_db -c "SELECT * FROM products;"
```


## Troubleshooting

### Issue: CrashLoopBackOff

**Symptoms:**

```bash
kubectl get pods -n shopsphere
NAME       READY   STATUS             RESTARTS   AGE
backend    0/1     CrashLoopBackOff   5          10m

kubectl logs -n shopsphere deployment/backend
sqlalchemy.exc.OperationalError: could not connect to server
```

**Root Causes:**

```
❌ Database not running
❌ Wrong DATABASE_URL
❌ Missing environment variables
❌ Python syntax errors
❌ Missing dependencies
```

**Fix:**

```bash
## Check environment variables
kubectl describe pod -n shopsphere deployment/backend | grep -A 10 Environment

## Verify database connectivity
kubectl exec -it -n shopsphere deployment/backend -- \
  python -c "import psycopg2; psycopg2.connect('postgresql://postgres:password@postgres:5432/db')"

## Check for Python errors
kubectl logs -n shopsphere deployment/backend --previous

## Test database connection
kubectl run test --rm -it --image=postgres:15-alpine --namespace=shopsphere -- \
  psql -h postgres -U postgres -d shopsphere_db -c "SELECT 1"
```

### Issue: ModuleNotFoundError

**Symptoms:**

```bash
kubectl logs -n shopsphere deployment/backend
ModuleNotFoundError: No module named 'flask'
```

**Root Cause:**

```
❌ requirements.txt not copied in Dockerfile
❌ pip install failed
```

**Fix:**

```docker
## Ensure Dockerfile has:
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
```



```bash
## Check database tables
kubectl exec -it -n shopsphere deployment/postgres -- \
  psql -U postgres -d shopsphere_db -c "\dt"

## Check database connection from backend
kubectl exec -it -n shopsphere deployment/backend -- \
  python -c "from app import db; print(db.engine.connect())"

## View database logs
kubectl logs -n shopsphere deployment/postgres --tail=50

## Check for migration issues
kubectl exec -it -n shopsphere deployment/backend -- \
  python -c "from app import db, Product; db.create_all(); print('Tables created')"

## Monitor API requests
kubectl logs -n shopsphere deployment/backend -f | grep "GET\|POST"
```

---

## Phase 08: 08-aws-load-balancer-controller

## Objective

Install and configure the AWS Load Balancer Controller to automatically provision Application Load Balancers (ALB) for Kubernetes Ingress resources.

## Architecture

```
Kubernetes Cluster
├── AWS Load Balancer Controller
│   ├── Deployment (kube-system)
│   ├── ServiceAccount (IRSA)
│   └── IAM Role (with permissions)
│
└── Ingress Resources
    ↓
Controller watches for Ingress
    ↓
Creates ALB via AWS API
    ↓
Configures Target Groups
    ↓
Routes traffic to Pods
```

## Commands

### Step 1: Associate OIDC Provider

```bash
eksctl utils associate-iam-oidc-provider \
  --cluster shopsphere \
  --region us-east-1 \
  --approve
```

**Verify:**

```bash
aws iam list-open-id-connect-providers | grep shopsphere
## Expected: arn:aws:iam::<account-id>:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/XXXXX
```

### Step 2: Create IAM Policy

```bash
## Download policy
curl -O <https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json>

## Create IAM policy
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json

## Get policy ARN
POLICY_ARN=$(aws iam list-policies \
  --query "Policies[?PolicyName=='AWSLoadBalancerControllerIAMPolicy'].Arn" \
  --output text)

echo $POLICY_ARN
```

### Step 3: Create IAM Service Account

```bash
eksctl create iamserviceaccount \
  --cluster=shopsphere \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=$POLICY_ARN \
  --override-existing-serviceaccounts \
  --approve
```

**Verify:**

```bash
kubectl get sa aws-load-balancer-controller -n kube-system -o yaml | grep annotations
## Expected: eks.amazonaws.com/role-arn: arn:aws:iam::...
```

### Step 4: Install Controller via Helm

```bash
## Add Helm repo
helm repo add eks <https://aws.github.io/eks-charts>
helm repo update

## Get VPC ID
VPC_ID=$(aws eks describe-cluster \
  --name shopsphere \
  --query "cluster.resourcesVpcConfig.vpcId" \
  --output text)

echo "VPC ID: $VPC_ID"

## Install controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=shopsphere \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=us-east-1 \
  --set vpcId=$VPC_ID \
  --set replicaCount=2 \
  --set resources.requests.cpu=100m \
  --set resources.requests.memory=128Mi
```

## Manifests

### Alternative: Manual Installation (without Helm)

```yaml
## aws-load-balancer-controller.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: aws-load-balancer-controller
  namespace: kube-system
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::<account-id>:role/AmazonEKSLoadBalancerControllerRole
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aws-load-balancer-controller
  namespace: kube-system
  labels:
    app.kubernetes.io/name: aws-load-balancer-controller
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: aws-load-balancer-controller
  template:
    metadata:
      labels:
        app.kubernetes.io/name: aws-load-balancer-controller
    spec:
      serviceAccountName: aws-load-balancer-controller
      containers:
      - name: controller
        image: public.ecr.aws/eks/aws-load-balancer-controller:v2.5.4
        args:
        - --cluster-name=shopsphere
        - --ingress-class=alb
        - --aws-vpc-id=<vpc-id>
        - --aws-region=us-east-1
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
```

## Verification

```bash
## Check controller pods
kubectl get pods -n kube-system | grep aws-load-balancer-controller

## Expected:
## aws-load-balancer-controller-6d8f9b7c4-abc12   1/1     Running   0   5m
## aws-load-balancer-controller-6d8f9b7c4-def34   1/1     Running   0   5m

## Check logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller --tail=20

## Expected:
## {"level":"info","ts":1686139200.123,"msg":"version","GitVersion":"v2.5.4"}
## {"level":"info","ts":1686139200.456,"msg":"starting manager"}

## Verify webhook is ready
kubectl get validatingwebhookconfiguration ingress-class-validator -o yaml

## Test by creating an Ingress (see Phase 9)
```

## Screenshots

**EC2 Load Balancers:**

```
🔗 Console Path: EC2 → Load Balancers
✅ After creating Ingress, ALB appears here
✅ Type: Application
✅ Scheme: internet-facing
✅ State: active
```

**Target Groups:**

```
🔗 Console Path: EC2 → Target Groups
✅ Automatically created for each Ingress
✅ Type: IP
✅ Protocol: HTTP
✅ Health checks configured
```

## Troubleshooting

### Issue: AccessDenied errors in logs

**Symptoms:**

```bash
kubectl logs -n kube-system deployment/aws-load-balancer-controller
{"level":"error","ts":1686139200,"msg":"failed to describe subnets",
"error":"AccessDenied: User: arn:aws:sts::123456789012:assumed-role/...
is not authorized to perform: ec2:DescribeSubnets"}
```

**Root Causes:**

```
❌ IRSA not configured correctly
❌ Missing IAM policy
❌ Wrong service account annotation
```

**Fix:**

```bash
## Verify service account has correct annotation
kubectl get sa aws-load-balancer-controller -n kube-system -o yaml

## Verify IAM role trust relationship
aws iam get-role \
  --role-name eksctl-shopsphere-addon-iamserviceaccount-kube-system-aws-load-balancer-controller

## Should include:
## "Condition": {
##   "StringEquals": {
##     "oidc.eks.us-east-1.amazonaws.com/id/XXXXX:sub": "system:serviceaccount:kube-system:aws-load-balancer-controller"
##   }
## }

## Re-create service account if needed
eksctl delete iamserviceaccount \
  --cluster=shopsphere \
  --namespace=kube-system \
  --name=aws-load-balancer-controller

eksctl create iamserviceaccount \
  --cluster=shopsphere \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=$POLICY_ARN \
  --override-existing-serviceaccounts \
  --approve
```

### Issue: No subnets found

**Symptoms:**

```bash
kubectl logs -n kube-system deployment/aws-load-balancer-controller
{"level":"error","msg":"failed to build load balancer",
"error":"couldn't find any subnets"}
```

**Root Cause:**

```
❌ Subnets not tagged correctly
```

**Fix:**

```bash
## Tag public subnets for internet-facing ALBs
aws ec2 create-tags \
  --resources subnet-xxxxx subnet-yyyyy \
  --tags Key=kubernetes.io/cluster/shopsphere,Value=shared \
  Key=kubernetes.io/role/elb,Value=1

## Tag private subnets for internal ALBs
aws ec2 create-tags \
  --resources subnet-zzzzz subnet-aaaaa \
  --tags Key=kubernetes.io/cluster/shopsphere,Value=shared \
  Key=kubernetes.io/role/internal-elb,Value=1

## Verify tags
aws ec2 describe-subnets \
  --filters "Name=tag:kubernetes.io/cluster/shopsphere,Values=shared"
```



```bash
## Check controller events
kubectl get events -n kube-system --sort-by='.lastTimestamp' | grep -i "load.balancer"

## Describe ingress for events
kubectl describe ingress <ingress-name> -n shopsphere

## Check AWS API calls (CloudTrail)
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=CreateLoadBalancer \
  --max-results 5

## Verify VPC configuration
aws ec2 describe-vpcs --vpc-ids $VPC_ID
aws ec2 describe-internet-gateways \
  --filters "Name=attachment.vpc-id,Values=$VPC_ID"

## Check subnet tags
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[*].[SubnetId,Tags]"
```

---

## Phase 09: 09-ingress-configuration

## Objective

Create Kubernetes Ingress resources to route external traffic to frontend and backend services through a single Application Load Balancer.

## Architecture

```
Internet
    ↓
Application Load Balancer (ALB)
├── Listener: HTTP (80)
│   └── Rules:
│       ├── Path: /api/* → backend:5000
│       ├── Path: /grafana → grafana:3000
│       └── Path: /* → frontend:80
│
└── Listener: HTTPS (443) [Optional with cert-manager]
    └── Same rules with SSL termination

Target Groups
├── tg-frontend (IP targets)
├── tg-backend (IP targets)
└── tg-grafana (IP targets)
```

## Commands

### Create Ingress

```bash
## Apply Ingress configuration
kubectl apply -f ingress.yaml

## Check Ingress status
kubectl get ingress -n shopsphere

## Wait for ALB to be created (2-5 minutes)
kubectl get ingress -n shopsphere -w

## Get ALB DNS name
ALB_DNS=$(kubectl get ingress shopsphere-ingress -n shopsphere \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "ALB DNS: $ALB_DNS"

## Test endpoints
curl http://$ALB_DNS/api/health
curl http://$ALB_DNS/api/products
curl http://$ALB_DNS/
```

### Test with kubectl

```bash
## Port-forward for local testing (alternative)
kubectl port-forward -n shopsphere svc/frontend 8080:80
curl <http://localhost:8080>

## Test backend directly
kubectl port-forward -n shopsphere svc/backend 5000:5000
curl <http://localhost:5000/api/health>
```

## Manifests

### Basic ingress (path-based)

Use this as the default ShopSphere ingress — routes `/api` to the backend and `/` to the frontend.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopsphere-ingress
  namespace: shopsphere
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}]'
    alb.ingress.kubernetes.io/healthcheck-path: /api/health
spec:
  rules:
  - http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 5000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

### Multi-host ingress (HTTPS)

Split frontend and API by hostname. Replace the certificate ARN with your ACM certificate.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopsphere-ingress
  namespace: shopsphere
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:123456789012:certificate/xxxxx
    alb.ingress.kubernetes.io/group.name: shopsphere
spec:
  rules:
  - host: api.shopsphere.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 5000
  - host: shopsphere.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

### Ingress with Cognito authentication

Uncomment the auth annotations to protect the frontend with Amazon Cognito.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopsphere-ingress
  namespace: shopsphere
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    # alb.ingress.kubernetes.io/auth-type: cognito
    # alb.ingress.kubernetes.io/auth-idp-cognito: '{"UserPoolArn":"arn:aws:cognito-idp:...","UserPoolClientId":"xxxx","UserPoolDomain":"auth.example.com"}'
spec:
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

### Grafana ingress (shared ALB)

Expose Grafana on `/grafana` using the same ALB group as the main ingress.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana-ingress
  namespace: monitoring
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/group.name: shopsphere
    alb.ingress.kubernetes.io/group.order: '2'
spec:
  rules:
  - http:
      paths:
      - path: /grafana
        pathType: Prefix
        backend:
          service:
            name: monitoring-grafana
            port:
              number: 80
```

### Custom single-service ingress

Minimal pattern for a single backend service on its own ALB.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: custom-ingress
  namespace: custom-app
  annotations:
    alb.ingress.kubernetes.io/load-balancer-name: custom-alb
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
            name: custom-svc
            port:
              number: 8080
```

## Verification

```bash
## Check Ingress resource
kubectl get ingress -n shopsphere

## Expected output:
## NAME                 CLASS   HOSTS   ADDRESS                                               PORTS   AGE
## shopsphere-ingress   alb     *       k8s-shops-shopspher-xxxxx-1234567890.us-east-1.elb.amazonaws.com   80      5m

## Describe Ingress for events
kubectl describe ingress shopsphere-ingress -n shopsphere

## Expected events:
## Normal   Created             Ingress   Ingress shopsphere/shopsphere-ingress
## Normal   Created             Ingress   LoadBalancer created

## Check ALB in AWS
ALB_DNS=$(kubectl get ingress shopsphere-ingress -n shopsphere \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "Testing ALB: $ALB_DNS"

## Test all endpoints
echo "=== Frontend ==="
curl -I http://$ALB_DNS/

echo "=== Backend API ==="
curl http://$ALB_DNS/api/health

echo "=== Products ==="
curl http://$ALB_DNS/api/products

## Check target groups
aws elbv2 describe-target-groups \
  --query "TargetGroups[?contains(TargetGroupName, 'k8s-shops')].TargetGroupName"

## Check ALB listeners
aws elbv2 describe-listeners \
  --load-balancer-arn $(aws elbv2 describe-load-balancers \
    --query "LoadBalancers[?DNSName=='$ALB_DNS'].LoadBalancerArn" --output text)
```


## Troubleshooting

### Issue: Ingress ADDRESS is empty

**Symptoms:**

```bash
kubectl get ingress -n shopsphere
NAME                 CLASS   HOSTS   ADDRESS   PORTS   AGE
shopsphere-ingress   alb     *                 80      10m

kubectl describe ingress shopsphere-ingress -n shopsphere
Events:
  Warning  FailedDeployModel  Failed deploy model due to
  ListenerNotFound: Listener 'arn:aws:elasticloadbalancing:...' not found
```

**Root Causes:**

```
❌ AWS Load Balancer Controller not running
❌ Missing subnet tags
❌ IAM permissions issue
```

**Fix:**

```bash
## Check controller is running
kubectl get pods -n kube-system | grep aws-load-balancer-controller

## Check controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller --tail=50

## Verify subnet tags (see Phase 8)
aws ec2 describe-subnets --filters "Name=tag:kubernetes.io/role/elb,Values=1"
```

### Issue: 503 Service Unavailable

**Symptoms:**

```bash
curl http://$ALB_DNS/api/health
## 503 Service Temporarily Unavailable
```

**Root Causes:**

```
❌ Target group health checks failing
❌ Wrong service port
❌ Pods not ready
```

**Fix:**

```bash
## Check target group health
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn>

## Expected:
## "State": "healthy"

## If unhealthy, check:
kubectl get pods -n shopsphere
kubectl describe pod -n shopsphere <pod-name>

## Verify service endpoints
kubectl get endpoints -n shopsphere

## Expected:
## NAME       ENDPOINTS         AGE
## backend    10.0.1.10:5000,10.0.1.11:5000   10m

## Check health check path
kubectl describe ingress shopsphere-ingress -n shopsphere | grep healthcheck

## Test health endpoint directly
kubectl run test --rm -it --image=curlimages/curl --namespace=shopsphere -- \
  curl <http://backend:5000/api/health>
```

### Issue: 404 Not Found

**Symptoms:**

```bash
curl http://$ALB_DNS/api/products
## 404 Not Found
```

**Root Cause:**

```
❌ Path not matching
❌ Service not found
```

**Fix:**

```bash
## Check pathType
kubectl get ingress shopsphere-ingress -n shopsphere -o yaml | grep pathType

## Use Prefix for /api/* matching
pathType: Prefix

## Verify service exists
kubectl get svc -n shopsphere backend

## Test service directly
kubectl run test --rm -it --image=curlimages/curl --namespace=shopsphere -- \
  curl <http://backend:5000/api/products>
```



```bash
## Check Ingress events
kubectl get events -n shopsphere --sort-by='.lastTimestamp' | grep -i ingress

## Check ALB logs (enable access logs first)
aws s3 ls s3://<alb-access-logs-bucket>/

## Describe target groups
aws elbv2 describe-target-groups \
  --query "TargetGroups[?contains(TargetGroupName, 'k8s-shops')].[TargetGroupName,HealthCheckPath,HealthCheckPort]"

## Check target health
TARGET_GROUP_ARN=$(aws elbv2 describe-target-groups \
  --query "TargetGroups[?contains(TargetGroupName, 'backend')].TargetGroupArn" --output text)

aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN

## Test from within cluster
kubectl run debug --rm -it --image=nicolaka/netshoot --namespace=shopsphere -- bash
curl -v <http://backend:5000/api/health>

## Check AWS WAF logs (if enabled)
aws wafv2 get-web-acl-resource --scope REGIONAL --resource-arn <alb-arn>
```

---

## Phase 10: 10-frontend-application

## Objective

Deploy an Nginx-based frontend that serves static HTML/JS files and acts as a reverse proxy to route `/api/*` requests to the Flask backend service.

## Architecture

```
Browser
  ↓
Nginx (Frontend Pod)
  ├── / → Serves static files (index.html, CSS, JS)
  └── /api/* → Proxies to <http://backend:5000>
```

## Commands

### Build and Push Frontend Image

```bash
## Build the Docker image
docker build -t shopsphere-frontend:latest ./frontend

## Authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

## Tag and push
docker tag shopsphere-frontend:latest \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/shopsphere-frontend:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/shopsphere-frontend:latest
```

### Deploy to EKS

```bash
## Apply ConfigMap, Deployment, and Service
kubectl apply -f frontend/configmap.yaml
kubectl apply -f frontend/deployment.yaml
kubectl apply -f frontend/service.yaml

## Verify
kubectl get pods -n shopsphere -l app=frontend
```

## Manifests

### Nginx Configuration (ConfigMap)

```yaml
## frontend/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
  namespace: shopsphere
data:
  default.conf: |
    server {
        listen 80;
        server_name localhost;

        # Serve static frontend files
        location / {
            root   /usr/share/nginx/html;
            index  index.html index.htm;
            try_files $uri $uri/ /index.html; # For SPA routing
        }

        # Reverse proxy to backend API
        location /api/ {
            proxy_pass <http://backend:5000>;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
```

### Frontend Deployment

```yaml
## frontend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: shopsphere
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/shopsphere-frontend:latest
        ports:
        - containerPort: 80
        volumeMounts:
        - name: nginx-config
          mountPath: /etc/nginx/conf.d/default.conf
          subPath: default.conf
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "200m"
      volumes:
      - name: nginx-config
        configMap:
          name: nginx-config
```

## Verification

```bash
## Test frontend through the ALB
curl http://<ALB-DNS>/
## Expected: HTML content of your frontend

## Test API proxy through frontend
curl http://<ALB-DNS>/api/products
## Expected: JSON array of products from the database
```

## Screenshots

> 

## Troubleshooting

### Issue: 502 Bad Gateway on `/api/*`

**Cause:** Nginx cannot resolve or connect to the `backend` service.
**Fix:** Ensure the backend service is named exactly `backend` and is in the same namespace. Check Nginx logs:

```bash
kubectl logs -n shopsphere deployment/frontend
## Look for: "host not found in upstream "backend:5000""
```

### Issue: CORS Errors in Browser Console

**Cause:** The browser blocks requests from the frontend domain to the backend.
**Fix:** Since Nginx is proxying the requests, the browser only sees one origin (the ALB). If you are calling the backend directly from JS instead of using relative URLs (`/api/...`), enable CORS in Flask:

```python
from flask_cors import CORS
CORS(app)
```

---

## Phase 11: 11-metrics-server

## Objective

Install the Kubernetes Metrics Server to collect CPU and memory metrics from pods and nodes. This is a strict prerequisite for Horizontal Pod Autoscaling (HPA).

## Architecture

```
Kubelet (on each node)
  ↓ (exposes /metrics/resource)
Metrics Server (Aggregation Layer)
  ↓ (exposes metrics.k8s.io API)
kubectl top / HPA Controller
```

## Commands

### Install Metrics Server

*Note: EKS does not install this by default.*

```bash
kubectl apply -f <https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml>
```

### Verify Installation

```bash
## Wait ~30 seconds for it to collect initial data
kubectl get pods -n kube-system | grep metrics-server

## Test node metrics
kubectl top nodes

## Test pod metrics
kubectl top pods -n shopsphere
```

## Verification

**Expected Output:**

```
NAME                         CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
ip-10-0-1-100.ec2.internal   150m         7%     1024Mi          26%
ip-10-0-2-100.ec2.internal   120m         6%     950Mi           24%
```

## Troubleshooting

### Issue: `kubectl top` returns `<unknown>`

**Cause:** The Metrics Server hasn't collected data yet, or the API service is not registering.
**Fix:**

```bash
## Check if metrics-server is crashing
kubectl logs -n kube-system deployment/metrics-server

## If you see TLS certificate errors (common in some local clusters, less in EKS),
## you may need to add the --kubelet-insecure-tls flag to the deployment args.
```

---

## Phase 12: 12-horizontal-pod-autoscaler

## Objective

Configure the backend deployment to automatically scale from 1 to 5 replicas based on CPU utilization.

## Architecture

```
HPA Controller
  ↓ (queries every 15s)
Metrics Server
  ↓ (returns current CPU usage)
HPA calculates desired replicas
  ↓
Updates Deployment.replicas
```

## Commands

### Apply HPA and Load Generator

```bash
kubectl apply -f backend/hpa.yaml
kubectl apply -f utils/load-generator.yaml
```

### Watch Scaling in Real-Time

```bash
## Watch HPA metrics
kubectl get hpa -n shopsphere -w

## Watch pods being created
kubectl get pods -n shopsphere -w
```

## Manifests

### Horizontal Pod Autoscaler

```yaml
## backend/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: shopsphere
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 1
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50 # Target 50% CPU usage
```

### Load Generator Pod

```yaml
## utils/load-generator.yaml
apiVersion: v1
kind: Pod
metadata:
  name: load-generator
  namespace: shopsphere
spec:
  containers:
  - name: busybox
    image: busybox
    command: ["sh", "-c", "while true; do wget -q -O- <http://backend/api/products>; done"]
```

## Verification

```bash
## After a few minutes of load generation, you should see:
kubectl get hpa -n shopsphere
NAME          REFERENCE             TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
backend-hpa   Deployment/backend    75%/50%   1         5         3          5m
```

## Troubleshooting

### Issue: HPA shows `0%/50%` or `<unknown>` and never scales

**Cause:** The target deployment is missing CPU `requests` in its resource limits. HPA calculates utilization as a percentage of the *request*, not the *limit*.
**Fix:** Ensure your backend deployment has:

```yaml
resources:
  requests:
    cpu: "100m" # This is mandatory for HPA
```



```bash
## See exactly what the HPA is calculating
kubectl describe hpa backend-hpa -n shopsphere
```

---

## Phase 13: 13-prometheus-grafana

## Objective

Deploy a production-grade observability stack using the `kube-prometheus-stack` Helm chart to monitor cluster health, node metrics, and application performance.

## Architecture

```
kube-prometheus-stack
├── Prometheus (Time-series DB)
├── Grafana (Visualization)
├── Alertmanager (Alert routing)
├── Node Exporter (DaemonSet for OS metrics)
└── kube-state-metrics (K8s object metrics)
```

## Commands

### Install via Helm

```bash
## Create namespace
kubectl create namespace monitoring

## Add repo and install
helm repo add prometheus-community <https://prometheus-community.github.io/helm-charts>
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.storageClassName=gp3
```

### Access Grafana Temporarily

```bash
## Get auto-generated admin password
kubectl get secret --namespace monitoring monitoring-grafana \
  -o jsonpath="{.data.admin-password}" | base64 --decode ; echo

## Port-forward to access locally
kubectl port-forward --namespace monitoring svc/monitoring-grafana 3000:80
## Open <http://localhost:3000> (User: admin, Password: <from above>)
```

## Verification

```bash
## Check all pods are running
kubectl get pods -n monitoring

## Expected:
## monitoring-grafana-xxxxx               3/3     Running
## monitoring-kube-prometheus-operator    1/1     Running
## monitoring-prometheus-xxxxx            2/2     Running
## monitoring-node-exporter-xxxxx         1/1     Running
```

## Screenshots

> 

## Troubleshooting

### Issue: Helm Timeout / Pods stuck in Pending

**Error:** `context deadline exceeded` during `helm install`.
**Events:** `0/2 nodes are available: Too many pods` or `Insufficient memory`.
**Root Cause:** The monitoring stack is resource-heavy. Two `t3.small` nodes (2 vCPU, 2GB RAM) will quickly run out of capacity.
**Resolution:** Scale your EKS Node Group. Change instance type to `t3.medium` or increase the Desired capacity to 3 nodes.

### Issue: Prometheus PVC stuck in Pending

**Cause:** The chart requests persistent storage, but the StorageClass doesn't exist or the EBS CSI driver isn't working.
**Fix:** Ensure Phase 3 (EBS CSI Driver) was completed successfully.

---

## Phase 14: 14-grafana-access-dashboards

## Objective

Expose Grafana to the internet via the AWS Load Balancer and import custom dashboards for the ShopSphere application.

## Architecture

```
Internet → ALB → /grafana path → monitoring namespace → Grafana Service
```

## Commands

### Create Grafana Ingress

```bash
kubectl apply -f monitoring/grafana-ingress.yaml
```

### Import Dashboards

1. Log into Grafana via the ALB URL.
2. Go to **Dashboards → Import**.
3. Import ID `3119` (Kubernetes Cluster Monitoring) or `13332` (Flask/Python metrics).

## Manifests

### Grafana Ingress

*Note: Ingress resources can ONLY reference services within the SAME namespace. Therefore, this must be created in the `monitoring` namespace.*

```yaml
## monitoring/grafana-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana-ingress
  namespace: monitoring # MUST be in the monitoring namespace
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}]'
    alb.ingress.kubernetes.io/group.name: shopsphere # Groups with main ALB
    alb.ingress.kubernetes.io/group.order: '10'
    alb.ingress.kubernetes.io/rewrite-target: /$2 # Strips /grafana prefix
spec:
  rules:
  - http:
      paths:
      - path: /grafana(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: monitoring-grafana
            port:
              number: 80
```

### Grafana Helm Values (Root URL fix)

If accessing via a subpath (`/grafana`), Grafana needs to know its root URL to load CSS/JS correctly.

```yaml
## grafana-values.yaml
grafana:
  grafana.ini:
    server:
      root_url: http://<ALB-DNS>/grafana
      serve_from_sub_path: true
```

*Upgrade helm:* `helm upgrade monitoring prometheus-community/kube-prometheus-stack -n monitoring -f grafana-values.yaml`

## Verification

```bash
## Verify Ingress is attached to the ALB
kubectl get ingress -n monitoring

## Test access
curl -I http://<ALB-DNS>/grafana
## Expected: HTTP/1.1 200 OK (or 302 redirect to login)
```

## Screenshots

> 

## Troubleshooting

### Issue: Cross Namespace Service Error

**Error:** `services "monitoring-grafana" not found` when creating Ingress in the `shopsphere` namespace.
**Reason:** Kubernetes Ingress controllers strictly enforce namespace boundaries for backend services.
**Fix:** Create a dedicated Ingress resource in the `monitoring` namespace and use the `alb.ingress.kubernetes.io/group.name` annotation to merge it into the existing ALB.

### Issue: Grafana UI is broken (missing CSS/JS)

**Cause:** Grafana is trying to load assets from the root path `/`, but it's being served under `/grafana`.
**Fix:** Configure `root_url` and `serve_from_sub_path` in the Grafana Helm values (see YAML snippet above).

---

## Project summary & Key Learnings

## 🧠 Kubernetes Mastery

- **Core Primitives:** Deployments, Services, ConfigMaps, Secrets, PVCs.
- **Networking:** ClusterIP vs NodePort vs LoadBalancer, Ingress path-based routing, DNS resolution between pods.
- **Storage:** Dynamic provisioning with StorageClasses and EBS CSI Driver.
- **Scaling:** HPA mechanics, the absolute requirement of `requests` for autoscaling.

## ☁️ AWS Integration

- **VPC Design:** Public vs Private subnets, NAT Gateways for private node internet access.
- **IAM & Security:** IRSA (IAM Roles for Service Accounts) to grant pod-level AWS permissions without node-level keys.
- **Load Balancing:** AWS Load Balancer Controller, ALB target types (IP vs Instance), Subnet tagging requirements.

## 📊 Observability

- **Metrics Server:** The bridge between Kubelet and HPA.
- **Prometheus/Grafana:** Scrape configs, ServiceMonitors, and visualizing cluster health.

## Troubleshooting notes

1. **Subnet Tags:** The ALB controller will silently fail to create load balancers if subnets aren't tagged with `kubernetes.io/role/elb`.
2. **Resource Requests:** HPA will completely ignore your pods if `resources.requests.cpu` is missing.
3. **Namespace Boundaries:** Ingress cannot cross namespaces.
4. **Node Capacity:** Monitoring stacks (Prometheus) will easily OOM or fail to schedule on `t3.small` instances.

---

## Phase 15: 15-application-metrics

## Objective

Expose custom application metrics from the Flask backend and configure Prometheus to scrape them using a `ServiceMonitor`, enabling deep observability into application-level performance (e.g., request counts, latency, database query times).

## Architecture

```
Flask App (prometheus_flask_instrumentator)
  ↓ (exposes /metrics endpoint)
Kubernetes Service (backend)
  ↓ (discovered by Prometheus Operator)
ServiceMonitor (Custom Resource)
  ↓ (tells Prometheus how to scrape)
Prometheus Server
  ↓ (stores time-series data)
Grafana Dashboards
```

## Commands

### Update Python Dependencies

Add the metrics library to your backend requirements.

```bash
echo "prometheus-flask-instrumentator==6.1.0" >> backend/requirements.txt
```

### Update Flask Application

Add the instrumentation code to `app.py`.

```python
## backend/app.py (Add to imports and initialization)
from prometheus_flask_instrumentator import Instrumentator

## ... after app = Flask(__name__) ...
Instrumentator().instrument(app).expose(app, endpoint="/metrics")
```

### Deploy and Create ServiceMonitor

```bash
## Rebuild and push the updated backend image
docker build -t shopsphere-backend:v2 ./backend
docker push <ECR-REPO-URI>/shopsphere-backend:v2

## Update the deployment image
kubectl set image deployment/backend backend=<ECR-REPO-URI>/shopsphere-backend:v2 -n shopsphere

## Apply the ServiceMonitor
kubectl apply -f monitoring/service-monitor.yaml
```

## Manifests

### Prometheus ServiceMonitor

*Crucial: The `labels` must match the `serviceMonitorSelector` configured in your `kube-prometheus-stack` Helm release (usually `release: monitoring`).*

```yaml
## monitoring/service-monitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: backend-monitor
  namespace: shopsphere
  labels:
    release: monitoring # Must match Prometheus selector!
spec:
  selector:
    matchLabels:
      app: backend
  endpoints:
  - port: http
    path: /metrics
    interval: 15s
```

## Verification

```bash
## 1. Verify the /metrics endpoint is working
kubectl port-forward -n shopsphere svc/backend 5000:5000
curl <http://localhost:5000/metrics>
## Expected: Prometheus text format metrics (e.g., http_requests_total)

## 2. Verify Prometheus is scraping the target
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
## Open <http://localhost:9090/targets>
## Look for "shopsphere/backend-monitor" with State: UP
```

## Screenshots

> 

## Troubleshooting

### Issue: Target shows "DOWN" in Prometheus

**Cause:** The `ServiceMonitor` labels don't match the Prometheus Operator's selector, or the port name in the ServiceMonitor (`http`) doesn't exactly match the port name in the Kubernetes Service.
**Fix:** Ensure your backend Service has `name: http` for port 5000, and the ServiceMonitor uses `port: http`.

---

## Phase 16: 16-advanced-autoscaling-karpenter

## Objective

Implement Karpenter to automatically provision and terminate EC2 instances based on pending pod demands, replacing or complementing the legacy Cluster Autoscaler with faster, more cost-effective node scaling.

## Architecture

```
Pending Pods (e.g., from HPA)
  ↓
Karpenter Controller (watches unschedulable pods)
  ↓
Evaluates NodePool & EC2NodeClass
  ↓
EC2 Fleet API (provisions exact instance type needed)
  ↓
Node joins cluster, Pod is scheduled
```

## Commands

### Prerequisites: IAM Roles

Karpenter requires an IAM role for the nodes it launches and an IRSA for the controller.

```bash
## Create Karpenter Node IAM Role (via eksctl or CloudFormation)
## Note: Refer to Karpenter docs for the exact CloudFormation template URL for your EKS version.

## Create IRSA for Karpenter Controller
eksctl create iamserviceaccount \
  --cluster shopsphere \
  --name karpenter \
  --namespace karpenter \
  --role-name KarpenterControllerRole-shopsphere \
  --attach-policy-arn arn:aws:iam::123456789012:policy/KarpenterControllerPolicy \
  --approve
```

### Install Karpenter via Helm

```bash
helm repo add karpenter <https://charts.karpenter.sh>
helm repo update

helm upgrade --install karpenter karpenter/karpenter \
  --namespace karpenter --create-namespace \
  --set settings.clusterName=shopsphere \
  --set settings.clusterEndpoint=$(aws eks describe-cluster --name shopsphere --query "cluster.endpoint" --output text) \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::123456789012:role/KarpenterControllerRole-shopsphere \
  --wait
```

## Manifests

### EC2NodeClass (AWS Specific Configuration)

```yaml
## karpenter/ec2-node-class.yaml
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: AL2
  role: "KarpenterNodeRole-shopsphere" # The IAM role for the EC2 instances
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: shopsphere # Tag your private subnets with this!
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: shopsphere # Tag your node SG with this!
  instanceProfile: "KarpenterNodeInstanceProfile-shopsphere" # If not using role directly
  tags:
    karpenter.sh/discovery: shopsphere
```

### NodePool (Generic Kubernetes Constraints)

```yaml
## karpenter/node-pool.yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: kubernetes.io/os
          operator: In
          values: ["linux"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["on-demand"] # Change to "spot" for cost savings
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["c", "m", "r"]
        - key: karpenter.k8s.aws/instance-generation
          operator: Gt
          values: ["2"]
      nodeClassRef:
        name: default
  limits:
    cpu: 1000 # Max CPU across all Karpenter nodes
  disruption:
    consolidationPolicy: WhenUnderutilized
    expireAfter: 720h # 30 days
```

## Verification

```bash
## 1. Apply the Karpenter resources
kubectl apply -f karpenter/ec2-node-class.yaml
kubectl apply -f karpenter/node-pool.yaml

## 2. Create a dummy deployment that requires more CPU than currently available
kubectl run stress-test --image=nginx --requests='cpu=5' -n shopsphere

## 3. Watch Karpenter provision a node
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter -f
## Expected: "Launching node with instance type m5.xlarge..."

kubectl get nodes -w
```

## Troubleshooting

### Issue: Karpenter fails to launch instances

**Cause:** Subnets or Security Groups are not tagged with `karpenter.sh/discovery: shopsphere`, or the Node IAM role lacks permissions to join the EKS cluster.
**Fix:** Verify AWS tags and ensure the `aws-auth` ConfigMap includes the Karpenter Node IAM role.

---

## Phase 17: 17-gitops-argocd

## Objective

Transition from imperative `kubectl apply` to declarative GitOps using ArgoCD, ensuring the cluster state always matches the manifests stored in a Git repository.

## Architecture

```
Git Repository (Source of Truth)
  ↓ (Polls / Webhooks)
ArgoCD (Continuous Delivery Tool)
  ↓ (Syncs state)
Kubernetes Cluster ( shopsphere namespace )
```

## Commands

### Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f <https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml>

## Expose ArgoCD UI via LoadBalancer
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "LoadBalancer"}}'

## Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```

### Create ArgoCD Application

```bash
kubectl apply -f argocd/application.yaml
```

## Manifests

### ArgoCD Application Manifest

```yaml
## argocd/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: shopsphere
  namespace: argocd
spec:
  project: default
  source:
    repoURL: '<https://github.com/your-username/shopsphere-gitops.git>'
    targetRevision: HEAD
    path: k8s-manifests # Folder in your repo containing the YAMLs
  destination:
    server: '<https://kubernetes.default.svc>'
    namespace: shopsphere
  syncPolicy:
    automated:
      prune: true      # Delete resources not in Git
      selfHeal: true   # Revert manual kubectl changes
    syncOptions:
    - CreateNamespace=true
```

## Verification

1. Access the ArgoCD UI via the LoadBalancer DNS.
2. Log in with `admin` and the decoded password.
3. Verify the `shopsphere` app shows a **Healthy** and **Synced** status (Green).
4. Manually delete a pod using `kubectl delete pod ...` and watch ArgoCD automatically recreate it within seconds (Self-Healing).

## Screenshots

> 

---

## Phase 18: 18-dns-tls-automation

## Objective

Automate DNS record creation using ExternalDNS and provision free SSL/TLS certificates using cert-manager with Let's Encrypt.

## Architecture

```
ExternalDNS: Watches Ingress → Updates Route53 A/CNAME records
cert-manager: Watches Ingress annotations → Solves ACME challenge → Creates K8s TLS Secret
```

## Commands

### Install ExternalDNS

```bash
## Create IAM Role for ExternalDNS (Route53 permissions)
eksctl create iamserviceaccount \
  --name external-dns \
  --namespace external-dns \
  --cluster shopsphere \
  --attach-policy-arn arn:aws:iam::123456789012:policy/ExternalDNSPolicy \
  --approve

helm repo add external-dns <https://kubernetes-sigs.github.io/external-dns/>
helm install external-dns external-dns/external-dns \
  --namespace external-dns --create-namespace \
  --set provider=aws \
  --set policy=sync \
  --set txtOwnerId=shopsphere \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::123456789012:role/ExternalDNSRole
```

### Install cert-manager

```bash
helm repo add jetstack <https://charts.jetstack.io>
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true
```

## Manifests

### Let's Encrypt ClusterIssuer

```yaml
## monitoring/cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: <https://acme-v02.api.letsencrypt.org/directory>
    email: admin@shopsphere.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: alb
```

### Updated Ingress with TLS

```yaml
## ingress.yaml (Updated)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopsphere-ingress
  namespace: shopsphere
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    cert-manager.io/cluster-issuer: "letsencrypt-prod" # Triggers cert-manager
spec:
  tls:
  - hosts:
    - shopsphere.yourdomain.com
    secretName: shopsphere-tls # cert-manager will create this secret
  rules:
  - host: shopsphere.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

## Verification

```bash
## Check Certificate status
kubectl get certificates -n shopsphere
## Expected: READY = True

## Check DNS record
dig shopsphere.yourdomain.com +short
## Expected: Returns the ALB DNS name

## Test HTTPS
curl -I <https://shopsphere.yourdomain.com>
## Expected: HTTP/2 200, valid Let's Encrypt certificate
```

## Troubleshooting

### Issue: Certificate stays in "Ready: False"

**Cause:** The HTTP01 challenge fails because the ALB isn't routing the `.well-known/acme-challenge` path correctly, or ExternalDNS hasn't propagated the DNS record yet.
**Fix:** Check `kubectl describe certificate shopsphere-tls`. Ensure DNS has propagated (can take up to 5 mins).

---

## Phase 19: 19-security-secrets

## Objective

Eliminate base64-encoded Kubernetes Secrets from Git by integrating the Secrets Store CSI Driver with AWS Secrets Manager, mounting secrets directly as volumes in pods.

## Architecture

```
AWS Secrets Manager (Source of Truth for Secrets)
  ↓ (API Call)
Secrets Store CSI Driver (Runs on Node)
  ↓ (Mounts as in-memory tmpfs volume)
Pod (/mnt/secrets/db-password)
```

## Commands

### Install Secrets Store CSI Driver & AWS Provider

```bash
helm repo add secrets-store-csi-driver <https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts>
helm install csi-secrets-store secrets-store-csi-driver/secrets-store-csi-driver \
  --namespace kube-system

## Install AWS Provider
helm repo add aws-secrets-provider <https://aws.github.io/secrets-store-csi-driver-provider-aws>
helm install secrets-provider-aws aws-secrets-provider/aws-secrets-provider \
  --namespace kube-system
```

### Create IAM Role for Pod

```bash
eksctl create iamserviceaccount \
  --name backend-sa \
  --namespace shopsphere \
  --cluster shopsphere \
  --attach-policy-arn arn:aws:iam::123456789012:policy/SecretsManagerReadPolicy \
  --approve
```

## Manifests

### SecretProviderClass

```yaml
## shopsphere/secret-provider-class.yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: backend-aws-secrets
  namespace: shopsphere
spec:
  provider: aws
  parameters:
    objects: |
      - objectName: "shopsphere/prod/db-password" # ARN or name in AWS Secrets Manager
        objectType: "secretsmanager"
        jmesPath:
            - path: password
              objectAlias: db_password
  secretObjects:
  - data:
    - key: db_password
      objectName: db_password
    secretName: db-secret-synced # Optional: syncs to a K8s secret for env vars
    type: Opaque
```

### Updated Backend Deployment

```yaml
## shopsphere/backend-deployment.yaml (Snippet)
spec:
  template:
    spec:
      serviceAccountName: backend-sa # Must use the IRSA service account
      containers:
      - name: backend
        image: shopsphere-backend:latest
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret-synced
              key: db_password
        volumeMounts:
        - name: secrets-store
          mountPath: "/mnt/secrets"
          readOnly: true
      volumes:
      - name: secrets-store
        csi:
          driver: secrets-store.csi.k8s.io
          readOnly: true
          volumeAttributes:
            secretProviderClass: "backend-aws-secrets"
```

## Verification

```bash
## 1. Exec into the backend pod
kubectl exec -it -n shopsphere deployment/backend -- bash

## 2. Verify the secret is mounted as a file
cat /mnt/secrets/db_password
## Expected: The actual plain-text password from AWS Secrets Manager

## 3. Verify the environment variable is populated
echo $DB_PASSWORD
```

## Screenshots

> 

## Troubleshooting

### Issue: Pod stuck in ContainerCreating / MountVolume.SetUp failed

**Cause:** The Service Account lacks the IAM permissions to read the specific secret in AWS Secrets Manager, or the CSI driver isn't running on the node.
**Fix:** Verify the IRSA role trust policy and the attached IAM policy allows `secretsmanager:GetSecretValue`. Check `kubectl describe pod` for the exact CSI error.

---

## Project completion

You have successfully built, deployed, and operated a production-grade, fully automated, and highly observable microservices architecture on Amazon EKS!

### Final architecture checklist

```
✅ Infrastructure: VPC, Public/Private Subnets, NAT Gateways
✅ Compute: EKS Cluster, Managed Node Groups, Karpenter Node Autoscaling
✅ Storage: EBS CSI Driver, gp3 Persistent Volumes for PostgreSQL
✅ Application: Flask Backend, Nginx Frontend, Path-based ALB Ingress
✅ Scaling: Horizontal Pod Autoscaler (CPU-based)
✅ Observability: Prometheus, Grafana, Custom App Metrics (ServiceMonitors)
✅ GitOps: ArgoCD for automated deployment and self-healing
✅ Networking & Security: ExternalDNS, Let's Encrypt TLS, AWS Secrets Manager via CSI
```

### What's next

You now have a robust platform. To continue your DevOps journey, consider exploring:

1. **Service Mesh:** Install **Istio** or **Linkerd** for mTLS, traffic splitting (Canary deployments), and advanced observability.
2. **Policy as Code:** Implement **Kyverno** or **OPA Gatekeeper** to enforce security policies (e.g., "no root containers", "must have resource limits").
3. **Chaos Engineering:** Use **Litmus** or **Chaos Mesh** to intentionally kill pods or inject network latency to test the resilience of your HPA and Karpenter configurations.
4. **CI/CD Pipelines:** Build GitHub Actions or GitLab CI pipelines to automatically run tests, build Docker images, push to ECR, and update the GitOps repository.


---