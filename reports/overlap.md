# Content Overlap Analysis & Canonical Post Recommendations

This report documents topic overlaps across related AWS and Kubernetes guides, recommends the primary/canonical post for each topic cluster, and defines reciprocal cross-linking without deleting any content.

---

## Topic Cluster: Amazon ECR (Lifecycle Policies & Repository Best Practices)

**Primary Recommended Post**: [Amazon ECR Lifecycle Policies: Syntax & Retention Rules](/blogs/aws-ecr-lifecycle-policy/)

| Post Slug | Title | Focus & Scope | Role / Recommendation |
| :--- | :--- | :--- | :--- |
| `aws-ecr-lifecycle-policy` | [Amazon ECR Lifecycle Policies: Syntax & Retention Rules](/blogs/aws-ecr-lifecycle-policy/) | Deep JSON syntax specification, evaluation rules, tag mutability, prefix match behavior, and excess image expiration. | **★ PRIMARY MAIN POST**<br>RECOMMENDED MAIN POST: This post is the most technically complete reference for ECR policy syntax and edge cases. |
| `aws-ecr-access-lifecycle-console-guide` | [Amazon ECR Policies: Access & Lifecycle Console Guide](/blogs/aws-ecr-access-lifecycle-console-guide/) | Step-by-step AWS Management Console guide for repository creation, cross-account access, and UI rule configuration. | **Supporting Guide**<br>Cross-link to aws-ecr-lifecycle-policy for policy JSON mechanics and prefix traps. |
| `eks-ecr-best-practices` | [Amazon ECR Best Practices: Security, Scanning & Policies](/blogs/eks-ecr-best-practices/) | High-level architectural overview covering vulnerability scanning, immutable tags, and encryption for EKS clusters. | **Supporting Guide**<br>Cross-link to aws-ecr-lifecycle-policy as the primary lifecycle reference. |

### Cross-Linking Strategy

- `aws-ecr-access-lifecycle-console-guide.md` and `eks-ecr-best-practices.md` include an editorial note pointing readers to `aws-ecr-lifecycle-policy.md` for exact policy JSON syntax and prefix traps.
- `aws-ecr-lifecycle-policy.md` links to `aws-ecr-access-lifecycle-console-guide.md` for console-first cross-account repository policy configuration.

---

## Topic Cluster: AWS VPC Lattice (Application Networking & EKS Ingress)

**Primary Recommended Post**: [AWS VPC Lattice: Multi-VPC Service Network Guide](/blogs/aws-vpc-lattice-application-networking/)
**Primary Kubernetes Guide**: [Amazon EKS VPC Lattice: Gateway API & HTTPRoute Setup](/blogs/eks-vpc-lattice-gateway-api-updated/)

| Post Slug | Title | Focus & Scope | Role / Recommendation |
| :--- | :--- | :--- | :--- |
| `aws-vpc-lattice-application-networking` | [AWS VPC Lattice: Multi-VPC Service Network Guide](/blogs/aws-vpc-lattice-application-networking/) | Multi-service architecture connecting ECS, EKS, EC2, Lambda, and private RDS via Lattice service networks. | **★ PRIMARY MAIN POST**<br>RECOMMENDED MAIN POST (Architecture): Serves as the overarching cross-compute architectural blueprint. |
| `eks-vpc-lattice-gateway-api-updated` | [Amazon EKS VPC Lattice: Gateway API & HTTPRoute Setup](/blogs/eks-vpc-lattice-gateway-api-updated/) | Modern Kubernetes Gateway API implementation on EKS using EKS Pod Identity and HTTPRoute routing. | **★ PRIMARY MAIN POST**<br>RECOMMENDED MAIN POST (EKS / K8s): Supersedes legacy IRSA post with modern Pod Identity controller setup. |
| `eks-vpc-lattice-gateway-api` | [Amazon EKS VPC Lattice Gateway API: Service Controller](/blogs/eks-vpc-lattice-gateway-api/) | Earlier Gateway API implementation using IAM Roles for Service Accounts (IRSA). | **Supporting Guide**<br>Keep for IRSA backward-compatibility; cross-link prominently to the updated Pod Identity guide. |
| `aws-vpc-lattice-path-routing-lab` | [AWS VPC Lattice Path Routing: Multi-Service Lab Setup](/blogs/aws-vpc-lattice-path-routing-lab/) | Hands-on path routing lab (/orders -> ECS, /customers -> EC2, /inventory -> EKS). | **Supporting Guide**<br>Companion lab: cross-link to aws-vpc-lattice-application-networking for full topology. |
| `eks-ingress-vpc-lattice-console-guide` | [Amazon EKS VPC Lattice Ingress: Console Runbook Guide](/blogs/eks-ingress-vpc-lattice-console-guide/) | Console-oriented walk-through configuring Lattice target groups and VPC associations for EKS. | **Supporting Guide**<br>Console runbook: cross-link to eks-vpc-lattice-gateway-api-updated for declarative YAML/CRD workflows. |

