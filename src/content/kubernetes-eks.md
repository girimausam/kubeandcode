---
title: Kubernetes on EKS — Core Resource Examples
description: Minimal YAML samples for common Kubernetes resources on EKS.
tags:
  - eks
  - kubernetes
  - deployment
  - pod
  - service
  - configmap
  - secret
  - serviceaccount
  - ebs
  - efs
  - s3
  - secrets-manager
  - parameter-store
  - ssm
  - hpa
  - vpa
  - autoscaling
---

# Kubernetes on EKS — Core Resource Examples

Minimal YAML samples for common Kubernetes resources on EKS. All examples use namespace `my-app`.

## Apply all

```bash
kubectl create namespace my-app
kubectl apply -f .
```

---

## ServiceAccount

Identity for pods. Used with IRSA or EKS Pod Identity for AWS API access.

```yaml
# serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app-sa
  namespace: my-app
```

---

## ConfigMap

Non-sensitive configuration. Mounted as a file or injected as environment variables.

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-config
  namespace: my-app
data:
  APP_ENV: production
  LOG_LEVEL: info
  config.ini: |
    [app]
    port = 8080
    [aws]
    region = us-east-1
```

---

## Secret

Sensitive values — base64-encoded in `data`, or plain text in `stringData` (encoded automatically).

```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-app-secret
  namespace: my-app
type: Opaque
stringData:
  DB_USER: admin
  DB_PASSWORD: changeme
```

---

## Pod

A single pod. Prefer a **Deployment** for production — it manages replicas and rollouts.

```yaml
# pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-app-pod
  namespace: my-app
  labels:
    app: my-app
spec:
  serviceAccountName: my-app-sa
  containers:
    - name: my-app
      image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
      ports:
        - containerPort: 8080
      env:
        - name: APP_ENV
          valueFrom:
            configMapKeyRef:
              name: my-app-config
              key: APP_ENV
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: my-app-secret
              key: DB_PASSWORD
      volumeMounts:
        - name: config-volume
          mountPath: /app/config.ini
          subPath: config.ini
          readOnly: true
  volumes:
    - name: config-volume
      configMap:
        name: my-app-config
```

---

## Deployment

Manages replica pods with rolling updates. Typical way to run apps on EKS.

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: my-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      serviceAccountName: my-app-sa
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          ports:
            - containerPort: 8080
          env:
            - name: APP_ENV
              valueFrom:
                configMapKeyRef:
                  name: my-app-config
                  key: APP_ENV
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: my-app-secret
                  key: DB_PASSWORD
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          volumeMounts:
            - name: config-volume
              mountPath: /app/config.ini
              subPath: config.ini
              readOnly: true
      volumes:
        - name: config-volume
          configMap:
            name: my-app-config
```

---

## Deployment — EBS, EFS, S3, and Secrets Manager

Each example mounts a different storage backend or secret source. Requires the corresponding CSI driver or add-on on the cluster.

| Mount | Driver / add-on | Access mode |
|---|---|---|
| EBS | `aws-ebs-csi-driver` | ReadWriteOnce (single pod) |
| EFS | `aws-efs-csi-driver` | ReadWriteMany (shared across pods) |
| S3 | `aws-mountpoint-s3-csi-driver` | ReadWriteMany (object storage) |
| Secrets Manager | ASCP CSI + `usePodIdentity: "true"` | Files under `/mnt/secrets-store` |
| Parameter Store | ASCP CSI + `usePodIdentity: "true"` | Files under `/mnt/secrets-store` |

### EBS (block storage)

Requires a `gp3` StorageClass — see [Prometheus with EBS CSI Driver](prometheus-ebs-csi-driver.md).

```yaml
# pvc-ebs.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-ebs
  namespace: my-app
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3
  resources:
    requests:
      storage: 10Gi
```

```yaml
# deployment-ebs.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-ebs
  namespace: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app-ebs
  template:
    metadata:
      labels:
        app: my-app-ebs
    spec:
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: my-app-ebs
```

### EFS (shared file storage)

