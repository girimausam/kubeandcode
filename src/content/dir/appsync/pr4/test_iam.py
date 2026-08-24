import json
import os
import urllib.request

import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

payload = {
    "query": """
        mutation UpdateTicket($input: UpdateTicketStatusInput!) {
        updateTicketStatus(input: $input) {
            ticketId
            title
            description
            status
            owner
            priority
            createdAt
            updatedAt
        }
        }
    """,
    "variables": {
        "input": {
            "ticketId": os.environ["TICKET_ID"],
            "status": "RESOLVED"
        }
    }
}

credentials = boto3.Session().get_credentials().get_frozen_credentials()

request = AWSRequest(
    method="POST",
    url=os.environ["TICKET_API_URL"],
    data=json.dumps(payload),
    headers={
        "Content-Type": "application/json"
    }
)

SigV4Auth(
    credentials,
    "appsync",
    os.environ["AWS_REGION"]
).add_auth(request)

response = urllib.request.urlopen(
    urllib.request.Request(
        url=request.url,
        data=request.body,  # Already bytes
        headers=dict(request.headers.items()),
        method="POST"
    )
)

print(response.read().decode())