### Cross-Linking Strategy

- `eks-vpc-lattice-gateway-api.md` (IRSA) points readers to `eks-vpc-lattice-gateway-api-updated.md` as the current standard using EKS Pod Identity.
- Lab and console guides cross-link to `aws-vpc-lattice-application-networking.md` as the overarching architectural reference.

---

## Topic Cluster: Amazon ECS East-West Networking (Service Connect vs Cloud Map)

**Primary Recommended Post**: [Amazon ECS Service Connect vs Cloud Map Discovery](/blogs/aws-ecs-service-connect-vs-discovery/)

| Post Slug | Title | Focus & Scope | Role / Recommendation |
| :--- | :--- | :--- | :--- |
| `aws-ecs-service-connect-vs-discovery` | [Amazon ECS Service Connect vs Cloud Map Discovery](/blogs/aws-ecs-service-connect-vs-discovery/) | 500+ line technical breakdown comparing Service Connect Envoy proxy vs Cloud Map DNS: metrics, latency, DNS caching, costs, and decision matrix. | **★ PRIMARY MAIN POST**<br>RECOMMENDED MAIN POST: The definitive, comprehensive comparison guide for ECS inter-service communication. |
| `ecs-production-service-connect-discovery-storage` | [Amazon ECS Production: Service Connect, Discovery & Storage](/blogs/ecs-production-service-connect-discovery-storage/) | Broader production guide combining east-west networking with filesystem storage (EBS, EFS, FSx, S3 Files). | **Supporting Guide**<br>Cross-link to aws-ecs-service-connect-vs-discovery for deep mesh analysis; this post remains the primary storage reference. |

### Cross-Linking Strategy

- `ecs-production-service-connect-discovery-storage.md` links to `aws-ecs-service-connect-vs-discovery.md` for dedicated deep-dive traffic benchmarks and failure modes.
- `aws-ecs-service-connect-vs-discovery.md` links to the production storage guide for persistent filesystem configuration (EBS/EFS/S3 Files).

---

## Topic Cluster: Amazon EKS GitOps with Argo CD

**Primary Recommended Post**: [Amazon EKS GitOps: Argo CD & AWS CodeCommit CI/CD Guide](/blogs/eks-argocd-codecommit-pipeline/)

| Post Slug | Title | Focus & Scope | Role / Recommendation |
| :--- | :--- | :--- | :--- |
| `eks-argocd-codecommit-pipeline` | [Amazon EKS GitOps: Argo CD & AWS CodeCommit CI/CD Guide](/blogs/eks-argocd-codecommit-pipeline/) | 480+ line end-to-end GitOps pipeline: CodeCommit source repos, ECR container builds, Argo CD application manifests, automated sync, and webhooks. | **★ PRIMARY MAIN POST**<br>RECOMMENDED MAIN POST: Complete production GitOps automation runbook. |
| `eks-argocd-install` | [Amazon EKS Argo CD: Step-by-Step Installation Runbook](/blogs/eks-argocd-install/) | Quickstart installation guide covering Argo CD namespace, Helm/manifest install, and NLB UI exposure. | **Supporting Guide**<br>Cross-link to eks-argocd-codecommit-pipeline for full automated GitOps pipeline integration. |

### Cross-Linking Strategy

- `eks-argocd-install.md` links to `eks-argocd-codecommit-pipeline.md` for end-to-end automated GitOps workflows.
- `eks-argocd-codecommit-pipeline.md` references the quickstart install guide for initial cluster bootstrap.

---

