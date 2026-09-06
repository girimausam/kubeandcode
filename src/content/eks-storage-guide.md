---
title: "EKS storage guide (EBS, EFS, S3)"
description: "Daily playbook for persistent storage on Amazon EKS: pick EBS vs EFS vs S3, install CSI add-ons, copy-paste StorageClass/PVC/PV, and avoid common bind and permission failures."
tags:
  - eks
  - ebs
  - efs
  - s3
  - csi
  - storageclass
  - pvc
  - kubernetes
  - notes
date: 2026-09-06
links:
  - title: EBS CSI on EKS
    url: https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html
  - title: EFS CSI on EKS
    url: https://docs.aws.amazon.com/eks/latest/userguide/efs-csi.html
  - title: Mountpoint for Amazon S3 CSI
    url: https://docs.aws.amazon.com/eks/latest/userguide/s3-csi.html
  - title: EFS CSI access-point examples
    url: https://github.com/kubernetes-sigs/aws-efs-csi-driver/blob/master/examples/kubernetes/access_points/README.md
---

# EKS storage guide

Pick storage from the workload, then run the matching CSI path. Do not mix patterns on the same PVC (dynamic EFS access points vs a pre-created access point).

| Need | Use | Access mode | Typical cost shape |
| --- | --- | --- | --- |
| Database, Prometheus, one-pod disk, AZ-local IOPS | **Amazon EBS** (`gp3`) | `ReadWriteOnce` | GiB-month + provisioned IOPS/throughput. Cheapest for exclusive block. |
| Shared POSIX files, multi-AZ, multi-pod write | **Amazon EFS** | `ReadWriteMany` | GiB-month by class (Standard / IA / Archive) + throughput. Elastic; no volume size to manage. |
| App talks S3 API (SDK, AWS CLI) | **S3 + Pod Identity** | n/a (no PVC) | Storage class + request/data transfer. Prefer this over a mount when the app already uses objects. |
| Legacy app needs a path like `/data` on a bucket | **Mountpoint for Amazon S3 CSI** | `ReadWriteMany` (static PV) | Same S3 charges; extra GET/PUT from file-style access. Not POSIX. No Fargate. |

Encrypt at rest (EBS `encrypted: "true"`, EFS encryption on create, S3 default encryption / KMS). Encrypt in transit (EFS TLS via CSI; S3 HTTPS). Scope IAM to one bucket or one access-point ARN. Turn on CloudWatch metrics for the CSI controllers and CloudTrail data events for S3 / EFS when you need an audit trail.

**Cluster notes**

- EKS Auto Mode uses provisioner `ebs.csi.eks.amazonaws.com`, not `ebs.csi.aws.com`.
- Fargate: no EBS; EFS static PV only (no dynamic EFS provisioning); no Mountpoint S3 CSI.
- Hybrid Nodes: EBS / EFS / Mountpoint CSI not supported.

<details>
<summary>Cluster env + Pod Identity trust JSON</summary>

```bash
export AWS_REGION=<region>
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export EKS_CLUSTER_NAME=<cluster>
aws eks update-kubeconfig --name "$EKS_CLUSTER_NAME" --region "$AWS_REGION"
```

Reuse this trust for CSI roles and app roles:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowEksAuthToAssumeRoleForPodIdentity",
      "Effect": "Allow",
      "Principal": { "Service": "pods.eks.amazonaws.com" },
      "Action": ["sts:AssumeRole", "sts:TagSession"]
    }
  ]
}
```

</details>

---

## 1. Amazon EBS (block, one node)

Install add-on `aws-ebs-csi-driver`. Controller SA: `kube-system/ebs-csi-controller-sa`. Attach `arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicyV2` (or `AmazonEBSCSIDriverPolicy` on older setups). Custom KMS keys need extra `kms:*` on that key.

`WaitForFirstConsumer` creates the volume in the AZ of the scheduled pod. Skip it → PVC in AZ-a, pod on AZ-b → attach fail.

PVC `Pending` + `UnauthorizedOperation` on EC2 → CSI role missing. Volume stuck across nodes → RWO + two pods; use EFS or one replica.

<details>
<summary>StorageClass + PVC (`gp3`, encrypted)</summary>

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-sc
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
parameters:
  type: gp3
  encrypted: "true"
```

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: ebs-sc
  resources:
    requests:
      storage: 4Gi
