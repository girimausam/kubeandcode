"""API Gateway HTTP API / REST proxy integration.

Reads httpMethod + body/query; returns API Gateway response object.
Env: TABLE_NAME optional — if set, GET ?id= reads DynamoDB (demo).
"""

import json
import os

import boto3

TABLE_NAME = os.environ.get("TABLE_NAME")
table = boto3.resource("dynamodb").Table(TABLE_NAME) if TABLE_NAME else None


def response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")
    query = event.get("queryStringParameters") or {}
    body = event.get("body")
    if body and isinstance(body, str):
        body = json.loads(body)

    if method == "GET" and table and query.get("id"):
        item = table.get_item(Key={"id": query["id"]}).get("Item")
        return response(200, {"item": item})

    if method == "POST" and table and body:
        table.put_item(Item=body)
        return response(201, {"saved": body})

    return response(200, {"method": method, "query": query, "body": body})
