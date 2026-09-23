---
title: "CloudWatch agent on EC2, step by step"
description: "Install the current CloudWatch agent on EC2, publish memory and disk metrics, and confirm them in the CWAgent namespace. Console and SSM."
tags:
  - aws
  - cloudwatch
  - ec2
  - ssm
  - monitoring
---

# CloudWatch agent on EC2, step by step

EC2 basic monitoring does not include memory used or disk used. Those numbers exist only inside the guest. The **CloudWatch agent** reads them and publishes custom metrics in the namespace **`CWAgent`**.

The old Perl scripts (`mon-put-instance-data.pl`) are retired. Do not install them. The supported agent is the one distributed as `AmazonCloudWatchAgent` in Systems Manager Distributor, package `AmazonCloudWatch-ManageAgent` is not the name. The Distributor package is **AmazonCloudWatchAgent**.

Docs: [Install the CloudWatch agent](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/install-CloudWatch-Agent-on-EC2-Instance.html) · [Create the configuration file](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/create-cloudwatch-agent-configuration-file.html)

---

## What you will see when it works

Console: **CloudWatch** -> **Metrics** -> **All metrics** -> **CWAgent**.

Dimensions typically include `InstanceId`, and for disk metrics `device`, `fstype`, and `path`. Metrics for this guide:

| Metric | Meaning |
| --- | --- |
| `mem_used_percent` | Memory in use, from the OS, not from EC2 |
| `disk_used_percent` | Filesystem percent full. Path `/` |
| `cpu_usage_active` | Optional. EC2 already publishes `CPUUtilization` in `AWS/EC2`. Keep one CPU metric so you do not double-alarm |

Basic EC2 metrics stay in `AWS/EC2` and keep working with no agent. Alarms on memory must use `CWAgent`.

---

## Step 1 - Instance profile

The instance needs an IAM role. Console: **EC2** -> instance -> **Actions** -> **Security** -> **Modify IAM role**.

Attach:

- `CloudWatchAgentServerPolicy` (push metrics and logs)
- `AmazonSSMManagedInstanceCore` (so Systems Manager can install and start the agent)

Do not use access keys in `/root/.aws`. The agent uses the instance role.

If the instance was launched without a role, attach one and wait a minute. Session Manager must show the instance under **Fleet Manager** -> **Managed nodes** before the Distributor install will succeed. That requires the SSM agent (already on Amazon Linux 2 and 2023), outbound 443 to SSM, or VPC endpoints for `ssm`, `ssmmessages`, and `ec2messages`.

---

## Step 2 - Write the agent config

Console: **CloudWatch** -> **Configure** (or **Settings** in some accounts) is not where the JSON lives. Store the JSON in **Systems Manager Parameter Store** so every instance loads the same file.

Console: **Systems Manager** -> **Parameter Store** -> **Create parameter**.

| Field | Value |
| --- | --- |
| Name | `AmazonCloudWatch-northwind` |
| Tier | Standard |
| Type | String |
| Value | the JSON below |

```json
{
  "agent": {
    "metrics_collection_interval": 60,
    "run_as_user": "cwagent"
  },
  "metrics": {
    "namespace": "CWAgent",
    "append_dimensions": {
      "InstanceId": "${aws:InstanceId}",
      "AutoScalingGroupName": "${aws:AutoScalingGroupName}"
    },
    "aggregation_dimensions": [["InstanceId"], ["AutoScalingGroupName"]],
    "metrics_collected": {
      "mem": {
        "measurement": ["mem_used_percent"],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": ["disk_used_percent"],
        "resources": ["/"],
        "ignore_file_system_types": ["sysfs", "devtmpfs", "tmpfs", "overlay"],
        "metrics_collection_interval": 60
      }
    }
  }
}
```

`append_dimensions` is why the metric is searchable by instance id. Without it you get a number and no idea which host it came from.

`aggregation_dimensions` publishes a second copy rolled up by instance and by ASG. You can alarm on one instance or on the whole group. Each extra dimension set is another custom metric and another charge.

Interval `60` matches basic monitoring. `1` is high-resolution custom metrics and costs more. Use 60 unless the alarm needs sub-minute data.

---

## Step 3 - Install the agent

