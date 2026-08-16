---
title: Egress Only VPC Transit Gateway
description: Notes on egress-only VPC routing with AWS Transit Gateway.
tags:
  - vpc
  - transit-gateway
  - egress
  - networking
  - aws
---

# Egress Only VPC Transit Gateway

VPC A ( Dev )

Subnets: 
    - 2 public & 2 private
    - 2 Transit Gateway Subnet

Security Group
    - Default VPC
    - TransitGateway VPC  ( is it required ? )

Route Table
    - private
    - public
    - transit ( is it required ? )


VPC B ( Prod )
- same as VPC A

VPC C ( Egress )

Subnets: 
    - 2 public & 2 private
    - 2 Transit Gateway Subnet

Security Group
    - Default VPC
    - TransitGateway VPC

Transit Gateway
    
    - Attachment
      - VPC A
      - VPC B
      - VPC C
        - Appliance Mode ( If cross zone required - I'm not sure )

Transite Gateway Route Table
    - Isolated-Route-Table
      - Association
        - VPC A, VPC B
      - Propagation
        - VPC C
    - Egress-Route-Table
      - 