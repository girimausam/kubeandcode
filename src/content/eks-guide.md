---
title: "EKS application deployment"
description: "ECR push, eksctl cluster, Deployment, HPA, Cluster Autoscaler, AWS Load Balancer Controller, and ALB Ingress."
tags:
  - eks
  - ecr
  - kubernetes
  - alb
  - aws
  - notes
date: 2026-08-29
---

# AWS EKS Application Deployment Guide


---

## Prerequisites

- AWS CLI configured with appropriate permissions
- `eksctl`, `kubectl`, `docker`, `helm` installed
- Basic familiarity with YAML and Kubernetes concepts

---

## 1. ECR Setup & Docker Image Push

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGION=ap-south-1

# Create ECR repository
aws ecr create-repository --repository-name myapp --region $REGION

# Authenticate Docker to ECR
aws ecr get-login-password --region $REGION | \\
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Tag & push image
docker tag myapp:latest $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/myapp:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/myapp:latest
```

---

## 2. Create EKS Cluster

```bash
eksctl create cluster \\
  --name my-cluster \\
  --region $REGION \\
  --nodegroup-name workers \\
  --node-type t3.medium \\
  --nodes 2 \\
  --managed
```

*AWS manages:* Control plane, API server, etcd

*You manage:* Worker nodes, pods, deployments, services

---

## 3. Deploy Application

**`deployment.yaml`**

*(Note: Added `resources` block. HPA requires CPU/Memory requests to function.)*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        - name: myapp
          image: $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/myapp:latest
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "256Mi"
```

```bash
kubectl apply -f deployment.yaml
kubectl get pods
```

---

## 4. Autoscaling (Pods & Nodes)

### 4.1 Horizontal Pod Autoscaler (HPA)

EKS includes `metrics-server` by default. Create an HPA to scale pods based on CPU utilization.

**`hpa.yaml`**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
```

```bash
kubectl apply -f hpa.yaml
kubectl get hpa
```

*Test:* `kubectl run load-generator --image=busybox -- /bin/sh -c "while true; do wget -q -O- <http://myapp-service>; done"`

### 4.2 Cluster Node Autoscaler

EKS managed node groups do **not** autoscale out-of-the-box. You must deploy the **Cluster Autoscaler** (CA) or use **Karpenter** (AWS recommended). Here is the standard CA setup:

### Step A: Tag Node Group for Auto-Discovery

CA requires specific tags to manage the node group.

```bash
eksctl create nodegroup \\
  --cluster my-cluster \\
  --name workers-autoscale \\
  --node-type t3.medium \\
  --nodes-min 2 \\
  --nodes-max 10 \\
  --tags k8s.io/cluster-autoscaler/enabled=true,k8s.io/cluster-autoscaler/my-cluster=owned
```

*(If updating an existing node group, use `aws eks update-nodegroup-config` to add tags.)*

### Step B: Attach IAM Policy

AWS provides a managed policy for CA:

```bash
export CA_POLICY_ARN="arn:aws:iam::aws:policy/AWSClusterAutoscalerPolicy"

eksctl create iamserviceaccount \\
  --cluster my-cluster \\
  --namespace kube-system \\
  --name cluster-autoscaler \\
  --attach-policy-arn $CA_POLICY_ARN \\
  --override-existing-serviceaccounts \\
  --approve
```

### Step C: Install via Helm

```bash
helm repo add autoscaler <https://kubernetes.github.io/autoscaler>
helm repo update

helm install cluster-autoscaler autoscaler/cluster-autoscaler \\
  -n kube-system \\
  --set autoDiscovery.clusterName=my-cluster \\
  --set awsRegion=$REGION \\
  --set extraArgs.balance-similar-node-groups=true \\
  --set extraArgs.skip-nodes-with-system-pods=false
```

**Verify:**

```bash
kubectl get pods -n kube-system | grep cluster-autoscaler
```

---

## 5. AWS Load Balancer Controller (ALB) Setup

### 5.1 Enable OIDC Provider

Required for IAM Roles for Service Accounts (IRSA).

```bash
eksctl utils associate-iam-oidc-provider \\
  --region $REGION \\
  --cluster my-cluster \\
  --approve
```

### 5.2 Create IAM Policy

```bash
curl -O <https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json>
aws iam create-policy \\
  --policy-name AWSLoadBalancerControllerIAMPolicy \\
  --policy-document file://iam_policy.json
```

### 5.3 Create IAM Service Account (IRSA)

```bash
export ALB_POLICY_ARN=$(aws iam list-policies \\
  --query 'Policies[?PolicyName==`AWSLoadBalancerControllerIAMPolicy`].Arn' \\
  --output text)

eksctl create iamserviceaccount \\
  --cluster my-cluster \\
  --namespace kube-system \\
  --name aws-load-balancer-controller \\
  --attach-policy-arn $ALB_POLICY_ARN \\
  --override-existing-serviceaccounts \\
  --approve
```

### 5.4 Install Controller via Helm

```bash
export VPC_ID=$(aws eks describe-cluster \\
  --name my-cluster \\
  --query "cluster.resourcesVpcConfig.vpcId" \\
  --output text)

helm repo add eks <https://aws.github.io/eks-charts>
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \\
  -n kube-system \\
  --set clusterName=my-cluster \\
  --set serviceAccount.create=false \\
  --set serviceAccount.name=aws-load-balancer-controller \\
  --set region=$REGION \\
  --set vpcId=$VPC_ID
```

**Verify:**

```bash
kubectl get pods -n kube-system | grep aws-load-balancer-controller
```

---

## 6. Service & Ingress Configuration

### 6.1 Internal Service (`ClusterIP`)

ALB handles public routing; services must remain internal.
**`service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-service
spec:
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP
```

### 6.2 Ingress (`ingress.yaml`)

Triggers ALB creation via the controller.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  annotations:
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
                name: myapp-service
                port:
                  number: 80
```

**Apply:**

```bash
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
kubectl get ingress myapp-ingress
```

---

## 7. Traffic Flow & Verification

```
Internet → ALB (Created by Ingress) → Ingress Controller → ClusterIP Service → Pods (Scaled by HPA)
                                                                         ↑
                                                                 Nodes (Scaled by CA)
```

- Wait 2–3 minutes for ALB provisioning.
- `kubectl get ingress` will show an `ADDRESS` (ALB DNS endpoint).
- Test access: `curl http://<ALB_DNS_ENDPOINT>`
- Monitor scaling: `kubectl get hpa` and `kubectl get nodes`

---