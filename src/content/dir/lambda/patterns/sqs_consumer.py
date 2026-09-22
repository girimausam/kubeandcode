"""SQS trigger: process batch, return partial failures for retry.

Event shape: standard SQS → Lambda Records[]. Each record body is JSON.
"""

import json


def lambda_handler(event, context):
    failures = []

    for record in event.get("Records", []):
        message_id = record["messageId"]
        try:
            body = json.loads(record["body"])
            # Your work here — e.g. save body to DB, call API, etc.
            print("processed", message_id, body)
        except Exception:
            failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": failures}
