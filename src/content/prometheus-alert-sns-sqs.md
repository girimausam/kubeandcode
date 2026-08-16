---
title: Prometheus Alerts with SNS and SQS
description: Wire Prometheus Alertmanager to SNS and SQS on EKS.
tags:
  - eks
  - prometheus
  - alertmanager
  - sns
  - sqs
  - pod-identity
  - iam
  - monitoring
---
# Prometheus Alerts with SNS and SQS

## 1. Create SNS topic

```bash
aws sns create-topic \
  --name eks-prometheus-alerts \
  --region us-east-1
```

## 2. Allow Alertmanager to publish to SNS

```bash
cat <<EOF > sns-publish-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:us-east-1:123456789012:eks-prometheus-alerts"
    }
  ]
}
EOF
```

## 3. Create IAM role for Pod Identity

### Trust policy

```bash
cat <<EOF > alertmanager-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "pods.eks.amazonaws.com"
      },
      "Action": [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
    }
  ]
}
EOF
```

### Create role and policy

```bash
aws iam create-role \
  --role-name EKS-Alertmanager-SNS \
  --assume-role-policy-document file://alertmanager-trust-policy.json

aws iam create-policy \
  --policy-name PrometheusAlertmanagerSNSPolicy \
  --policy-document file://sns-publish-policy.json
```

**Attach the policy to the role:**

```bash
aws iam attach-role-policy \
  --role-name EKS-Alertmanager-SNS \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/PrometheusAlertmanagerSNSPolicy
```

## 4. Use EKS Pod Identity for Alertmanager

Ensure the `eks-pod-identity-agent` add-on is installed:

```bash
kubectl get pods -n kube-system | grep eks-pod-identity-agent
```

**Verify the Alertmanager service account:**

This guide uses the `prometheus` namespace and `prometheus-kube-prometheus-alertmanager` service account. The namespace and service account name can differ depending on how kube-prometheus-stack was installed.

```bash
kubectl get sa -n prometheus

kubectl get pod \
  -n prometheus \
  alertmanager-prometheus-kube-prometheus-alertmanager-0 \
  -o jsonpath='{.spec.serviceAccountName}{"\n"}'
```

**Create the Pod Identity association.** Replace `<CLUSTER_NAME>` and `<ACCOUNT_ID>`:

This links the Alertmanager service account to the IAM role so the pod can publish to SNS without static credentials.

```bash
aws eks create-pod-identity-association \
  --cluster-name <CLUSTER_NAME> \
  --namespace prometheus \
  --service-account prometheus-kube-prometheus-alertmanager \
  --role-arn arn:aws:iam::<ACCOUNT_ID>:role/EKS-Alertmanager-SNS \
  --region us-east-1
```

Pod Identity credentials are injected when a pod starts. An already-running Alertmanager pod will not use the association until it is restarted.

```bash
kubectl rollout restart statefulset \
  alertmanager-prometheus-kube-prometheus-alertmanager \
  -n prometheus
```

**Verify the association:**

```bash
aws eks list-pod-identity-associations \
  --cluster-name <CLUSTER_NAME> \
  --region us-east-1
```

## 5. Alertmanager configuration

```yaml
# values.yaml
alertmanager:
  alertmanagerSpec:
    serviceAccountName: prometheus-kube-prometheus-alertmanager

  config:
    global:
      resolve_timeout: 5m

    route:
      receiver: sns
      group_by:
        - alertname
        - namespace
        - pod
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 1h

    receivers:
      - name: sns
        sns_configs:
          - topic_arn: arn:aws:sns:us-east-1:<ACCOUNT_ID>:eks-prometheus-alerts
            sigv4:
              region: us-east-1
            send_resolved: true
```

**Apply:**

```bash
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  -n prometheus \
  -f values.yaml
```

## 6. Verify

Wait for the Alertmanager rollout:

```bash
kubectl rollout status statefulset \
  alertmanager-prometheus-kube-prometheus-alertmanager \
  -n prometheus
```

Confirm Alertmanager received AWS credentials from Pod Identity:

```bash
kubectl exec -n prometheus \
  alertmanager-prometheus-kube-prometheus-alertmanager-0 \
  -- env | grep AWS
```

