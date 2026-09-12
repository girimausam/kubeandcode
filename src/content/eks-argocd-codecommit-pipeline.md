---
title: CodeCommit to ArgoCD Pipeline on EKS
description: End-to-end GitOps from CodeCommit through CodePipeline to Argo CD on EKS.
tags:
  - eks
  - argocd
  - codecommit
  - codepipeline
  - codebuild
  - ecr
  - cicd
  - gitops
---

# CodeCommit to ArgoCD Pipeline on EKS

End-to-end GitOps: push application code → CodePipeline builds and pushes to ECR → image tag is bumped in a manifest repo → Argo CD syncs to the cluster.

```text
git push app-repo
  → CodePipeline / CodeBuild
  → build image → push ECR
  → bump tag in manifest-repo
  → Argo CD sync
```

**Repos:**

```text
app-repo/              manifest-repo/
├── Dockerfile         ├── deployment-api.yaml
├── buildspec.yml      └── configmap.yaml
└── src/...
```

**Prerequisites:** Argo CD installed on EKS ([ArgoCD on EKS](argocd-eks.md)), `aws` CLI, `kubectl`, and `git-remote-codecommit` for local clones.

---

## 1. Create CodeCommit repos

Create two repos in CodeCommit:

- `app-repo` - application source + Dockerfile + buildspec
- `manifest-repo` - Kubernetes manifests (Deployment, ConfigMap)

Clone locally:

```bash
pip install git-remote-codecommit

git clone codecommit::<region>://app-repo
git clone codecommit::<region>://manifest-repo
```

## 2. Create ECR repo

```bash
aws ecr create-repository --repository-name my-app --region <region>
```

## 3. Push manifests to manifest-repo

The app pod reads RDS credentials from Secrets Manager at runtime (`secret_name` in `config.ini`). It uses service account `my-app-sa`.

`deployment-api.yaml`:

```yaml
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

`configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-config
  namespace: my-app
data:
  config.ini: |
    [app]
    port = 8080

    [aws]
    region = <region>

    [database]
    host = <rds-host>
    port = 5432
    dbname = <dbname>
    secret_name = <rds-secret-name>

    [firehose]
    stream_name = <firehose-stream>
```

## 4. App IAM - Secrets Manager

The Secrets Manager policy belongs on the **application** service account (`my-app-sa`), not Argo CD.

```bash
cat <<EOF > my-app-secrets-manager-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SecretsManagerGetAndDescribeSecret",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:<region>:<account-id>:secret:<rds-secret-name>*"
    },
    {
      "Sid": "KMSDecryptKey",
      "Effect": "Allow",
      "Action": ["kms:Decrypt"],
      "Resource": "arn:aws:kms:<region>:<account-id>:key/*",
      "Condition": {
        "StringLike": {
          "kms:EncryptionContext:SecretARN": "arn:aws:secretsmanager:<region>:<account-id>:secret:<rds-secret-name>*",
          "kms:ViaService": "secretsmanager.<region>.amazonaws.com"
        }
      }
    }
  ]
}
EOF

cat <<EOF > my-app-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "pods.eks.amazonaws.com" },
      "Action": ["sts:AssumeRole", "sts:TagSession"]
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name MyAppSecretsManagerReadPolicy \
  --policy-document file://my-app-secrets-manager-policy.json

aws iam create-role \
  --role-name EKS-MyApp-SecretsManager-Role \
  --assume-role-policy-document file://my-app-trust-policy.json

aws iam attach-role-policy \
  --role-name EKS-MyApp-SecretsManager-Role \
  --policy-arn arn:aws:iam::<account-id>:policy/MyAppSecretsManagerReadPolicy
```

Associate the role with the app service account:

```bash
kubectl create namespace my-app
kubectl create serviceaccount my-app-sa -n my-app

aws eks create-pod-identity-association \
  --cluster-name <cluster> \
  --namespace my-app \
  --service-account my-app-sa \
  --role-arn arn:aws:iam::<account-id>:role/EKS-MyApp-SecretsManager-Role \
  --region <region>
