"""
Settlement worker — runs in VPC, calls orders via Cloud Map DNS (not Service Connect).

Env:
  ORDERS_DNS   e.g. orders-api.shopflow.prod.internal
  ORDERS_PORT  default 8081
"""

import json
import os
import urllib.request

ORDERS_DNS = os.environ["ORDERS_DNS"]
ORDERS_PORT = os.environ.get("ORDERS_PORT", "8081")


def lambda_handler(event, context):
    # Example: nightly reconciliation pull — uses Service Discovery FQDN
    url = f"http://{ORDERS_DNS}:{ORDERS_PORT}/health"
    with urllib.request.urlopen(url, timeout=10) as resp:
        body = resp.read().decode()
    return {"statusCode": 200, "body": json.dumps({"checked": url, "response": body})}
