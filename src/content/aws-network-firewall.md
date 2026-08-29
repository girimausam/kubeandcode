---
title: "AWS Network Firewall"
description: "Rule groups, policies, endpoints, stateless vs stateful processing, domain lists, Suricata, TLS inspection, managed rules, and logging — with the centralized TGW lab as the multi-VPC pattern."
tags:
  - network-firewall
  - vpc
  - suricata
  - networking
  - aws
  - notes
date: 2026-08-29
---

## What it is

Layer 4–7 inspection in the VPC data path. Not a replacement for security groups or NACLs: those stay on ENIs and subnets. Network Firewall sits **on the route** (you steer CIDRs to a firewall endpoint).

| Piece | Role |
| --- | --- |
| Rule group | Stateless (per packet, 5-tuple) or stateful (flow + Suricata) |
| Firewall policy | Ordered groups, default actions, optional TLS inspection config |
| Firewall | One policy, bound to a **primary VPC** and subnet mappings |
| Firewall endpoint | Per-AZ `vpce` in a **dedicated** subnet. Cannot inspect that subnet |

Create empty **firewall subnets** (one AZ each). Put no workloads there. Extra endpoints (same AZ, same or other VPCs) use **VPC endpoint associations**; extra VPCs may only use AZs that already have a primary mapping. Capacity: **100 Gbps per AZ**, shared across endpoints on that firewall in the AZ.

---

## How a packet is filtered

[Policy processing](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-policy-processing.html):

1. **Stateless** engine — rule groups by priority (lowest first). Match → drop, pass (skip stateful), or **forward to stateful**.
2. If **no** stateless match: **stateless default** (full packet vs UDP fragment). Default must be **forward to stateful** if you want Suricata/domain lists at all. Other protocols’ fragments are dropped.
3. **Stateful** engine (Suricata) — flow-aware. Logs apply here only.

**Stateful rule order** on the policy:

| Mode | Behavior |
| --- | --- |
| **Strict order** (recommended) | Your sequence, then a **default** you set (drop/pass/alert). |
| **Action order** (legacy “default”) | All `pass`, then `drop`/`reject`, then `alert`. First match wins. Unmatched traffic **passes**. |

Unlike security groups, the stateful engine’s action-order default is **allow**.

---

## Stateful rule groups

| Kind | Use |
| --- | --- |
| Domain list | HTTP `Host` and/or TLS **SNI** (no extra DNS lookup). Wildcard `.example.com`. Allowlist or denylist. |
| 5-tuple / standard | Port, protocol, CIDR in flow context |
| Suricata IPS | Compatible signatures (`pass` / `drop` / `reject` / `alert`) |
| AWS managed | Active threat defense; domain/IP lists; threat signatures. Most at no extra rule-group charge. Override a group to **alert** before enforce. Marketplace groups exist separately. |

SNI/Host can be spoofed; pair with IP rules if that matters. Domain lists do **not** decrypt TLS.

Lab allowlist (CloudFormation): [`inspection.yaml`](./dir/vpc/egress-firewall/inspection.yaml) — `ALLOWLIST` + `TLS_SNI` + `.amazonaws.com`.

Workshop-style Suricata (HTTP host, TLS SNI, then drop other established TCP):

<details>
<summary><strong>Example Suricata rules</strong></summary>

```text
pass http any any -> any any (http.host; dotprefix; content:".amazonaws.com"; endswith; msg:"Permit HTTP to amazonaws.com"; sid:1000001; rev:1;)

pass tls any any -> any any (tls.sni; content:"aws.amazon.com"; startswith; nocase; endswith; msg:"Permit HTTPS to aws.amazon.com"; sid:1000002; rev:1;)

drop tcp any any -> any any (flow:established,to_server; msg:"Deny other TCP"; sid:1000003; rev:1;)
```

`sid` values must be unique in the group. The drop rule does not cover UDP/ICMP. Under **action order**, all `pass` rules run before `drop`.

</details>

---

## TLS inspection (decrypt)

Optional. Separate from SNI matching. Attach a **TLS inspection configuration** to a **new** policy, then to the firewall. ACM certificates required.

| Direction | Certificate |
| --- | --- |
| Inbound | Server cert in ACM per domain you decrypt |
| Outbound | **CA** you import to ACM; firewall mints certs to the client. Trust that CA on clients. |

After decrypt, HTTP keywords apply; most TLS keywords except `tls.sni` do not match decrypted flows. Scope is 5-tuple (often `:443`). Client Hello **without SNI**, Encrypted Client Hello / encrypted SNI, and some TLS 1.3 cases: connection **RST**. Self-signed downstream certs are not supported for outbound verification (public Mozilla roots). Optional revocation checks on outbound. Billing: **advanced inspection** traffic + endpoints.

---

## Routing

Firewall does nothing until route tables send traffic through the endpoint **and back**. Typical single-VPC internet path: workload subnet `0.0.0.0/0` → `vpce`; IGW/NAT edge RT for the workload CIDR → same `vpce`; firewall subnet RT → IGW/NAT and `local`.

Steer **both directions** if you need both inspected. Use the endpoint in the **same AZ** as the workload. Multi-AZ stateful inspection behind Transit Gateway: **appliance mode** on the inspection attachment — [egress + TGW lab](./vpc-egress-tgw-firewall.md).

**Models:** firewall in each VPC (distributed) vs inspection VPC on TGW (centralized). Same policy object; different routing.

---

## Logging and metrics

Stateful only (traffic that was forwarded). Destinations: CloudWatch Logs, S3, Firehose.

| Log type | Content |
| --- | --- |
| FLOW | Flows the stateful engine saw |
| ALERT | `drop` / `reject` / `alert` matches |
| TLS | TLS inspection events (needs TLS inspection) |

Enable before you need forensics. CloudWatch metrics cover both engines at a coarser grain.

---

## Order of work

1. Firewall subnets (empty) per AZ.  
2. Rule groups → policy (stateless default **forward to SFE**; prefer **strict** order).  
3. Firewall + subnet mappings.  
4. Routes (and TGW tables if centralized).  
5. Logging.  
6. Optional: managed groups (alert mode first), TLS inspection, VPC endpoint associations.

---

## References

- [What is Network Firewall](https://docs.aws.amazon.com/network-firewall/latest/developerguide/what-is-aws-network-firewall.html)
- [Components](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-components.html)
- [How traffic is filtered](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-policy-processing.html)
- [Subnet layout](https://docs.aws.amazon.com/network-firewall/latest/developerguide/vpc-config-subnets.html)
- [Route tables](https://docs.aws.amazon.com/network-firewall/latest/developerguide/vpc-config-route-tables.html)
- [Domain lists](https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-domain-names.html)
- [Suricata rule groups](https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html)
- [Managed rule groups](https://docs.aws.amazon.com/network-firewall/latest/developerguide/nwfw-managed-rule-groups.html)
- [TLS inspection](https://docs.aws.amazon.com/network-firewall/latest/developerguide/tls-inspection-configurations.html)
- [Logging](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-logging.html)
- [Deployment models (blog)](https://aws.amazon.com/blogs/networking-and-content-delivery/deployment-models-for-aws-network-firewall/)
- [Centralized egress lab](./vpc-egress-tgw-firewall.md)
- [Networking on AWS](./networking-on-aws.md)
