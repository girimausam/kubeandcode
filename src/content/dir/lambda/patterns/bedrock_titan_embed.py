"""Bedrock Titan embeddings. Env: MODEL_ID (default amazon.titan-embed-text-v2:0).

Event: {"text": "sentence to embed"}
"""

import json
import os

import boto3

client = boto3.client("bedrock-runtime")
MODEL_ID = os.environ.get("MODEL_ID", "amazon.titan-embed-text-v2:0")


def lambda_handler(event, context):
    body = json.dumps({"inputText": event["text"]})
    res = client.invoke_model(modelId=MODEL_ID, body=body)
    payload = json.loads(res["body"].read())
    return {"embedding": payload.get("embedding"), "inputTextTokenCount": payload.get("inputTextTokenCount")}
