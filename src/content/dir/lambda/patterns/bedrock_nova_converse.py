"""Bedrock Converse (Nova, etc.). Env: MODEL_ID (e.g. amazon.nova-lite-v1:0).

Event: {"prompt": "Summarize this in one sentence.", "system": "optional"}
"""

import os

import boto3

client = boto3.client("bedrock-runtime")
MODEL_ID = os.environ.get("MODEL_ID", "amazon.nova-lite-v1:0")


def lambda_handler(event, context):
    prompt = event["prompt"]
    messages = [{"role": "user", "content": [{"text": prompt}]}]

    kwargs = {
        "modelId": MODEL_ID,
        "messages": messages,
        "inferenceConfig": {"maxTokens": 512, "temperature": 0.3},
    }
    if event.get("system"):
        kwargs["system"] = [{"text": event["system"]}]

    res = client.converse(**kwargs)
    text = res["output"]["message"]["content"][0]["text"]
    return {"model": MODEL_ID, "text": text}
