import json
import os
import uuid
from datetime import datetime, timezone

import boto3

table = boto3.resource("dynamodb").Table(
    os.environ["TICKETS_TABLE"]
)


def lambda_handler(event, context):

    input_data = event["input"]
    identity = event["identity"]

    title = input_data["title"].strip()

    if not title:
        raise ValueError("title cannot be empty")

    if len(title) > 200:
        raise ValueError("title cannot exceed 200 characters")

    description = input_data.get("description")

    priority = "HIGH" if "urgent" in title.lower() else "NORMAL"

    now = datetime.now(timezone.utc).isoformat()

    ticket = {
        "ticketId": str(uuid.uuid4()),
        "title": title,
        "description": description,
        "status": "OPEN",
        "owner": identity["sub"],
        "priority": priority,
        "createdAt": now,
        "updatedAt": now
    }

    table.put_item(Item=ticket)

    return ticket