```

</details>

<details>
<summary>Smoke-test pod</summary>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: ebs-test-app
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "echo hello from EBS > /data/out.txt && sleep 3600"]
      volumeMounts:
        - mountPath: /data
          name: my-volume
  volumes:
    - name: my-volume
      persistentVolumeClaim:
        claimName: my-app-pvc
```

```bash
kubectl apply -f storageclass.yaml -f pvc.yaml -f pod.yaml
kubectl get pvc,pv,pod
kubectl exec ebs-test-app -- cat /data/out.txt
```

</details>

---

## 2. Amazon EFS (NFS, shared)

### Network

Mount-target SG: inbound TCP **2049** from the node (or pod) SG. Node SG: outbound TCP 2049 to the mount-target SG. Timeout on mount almost always this. Regional EFS: mount target in every AZ you run nodes.

<details>
<summary>Allow NFS from node SG</summary>

```bash
aws ec2 authorize-security-group-ingress \
  --group-id <efs_sg_id> \
  --protocol tcp --port 2049 \
  --source-group <node_sg_id>
```

</details>

### Driver

Add-on: Amazon EFS CSI driver. Controller SA: `kube-system/efs-csi-controller-sa`. Managed policy: `arn:aws:iam::aws:policy/service-role/AmazonEFSCSIDriverPolicy`. Then install / update the add-on (console or `aws eks create-addon`).

<details>
<summary>Pod Identity for EFS CSI</summary>

```bash
aws iam create-role --role-name AmazonEKS_EFS_CSI_DriverRole \
  --assume-role-policy-document file://eks-pod-identity-trust-relationship.json

aws iam attach-role-policy --role-name AmazonEKS_EFS_CSI_DriverRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEFSCSIDriverPolicy

aws eks create-pod-identity-association \
  --cluster-name "$EKS_CLUSTER_NAME" \
  --role-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/AmazonEKS_EFS_CSI_DriverRole" \
  --namespace kube-system \
  --service-account efs-csi-controller-sa
```

</details>

### Dynamic access points (dev / one PVC lifecycle)

CSI creates an access point per PVC. EFS size on the PVC is ignored for capacity (NFS is elastic); keep a dummy request so the object is valid.

`directoryPerms` (access-point root): `700` default (one app); `750` sidecar other UID same GID read; `755` shared read; `777` lab only.

<details>
<summary>directoryPerms cheat sheet</summary>

| Mode | When |
| --- | --- |
| `700` | Default. One app owns the tree. |
| `750` | Sidecar other UID, same GID, read-only. |
| `755` | Shared read, no extra writers. |
| `777` | Lab only. Never prod. |

</details>

<details>
<summary>StorageClass + PVC (`efs-ap`)</summary>

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: efs-sc
provisioner: efs.csi.aws.com
parameters:
  provisioningMode: efs-ap
  fileSystemId: <EFS_ID>
  directoryPerms: "700"
```

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-efs-pvc
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: efs-sc
  resources:
    requests:
      storage: 5Gi
```

</details>

<details>
<summary>Writer / reader smoke test</summary>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: efs-writer
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "echo hello from pod A > /data/shared.txt && sleep 3600"]
      volumeMounts:
        - mountPath: /data
          name: efs-vol
  volumes:
    - name: efs-vol
      persistentVolumeClaim:
        claimName: my-efs-pvc
---
apiVersion: v1
kind: Pod
metadata:
  name: efs-reader
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - mountPath: /data
          name: efs-vol
  volumes:
    - name: efs-vol
      persistentVolumeClaim:
        claimName: my-efs-pvc
