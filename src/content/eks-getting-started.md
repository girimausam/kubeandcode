---
title: Getting Started with EKS
description: Initial EKS cluster setup including IAM roles, nodes, CNI, and ECR.
tags:
  - eks
  - iam
  - kubernetes
  - nodes
  - cni
  - ecr
  - auto-mode
---

# Getting Started with EKS

## Setup
- Cluster IAM Role
  - `AmazonEKSClusterRole` : Policies: `AmazonEKSClusterPolicy`

  Additional Policies Required ( Auto Mode ):
  - `AmazonEKSClusterPolicy`
    This policy provides Kubernetes the permissions it requires to manage resources on your behalf. Kubernetes requires Ec2:CreateTags permissions to place identifying information on EC2 resources including but not limited to Instances, Security Groups, and Elastic Network Interfaces.

  - `AmazonEKSBlockStoragePolicyV2`
    Policy attached to the EKS Cluster Role that grants permissions to manage the cluster's block storage resources.

  - `AmazonEKSComputePolicy`
    Policy attached to the EKS Cluster Role that grants permissions to manage the cluster's compute resources.

  - `AmazonEKSLoadBalancingPolicy`
    Policy attached to the EKS Cluster Role that grants permissions to manage the cluster's load balancing resources.

  - `AmazonEKSNetworkingPolicy`
    Policy attached to the EKS Cluster Role that grants permissions to manage the cluster's networking resources.

- Node IAM

  NodeGroup Role
  - `AmazonEC2ContainerRegistryReadOnly`
    Provides read-only access to Amazon EC2 Container Registry repositories.

  - `AmazonEKS_CNI_Policy`
    This policy provides the Amazon VPC CNI Plugin (amazon-vpc-cni-k8s) the permissions it requires to modify the IP address configuration on your EKS worker nodes. This permission set allows the CNI to list, describe, and modify Elastic Network Interfaces on your behalf. More information on the AWS VPC CNI Plugin is available here: https://github.com/aws/amazon-vpc-cni-k8s

  - `AmazonEKSWorkerNodePolicy`
    This policy allows Amazon EKS worker nodes to connect to Amazon EKS Clusters.

  - `AmazonElasticContainerRegistryPublicReadOnly`
    Provides read-only access to Amazon ECR Public repositories.

  Policies ( In Auto Mode ):
  - `AmazonEC2ContainerRegistryPullOnly`
    Provides access to pull images from Amazon EC2 Container Registry repositories.

  - `AmazonEKSWorkerNodeMinimalPolicy`
    This policy allows Amazon EKS worker nodes to connect to Amazon EKS Clusters.

  - `AmazonElasticContainerRegistryPublicReadOnly`
    Provides read-only access to Amazon ECR Public repositories.
