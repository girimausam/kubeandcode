---
title: "AWS Architecture Reference Links"
description: "Curated Well-Architected, prescriptive guidance, workshops, and hands-on lab templates for EKS, networking, and data."
tags:
  - aws
  - architecture
  - well-architected
  - reference
  - workshops
  - eks
---
## Purpose

Curated source list for AWS architecture, operational best practices, and diagrams.

## Core references

- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [AWS Prescriptive Guidance — Cloud Design Patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/welcome.html)
- [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/)
- [AWS Reference Architecture Diagrams](https://aws.amazon.com/architecture/reference-architecture-diagrams/)

## Service references

- [Amazon EKS User Guide](https://docs.aws.amazon.com/eks/latest/userguide/)
- [AWS Network Firewall Developer Guide](https://docs.aws.amazon.com/network-firewall/latest/developerguide/)
- [Amazon VPC Lattice User Guide](https://docs.aws.amazon.com/vpc-lattice/latest/ug/)

## Workshops

Workshop reference for decoupled microservices and catalog service patterns.

- [AWS Workshop Studio — microservices catalog](https://catalog.us-east-1.prod.workshops.aws/workshops/e8738cf6-6eb0-4d1d-9e98-ae240d229535/en-US)

**Related guides:** EKS, VPC Lattice, Application Auto Scaling, and RDS patterns covered in this site.

## Lab template

Reusable template for AWS CloudOps practice: build, break, diagnose, document, and tear down.

- Architecture sketch or AWS icon diagram
- Provisioning path: Terraform, CloudFormation, SAM, eksctl, or console steps
- Day-1 setup checklist
- Day-2 operations checklist
- Failure drill and expected symptoms
- Security review: IAM, logging, encryption, network exposure
- Cost controls and teardown checklist

### Suggested labs

- Private EC2 with SSM endpoints and no inbound SSH/RDP
- RDS connectivity drill with security-group failure and recovery
- Redshift COPY from S3 with SSE-KMS permission failure
- EKS workload using Pod Identity
- Network Firewall centralized inspection with Transit Gateway

## Cross-links

- [Kubernetes on AWS](/blog/kubernetes-on-aws)
- [Networking on AWS](/blog/networking-on-aws)
- [Data on AWS](/blog/data-on-aws)

## WAF reference

- [WAF rate-based rules](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-request-aggregation.html)