```

```bash
kubectl apply -f storageclass-efs.yaml -f pvc-efs.yaml -f pods-efs.yaml
kubectl exec efs-reader -- cat /data/shared.txt
```

</details>

### POSIX: StorageClass `uid`/`gid` vs pod `securityContext`

EFS access points **enforce identity**. NFS client UID/GID is replaced by the access-point user for file operations. Dynamic `efs-ap` does **not** honor Kubernetes `fsGroup` the way EBS does (driver will not chown the AP root; that would break the AP).

Set `uid`/`gid` on the StorageClass when the process must own files as a known UID. Match `runAsUser` / `runAsGroup` / `fsGroup` on the pod so local tools agree. `fsGroup` still helps **ephemeral** files; it is not the EFS AP source of truth.

Omit `uid`/`gid` → driver picks from `gidRangeStart` / `gidRangeEnd`. Need no identity enforcement → static provision without an access point.

<details>
<summary>Fixed uid/gid on StorageClass</summary>

```yaml
parameters:
  provisioningMode: efs-ap
  fileSystemId: <EFS_ID>
  directoryPerms: "750"
  uid: "1000"
  gid: "1000"
```

</details>

<details>
<summary>Pod `securityContext` sample</summary>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: efs-posix-app
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    fsGroupChangePolicy: OnRootMismatch
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "id; echo posix-ok > /data/out.txt && sleep 3600"]
      securityContext:
        allowPrivilegeEscalation: false
      volumeMounts:
        - name: efs-vol
          mountPath: /data
  volumes:
    - name: efs-vol
      persistentVolumeClaim:
        claimName: my-efs-pvc
```

</details>

### Static: existing access point (prod / multi-tenant)

Create the access point in AWS (Terraform/CLI). Point a **PersistentVolume** at `FileSystemId::AccessPointId` (double colon required; middle field is optional subpath). Reclaim `Retain`.

Do **not** use StorageClass `efs-sc` with `provisioningMode: efs-ap` for this PVC — that class creates a **new** AP. Use a class with no `efs-ap` parameters and bind with `volumeName`. Skip `volumeName` on a dynamic class → new AP, not yours.

Tighten IAM with `elasticfilesystem:AccessPointArn` when apps share one filesystem.

- Dynamic AP → lab, one app owns PVC lifecycle.
- Static AP → prod isolation, `Retain`, shared FS, IAM scoped to one AP.

<details>
<summary>Static SC + PV + PVC (existing AP)</summary>

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: efs-static
provisioner: efs.csi.aws.com
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: efs-pv-static
spec:
  capacity:
    storage: 5Gi
  volumeMode: Filesystem
  accessModes:
    - ReadWriteMany
  persistentVolumeReclaimPolicy: Retain
  storageClassName: efs-static
  csi:
    driver: efs.csi.aws.com
    volumeHandle: ${EFS_ID}::${EFS_AP_ID}
    volumeAttributes:
      encryptInTransit: "true"
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: efs-pvc-static
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: efs-static
  volumeName: efs-pv-static
  resources:
    requests:
      storage: 5Gi
