"""SNS: publish JSON message. Env: TOPIC_ARN. Event: {"message": "...", "subject": "optional"}."""

import json
import os

import boto3

sns = boto3.client("sns")
TOPIC_ARN = os.environ["TOPIC_ARN"]


def lambda_handler(event, context):
    body = event if isinstance(event, dict) and "message" in event else json.loads(event.get("body", "{}"))

    res = sns.publish(
        TopicArn=TOPIC_ARN,
        Subject=body.get("subject", "Lambda notification"),
        Message=json.dumps(body["message"]) if not isinstance(body["message"], str) else body["message"],
    )
    return {"messageId": res["MessageId"]}
