"""S3 get or put JSON object. Env: BUCKET_NAME.

Event get:  {"action": "get", "key": "path/file.json"}
Event put:  {"action": "put", "key": "path/file.json", "data": {...}}
"""

import json
import os

import boto3

s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET_NAME"]


def lambda_handler(event, context):
    key = event["key"]
    action = event.get("action", "get")

    if action == "put":
        s3.put_object(
            Bucket=BUCKET,
            Key=key,
            Body=json.dumps(event["data"]).encode("utf-8"),
            ContentType="application/json",
        )
        return {"bucket": BUCKET, "key": key, "status": "written"}

    obj = s3.get_object(Bucket=BUCKET, Key=key)
    data = json.loads(obj["Body"].read())
    return {"bucket": BUCKET, "key": key, "data": data}