```

</details>

---

## 3. Amazon S3 API from a pod (no mount)

Prefer this when the workload uses the AWS SDK. Bind Pod Identity to the **app** service account (not the CSI SA). Pod must set `serviceAccountName: my-app-sa`. Block instance metadata if nodes still expose broad IAM.

<details>
<summary>App policy + Pod Identity association</summary>

```bash
cat > s3-app-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::my-eks-app-bucket-<unique-suffix>"]
    },
    {
      "Sid": "ObjectRW",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::my-eks-app-bucket-<unique-suffix>/*"]
    }
  ]
}
EOF

aws iam create-policy --policy-name MyAppS3Policy --policy-document file://s3-app-policy.json

aws iam create-role --role-name MyAppS3Role \
  --assume-role-policy-document file://eks-pod-identity-trust-relationship.json

aws iam attach-role-policy --role-name MyAppS3Role \
  --policy-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/MyAppS3Policy"

aws eks create-pod-identity-association \
  --cluster-name "$EKS_CLUSTER_NAME" \
  --role-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/MyAppS3Role" \
  --namespace default \
  --service-account my-app-sa
```

</details>

---

## 4. Mountpoint for Amazon S3 CSI (bucket as a path)

Add-on: `aws-mountpoint-s3-csi-driver`. SA: `kube-system/s3-csi-driver-sa`. **Static provisioning only** (existing bucket). Capacity on PV/PVC is required by Kubernetes and **ignored** by S3. Not full POSIX. `allow-delete` only if the app must unlink files.

IAM is a **customer** policy (commonly `AmazonS3CSIDriverPolicy`), not the EFS/EBS AWS-managed CSI policies.

Empty `storageClassName` disables dynamic provision. `volumeHandle` must be unique per PV if you mount multiple buckets.

Console: IAM role trusted by `pods.eks.amazonaws.com` → EKS **Access** → Pod Identity → role + `kube-system` + `s3-csi-driver-sa`.

<details>
<summary>CSI IAM policy + role + add-on</summary>

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MountpointFullBucketAccess",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::my-eks-app-bucket-<unique-suffix>"]
    },
    {
      "Sid": "MountpointFullObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:AbortMultipartUpload",
        "s3:DeleteObject"
      ],
      "Resource": ["arn:aws:s3:::my-eks-app-bucket-<unique-suffix>/*"]
    }
  ]
}
```

```bash
aws iam create-policy --policy-name AmazonS3CSIDriverPolicy \
  --policy-document file://s3-csi-policy.json

aws iam create-role --role-name AmazonEKS_S3_CSI_DriverRole \
  --assume-role-policy-document file://eks-pod-identity-trust-relationship.json

aws iam attach-role-policy --role-name AmazonEKS_S3_CSI_DriverRole \
  --policy-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AmazonS3CSIDriverPolicy"

aws eks create-pod-identity-association \
  --cluster-name "$EKS_CLUSTER_NAME" \
  --role-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/AmazonEKS_S3_CSI_DriverRole" \
  --namespace kube-system \
  --service-account s3-csi-driver-sa

aws eks create-addon \
  --cluster-name "$EKS_CLUSTER_NAME" \
  --addon-name aws-mountpoint-s3-csi-driver \
  --service-account-role-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/AmazonEKS_S3_CSI_DriverRole"
```

</details>

<details>
<summary>Static PV + PVC</summary>

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: s3-pv
spec:
  capacity:
    storage: 100Gi
  accessModes:
    - ReadWriteMany
  storageClassName: ""
  claimRef:
    namespace: default
    name: s3-pvc
  mountOptions:
    - allow-delete
    - region us-east-1
  csi:
    driver: s3.csi.aws.com
    volumeHandle: s3-csi-driver-volume
    volumeAttributes:
      bucketName: my-eks-app-bucket-<unique-suffix>
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: s3-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: ""
  resources:
    requests:
      storage: 100Gi
  volumeName: s3-pv
```

</details>

<details>
<summary>Smoke-test pod</summary>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: s3-mount-test
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "echo hello from mountpoint > /data/mnt-test.txt && sleep 3600"]
      volumeMounts:
        - name: s3-vol
          mountPath: /data
  volumes:
    - name: s3-vol
      persistentVolumeClaim:
        claimName: s3-pvc
```

```bash
kubectl apply -f s3-pv-pvc.yaml -f s3-pod.yaml
kubectl exec s3-mount-test -- cat /data/mnt-test.txt
aws s3 ls s3://my-eks-app-bucket-<unique-suffix>/
```

</details>

---

## 5. Daily checks

| Symptom | First look |
| --- | --- |
| PVC Pending, no volume | CSI add-on / IAM; EBS Auto Mode provisioner mismatch |
| EBS attach timeout | AZ mismatch; missing `WaitForFirstConsumer` |
| EFS mount hang | SG 2049 both directions; no mount target in node AZ |
| EFS Permission denied | AP `uid`/`gid` vs image user; `directoryPerms`; IAM on FS |
| S3 mount fail | Driver SA policy vs bucket; region mount option; POSIX expectation |

Pricing: [EBS](https://aws.amazon.com/ebs/pricing/) · [EFS](https://aws.amazon.com/efs/pricing/) · [S3](https://aws.amazon.com/s3/pricing/)

<details>
<summary>kubectl debug commands</summary>

```bash
kubectl get sc,pvc,pv
kubectl describe pvc <name>
kubectl -n kube-system get pods | grep -E 'ebs-csi|efs-csi|s3-csi|mountpoint'
kubectl -n kube-system logs deploy/ebs-csi-controller --tail=50
```

</details>