Create an EFS file system first, then install the [EFS CSI driver](https://docs.aws.amazon.com/eks/latest/userguide/efs-csi.html).

```yaml
# storageclass-efs.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: efs-sc
provisioner: efs.csi.aws.com
parameters:
  provisioningMode: efs-ap
  fileSystemId: fs-<efs-id>
  directoryPerms: "700"
```

```yaml
# pvc-efs.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-efs
  namespace: my-app
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: efs-sc
  resources:
    requests:
      storage: 5Gi
```

```yaml
# deployment-efs.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-efs
  namespace: my-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app-efs
  template:
    metadata:
      labels:
        app: my-app-efs
    spec:
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          volumeMounts:
            - name: shared-data
              mountPath: /shared
      volumes:
        - name: shared-data
          persistentVolumeClaim:
            claimName: my-app-efs
```

### S3 (object storage)

Uses the [Mountpoint for Amazon S3 CSI driver](https://docs.aws.amazon.com/eks/latest/userguide/s3-csi.html). Mounts a bucket as a filesystem path (read-heavy workloads).

```yaml
# pv-s3.yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: s3-pv
spec:
  capacity:
    storage: 1200Gi   # required but not enforced for S3
  accessModes:
    - ReadWriteMany
  mountOptions:
    - region <region>
  csi:
    driver: s3.csi.aws.com
    volumeHandle: <bucket-name>
    volumeAttributes:
      bucketName: <bucket-name>
```

```yaml
# pvc-s3.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-s3
  namespace: my-app
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: ""
  resources:
    requests:
      storage: 1200Gi
  volumeName: s3-pv
```

```yaml
# deployment-s3.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-s3
  namespace: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app-s3
  template:
    metadata:
      labels:
        app: my-app-s3
    spec:
      serviceAccountName: my-app-sa   # needs s3:GetObject on the bucket
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          volumeMounts:
            - name: s3-data
              mountPath: /assets
              readOnly: true
      volumes:
        - name: s3-data
          persistentVolumeClaim:
            claimName: my-app-s3
```

### Secrets Manager (ASCP + Pod Identity)

Uses the [AWS Secrets and Configuration Provider (ASCP)](https://docs.aws.amazon.com/systems-manager/latest/userguide/ascp-pod-identity-integration.html) CSI driver. Secrets mount as files under `/mnt/secrets-store`.

**Prerequisites:**

- `eks-pod-identity-agent` add-on
- [Secrets Store CSI Driver](https://secrets-store-csi-driver.sigs.k8s.io/) installed with sync enabled: `--set syncSecret.enabled=true`
- [AWS provider](https://github.com/aws/secrets-store-csi-driver-provider-aws) installed
- Pod Identity association on `my-app-sa` with `secretsmanager:GetSecretValue` — see [CodeCommit to ArgoCD](codecommit-eks-argocd.md#4-app-iam--secrets-manager)

RDS secrets in Secrets Manager are JSON (`username`, `password`, etc.). Use `jmesPath` to extract keys — `secretObjects.data.objectName` must reference the **objectAlias**, not the secret name.

```yaml
# secretproviderclass.yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: aws-secrets
  namespace: my-app
spec:
  provider: aws
  parameters:
    usePodIdentity: "true"          # required for Pod Identity; omit or "false" for IRSA
    objects: |
      - objectName: "<rds-secret-name>"
        objectType: "secretsmanager"
        jmesPath:
          - path: "username"
            objectAlias: "db-username"
          - path: "password"
            objectAlias: "db-password"
  secretObjects:                    # optional — sync to a K8s Secret (needs syncSecret.enabled=true)
    - secretName: my-app-db-secret
      type: Opaque
      data:
        - objectName: db-username   # objectAlias from jmesPath, not the secret name
          key: username
        - objectName: db-password
          key: password
```

```yaml
# deployment-secrets-manager.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-sm
  namespace: my-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app-sm
  template:
    metadata:
      labels:
        app: my-app-sm
    spec:
      serviceAccountName: my-app-sa
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          volumeMounts:
            - name: secrets-store-inline
              mountPath: /mnt/secrets-store
              readOnly: true
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: my-app-db-secret
                  key: password
      volumes:
        - name: secrets-store-inline
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: aws-secrets
```

Verify the mount:

```bash
kubectl exec -it deploy/my-app-sm -n my-app -- cat /mnt/secrets-store/db-password
```

**Alternative — SDK in application code:** skip the CSI driver and call `secretsmanager:GetSecretValue` from the app using Pod Identity on `my-app-sa`.

### Parameter Store (ASCP + Pod Identity)

Same [ASCP CSI driver](https://docs.aws.amazon.com/systems-manager/latest/userguide/ascp-pod-identity-integration.html) as Secrets Manager — set `objectType: "ssmparameter"` instead. Pod Identity association on `my-app-sa` needs `ssm:GetParameter` and `ssm:GetParameters` on the parameter ARN.

```bash
cat <<EOF > my-app-ssm-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:DescribeParameters"
      ],
      "Resource": "arn:aws:ssm:<region>:<account-id>:parameter/myapp/*"
    }
  ]
}
EOF
```

**String parameter** — value mounts as a file. Use `objectAlias` for a clean filename (slashes in parameter paths are not valid filenames).

```yaml
# secretproviderclass-ssm.yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: aws-ssm-params
  namespace: my-app
spec:
  provider: aws
  parameters:
    usePodIdentity: "true"
    objects: |
      - objectName: "/myapp/config/api-key"
        objectType: "ssmparameter"
        objectAlias: "api-key"
      - objectName: "/myapp/config/log-level"
        objectType: "ssmparameter"
        objectAlias: "log-level"
  secretObjects:
    - secretName: my-app-ssm-secret
      type: Opaque
      data:
        - objectName: api-key        # objectAlias
          key: API_KEY
        - objectName: log-level
          key: LOG_LEVEL
```

**JSON parameter** — use `jmesPath` to extract individual keys (same pattern as Secrets Manager):

```yaml
# secretproviderclass-ssm-json.yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: aws-ssm-json
  namespace: my-app
spec:
  provider: aws
  parameters:
    usePodIdentity: "true"
    objects: |
      - objectName: "/myapp/database/config"
        objectType: "ssmparameter"
        jmesPath:
          - path: "host"
            objectAlias: "db-host"
          - path: "port"
            objectAlias: "db-port"
  secretObjects:
    - secretName: my-app-db-config
      type: Opaque
      data:
        - objectName: db-host
          key: host
        - objectName: db-port
          key: port
```

Mount in a Deployment (same volume pattern as Secrets Manager):

```yaml
# deployment-ssm.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-ssm
  namespace: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app-ssm
  template:
    metadata:
      labels:
        app: my-app-ssm
    spec:
      serviceAccountName: my-app-sa
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          volumeMounts:
            - name: secrets-store-inline
              mountPath: /mnt/secrets-store
              readOnly: true
          env:
            - name: API_KEY
              valueFrom:
                secretKeyRef:
                  name: my-app-ssm-secret
                  key: API_KEY
      volumes:
        - name: secrets-store-inline
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: aws-ssm-params
```

Verify:

```bash
kubectl exec -it deploy/my-app-ssm -n my-app -- cat /mnt/secrets-store/api-key
```

---

## Service

Exposes pods inside the cluster (ClusterIP) or externally (LoadBalancer on EKS).

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
  namespace: my-app
spec:
  type: ClusterIP
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 8080
      protocol: TCP
```

**LoadBalancer** (creates an AWS ELB):

```yaml
# service-lb.yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app-lb
  namespace: my-app
spec:
  type: LoadBalancer
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 8080
      protocol: TCP
```

---

## HPA (Horizontal Pod Autoscaler)

Scales pod **replica count** based on CPU, memory, or custom metrics. Requires [metrics-server](https://docs.aws.amazon.com/eks/latest/userguide/metrics-server.html) on the cluster.

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app
  namespace: my-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

The target Deployment must define `resources.requests` — HPA compares usage against requests.

Verify:

```bash
kubectl get hpa -n my-app
kubectl describe hpa my-app -n my-app
```

---

## VPA (Vertical Pod Autoscaler)

Adjusts pod **CPU/memory requests and limits** based on historical usage. Not included in EKS by default — install the [VPA add-on](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler) first:

```bash
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/latest/download/vertical-pod-autoscaler.yaml
```

Do not use VPA and HPA on the same Deployment for CPU — they conflict. Use HPA for replica scaling, or VPA for right-sizing resources.

```yaml
# vpa.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: my-app
  namespace: my-app
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  updatePolicy:
    updateMode: Auto        # Off | Initial | Recreate | Auto
  resourcePolicy:
    containerPolicies:
      - containerName: my-app
        minAllowed:
          cpu: 100m
          memory: 128Mi
        maxAllowed:
          cpu: "1"
          memory: 1Gi
```

| `updateMode` | Behavior |
|---|---|
| `Off` | Recommendations only (no changes applied) |
| `Initial` | Apply on pod creation |
| `Recreate` | Evict and recreate pods with new resources |
| `Auto` | Recreate pods when resources need updating |

Verify:

```bash
kubectl get vpa -n my-app
kubectl describe vpa my-app -n my-app
```

---

## Verify

```bash
kubectl get sa,configmap,secret,pvc,pv,deployment,svc,hpa,vpa -n my-app
kubectl describe deployment my-app -n my-app
kubectl get secretproviderclass -n my-app
```
