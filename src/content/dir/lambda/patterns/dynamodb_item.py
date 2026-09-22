"""DynamoDB: put and get one item. Env: TABLE_NAME. Event: {"id": "...", "name": "..."}."""

import json
import os

import boto3

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])


def lambda_handler(event, context):
    if event.get("action") == "get":
        item_id = event["id"]
        res = table.get_item(Key={"id": item_id})
        return {"item": res.get("Item")}

    item = {"id": event["id"], "name": event.get("name", "")}
    table.put_item(Item=item)
    return {"saved": item}
