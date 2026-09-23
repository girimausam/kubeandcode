---
title: "Site-to-Site VPN on AWS (console guide)"
description: "Production-oriented Site-to-Site VPN - VGW and Transit Gateway paths, routing, security, and commonly missed console settings."
tags:
 - aws
 - vpn
 - site-to-site
 - networking
 - transit-gateway
 - devops
---

# Site-to-Site VPN on AWS (console guide)

Connect on-premises or partner networks to AWS over **IPsec**. In system designs this appears with **hybrid DNS**, **Active Directory**, **legacy ERP access to RDS**, and **gradual migration** before Direct Connect.

**Checklist:** [AWS DevOps system design checklist](./aws-devops-system-design-checklist.md)

Official diagram (VPN to VPC): [AWS Site-to-Site VPN](https://docs.aws.amazon.com/images/vpn/latest/s2svpn/images/vpn-generic-diagram.png)

---

## Use cases

| Scenario | Pattern |
|----------|---------|
| Branch office → AWS apps | VPN to VPC with private subnets |
| Multi-VPC hub | VPN → **Transit Gateway** → spoke VPCs |
| Backup connectivity | VPN as failover to Direct Connect |
| Dev/test hybrid | Single tunnel, static routes (not HA) |

---

## Architecture choices

| Attachment | When |
|------------|------|
| **Virtual private gateway (VGW)** on VPC | One VPC, simple hub |
| **Transit Gateway** VPN attachment | Many VPCs, shared on-prem route domain |

```text
On-prem firewall ──IPsec──► AWS VPN endpoint ──► VGW or TGW ──► VPC route tables
```

---

## Console implementation - VPN to a VPC (VGW)

### 1. Customer gateway (your side)

1. **VPC console** → **Customer gateways** → **Create customer gateway**.
2. **BGP ASN:** your device ASN (or static if not using BGP).
3. **IP address:** public IP of on-prem VPN device.
4. **Device:** optional vendor hint.

### 2. Virtual private gateway

1. **Virtual private gateways** → **Create virtual private gateway**.
2. Attach to **target VPC** (one VGW per VPC attachment model).
3. Wait until **attached**.

### 3. Site-to-Site VPN connection

1. **Site-to-Site VPN connections** → **Create VPN connection**.
2. **Target gateway type:** Virtual private gateway **or** Transit gateway.
3. Select **customer gateway** and **VGW/TGW**.
4. **Routing:** **Static** (you maintain routes) or **BGP** (dynamic).
5. Download **configuration file** for your firewall (Cisco, Juniper, etc.).

### 4. Route tables

**Static routing:**

1. **VPC route tables** (private subnets): add route `10.0.0.0/8` (on-prem) → **Virtual private gateway**.
2. On-prem: route AWS VPC CIDR → VPN tunnel.

**BGP:** Enable route propagation on route table associated with VGW.

### 5. Security groups & NACLs

- RDS/EC2 SGs must allow **on-prem CIDR** on app ports - not `0.0.0.0/0`.
- NACLs must permit return traffic symmetrically.

---

## Console implementation - VPN to Transit Gateway

1. Create **Transit Gateway** ([TGW guide](./aws-vpc-transit-gateway.md)).
2. **VPN attachment** on TGW instead of VGW.
3. Associate **spoke VPC attachments** with TGW route tables.
4. Propagate VPN routes into TGW RT; static routes from TGW to VPC attachments.

Use when the exam scenario mentions **multiple VPCs** and **on-prem** in one diagram.

---

## IAM & permissions

Console users need `ec2:CreateVpnConnection`, `ec2:CreateCustomerGateway`, etc. (often via `NetworkAdministrator` policy). **VPN does not use IAM roles for traffic** - authorization is **IP routing + SG + NACL + resource policies**.

---

## Security considerations

- Prefer **two tunnels** (AWS provides two endpoints) for HA - terminate both on-prem.
- Use **IKEv2** strong crypto suites per downloaded config.
- Monitor **VPN Connection** CloudWatch metrics (`TunnelState`).
- Do not expose admin APIs publicly; hybrid access should land in **private subnets**.

---

## Commonly missed

| Miss | Impact |
|------|--------|
| Overlapping CIDR (on-prem vs VPC) | Routing blackholes |
| Forgot route propagation (BGP) | One-way connectivity |
| Security group only allows VPC CIDR | On-prem cannot reach RDS |
| NAT in path for VPN traffic | Broken return path for stateful flows |
| Single tunnel in prod | No redundancy |

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Tunnel DOWN | PSK, peer IP, UDP 500/4500, IKE versions |
| Tunnel UP, no ping | Routes, SG, NACL, wrong destination CIDR |
| Intermittent | MSS/MTU - try TCP MSS clamping 1370 |
| Works to EC2, not RDS | RDS SG missing on-prem CIDR |

Docs: [Site-to-Site VPN](https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html) · [TGW VPN](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpn-attachments.html)

[← Checklist](./aws-devops-system-design-checklist.md)
