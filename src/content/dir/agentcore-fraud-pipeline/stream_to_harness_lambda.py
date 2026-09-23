"""
DynamoDB Streams → AgentCore Harness → write FraudAssessments.

Env:
  PAYMENT_EVENTS_TABLE   (source; stream attached)
  FRAUD_RESULTS_TABLE
  HARNESS_ARN
  HARNESS_QUALIFIER      optional, default prod

Stream handler expects PaymentEvents items with:
  transactionId, merchantId, amount, currency, deviceId, ipCountry, status
Only processes records where status == PENDING_FRAUD_CHECK (configurable).
"""

from __future__ import annotations

import json
import os
import time
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.types import TypeDeserializer

REGION = os.environ.get("AWS_REGION", "us-east-1")
HARNESS_ARN = os.environ["HARNESS_ARN"]
HARNESS_QUALIFIER = os.environ.get("HARNESS_QUALIFIER", "prod")
FRAUD_TABLE = os.environ["FRAUD_RESULTS_TABLE"]
TRIGGER_STATUS = os.environ.get("TRIGGER_STATUS", "PENDING_FRAUD_CHECK")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
fraud_table = dynamodb.Table(FRAUD_TABLE)
agentcore = boto3.client("bedrock-agentcore", region_name=REGION)
_deser = TypeDeserializer()


def _session_id(transaction_id: str) -> str:
    base = f"fraud-{transaction_id}"
    return base if len(base) >= 33 else (base + "-0" * 33)[:40]


def _to_jsonable(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return float(obj) if obj % 1 else int(obj)
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_jsonable(v) for v in obj]
    return obj


def _unmarshall_image(image: dict | None) -> dict | None:
    if not image:
        return None
    return _to_jsonable({k: _deser.deserialize(v) for k, v in image.items()})


def _drain_harness_text(response: dict) -> str:
    parts: list[str] = []
    for event in response.get("stream", []):
        if "contentBlockDelta" in event:
            delta = event["contentBlockDelta"].get("delta", {})
            if "text" in delta:
                parts.append(delta["text"])
        elif "runtimeClientError" in event:
            raise RuntimeError(event["runtimeClientError"].get("message", "harness error"))
    return "".join(parts)


def _parse_verdict(raw: str) -> dict:
    """Harness is prompted to emit a single JSON object; extract it fail-safe."""
    raw = raw.strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        return {
            "riskScore": 50,
            "recommendation": "REVIEW",
            "summary": raw[:2000],
            "parseError": True,
        }
    try:
        return json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return {
            "riskScore": 50,
            "recommendation": "REVIEW",
            "summary": raw[:2000],
            "parseError": True,
        }


def _invoke_harness(txn: dict) -> dict:
    transaction_id = txn["transactionId"]
    facts = json.dumps(_to_jsonable(txn), separators=(",", ":"))
    prompt = (
        "Analyze this payment for fraud. Call every specialist tool on the gateway "
        "(velocity, device, geo, merchant). Then return ONLY one JSON object with keys: "
        "riskScore (0-100), recommendation (APPROVE|REVIEW|DECLINE), summary (string), "
        "signals (array of {agent, finding, severity}).\n\n"
        f"TRANSACTION:\n{facts}"
    )

    response = agentcore.invoke_harness(
        harnessArn=HARNESS_ARN,
        qualifier=HARNESS_QUALIFIER,
        runtimeSessionId=_session_id(transaction_id),
        actorId=txn.get("merchantId", "unknown-merchant"),
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        allowedTools=[
            "fraud-gateway___velocity_check",
            "fraud-gateway___device_check",
            "fraud-gateway___geo_check",
            "fraud-gateway___merchant_check",
        ],
        maxIterations=20,
        timeoutSeconds=240,
    )
    verdict = _parse_verdict(_drain_harness_text(response))
    verdict["transactionId"] = transaction_id
    verdict["harnessArn"] = HARNESS_ARN
    verdict["assessedAt"] = int(time.time())
    return verdict


def _save_result(verdict: dict) -> None:
    fraud_table.put_item(
        Item={
            "transactionId": verdict["transactionId"],
            "riskScore": verdict.get("riskScore", 50),
            "recommendation": verdict.get("recommendation", "REVIEW"),
            "summary": verdict.get("summary", ""),
            "signals": verdict.get("signals", []),
            "assessedAt": verdict.get("assessedAt"),
            "rawParseError": verdict.get("parseError", False),
        }
    )


def lambda_handler(event, context):
    failures: list[str] = []
    for record in event.get("Records", []):
        if record.get("eventName") not in ("INSERT", "MODIFY"):
            continue
        new_image = _unmarshall_image(record.get("dynamodb", {}).get("NewImage"))
        if not new_image:
            continue
        if new_image.get("status") != TRIGGER_STATUS:
            continue
        try:
            verdict = _invoke_harness(new_image)
            _save_result(verdict)
        except Exception as exc:  # noqa: BLE001 — batch partial failure
            failures.append(f"{new_image.get('transactionId')}: {exc}")

    if failures:
        raise RuntimeError("; ".join(failures))
    return {"processed": len(event.get("Records", []))}
