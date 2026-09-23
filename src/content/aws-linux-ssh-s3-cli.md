---
title: "SSH, SCP, cp, and AWS CLI commands"
description: "Copy files to EC2 and S3, then the AWS CLI checks used to review S3, EC2, security groups, RDS, EBS, CloudTrail, and IAM."
tags:
  - aws
  - linux
  - ssh
  - s3
  - cli
  - ec2
---

# SSH, SCP, cp, and AWS CLI commands

Day-to-day work is still a shell. You sign in to an instance, copy a file up or down, put a directory in S3, and then ask the API whether the account matches the usual baseline. Kubernetes-only snippets stay in [AWS and Kubernetes CLI snippets](./aws-cli-snippets.md).

Set the Region once so every command below hits the same place:

```bash
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
aws sts get-caller-identity
```

If `get-caller-identity` fails, nothing later will work. Fix the profile (`aws configure list`) before you debug SSH or S3.

---

## SSH into EC2

Amazon Linux uses `ec2-user`. Ubuntu uses `ubuntu`. Debian uses `admin`. RHEL uses `ec2-user` or `root` depending on the AMI. The key must not be group-readable or OpenSSH refuses it.

```bash
chmod 400 ~/keys/northwind.pem
ssh -i ~/keys/northwind.pem ec2-user@203.0.113.20
```

Useful flags:

| Flag | Why |
| --- | --- |
| `-i` | Private key for this instance |
| `-p 22` | Only if the security group listens on another port |
| `-o StrictHostKeyChecking=accept-new` | Saves the host key on first connect, then fails if it changes |
| `-J bastion` | ProxyJump through a bastion when the instance has no public IP |

Through a bastion:

```bash
ssh -i ~/keys/northwind.pem \
  -J ec2-user@BASTION_PUBLIC_IP \
  ec2-user@10.0.1.25
```

The instance security group must allow TCP 22 from the bastion security group, not from `0.0.0.0/0`, if you can avoid it. The bastion allows 22 only from your IP.

**Prefer Session Manager** when the instance has the SSM agent and `AmazonSSMManagedInstanceCore`. No inbound port 22, no key on the laptop:

```bash
aws ssm start-session --target i-0123456789abcdef0 --region us-east-1
```

Find the instance id from a name tag:

```bash
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=northwind-app" "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[].[InstanceId,PublicIpAddress,PrivateIpAddress]" \
  --output table
```

---

## scp: local to remote, and remote to local

`scp` uses the same key and user as `ssh`. The direction is which side has the colon.

**Laptop to instance** (remote path is `user@host:path`):

```bash
scp -i ~/keys/northwind.pem \
  ./app.tar.gz \
  ec2-user@203.0.113.20:/home/ec2-user/app.tar.gz
```

A directory needs `-r`:

```bash
scp -i ~/keys/northwind.pem -r \
  ./config/ \
  ec2-user@203.0.113.20:/home/ec2-user/config/
```

**Instance to laptop** (remote path comes first):

```bash
scp -i ~/keys/northwind.pem \
  ec2-user@203.0.113.20:/var/log/messages \
  ./messages.from-ec2
```

Through the bastion, add the same `-J`:

```bash
scp -i ~/keys/northwind.pem -J ec2-user@BASTION_PUBLIC_IP \
  ./app.tar.gz \
  ec2-user@10.0.1.25:/home/ec2-user/app.tar.gz
```

For a large tree, `rsync` resumes and skips unchanged files. It is not installed on every AMI.

```bash
rsync -avP -e "ssh -i ~/keys/northwind.pem" \
  ./site/ \
  ec2-user@203.0.113.20:/var/www/site/
```

---

## cp on the instance

`cp` never talks to AWS. It copies on the machine you are logged into.

```bash
cp /home/ec2-user/app.tar.gz /opt/northwind/app.tar.gz
cp -a /home/ec2-user/config /opt/northwind/config
cp -r /var/log/nginx /tmp/nginx-logs
```

| Flag | Behavior |
| --- | --- |
| `-r` or `-R` | Directory tree |
| `-a` | Archive: recursive, keeps permissions, times, and links |
| `-u` | Copy only when the source is newer |
| `-v` | Print each file |
| `-n` | Do not overwrite an existing file |

Do not `cp` over a running binary that the process still has open. Copy to a new name, then move:

```bash
cp -a app-1.2.jar /opt/northwind/app-1.2.jar
sudo systemctl stop northwind
sudo ln -sfn /opt/northwind/app-1.2.jar /opt/northwind/app.jar
sudo systemctl start northwind
```

---

## S3: one file, many files, sync

The CLI must be v2. Check with `aws --version`.

**One file:**

```bash
aws s3 cp ./invoice.json s3://northwind-raw/incoming/invoice.json \
  --sse aws:kms --sse-kms-key-id alias/northwind-lake
```

**A directory, every file:**

```bash
aws s3 cp ./invoices/ s3://northwind-raw/incoming/ \
  --recursive \
  --sse aws:kms --sse-kms-key-id alias/northwind-lake
```

The trailing slash on `./invoices/` means the objects are `incoming/file.json`, not `incoming/invoices/file.json`.

**Sync** uploads what is missing or newer, and by default it does not delete remote objects that you removed locally:

```bash
aws s3 sync ./invoices/ s3://northwind-raw/incoming/ \
  --sse aws:kms --sse-kms-key-id alias/northwind-lake \
  --exclude "*" --include "*.json"
```

`--delete` removes objects in the prefix that are not in the local directory. Do not put `--delete` on a shared prefix until you have listed what would change:

```bash
aws s3 sync ./invoices/ s3://northwind-raw/incoming/ --delete --dryrun
```

**Download** is the same commands with the S3 URI first:

```bash
aws s3 cp s3://northwind-raw/incoming/ ./invoices-down/ --recursive
aws s3 sync s3://northwind-raw/incoming/ ./invoices-down/
```

**List before you copy:**

```bash
aws s3 ls s3://northwind-raw/incoming/ --human-readable --summarize
```

From the EC2 instance, `aws s3 cp` uses the instance role. It does not use your laptop keys. The role needs `s3:PutObject` or `s3:GetObject` on that prefix and `kms:Decrypt` plus `kms:GenerateDataKey` when the bucket is SSE-KMS.

Presigned URL when someone else must download one object without a role:

```bash
aws s3 presign s3://northwind-raw/incoming/invoice.json --expires-in 900
```

---

## Checks against common baselines

These commands do not change anything. They print the settings that reviews usually ask about. Replace names and account ids.

### Identity and Region

```bash
aws sts get-caller-identity
aws configure get region
aws iam get-account-summary
```

Look for `AccountAccessKeysPresent`. Long-lived root keys should be zero.

### S3

```bash
aws s3api get-public-access-block --bucket northwind-raw
aws s3api get-bucket-encryption --bucket northwind-raw
aws s3api get-bucket-versioning --bucket northwind-raw
aws s3api get-bucket-policy-status --bucket northwind-raw
```

Account-wide block, which overrides a sloppy bucket:

```bash
aws s3control get-public-access-block --account-id "$(aws sts get-caller-identity --query Account --output text)"
```

You want `BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`, and `RestrictPublicBuckets` all true. Encryption should show `aws:kms` or `AES256`, not an error that the bucket has no configuration.

### EC2, IMDSv2, and open ports

```bash
aws ec2 describe-instances \
  --instance-ids i-0123456789abcdef0 \
  --query "Reservations[].Instances[].MetadataOptions" \
  --output table
```

`HttpTokens` should be `required` (IMDSv2 only).

Security groups with SSH or RDP open to the world:

```bash
aws ec2 describe-security-groups \
  --filters "Name=ip-permission.cidr,Values=0.0.0.0/0" \
  --query "SecurityGroups[].[GroupId,GroupName,IpPermissions[?IpRanges[?CidrIp=='0.0.0.0/0']].[IpProtocol,FromPort,ToPort]]" \
  --output text
```

Default EBS encryption for new volumes:

```bash
aws ec2 get-ebs-encryption-by-default --region us-east-1
```

Unattached volumes (cost and leftover data):

```bash
aws ec2 describe-volumes \
  --filters "Name=status,Values=available" \
  --query "Volumes[].[VolumeId,Size,Encrypted]" \
  --output table
```

### RDS

```bash
aws rds describe-db-instances \
  --query "DBInstances[].[DBInstanceIdentifier,PubliclyAccessible,StorageEncrypted,DeletionProtection,BackupRetentionPeriod,MultiAZ]" \
  --output table
```

`PubliclyAccessible` false, `StorageEncrypted` true, `DeletionProtection` true, backup retention greater than 0, `MultiAZ` true for production.

### CloudTrail and logs

```bash
aws cloudtrail describe-trails --query "trailList[].[Name,IsMultiRegionTrail,LogFileValidationEnabled,S3BucketName,KmsKeyId]" --output table
aws cloudtrail get-trail-status --name TRAIL_NAME
```

Multi-region and log file validation should be true. `IsLogging` from the status call should be true.

Recent API failures:

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ConsoleLogin \
  --max-results 5
```

### IAM

Roles used by humans that still have access keys, and policies attached directly to users, are the usual findings:

```bash
aws iam generate-credential-report
aws iam get-credential-report --query Content --output text | base64 -d | head
```

Access Analyzer findings (external access):

```bash
aws accessanalyzer list-analyzers --query "analyzers[].[name,status]" --output table
aws accessanalyzer list-findings --analyzer-name ANALYZER_NAME --max-results 20
```

### Load balancer and EKS logging

```bash
aws elbv2 describe-load-balancers \
  --query "LoadBalancers[].[LoadBalancerName,Scheme,Type]" --output table

aws eks describe-cluster --name payments-prod \
  --query "cluster.{version:version,endpointPublic:resourcesVpcConfig.endpointPublicAccess,logs:logging.clusterLogging}"
```

EKS control plane logs (`api`, `audit`, `authenticator`) should be enabled. A public API endpoint with `0.0.0.0/0` is a finding unless the design says so.

### Lambda and SQS

```bash
aws lambda get-function-configuration --function-name northwind-upload \
  --query "{timeout:Timeout,memory:MemorySize,role:Role,runtime:Runtime}"

aws sqs get-queue-attributes \
  --queue-url "$(aws sqs get-queue-url --queue-name northwind-orders --query QueueUrl --output text)" \
  --attribute-names All \
  --query "Attributes.{kms:KmsMasterKeyId,dlq:RedrivePolicy,visibility:VisibilityTimeout}"
```

A queue that workers consume should have a redrive policy. Visibility timeout should be longer than the Lambda or ECS task timeout.

---

## A short session, in order

```bash
aws sts get-caller-identity
ssh -i ~/keys/northwind.pem ec2-user@203.0.113.20
# on the instance:
cp -a ~/app.tar.gz /opt/northwind/app.tar.gz
aws s3 sync /opt/northwind/out/ s3://northwind-raw/rendered/ --sse aws:kms --sse-kms-key-id alias/northwind-lake
exit
scp -i ~/keys/northwind.pem ec2-user@203.0.113.20:/opt/northwind/out/report.pdf ./report.pdf
aws s3api get-public-access-block --bucket northwind-raw
aws ec2 get-ebs-encryption-by-default
```

[<- CLI snippets](./aws-cli-snippets.md) · [<- S3 and KMS](./aws-s3-kms-encryption-decryption-iam.md)