```

Pod Identity credentials are injected at pod start. Restart the deployment after creating the association:

```bash
kubectl rollout restart deployment my-app -n my-app
```

## 5. CodeBuild IAM policy

Attach this policy to the CodeBuild service role. Replace `<region>` and `<account-id>`.

```bash
cat <<EOF > codebuild-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["codecommit:GitPull"],
      "Resource": "arn:aws:codecommit:<region>:<account-id>:app-repo"
    },
    {
      "Effect": "Allow",
      "Action": ["codecommit:GitPull", "codecommit:GitPush"],
      "Resource": "arn:aws:codecommit:<region>:<account-id>:manifest-repo"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name MyAppCodeBuildPolicy \
  --policy-document file://codebuild-policy.json

aws iam attach-role-policy \
  --role-name <CODEBUILD_ROLE_NAME> \
  --policy-arn arn:aws:iam::<account-id>:policy/MyAppCodeBuildPolicy
```

## 6. buildspec.yml and CodePipeline

Add `buildspec.yml` to `app-repo`:

```yaml
version: 0.2

env:
  variables:
    ECR_REPO: "<account-id>.dkr.ecr.<region>.amazonaws.com/my-app"
    AWS_REGION: "<region>"
    MANIFESTS_REPO: "https://git-codecommit.<region>.amazonaws.com/v1/repos/manifest-repo"
    DEPLOYMENT_FILE: "deployment-api.yaml"

phases:
  install:
    commands:
      - IMAGE_TAG=$(echo "$CODEBUILD_RESOLVED_SOURCE_VERSION" | cut -c1-8)
      - "git config --global credential.helper '!aws codecommit credential-helper $@'"
      - git config --global credential.UseHttpPath true

  pre_build:
    commands:
      - aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REPO"

  build:
    commands:
      - docker build -t "$ECR_REPO:$IMAGE_TAG" .
      - docker tag "$ECR_REPO:$IMAGE_TAG" "$ECR_REPO:latest"

  post_build:
    commands:
      - docker push "$ECR_REPO:$IMAGE_TAG"
      - docker push "$ECR_REPO:latest"
      - git clone "$MANIFESTS_REPO" manifests-checkout
      - cd manifests-checkout
      - 'sed -i "s|image: .*|image: ${ECR_REPO}:${IMAGE_TAG}|" ${DEPLOYMENT_FILE}'
      - git config user.email "ci-bot@my-app.internal"
      - git config user.name "ci-bot"
      - git add ${DEPLOYMENT_FILE}
      - git commit -m "ci - bump image to ${IMAGE_TAG}"
      - git push origin HEAD
```

Create a CodePipeline with:

- **Source:** CodeCommit `app-repo`
- **Build:** CodeBuild project using the role from step 5

## 7. Connect Argo CD to manifest-repo

Argo CD only needs access to `manifest-repo` to sync Kubernetes manifests. Two options below - use **direct auth** unless Pod Identity is preferred.

### Option A - Direct auth (HTTPS credentials)

Generate HTTPS git credentials: IAM user → CodeCommit → Clone URL → HTTPS.

`argocd-repo-secret.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: codecommit-repo
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: https://git-codecommit.<region>.amazonaws.com/v1/repos/manifest-repo
  username: <codecommit-git-username>
  password: <codecommit-git-password>
```

`argocd-application.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://git-codecommit.<region>.amazonaws.com/v1/repos/manifest-repo
    targetRevision: master
    path: .
  destination:
    server: https://kubernetes.default.svc
    namespace: my-app
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Apply:

```bash
kubectl apply -f argocd-repo-secret.yaml
kubectl apply -f argocd-application.yaml
```

### Option B - Pod Identity (no git credentials in secret)

Requires the EKS Pod Identity agent add-on.

```bash
cat <<EOF > argocd-codecommit-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["codecommit:GitPull", "codecommit:Get*", "codecommit:List*"],
      "Resource": "arn:aws:codecommit:<region>:<account-id>:manifest-repo"
    }
  ]
}
EOF

cat <<EOF > argocd-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "pods.eks.amazonaws.com" },
      "Action": ["sts:AssumeRole", "sts:TagSession"]
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name ArgoCDCodeCommitPolicy \
  --policy-document file://argocd-codecommit-policy.json

aws iam create-role \
  --role-name EKS-ArgoCD-CodeCommit-Role \
  --assume-role-policy-document file://argocd-trust-policy.json

aws iam attach-role-policy \
  --role-name EKS-ArgoCD-CodeCommit-Role \
  --policy-arn arn:aws:iam::<account-id>:policy/ArgoCDCodeCommitPolicy

aws eks create-pod-identity-association \
  --cluster-name <cluster> \
  --namespace argocd \
  --service-account argocd-repo-server \
  --role-arn arn:aws:iam::<account-id>:role/EKS-ArgoCD-CodeCommit-Role \
  --region <region>
```

Patch `argocd-repo-server` to use the AWS git credential helper:

```yaml
# patch-repo-server.yaml
spec:
  template:
    spec:
      initContainers:
        - name: config-git-aws
          image: alpine/git:latest
          command: ["sh", "-c"]
          args:
            - |
              git config --global credential.helper '!aws codecommit credential-helper "$@"'
              git config --global credential.UseHttpPath true
          volumeMounts:
            - name: git-config
              mountPath: /root
      volumes:
        - name: git-config
          emptyDir: {}
```

```bash
kubectl patch deployment argocd-repo-server -n argocd --patch-file patch-repo-server.yaml
```

Repo secret (URL only, no credentials):

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: codecommit-repo
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
type: Opaque
stringData:
  type: git
  url: https://git-codecommit.<region>.amazonaws.com/v1/repos/manifest-repo
  enableLfs: "true"
```

Apply the Application manifest from Option A (without username/password in the repo secret).

## 8. Verify

Push to `app-repo` and confirm the full pipeline:

```bash
aws codepipeline get-pipeline-state --name my-app-pipeline
aws ecr describe-images --repository-name my-app --region <region>
kubectl get application my-app -n argocd -o wide
kubectl get pods -n my-app -o jsonpath='{.items[*].spec.containers[*].image}'
```

---

**Optional:** For private Argo CD, create a VPC interface endpoint for `com.amazonaws.<region>.eks-capabilities` across multiple AZs with inbound HTTPS (443) allowed.
