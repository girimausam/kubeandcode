---
title: Prometheus with EBS CSI Driver
description: Run Prometheus on EKS with persistent volumes via the AWS EBS CSI driver.
tags:
  - eks
  - prometheus
  - ebs
  - ebs-csi-driver
  - kubernetes
  - storageclass
  - pvc
  - gp3
---

# Prometheus with EBS CSI Driver

EKS clusters often ship with a legacy `gp2` StorageClass using the in-tree `kubernetes.io/aws-ebs` provisioner. On newer Kubernetes versions, volume provisioning is migrated to `ebs.csi.aws.com` — so PVCs stay `Pending` until the AWS EBS CSI driver is installed.

```text
kubectl get storageclass

NAME   PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
gp2    kubernetes.io/aws-ebs   Delete          WaitForFirstConsumer   false                  10h
```

This guide installs the EBS CSI driver, creates a `gp3` StorageClass, and points Prometheus at it.

## 1. Check current StorageClasses

```bash
kubectl get storageclass
```

Legacy `gp2` uses `kubernetes.io/aws-ebs`. The target is a CSI-based `gp3` class using `ebs.csi.aws.com`.

## 2. Install the AWS EBS CSI driver

Set cluster variables:

```bash
export CLUSTER_NAME=<your-cluster-name>
export AWS_REGION=$(aws configure get region)
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

Check if the add-on is already installed:

```bash
aws eks describe-addon \
  --cluster-name "$CLUSTER_NAME" \
  --addon-name aws-ebs-csi-driver \
  --region "$AWS_REGION"
```

Create the IAM role for the CSI controller:

```bash
eksctl utils associate-iam-oidc-provider --cluster "$CLUSTER_NAME" --approve

eksctl create iamserviceaccount \
  --name ebs-csi-controller-sa \
  --namespace kube-system \
  --cluster "$CLUSTER_NAME" \
  --role-name AmazonEKS_EBS_CSI_DriverRole \
  --role-only \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
  --approve
```

Install the add-on:

```bash
eksctl create addon \
  --name aws-ebs-csi-driver \
  --cluster "$CLUSTER_NAME" \
  --service-account-role-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/AmazonEKS_EBS_CSI_DriverRole" \
  --force
```

Verify the driver is running:

```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-ebs-csi-driver
```

## 3. Create a gp3 StorageClass

Do not delete the existing `gp2` StorageClass — existing PVCs may still depend on it.

Unset `gp2` as the default (if it is):

```bash
kubectl patch storageclass gp2 \
  -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
```

Create `gp3-storageclass.yaml`:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
reclaimPolicy: Delete
```

Apply:

```bash
kubectl apply -f gp3-storageclass.yaml
kubectl get storageclass
```

Expected output includes:

```text
gp3    ebs.csi.aws.com   Delete   WaitForFirstConsumer   true
```

## 4. Configure Prometheus storage

Add to `values.yaml`:

```yaml
prometheus:
  prometheusSpec:
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 50Gi
```

Apply:

```bash
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  -n prometheus \
  -f values.yaml
```

If Prometheus was previously installed with a pending PVC on `gp2`, delete the stuck PVC before upgrading so it can be recreated on `gp3`:

```bash
kubectl get pvc -n prometheus
kubectl delete pvc -n prometheus <stuck-pvc-name>
```

## 5. Verify

```bash
kubectl get pvc -n prometheus
kubectl get pods -n prometheus
```

PVCs should be `Bound` and Prometheus pods `Running`.

## Alternative: disable persistence

For dev or temporary setups, skip EBS entirely and use ephemeral storage:

```bash
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  -n prometheus \
  --set prometheus.prometheusSpec.storageSpec=null
```

Metrics are lost when the pod is rescheduled.
