---
title: "OrderFlow CLI and Operations Snippets"
description: "Copy-paste EKS, IRSA, RDS, SQS, ingress, and add-on commands for the OrderFlow migration project."
tags:
  - orderflow
  - eks
  - irsa
  - rds
  - sqs
  - cli
  - snippets
  - aws
---
Copy-paste commands for [OrderFlow on AWS](/blog/orderflow-aws). The guide covers architecture and decisions; this page holds operational snippets.

## EKS cluster and nodes

```bash
aws eks describe-cluster --name orderflow-cluster \
  --query 'cluster.{Status:status,Version:version,Endpoint:endpoint,OIDC:identity.oidc.issuer}'

aws eks update-kubeconfig --name orderflow-cluster --region us-east-1
kubectl get nodes -o wide
kubectl get pods -A
```

## OIDC and IRSA

```bash
aws iam list-open-id-connect-providers

## API — Secrets Manager + RDS access
eksctl create iamserviceaccount \
  --cluster orderflow-cluster \
  --namespace orderflow \
  --name orderflow-api \
  --attach-policy-arn arn:aws:iam::ACCOUNT_ID:policy/OrderFlowApiPolicy \
  --approve

## Worker — SQS, SNS, DynamoDB
eksctl create iamserviceaccount \
  --cluster orderflow-cluster \
  --namespace orderflow \
  --name orderflow-worker \
  --attach-policy-arn arn:aws:iam::ACCOUNT_ID:policy/OrderFlowWorkerPolicy \
  --approve

kubectl describe pod -n orderflow -l app=orderflow-api | grep -E 'AWS_ROLE_ARN|AWS_WEB_IDENTITY'
```

## Add-ons and ingress

```bash
kubectl get deployment -n kube-system aws-load-balancer-controller
kubectl get pods -n kube-system -l app=ebs-csi-controller
kubectl get storageclass gp3

kubectl create namespace orderflow --dry-run=client -o yaml | kubectl apply -f -
kubectl get ingress -n orderflow
kubectl describe ingress orderflow-ingress -n orderflow
```

## ECR login and push

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGION=us-east-1

aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

## Repositories: orderflow/api, orderflow/frontend, orderflow/worker
docker tag orderflow-api:v1 $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/orderflow/api:v1
docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/orderflow/api:v1
```

## RDS connectivity

```bash
kubectl run postgres-client -n orderflow --image=postgres:17 --restart=Never -- sleep infinity
kubectl exec -it postgres-client -n orderflow -- pg_isready -h <rds-endpoint> -p 5432
kubectl exec -it postgres-client -n orderflow -- \
  psql -h <rds-endpoint> -U orderflow -d orderflowdb -c "SELECT count(*) FROM orders;"
kubectl delete pod postgres-client -n orderflow
```

## API smoke test

```bash
ALB=$(kubectl get ingress orderflow-ingress -n orderflow -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
curl -s "http://${ALB}/health"
curl -s -X POST "http://${ALB}/orders" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"ord-001","status":"CREATED"}'
```

## SQS, SNS, DynamoDB

```bash
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/orderflow-orders \
  --attribute-names ApproximateNumberOfMessages,ApproximateNumberOfMessagesNotVisible

aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:orderflow-notifications

aws dynamodb describe-table --table-name orderflow-events \
  --query 'Table.{Name:TableName,Status:TableStatus,ItemCount:ItemCount}'
```

## Worker rollout and logs

```bash
kubectl apply -f k8s/worker-deployment.yaml
kubectl rollout status deployment/orderflow-worker -n orderflow
kubectl logs -f deployment/orderflow-worker -n orderflow
```

## CloudWatch agents

```bash
kubectl get pods -n amazon-cloudwatch
```