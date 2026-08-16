---
title: Monitoring with Grafana and Prometheus
description: Set up Grafana and Prometheus on EKS with CloudWatch observability.
tags:
  - eks
  - prometheus
  - grafana
  - cloudwatch
  - helm
  - monitoring
  - observability
  - oidc
---

# Monitoring with Grafana and Prometheus

## Monitoring With CloudWatch Observability

* **Policy Required:** `CloudWatchAgentServerPolicy`

## Monitoring With Grafana and Prometheus

1. Helm Install
```bash
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-4
chmod 700 get_helm.sh
./get_helm.sh
```
---
1. Create an IAM OIDC provider for your cluster:
```bash
eksctl utils associate-iam-oidc-provider --region <region> --cluster <cluster-name> --approve
```
2. Create an IAM policy for monitoring (for example CloudWatch).
3. Create a Kubernetes service account and associate it with the IAM role:
```bash
eksctl create iamserviceaccount \
  --name <service-account-name> \
  --namespace <namespace> \
  --cluster <cluster-name> \
  --attach-policy-arn arn:aws:iam::<account-id>:policy/<policy-name> \
  --approve
```
---
### 1. Create a Prometheus Namespace

```bash
kubectl create namespace prometheus
```

### 2. Add the Prometheus Community Chart Repository

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
```

### 3. Deploy Prometheus ( Adds Prometheus by default )

For ephemeral storage: data lost when pods are recreated:  `prometheus.prometheusSpec.storageSpec.emptyDir={}` 

```bash
helm install prometheus \
>   prometheus-community/kube-prometheus-stack \
>   -n prometheus \
>   --create-namespace \
>   --set crds.enabled=true
```

- avoid
  - ` --set alertmanager.persistence.storageClass="gp2"`
  - `--set server.persistentVolume.storageClass="gp2"`

```bash
# Check its status
kubectl --namespace prometheus get pods -l "release=prometheus"

# Get Grafana 'admin'
kubectl --namespace prometheus get secrets prometheus-grafana -o jsonpath="{.data.admin-password}" | base64 -d ; echo

# Access Grafana on local instance
export POD_NAME=$(kubectl --namespace prometheus get pod -l "app.kubernetes.io/name=grafana,app.kubernetes.io/instance=prometheus" -oname)
  kubectl --namespace prometheus port-forward $POD_NAME 3000 # 9000:3000
  
# Get Grafana 'admin'
kubectl get secret --namespace prometheus -l app.kubernetes.io/component=admin-secret -o jsonpath="{.items[0].data.admin-password}" | base64 --decode ; echo

```

### 4. Verify the Deployment

```bash
kubectl get pods -n prometheus
```

### 5. Port Forward the Prometheus Console

Use `kubectl` to port forward the Prometheus console to your local machine:

```bash
kubectl --namespace=prometheus port-forward deploy/prometheus-server 9090
```

You can then access the Prometheus console at:

```text
http://localhost:9090
```
---
### Add Grafana
```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install grafana-k8s-monitoring grafana/k8s-monitoring -n <namespace> --create-namespace
```


## debug

```bash
kubectl get events -n prometheus --sort-by=.lastTimestamp

# Check Alertmanager
kubectl describe pod prometheus-alertmanager-0 -n prometheus
```
```bash
# remove everything
kubectl delete namespace prometheus
```