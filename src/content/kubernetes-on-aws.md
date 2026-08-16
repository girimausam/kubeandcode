---
title: "Kubernetes on AWS (EKS Runbook)"
description: "EKS version guidance, access entries, Pod Identity vs IRSA, and day-2 cluster operations for Amazon EKS."
tags:
  - eks
  - kubernetes
  - pod-identity
  - irsa
  - aws
---
## Overview

Reference runbook for Amazon EKS cluster operations, workload identity, and deployment patterns. For a full end-to-end walkthrough, follow [ShopSphere on Amazon EKS](/shopsphere-on-eks/).

## EKS operations

### Version guidance

As of June 2026, AWS docs list EKS standard support for Kubernetes 1.35, 1.34, and 1.33. Verify with [EKS Kubernetes versions](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html) or `aws eks describe-cluster-versions` before creating clusters.

### Core commands

```bash
eksctl create cluster --name my-cluster --region ap-south-1 --version 1.35 --managed
aws eks update-kubeconfig --region ap-south-1 --name my-cluster
kubectl get nodes -o wide
kubectl get svc -A
kubectl auth can-i --list
```

### Access model

- Prefer **EKS access entries** for cluster access management on modern clusters.
- For pod AWS permissions, standardize on either **EKS Pod Identity** or **IRSA** per cluster/team.

### Day-2 checklist

- Confirm node IAM role has only node-level permissions.
- Use pod-level IAM for workload AWS access.
- Confirm add-ons and kubectl versions match the cluster minor version.
- Keep worker nodes in private subnets unless public nodes are deliberate.

### References

- [EKS access entries](https://docs.aws.amazon.com/eks/latest/userguide/access-entries.html)
- [EKS quick start](https://docs.aws.amazon.com/eks/latest/userguide/quickstart.html)

## Pod Identity and IRSA

Decision and troubleshooting notes for pod-level AWS permissions in Amazon EKS.

### Choose one pattern

- **EKS Pod Identity** — simpler operational model for supported EKS clusters and Linux EC2 worker nodes.
- **IRSA** — useful for OIDC-based compatibility and established workflows.

### Pod Identity trust policy

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "pods.eks.amazonaws.com" },
    "Action": ["sts:AssumeRole", "sts:TagSession"]
  }]
}
```

### Troubleshooting checklist

- Pod uses the intended `serviceAccountName`.
- Association exists for the namespace/service account.
- AWS SDK inside the container is recent enough for the selected identity method.
- No static `AWS_ACCESS_KEY_ID` or profile setting overrides the provider chain.
- Validate with `aws sts get-caller-identity` from inside the pod.

### References

- [EKS Pod Identity](https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html)
- [IAM roles for service accounts](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)

## Application deployment

For a complete deployment tutorial (ECR, HPA, ALB controller, ingress), use the ShopSphere walkthrough:

- [Infrastructure setup](/shopsphere-on-eks/#phase-01-01-infrastructure-setup)
- [Application deployment](/shopsphere-on-eks/#phase-05-05-application-deployment)
- [Ingress configuration](/shopsphere-on-eks/#phase-09-09-ingress-configuration)

**Quick reference links:**

- [EKS networking requirements](https://docs.aws.amazon.com/eks/latest/userguide/network-reqs.html)
- [AWS Load Balancer Controller](https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html)
- [Enable IAM OIDC provider](https://docs.aws.amazon.com/eks/latest/userguide/enable-iam-roles-for-service-accounts.html)