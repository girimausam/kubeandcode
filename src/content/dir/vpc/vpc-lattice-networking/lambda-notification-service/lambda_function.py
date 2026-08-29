import json

def lambda_handler(event, context):
    body = event.get("body", event)
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            body = {}

    order_id = body.get("order_id", "UNKNOWN")
    message = {
        "service": "notification-service",
        "order_id": order_id,
        "message": f"Notification processed for {order_id}"
    }

    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(message)
    }
