---
title: "EKS with Kyverno -  console-oriented production guide"
description: "Policy-as-code on EKS - install verification, representative ClusterPolicies, and governance patterns beyond the Helm install steps."
tags:
 - eks
 - kyverno
 - policy
 - security
 - governance
 - devops
---

# EKS with Kyverno -  console-oriented production guide

**Kyverno** validates and mutates Kubernetes resources without a separate language - policies are **YAML**. In enterprises it enforces **labels, image registries, resource limits, and network defaults**.

**Install steps:** [Kyverno install on EKS](./eks-kyverno-install.md)  
**Checklist:** [DevOps checklist](./aws-devops-system-design-checklist.md)

---

## Use cases

| Policy type | Example |
|-------------|---------|
| Validate | Only images from `ACCOUNT.dkr.ecr...` |
| Mutate | Inject `resource limits` or standard labels |
| Generate | Create NetworkPolicy when Namespace created |
| VerifyImages | Cosign/sigstore (advanced) |

---

## Console-relevant workflow

While policies are YAML, operators use:

1. **EKS console** → cluster health, add-ons, access entries.
2. **CloudWatch** / **Container Insights** for admission denials (via audit logs).
3. **IAM** for CI roles applying policies via GitOps.

---

## Install verification (post-Helm)

```bash
kubectl get pods -n kyverno
kubectl get crd | grep kyverno
```

Expect 3+ `kyverno` controller pods in HA install.

---

## Representative policies (apply via kubectl)

### Require standard labels

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-team-label
spec:
  validationFailureAction: Enforce
  rules:
 - name: check-team
      match:
        any:
 - resources:
              kinds: [Deployment]
      validate:
        message: "label team is required"
        pattern:
          metadata:
            labels:
              team: "?*"
```

### Restrict registries

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: only-ecr-images
spec:
  validationFailureAction: Enforce
  rules:
 - name: ecr-only
      match:
        any:
 - resources:
              kinds: [Pod]
      validate:
        message: "Images must be from ECR"
        pattern:
          spec:
            containers:
 - image: "*.dkr.ecr.*.amazonaws.com/*"
```

---

## IAM & RBAC

- Cluster admins install policies; developers should not delete `ClusterPolicy` without break-glass.
- Use **EKS access entries** to map SSO groups to `cluster-admin` vs namespace-scoped roles.

---

## Security

- Exclude `kyverno` and `kube-system` carefully when testing `Enforce` - avoid cluster lockout.
- Start policies in `Audit` (`validationFailureAction: Audit`) before `Enforce`.
- Backup policies in Git ([Argo CD](./eks-argocd-install.md)).

---

## Commonly missed

| Miss | Impact |
|------|--------|
| Webhook timeout on large objects | Random apply failures |
| Policies on `Pods` vs controllers | Bypass via bare Pods |
| No exceptions for `system:` namespaces | Break add-ons |
| Forgetting generate cleanup | Orphan resources |

---

## Troubleshooting

```bash
kubectl describe policyreport -A
kubectl logs -n kyverno -l app.kubernetes.io/component=admission-controller
```

Docs: [Kyverno policies](https://kyverno.io/docs/policy-types/) · [EKS best practices](https://docs.aws.amazon.com/eks/latest/best-practices/introduction.html)

[← Install guide](./eks-kyverno-install.md) · [Checklist](./aws-devops-system-design-checklist.md)
