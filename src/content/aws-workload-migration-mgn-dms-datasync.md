---
title: "Migrate servers, databases, and files (console)"
description: "Northwind lift-and-shift: Application Migration Service, DMS for MySQL, and DataSync for a file share. Cutover, test, and settings people skip."
tags:
  - aws
  - migration
  - mgn
  - dms
  - datasync
  - devops
---

# Migrate servers, databases, and files (console)

**Scenario: Northwind** still runs a store app on a VMware VM, MySQL 8 on the same site, and a Windows file share of product images. The architect keeps the VPN up until cutover. You do not rewrite the app on day one.

| Data | Service | Why |
| --- | --- | --- |
| VM (app server) | **AWS Application Migration Service (MGN)** | Continuous block replication, test instances, cutover |
| MySQL | **AWS DMS** | Full load plus CDC into RDS |
| File share | **AWS DataSync** | Scheduled copy to S3 or FSx, verification |

Docs: [MGN](https://docs.aws.amazon.com/mgn/latest/ug/what-is-application-migration.html) · [DMS](https://docs.aws.amazon.com/dms/latest/userguide/Welcome.html) · [DataSync](https://docs.aws.amazon.com/datasync/latest/userguide/what-is-datasync.html)

**Checklist:** [DevOps checklist](./aws-devops-system-design-checklist.md)

---

## Order that avoids a broken cutover

1. Network path first: [Site-to-Site VPN](./aws-site-to-site-vpn-console-guide.md) or Direct Connect, routes, security groups.
2. Landing zone: VPC subnets, **staging subnet for MGN**, RDS subnet group, S3 bucket.
3. Replicate (MGN, DMS, DataSync) while the source is still live.
4. **Test** launch. Do not cut over yet.
5. Application smoke test against the test instance and a DMS validation task.
6. Schedule cutover. Stop writes on the source. Final sync. Flip DNS.

---

## Step 1 - Application Migration Service

Console: **Application Migration Service** (MGN). Initialize the service in the Region. Initialization creates a staging area and IAM roles. Read what it creates before you click through.

### Hidden settings

| Setting | Why it matters |
| --- | --- |
| **Staging area subnet** | Replication servers live here. Must reach the source over 1500 (replication) and the service endpoints. Private subnet plus VPC endpoints or NAT. |
| **Replication server instance type** | Too small and lag grows. Start with the default, watch backlog. |
| **EBS encryption** | Turn on. Use a CMK if the org requires it. |
| **Transfer throttling** | Set it if the VPN is shared with production users. |
| **Launch settings: instance type, subnet, SG, private IP** | Test and cutover use these. Public IP off. |
| **EC2 launch template** | IMDSv2 required, detailed monitoring if the rubric asks, termination protection after cutover. |

### Console flow

1. **Get started** / initialize MGN.
2. Add the source server: install the **AWS Replication Agent** on the VM (Linux or Windows). The console shows the installer command and IAM credentials. Prefer a dedicated IAM user or role for the agent, not a personal admin key.
3. Wait until replication is **Healthy** and lag is near zero.
4. **Test and cutover** -> **Launch test instances**.
5. RDP or SSM to the test box. Check the app. Terminate test instances when done (MGN marks them so you do not confuse them with cutover).
6. **Launch cutover instances** only after the source is quiesced.
7. **Finalize cutover** so MGN stops replication and you are billed only for the EC2 instance.

Post-launch actions (MGN settings): install the SSM agent, run a script to point the app at the new RDS endpoint. That script is the difference between a booted VM and a working app.

---

## Step 2 - DMS into RDS

Create the RDS target first. Private, encrypted, multi-AZ, SG allows the **replication instance** only. See [databases](./aws-databases-networking-security-backup-console.md).

Console: **DMS** -> **Replication instances** -> create one in the app or data subnets. Then:

1. **Source endpoint:** MySQL, server name is the on-prem IP over the VPN, SSL mode **verify-full** if the source has a cert.
2. **Target endpoint:** RDS endpoint, SSL required.
3. **Test connection** on both. Failure here is almost always SG, NACL, or VPN route, not the password.
4. **Database migration task:**
   - Migration type: **Migrate existing data and replicate ongoing changes**.
   - Target table prep: **Do nothing** if the schema was created by your SQL scripts. **Drop tables** only on an empty lab target.
   - Enable **CloudWatch logs**.
   - Enable **validation** (premigration assessment and validation) when the console offers it.
   - LOB mode: **Limited LOB** with a sane max size. Full LOB is slow and is a classic timeout.

CDC prerequisites on MySQL: `binlog_format=ROW`, binlog retention long enough for a lag spike, a user with replication rights. Without ROW format the task starts and then sits in error.

**Cutover:** stop app writes, wait until DMS **CDCLatencySource** and **CDCLatencyTarget** are near zero, then point the app at RDS, then stop the task. Do not stop the task before the app moves or you lose the last transactions.

---

## Step 3 - DataSync for the file share

Console: **DataSync**.

1. **Source location:** SMB (the Windows share) or NFS. Agent deployed on-prem if the share is not on AWS. The agent VM needs a path to DataSync public endpoints or VPC endpoints.
2. **Destination:** S3 bucket `northwind-images`, SSE-KMS, block public access. Or FSx for Windows if the app must keep SMB.
3. **Task options people skip:**
   - **Verify data:** verify only the data transferred, or verify all (slower, safer for cutover).
   - **Overwrite:** never overwrite newer destination files if users might write on both sides.
   - **Preserve deleted files** vs delete on destination. For a migration, do not delete destination until you understand the source.
   - **Bandwidth limit**.
   - **Schedule** hourly until cutover, then one final run.
   - **Task logging** to CloudWatch.
   - **Include/exclude filters** so you do not copy `Thumbs.db` and recycle bins.

IAM role on the destination must allow `s3:PutObject` and `kms:GenerateDataKey`. DataSync creates a role in the wizard. Open it.

---

## Security

- Replication traffic stays on the VPN. Do not open MySQL to `0.0.0.0/0` "just for DMS".
- Agent credentials are short lived and scoped.
- After cutover, remove the on-prem inbound rules that existed only for replication.
- Snapshots of RDS before cutover. MGN cutover instances get their own EBS volumes. Tag them `Migration=northwind`.

---

## Mistakes

| Mistake | Result |
| --- | --- |
| Cut over before test launch | App down, no rollback instance |
| DMS task started with binlog still STATEMENT | CDC errors after full load |
| DataSync verify off | Silent corrupt copy found by the app |
| Staging subnet has no route to on-prem | MGN agent never healthy |
| Forgot to update connection strings | VM is up, app still queries old MySQL |
| Left MGN replication running for weeks after cutover | Unexpected bill |

---

## Troubleshooting

| Symptom | Look at |
| --- | --- |
| MGN stalled | Agent logs, TCP 1500, staging SG, service quotas |
| DMS test connection failed | SG both ways, port 3306, DNS of RDS from the replication instance |
| DMS full load slow | LOB mode, replication instance size, parallel load table mappings |
| DataSync preparation failed | Agent activation, clock skew, SMB version, credentials |

[<- Roles map](./aws-cloud-roles-responsibility-map.md) · [<- Checklist](./aws-devops-system-design-checklist.md)
