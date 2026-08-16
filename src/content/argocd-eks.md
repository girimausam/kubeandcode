---
title: ArgoCD on EKS
description: Install Argo CD on EKS, expose it with a LoadBalancer, and retrieve the admin password.
tags:
  - eks
  - argocd
  - kubernetes
  - helm
  - load-balancer
links:
  - title: Argo CD documentation
    url: https://argo-cd.readthedocs.io/
  - title: Amazon EKS
    url: https://docs.aws.amazon.com/eks/
---

# ArgoCD on EKS

## 1. Install Argo CD

```bash
helm repo add argo-cd https://argoproj.github.io/argo-helm
helm repo update

kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

## 2. Expose with a LoadBalancer

```bash
kubectl patch svc argocd-server -n argocd \
  -p '{"spec": {"type": "LoadBalancer"}}'
```

Get the URL:

```bash
export ARGOCD_SERVER=$(kubectl get svc argocd-server -n argocd \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Argo CD URL: https://$ARGOCD_SERVER"
```

## 3. Get the admin password

The default username is `admin`. The password is stored in a Kubernetes secret:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo
```

Or save it to a variable:

```bash
export ARGOCD_PWD=$(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d)
echo "Argo CD admin password: $ARGOCD_PWD"
```

Log in:

```bash
argocd login "$ARGOCD_SERVER" --username admin --password "$ARGOCD_PWD" --insecure
```

For CodeCommit repo access and application IAM (Secrets Manager), see [CodeCommit to ArgoCD Pipeline on EKS](codecommit-eks-argocd.md).