Console: **Systems Manager** -> **Distributor** -> select **AmazonCloudWatchAgent** -> **Install one time**.

| Field | Value |
| --- | --- |
| Targets | the instance, or a tag `Role=northwind-app` |
| Action | Install |

Or **Run Command** -> **AWS-ConfigureAWSPackage**:

| Parameter | Value |
| --- | --- |
| Action | Install |
| Name | `AmazonCloudWatchAgent` |

Wait until the command status is **Success**. On Amazon Linux the binary is `/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl`.

---

## Step 4 - Start the agent with that config

**Run Command** -> document **AmazonCloudWatch-ManageAgent**.

| Parameter | Value |
| --- | --- |
| Action | configure |
| Mode | ec2 |
| Optional Configuration Source | ssm |
| Optional Configuration Location | `AmazonCloudWatch-northwind` |
| Optional Restart | yes |

Targets: the same instances.

Success means the agent loaded the parameter and restarted. A failed command often says the parameter name was wrong or the instance role cannot `ssm:GetParameter`. `CloudWatchAgentServerPolicy` includes that read for parameters named `AmazonCloudWatch-*`. If you named the parameter something else, add `ssm:GetParameter` on that ARN.

---

## Step 5 - Confirm the metric

Wait two minutes.

1. **CloudWatch** -> **Metrics** -> **CWAgent** -> **InstanceId**.
2. Find the instance id. Check `mem_used_percent` and `disk_used_percent`.
3. On the instance, with Session Manager: `sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status`. `status` should be `running` and the config path should mention the SSM parameter.

If status is running and the namespace is empty, the agent is using an empty default config. Re-run ManageAgent with the configuration location set. Check `/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log` for `AccessDenied` on `cloudwatch:PutMetricData`.

---

## Step 6 - Alarm

Console: **CloudWatch** -> **Alarms** -> **Create alarm** -> select `CWAgent` `mem_used_percent` for that `InstanceId`.

| Field | Value |
| --- | --- |
| Statistic | Average |
| Period | 1 minute |
| Threshold | Greater than 80 for 5 datapoints |
| Missing data | Treat as breaching if the agent should always be installed. Treat as missing if instances stop at night |

Notify an SNS topic. An alarm on `AWS/EC2` `CPUUtilization` does not fire when the box is out of memory and idle on CPU. That is the usual reason to install the agent.

Disk: alarm on `disk_used_percent` dimension `path=/`. A host with a full disk and a healthy root volume needs a second metric collection for that mount. Add the path under `disk.resources`.

---

## Logs in the same agent

The same process can ship `/var/log/messages`. Add a `logs` block only if you want it. It needs a log group and it needs the role to call `logs:PutLogEvents` (`CloudWatchAgentServerPolicy` already allows it).

```json
"logs": {
  "logs_collected": {
    "files": {
      "collect_list": [{
        "file_path": "/var/log/messages",
        "log_group_name": "/northwind/ec2/messages",
        "log_stream_name": "{instance_id}",
        "retention_in_days": 14
      }]
    }
  }
}
```

Set retention in the console as well: **Log groups** -> the group -> **Actions** -> **Edit retention**. The agent field is not always applied on an existing group.

Searching those events is covered in [Search CloudWatch Logs](./cloudwatch-logs-search.md).

---

## Several instances

Target the Distributor install and ManageAgent by tag, not by one instance id. Put the same parameter name in a State Manager association so new instances in the ASG configure themselves:

Console: **Systems Manager** -> **State Manager** -> **Create association** -> document `AmazonCloudWatch-ManageAgent` -> schedule `rate(1 hour)` -> targets tag `Role=northwind-app` -> parameters as in step 4.

---

## Mistakes

| Mistake | Result |
| --- | --- |
| Alarm on `AWS/EC2` looking for memory | Metric does not exist |
| No instance profile | Agent installed, `PutMetricData` denied |
| Parameter name not passed to ManageAgent | Agent runs, `CWAgent` stays empty |
| `mem_used_percent` collected but dimension not appended | You cannot tell which instance |
| High-resolution interval on every host | Custom metric bill jumps |
| Old `mon-put-instance-data` cron still installed | Duplicate and conflicting numbers |

[<- Logs search](./cloudwatch-logs-search.md)
