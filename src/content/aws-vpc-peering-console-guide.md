---
title: "VPC peering (console guide)"
description: "When to use VPC peering, console steps, routing and DNS, and non-transitive routing traps for multi-VPC system designs."
tags:
 - aws
 - vpc
 - peering
 - networking
 - devops
---

# VPC peering (console guide)

**VPC peering** connects two VPCs at Layer 3 with **private IP routing**. Use it for **simple two-VPC** or **full mesh among few VPCs** - not as a large-scale hub (use **Transit Gateway** instead).

**Checklist:** [DevOps system design checklist](./aws-devops-system-design-checklist.md)

AWS diagram: [VPC peering](https://docs.aws.amazon.com/images/vpc/latest/peering/images/peering-intro-diagram.png)

---

## Use cases

| Scenario | Fit |
|----------|-----|
| Shared services VPC (directory, tooling) | Peering to app VPCs |
| Acquisitions / two-team accounts (same region) | Peering + RAM optional |
| Database in VPC-A, app in VPC-B | Peering + SG referencing peer CIDR |

**Poor fit:** Many VPCs needing transitive access (A↔B and B↔C does **not** give A↔C through B).

---

## Console steps

### 1. Create peering connection

1. **VPC console** → **Peering connections** → **Create peering connection**.
2. **Requester VPC** and **Accepter VPC** (same or cross-account).
3. Cross-account: accepter must **Accept** in their account.

### 2. Enable DNS resolution (if needed)

1. Select peering → **Actions** → **Edit DNS settings**.
2. Enable **Requester/accepter DNS resolution** so private hosted zone names resolve across peer (requires associated zones).

### 3. Update route tables

**Both sides** need routes:

1. **Route tables** → private RT for VPC-A → **Edit routes** → destination **VPC-B CIDR** → target **pcx-xxxxx**.
2. Repeat in VPC-B for VPC-A CIDR.

Missing **one side** = asymmetric failures.

### 4. Security groups

SG rules can reference **peer VPC CIDR** or use **referenced security group** (same region peering).

---

## IAM

Peering creation uses EC2 VPC IAM actions (`ec2:CreateVpcPeeringConnection`, `ec2:AcceptVpcPeeringConnection`). No special service role for data plane.

---

## Security

- Peering is **private** - traffic does not traverse internet.
- Still apply **least-privilege SG**; peering is not a security boundary by itself.
- **Network ACLs** apply per subnet - verify both directions.

---

## Commonly missed

| Item | Detail |
|------|--------|
| **Non-transitive** | No “route through peer VPC” to a third VPC |
| **Overlapping CIDRs** | Peering rejected or routing broken |
| **One-way routes** | Works ping one direction only |
| **DNS** | Hostnames fail without DNS resolution option + PHZ association |
| **NACL deny** | Overrides SG allow |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Peering `pending-acceptance` | Accept in accepter account |
| `active` but no traffic | Routes on both RTs; SG/NACL |
| DNS NXDOMAIN cross-VPC | DNS resolution + private zone association |
| Need 10+ VPC mesh | Migrate design to **TGW** |

Docs: [VPC peering](https://docs.aws.amazon.com/vpc/latest/peering/what-is-vpc-peering.html)

[← Checklist](./aws-devops-system-design-checklist.md) · [Transit Gateway](./aws-vpc-transit-gateway.md)
