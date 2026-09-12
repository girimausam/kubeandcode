---
title: "What Is a vCPU on AWS?"
description: "How virtual CPUs map to physical cores on Intel, AMD, and Graviton instances-and how vCPU limits affect EC2 capacity."
tags:
  - ec2
  - compute
  - vcpu
  - graviton
  - aws
---## Overview

A **vCPU (virtual Central Processing Unit)** is a logical unit of compute capacity, not a physical object. It represents a time-share on a physical CPU core, managed by a hypervisor.

> If a physical processor core is a worker, a **vCPU is an assigned task slot** for that worker.

## vCPU in general virtualization

In virtualization (VMware, VirtualBox, cloud platforms), the system maps virtual resources to physical hardware. Physical CPUs with **Simultaneous Multithreading (SMT)** - Hyper-Threading on Intel - can often run two execution threads per core.

## vCPU in AWS

AWS uses vCPUs as the standard unit for EC2 instance capacity and account limits.

- **Intel/AMD instances:** one physical core typically equals **two vCPUs** (SMT enabled).
- **AWS Graviton (ARM):** no SMT - **one vCPU equals one physical core**.
- **Account limits:** total vCPU quota caps how many instances you can run across types.

### Example: m5.xlarge

1. **Specification:** 4 vCPUs
2. **Physical mapping:** 2 physical cores
3. **Math:** 2 cores × 2 threads/core = 4 vCPUs