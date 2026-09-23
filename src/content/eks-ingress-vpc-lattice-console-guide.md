---
title: "EKS Ingress with VPC Lattice — console guide"
description: "Expose Kubernetes services through VPC Lattice—service networks, associations, Gateway API, and how this differs from ALB Ingress alone."
tags:
  - eks
  - vpc-lattice
  - ingress
  - gateway-api
  - networking
  - devops
---

# EKS Ingress with VPC Lattice — console guide

**VPC Lattice** provides **application-layer connectivity** across VPCs and accounts with **auth policies** and **service networks**. On EKS, teams combine **Gateway API** or **Lattice targets** with cluster ingress controllers.

**Deep labs:** [VPC Lattice path routing](./aws-vpc-lattice-path-routing-lab.md) · [EKS Lattice Gateway API](./eks-vpc-lattice-gateway-api-updated.md) · [dir/vpc-lattic-eks](./dir/vpc-lattic-eks/README.md)  
**Checklist:** [DevOps checklist](./aws-devops-system-design-checklist.md)

Official: [What is VPC Lattice?](https://docs.aws.amazon.com/vpc-lattice/latest/ug/what-is-vpc-lattice.html)

---

## Use cases

| Scenario | Why Lattice |
|----------|-------------|
| Shared platform cluster, many consumer VPCs | Service network association without VPC peering mesh |
| Fine-grained auth between services | Lattice auth policy on service |
| Gradual strangler from monolith | Path-based routing to K8s and EC2 targets |
| Internal API catalog | DNS names under service network |

**When ALB alone is enough:** single VPC, north-south HTTP only—use [ALB Ingress Controller](./eks-alb-ingress-controller.md).

---

## Architecture

```text
Consumer VPC (Lambda/ECS) ──► VPC Lattice service network ──► Lattice service ──► EKS (Gateway/HTTPRoute)
```

---

## Console — service network

1. **VPC Lattice** console → **Service networks** → **Create**.
2. Name: `platform-internal`.
3. **Auth policy** (optional): IAM-based access—define who can invoke.

---

## Console — register EKS workload

Paths vary by integration generation; typical flow:

1. **Create service** in Lattice linked to **target group** (IP targets = pod ENIs or NodePort path per design).
2. **Associate service network** with **consumer VPCs** (same or cross-account via RAM).
3. On EKS: deploy **AWS Gateway API Controller** for Lattice ([updated guide](./eks-vpc-lattice-gateway-api-updated.md)).

### EKS console touchpoints

1. **EKS** → cluster → verify **OIDC provider** for IRSA.
2. Install Lattice/Gateway controller with IAM policy from AWS docs.
3. Apply `Gateway` + `HTTPRoute` manifests pointing to `Service`.

---

## Configuration details

| Item | Note |
|------|------|
| Health checks | Lattice target health independent of K8s `ready`—align probes |
| TLS | Terminate at Lattice or pass-through—pick one model |
| DNS | Lattice-generated names; integrate with private DNS if needed |
| Security groups | Pod SG must allow Lattice ENI traffic |

---

## IAM

- Controller role: `vpc-lattice:*` scoped + `elasticloadbalancing` if hybrid.
- Consumer principals allowed in **auth policy** on service network association.

---

## Commonly missed

- Mixing **ALB Ingress** annotations with Lattice routes without clear ownership
- Forgetting **cross-account RAM** accept for service network
- Target type mismatch (instance vs IP) on Fargate
- No auth policy—open internal mesh

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 403 from Lattice | Auth policy principal |
| No healthy targets | Pod labels, `HTTPRoute` backend ref, SG |
| DNS fails in consumer VPC | Association + resolver rules |

[← Checklist](./aws-devops-system-design-checklist.md) · [Lattice application networking](./aws-vpc-lattice-application-networking.md)
