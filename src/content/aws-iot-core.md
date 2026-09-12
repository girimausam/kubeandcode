---
title: "AWS IoT Core: MQTT, Policies, and Rules Engine"
description: "Thing, X.509 cert, policy, MQTT publish/subscribe, rules to Lambda, shadows, and common connect/policy failures."
tags:
  - iot
  - iot-core
  - mqtt
  - aws
  - lambda
  - notes
date: 2026-09-12
links:
  - title: How AWS IoT works
    url: https://docs.aws.amazon.com/iot/latest/developerguide/iot-gs.html
  - title: IoT policies
    url: https://docs.aws.amazon.com/iot/latest/developerguide/iot-policy-actions.html
  - title: Rules engine
    url: https://docs.aws.amazon.com/iot/latest/developerguide/iot-rules.html
  - title: Device Shadow
    url: https://docs.aws.amazon.com/iot/latest/developerguide/iot-device-shadows.html
---

# AWS IoT Core

**Device path:** register **Thing** → create **X.509 cert** → **IoT policy** on cert → MQTT over TLS to **data endpoint** → **topics** → optional **Rules** → Lambda / DynamoDB / SQS / Timestream.

**Cloud path:** IAM principal calls **`iot-data`** API (`Publish`, `UpdateThingShadow`) — not the same auth as devices.

Use **Data-ATS** endpoint (`…-ats.iot.<region>.amazonaws.com`, port **8883**). Thing name = MQTT **client ID** when policy scopes `client/${iot:Connection.Thing.ThingName}`.

| Piece | Job |
| --- | --- |
| Thing | Logical device id in registry |
| Certificate | Device identity (TLS mutual auth) |
| IoT policy | Allows `Connect` / `Publish` / `Subscribe` / `Receive` on ARNs |
| Topic | MQTT routing (`device/<thing>/telemetry`) |
| Rule | SQL on topic payload → action |
| Shadow | JSON state document (`$aws/things/<name>/shadow/...`) |

<details>
<summary>Env + data endpoint</summary>

```bash
export AWS_REGION=<region>
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws iot describe-endpoint --endpoint-type iot:Data-ATS --query endpointAddress --output text
```

Download [Amazon Root CA 1](https://www.amazontrust.com/repository/AmazonRootCA1.pem) for devices (`AmazonRootCA1.pem`).

</details>

---

## 1. Thing + certificate + policy

Order matters: **policy exists** → **cert created** → **attach policy to cert** → **attach cert to thing**.

Duplicate thing name in same Region → `ResourceAlreadyExistsException`. Delete test things between tutorials or use unique names.

<details>
<summary>Create thing, cert, and attach</summary>

```bash
THING_NAME=my-sensor-01

aws iot create-thing --thing-name "$THING_NAME"

aws iot create-keys-and-certificate --set-as-active \
  --certificate-pem-outfile device.cert.pem \
  --public-key-outfile device.public.key \
  --private-key-outfile device.private.key \
  --query certificateArn --output text > cert-arn.txt

CERT_ARN=$(cat cert-arn.txt)

aws iot attach-thing-principal --thing-name "$THING_NAME" --principal "$CERT_ARN"
```

</details>

<details>
<summary>IoT policy (thing-scoped topics)</summary>

Replace `<region>` and `<account>`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "iot:Connect",
      "Resource": "arn:aws:iot:<region>:<account>:client/${iot:Connection.Thing.ThingName}"
    },
    {
      "Effect": "Allow",
      "Action": ["iot:Publish", "iot:Receive"],
      "Resource": "arn:aws:iot:<region>:<account>:topic/device/${iot:Connection.Thing.ThingName}/*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Subscribe",
      "Resource": "arn:aws:iot:<region>:<account>:topicfilter/device/${iot:Connection.Thing.ThingName}/*"
    }
  ]
}
```

```bash
aws iot create-policy --policy-name "${THING_NAME}-policy" --policy-document file://iot-policy.json
aws iot attach-policy --policy-name "${THING_NAME}-policy" --target "$CERT_ARN"
```

Policy on **certificate** (or Cognito identity), not on the thing object alone.

</details>

---

## 2. Publish telemetry (device)

Topic must match policy. QoS **0** or **1** (IoT Core supports QoS 0 and 1, not 2).

<details>
<summary>mosquitto_pub (quick test)</summary>

```bash
ENDPOINT=$(aws iot describe-endpoint --endpoint-type iot:Data-ATS --query endpointAddress --output text)

mosquitto_pub \
  --cafile AmazonRootCA1.pem \
  --cert device.cert.pem \
  --key device.private.key \
  -h "$ENDPOINT" -p 8883 -q 1 \
  -i "$THING_NAME" \
  -t "device/${THING_NAME}/telemetry" \
  -m '{"temp_c":22.5}'
