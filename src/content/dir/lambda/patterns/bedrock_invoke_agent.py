"""Bedrock Agent invoke (streaming collected to one string).

Env: AGENT_ID, AGENT_ALIAS_ID (e.g. TSTALIASID)
Event: {"prompt": "What is our return policy?", "sessionId": "optional-uuid"}
"""

import os
import uuid

import boto3

client = boto3.client("bedrock-agent-runtime")
AGENT_ID = os.environ["AGENT_ID"]
ALIAS_ID = os.environ["AGENT_ALIAS_ID"]


def lambda_handler(event, context):
    session_id = event.get("sessionId") or str(uuid.uuid4())

    stream = client.invoke_agent(
        agentId=AGENT_ID,
        agentAliasId=ALIAS_ID,
        sessionId=session_id,
        inputText=event["prompt"],
    )

    parts = []
    for event_chunk in stream.get("completion", []):
        if "chunk" in event_chunk:
            parts.append(event_chunk["chunk"]["bytes"].decode("utf-8"))

    return {"sessionId": session_id, "answer": "".join(parts)}
