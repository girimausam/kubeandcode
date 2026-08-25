import os
import json
import boto3
# pip install amazon-dax-client -t package
import amazondax


TABLE_NAME = os.environ["TABLE_NAME"]
DAX_ENDPOINT = os.environ["DAX_ENDPOINT"]


# Reused across warm Lambda invocations
dynamodb = boto3.client("dynamodb")

dax = amazondax.AmazonDaxClient(
    endpoints=[DAX_ENDPOINT],
    region_name=os.environ["AWS_REGION"]
)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps(body)
    }


def lambda_handler(event, context):

    path = event.get("rawPath", "")

    product_id = (
        event.get("queryStringParameters") or {}
    ).get("productId")

    if not product_id:
        return response(
            400,
            {
                "message": "productId is required"
            }
        )

    key = {
        "productId": {
            "S": product_id
        }
    }

    # EVENTUALLY CONSISTENT READ
    if path == "/eventual":

        result = dax.get_item(
            TableName=TABLE_NAME,
            Key=key
        )

        return response(
            200,
            {
                "consistency": "EVENTUAL",
                "source": "DAX -> DynamoDB on cache miss",
                "item": result.get("Item")
            }
        )

    # STRONGLY CONSISTENT READ
    elif path == "/strong":

        result = dynamodb.get_item(
            TableName=TABLE_NAME,
            Key=key,
            ConsistentRead=True
        )

        return response(
            200,
            {
                "consistency": "STRONG",
                "source": "DynamoDB",
                "item": result.get("Item")
            }
        )

    return response(
        404,
        {
            "message": "Use /eventual or /strong"
        }
    )