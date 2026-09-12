
# AIM CRUD app DynamoDB

import boto3
import os
import json

TABLE_NAME = os.environ.get("TABLE_NAME")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

def lambda_handler(event, context):
    body = event.get("body")

    if body:
        if isinstance(body, str):
            body = json.loads(body)
    else:
        body = {}

    method = event.get("httpMethod")
    query_params = event.get("queryStringParameters") or {}

    print(body, method, query_params)

    # read
    if method == "GET":
        item_id = query_params.get("id")

        item = []
        last_evaluated_key = None

        if item_id:
            res = table.get_item(
                Key = {
                    "id": item_id
                }
            )
            item = res['Item']
        else:
            limit = query_params.get("limit", "10")
            if limit:
                scan_params = {
                    "Limit": int(limit)
                }
            
            last_key = query_params.get("lastKey")
            if last_key:
                scan_params["ExclusiveStartKey"] = json.loads(last_key)

            res = table.scan(**scan_params)
            item = res.get("Items", [])

            last_evaluated_key = res.get("LastEvaluatedKey")

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "item": item,
                "nextKey": json.dumps(last_evaluated_key) if last_evaluated_key else None 
            })
        }

    # create
    if method == 'POST':
        

        if isinstance(body, list):
            batch_save(body)

        else:
            item = {
                "id": body["id"],
                "name": body["name"],
                "email": body["email"]
            }

            table.put_item(Item=item)

        return {
            "statusCode": 201,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "message": "Saved"
            })
        }

    # update
    if method == "PUT":

        item_id = body.get("id")

        if not item_id:
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": {
                    "message": "id is required"
                }
            }
        
        res = table.update_item(
            Key={
                "id": item_id
            },
            ConditionExpression="attribute_exists(id)",
            UpdateExpression="SET #name = :name, email = :email",
            ExpressionAttributeNames={
                "#name": "name"
            },
            ExpressionAttributeValues={
                ":name": body.get("name"),
                ":email": body.get("email")
            },
            ReturnValues="ALL_NEW"
        )

        return {
            "statusCode": 201,
            "body": json.dumps({
                "item_id": item_id,
                "item": res["Attributes"]
            }),
            "headers": {
                "Content-Type": "application/json"
            }
        }

    # delete
    if method == "DELETE":
        item_id = body.get("id")

        if not item_id:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "id is required"
                }),
                "headers": {
                    "Content-Type": "application/json"
                }
            }
        
        res = table.delete_item(
            Key={
                "id": item_id
            },
            ReturnValues="ALL_OLD"
        )

        deleted_item = res.get("Attributes")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "item": deleted_item
            })
        }

def batch_save(body):
    with table.batch_writer() as batch:
        for item in body:
            batch.put_item(
                Item={
                    "id": str(item['id']),
                    "name": item['name'],
                    "email": item["email"]
                }
            )
        