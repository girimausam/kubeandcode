---
title: Kyverno Setup on EKS
description: Install and configure Kyverno policy engine on Amazon EKS.
tags:
  - eks
  - kyverno
  - policy
  - helm
  - admission-controller
---
# Kyverno Setup on EKS

## 1. Confirm cluster context

```bash
kubectl config current-context
kubectl get nodes
```

## 2. Add the Kyverno Helm repo

```bash
helm repo add kyverno https://kyverno.github.io/kyverno/
helm repo update
```

## 3. Install Kyverno

```bash
kubectl create namespace kyverno

helm install kyverno kyverno/kyverno \
  -n kyverno \
  --set replicaCount=3 \
  --wait
```

## 4. Verify

```bash
kubectl get pods -n kyverno
kubectl get deploy -n kyverno
```

## 5. Policy examples

Each example is a standalone `ClusterPolicy`. Replace `my-app-namespace` with the target namespace. Policies can be combined into one file by merging rules under a single `spec.rules` list.

### Allowed registries

Only allow images from the account ECR or `public.ecr.aws`.

`allowed-registries.yaml`:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: allowed-registries
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: allowed-registries
      match:
        any:
          - resources:
              kinds:
                - Pod
              namespaces:
                - my-app-namespace
      validate:
        message: "Images must come from an approved registry (ECR account or public.ecr.aws)."
        pattern:
          spec:
            containers:
              - image: "<YOUR_ACCOUNT_ID>.dkr.ecr.*.amazonaws.com/* | public.ecr.aws/*"
```

### Disallow `:latest` tag

Block implicit or explicit `:latest` image tags.

`disallow-latest-tag.yaml`:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-latest-tag
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: disallow-latest-tag
      match:
        any:
          - resources:
              kinds:
                - Pod
              namespaces:
                - my-app-namespace
      validate:
        message: "Images must not use the ':latest' tag or omit a tag."
        pattern:
          spec:
            containers:
              - image: "!*:latest"
                =(imagePullPolicy): "!Always"
```

### Require resource limits

Require CPU and memory limits on all containers.

`require-resource-limits.yaml`:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-resource-limits
spec:
  validationFailureAction: Enforce
  rules:
    - name: require-limits
      match:
        any:
          - resources:
              kinds:
                - Pod
              namespaces:
                - my-app-namespace
      validate:
        message: "CPU and memory limits are required."
        pattern:
          spec:
            containers:
              - resources:
                  limits:
                    memory: "?*"
                    cpu: "?*"
```

### Disallow privileged containers

Prevent pods from running privileged containers.

`disallow-privileged.yaml`:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-privileged
spec:
  validationFailureAction: Enforce
  rules:
    - name: disallow-privileged
      match:
        any:
          - resources:
              kinds:
                - Pod
              namespaces:
                - my-app-namespace
      validate:
        message: "Privileged containers are not allowed."
        pattern:
          spec:
            containers:
              - securityContext:
                  privileged: false
```

### Require labels

Require standard labels on every pod.

`require-labels.yaml`:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-labels
spec:
  validationFailureAction: Enforce
  rules:
    - name: require-labels
      match:
        any:
          - resources:
              kinds:
                - Pod
              namespaces:
                - my-app-namespace
      validate:
        message: "Labels 'app' and 'env' are required."
        pattern:
          metadata:
            labels:
              app: "?*"
              env: "?*"
```

Apply one or more policies:

```bash
kubectl apply -f allowed-registries.yaml
kubectl apply -f disallow-latest-tag.yaml
kubectl apply -f require-resource-limits.yaml
kubectl apply -f disallow-privileged.yaml
kubectl apply -f require-labels.yaml
```

## 6. Remove a ClusterPolicy

```bash
# List what's currently applied
kubectl get clusterpolicy

# Delete a specific ClusterPolicy
kubectl delete clusterpolicy allowed-registries
kubectl delete clusterpolicy disallow-latest-tag

# Delete all ClusterPolicies (removes every policy cluster-wide)
kubectl delete clusterpolicy --all
```

## 7. Debug

```bash
kubectl logs -n kyverno \
  -l app.kubernetes.io/component=admission-controller \
  --tail=50

kubectl get pods -n kyverno
kubectl get pods -n kyverno -o wide

kubectl logs -n kyverno -l app.kubernetes.io/component=admission-controller -f --tail=20
```

