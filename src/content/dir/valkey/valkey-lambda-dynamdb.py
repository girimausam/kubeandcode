import os
import json
import boto3
import redis
from boto3.dynamodb.conditions import Key

# GLOBAL INIT (Warm Start Optimization)
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get('DYNAMODB_TABLE', 'ProductsTable'))

# Valkey Client (TLS Enabled)
cache = redis.Redis(
    host=os.environ.get('VALKEY_ENDPOINT'),
    port=os.environ.get('VALKEY_HOST', 6379),
    ssl=True,
    ssl_cert_reqs="required",
    decode_responses=True,
    # socket_timeout=2
    # socket_connect=2
)

###
def cache_get(key):
    try: return cache.get(key)
    except: return None

def cache_set(key, value):
    try: cache.setex(key, 300, json.dumps(value, default=str))
    except: pass

def cache_delete(*keys):
    try: cache.delete(*keys)
    except: pass

###
def get_product(product_id):
    key = f"product:{product_id}"
    
    if data := cache_get(key):
        return 200, {"source": "cache", "data": json.loads(data)}

    response = table.get_item(Key={'id': product_id})
    if 'Item' not in response:
        return 404, {"error": "Not found"}
        
    cache_set(key, response['Item'])
    return 200, {"source": "db", "data": response['Item']}

def get_by_category(category):
    key = f"category:{category}"
    
    if data := cache_get(key):
        return 200, {"source": "cache", "data": json.loads(data)}

    response = table.query(IndexName='category-index', KeyConditionExpression=Key('category').eq(category))
    
    cache_set(key, response.get('Items', []))
    return 200, {"source": "db", "data": response.get('Items', [])}

def put_product(product_id, body):
    body['id'] = product_id
    table.put_item(Item=body)
    
    keys_to_delete = [f"product:{product_id}"]
    if category := body.get('category'):
        keys_to_delete.append(f"category:{category}")
    cache_delete(*keys_to_delete)
    
    return 200, {"message": "Updated", "data": body}

def delete_product(product_id):
    table.delete_item(Key={'id': product_id})
    
    cache_delete(f"product:{product_id}")
    
    return 204, None


def lambda_handler(event, context):
    method = event['httpMethod']
    path_params = event.get('pathParameters') or {}
    query_params = event.get('queryStringParameters') or {}
    
    product_id = path_params.get('id')
    category = query_params.get('category')

    if method == 'GET' and product_id:
        status, body = get_product(product_id)

    elif method == 'GET' and category:
        status, body = get_by_category(category)

    elif method == 'PUT' and product_id:
        status, body = put_product(product_id, json.loads(event.get('body', '{}')))

    elif method == 'DELETE' and product_id:
        status, body = delete_product(product_id)
        
    else:
        status, body = 400, {"error": "Bad Request"}

    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body) if body else ''
    }