```

Console: **MQTT test client** → subscribe `device/#` → watch messages.

</details>

<details>
<summary>Python (X.509) example</summary>

`./content/dir/iot/mqtt-publish-telemetry.py`

```bash
pip install awsiotsdk
python ./content/dir/iot/mqtt-publish-telemetry.py \
  --endpoint "$ENDPOINT" \
  --cert device.cert.pem --key device.private.key --ca AmazonRootCA1.pem \
  --thing-name "$THING_NAME"
```

</details>

<details>
<summary>Cloud publish (IAM, not device cert)</summary>

Backend or test from CLI with your **IAM** user/role:

```bash
aws iot-data publish \
  --topic "device/${THING_NAME}/telemetry" \
  --qos 1 \
  --payload '{"temp_c":23.0,"source":"cli"}' \
  --cli-binary-format raw-in-base64-out
```

Requires IAM `iot:Publish` on the topic ARN. Does not prove device cert wiring.

</details>

---

## 3. Rules engine → Lambda

Rule SQL selects fields from incoming messages. Rule execution role needs permission to invoke Lambda (and write to downstream resources).

<details>
<summary>Topic rule payload + create</summary>

`rule-temp-lambda.json`:

```json
{
  "sql": "SELECT topic(2) AS thingName, temp_c, ts FROM 'device/+/telemetry' WHERE temp_c > 30",
  "description": "Hot readings to Lambda",
  "actions": [
    {
      "lambda": {
        "functionArn": "arn:aws:lambda:<region>:<account>:function:IotHotTelemetry"
      }
    }
  ],
  "ruleDisabled": false,
  "awsIotSqlVersion": "2016-03-23"
}
```

```bash
aws iot create-topic-rule --rule-name HotTelemetryToLambda --topic-rule-payload file://rule-temp-lambda.json
```

Lambda resource policy must allow `iot.amazonaws.com` to invoke. Rule errors → CloudWatch Logs log group **`AWSIotLogsV2`** (enable logging in IoT settings if empty).

</details>

<details>
<summary>Rule → DynamoDB (pattern)</summary>

```json
{
  "sql": "SELECT * FROM 'device/+/telemetry'",
  "actions": [
    {
      "dynamoDBv2": {
        "roleArn": "arn:aws:iam::<account>:role/IotRuleDynamoRole",
        "putItem": {
          "tableName": "DeviceTelemetry"
        }
      }
    }
  ]
}
```

Partition key in table must match what SQL exposes (often `thingName` from `topic(n)` or a field in JSON).

</details>

---

## 4. Device Shadow (optional)

Reported state from device; desired state from cloud. Classic shadow topics:

- Update reported: `$aws/things/<thingName>/shadow/update`
- Get: `$aws/things/<thingName>/shadow/get`

Policy must allow `iot:Publish` / `iot:Subscribe` on `$aws/things/${iot:Connection.Thing.ThingName}/shadow/*` if you use shadows with thing-scoped policies.

<details>
<summary>Shadow update payload</summary>

```json
{
  "state": {
    "reported": {
      "temp_c": 22.5,
      "connected": true
    }
  }
}
```

```bash
aws iot-data update-thing-shadow \
  --thing-name "$THING_NAME" \
  --payload file://shadow-reported.json \
  --cli-binary-format raw-in-base64-out
```

</details>

---

## 5. Daily checks

| Symptom | First look |
| --- | --- |
| `CONNECT` fails / TLS handshake | Wrong endpoint (use **ATS**); clock skew; CA file |
| `Not authorized` on connect | Policy not attached to **cert**; client ID ≠ thing name when policy uses ThingName variable |
| `Not authorized` on publish | Topic string mismatch vs policy ARN (typo, missing level, wrong `topic` vs `topicfilter`) |
| Cert rejected | Cert inactive or revoked; using cert from another account/Region |
| Rule never fires | SQL topic filter vs actual topic; `ruleDisabled`; no message reaching broker |
| Lambda not invoked | Rule role + Lambda resource policy; check **`AWSIotLogsV2`** |
| Shadow access denied | Shadow `$aws/things/...` ARNs missing in IoT policy |

```bash
aws iot list-things
aws iot list-thing-principals --thing-name "$THING_NAME"
aws iot list-principal-policies --principal "$CERT_ARN"
aws iot get-topic-rule --rule-name HotTelemetryToLambda
```

Docs: [troubleshoot MQTT](https://docs.aws.amazon.com/iot/latest/developerguide/diagnosing-connectivity-issues.html) · [policy variables](https://docs.aws.amazon.com/iot/latest/developerguide/basic-policy-variables.html)
