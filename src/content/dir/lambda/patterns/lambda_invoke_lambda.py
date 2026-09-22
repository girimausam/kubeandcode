"""Call another Lambda and return its payload. Env: DOWNSTREAM_FUNCTION_NAME.

Event: {"payload": {...}, "async": false}
"""

import json
import os

import boto3

lambda_client = boto3.client("lambda")
DOWNSTREAM = os.environ["DOWNSTREAM_FUNCTION_NAME"]


def lambda_handler(event, context):
    payload = event.get("payload", {})
    invoke_async = event.get("async", False)

    res = lambda_client.invoke(
        FunctionName=DOWNSTREAM,
        InvocationType="Event" if invoke_async else "RequestResponse",
        Payload=json.dumps(payload).encode("utf-8"),
    )

    if invoke_async:
        return {"status": "queued", "statusCode": res["StatusCode"]}

    body = res["Payload"].read()
    downstream = json.loads(body) if body else {}
    if "FunctionError" in res:
        return {"error": res["FunctionError"], "details": downstream}

    return {"downstream": downstream}
