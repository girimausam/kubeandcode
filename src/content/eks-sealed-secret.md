---
title: "Sealed Secret on Amazon EKS"
description: Use Sealed Secret on Amazon EKS.
tags:
  - eks
  - kubernetes
  - storageclass
  - secret
  - sealed secret
  - sealed
---

# 1. Install kubeseal (CLI) if you don't have it - matches your cluster's controller version
# 2. Install the sealed-secrets controller in-cluster (once):
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# 3. Create the plain secret LOCALLY only (never apply or commit this file):

## metadata
##   name: frontend-secret
##   namespace: claude
   
kubectl create secret generic frontend-secret \
  --namespace claude \
  --from-literal=db-password='REAL_PASSWORD_HERE' \
  --dry-run=client -o yaml > frontend-secret.yaml

# 4. Seal it using the controller's public cert:
kubeseal --format yaml \
  --controller-name sealed-secrets \
  --controller-namespace kube-system \
  < frontend-secret.yaml > frontend-sealedsecret.yaml

# 5. Delete the plaintext file, commit only the sealed one:
rm frontend-secret.yaml
git add frontend-sealedsecret.yaml   # goes in your CodeCommit manifests repo

# 6. ArgoCD (or kubectl apply) deploys frontend-sealedsecret.yaml -> controller
#    decrypts it in-cluster -> produces the real "frontend-secret" K8s Secret
#    that your Deployment's DB_PASSWORD env var already references.
