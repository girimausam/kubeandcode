"""SQS: send one message. Env: QUEUE_URL. Event: {"payload": {...}}."""

import json
import os

import boto3

sqs = boto3.client("sqs")
QUEUE_URL = os.environ["QUEUE_URL"]


def lambda_handler(event, context):
    payload = event.get("payload", event)
    res = sqs.send_message(
        QueueUrl=QUEUE_URL,
        MessageBody=json.dumps(payload),
    )
    return {"messageId": res["MessageId"]}
