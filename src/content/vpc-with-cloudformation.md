---
title: VPC with CloudFormation
description: Deploy a lab VPC with public and private subnets using CloudFormation.
tags:
  - vpc
  - cloudformation
  - subnets
  - nat-gateway
  - security-group
  - aws
---

# VPC with CloudFormation

Deploy a lab VPC with public and private subnets using [vpc-with-cloudformation.yaml](./files/vpc-with-cloudformation.yaml).

The base template creates:

- 1 VPC (`10.0.0.0/16` by default)
- 2 public subnets and 2 private subnets across 2 AZs
- Internet Gateway and route tables

## Step 1 — Set variables

```bash
export STACK_NAME="lab-vpc-stack"
export YAML_FILE="vpc-with-cloudformation.yaml"
export AWS_REGION="$(aws configure get region)"
```

Optional parameter overrides:

```bash
export VPC_NAME="lab-vpc"
export VPC_CIDR="10.0.0.0/16"
```

## Step 2 — Add InstanceSG (optional)

Paste into `Resources`, after `PrivateSubnet1BRouteAssociation`:

```yaml
  InstanceSG:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupName: InstanceSG
      GroupDescription: Security group for EC2 instances in the VPC
      VpcId: !Ref VPC
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0
      Tags:
        - Key: Name
          Value: InstanceSG
```

Add this to `Outputs`:

```yaml
  InstanceSG:
    Value: !Ref InstanceSG
```

## Step 3 — Add NAT Gateway (optional)

> **Optional.** Skip if private subnets do not need outbound internet. Use **regional** or **zonal** — not both.

### Option A — Regional NAT (single NAT, lower cost)

Paste into `Resources`, after `PrivateSubnet1BRouteAssociation` (or after `InstanceSG` if added):

```yaml
  NatGatewayEIP:
    Type: AWS::EC2::EIP
    DependsOn: AttachGateway
    Properties:
      Domain: vpc
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-eip"

  NatGateway:
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt NatGatewayEIP.AllocationId
      SubnetId: !Ref PublicSubnet1A
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-gateway"

  PrivateDefaultRoute:
    Type: AWS::EC2::Route
    Properties:
      RouteTableId: !Ref PrivateRouteTable
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref NatGateway
```

### Option B — Zonal NAT (one NAT per AZ, higher availability)

Remove `PrivateSubnet1ARouteAssociation` and `PrivateSubnet1BRouteAssociation` from the template, then paste:

```yaml
  NatGatewayEIP1A:
    Type: AWS::EC2::EIP
    DependsOn: AttachGateway
    Properties:
      Domain: vpc
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-eip-1a"

  NatGatewayEIP1B:
    Type: AWS::EC2::EIP
    DependsOn: AttachGateway
    Properties:
      Domain: vpc
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-eip-1b"

  NatGateway1A:
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt NatGatewayEIP1A.AllocationId
      SubnetId: !Ref PublicSubnet1A
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-gateway-1a"

  NatGateway1B:
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt NatGatewayEIP1B.AllocationId
      SubnetId: !Ref PublicSubnet1B
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-gateway-1b"

  PrivateRouteTable1A:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref VPC
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-private-rt-1a"

  PrivateRouteTable1B:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref VPC
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-private-rt-1b"

  PrivateDefaultRoute1A:
    Type: AWS::EC2::Route
    Properties:
      RouteTableId: !Ref PrivateRouteTable1A
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref NatGateway1A

  PrivateDefaultRoute1B:
    Type: AWS::EC2::Route
    Properties:
      RouteTableId: !Ref PrivateRouteTable1B
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref NatGateway1B

  PrivateSubnet1ARouteAssociation:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      RouteTableId: !Ref PrivateRouteTable1A
      SubnetId: !Ref PrivateSubnet1A

  PrivateSubnet1BRouteAssociation:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      RouteTableId: !Ref PrivateRouteTable1B
      SubnetId: !Ref PrivateSubnet1B
```

## Step 4 — Deploy the stack

```bash
aws cloudformation deploy \
  --stack-name "${STACK_NAME}" \
  --template-file "${YAML_FILE}" \
  --region "${AWS_REGION}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    VpcName="${VPC_NAME:-lab-vpc}" \
    VpcCidr="${VPC_CIDR:-10.0.0.0/16}"
```

## Step 5 — Verify outputs (optional)

```bash
aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${AWS_REGION}" \
  --query "Stacks[0].Outputs"
```

Confirm these outputs exist:

- `VpcId`
- `PublicSubnet1A`, `PublicSubnet1B`
- `PrivateSubnet1A`, `PrivateSubnet1B`
- `InstanceSG` (if Step 2 was applied)
