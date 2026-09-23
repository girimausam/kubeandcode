"""
Shared Lambda for four fraud "agents" behind AgentCore Gateway (one function, four aliases).

Env:
  SPECIALIST_ROLE  velocity | device | geo | merchant

Gateway invokes with JSON body matching the OpenAPI schema per tool.
Returns structured JSON the orchestrator harness can merge.
"""

import json
import os
from typing import Any

ROLE = os.environ.get("SPECIALIST_ROLE", "velocity")


def _velocity(event: dict) -> dict:
    amount = float(event.get("amount", 0))
    count_1h = int(event.get("txnCountLastHour", 0))
    score = min(100, int(amount / 100) + count_1h * 8)
    return {
        "agent": "velocity",
        "riskScore": score,
        "finding": f"{count_1h} txns in last hour; amount {amount}",
        "severity": "high" if score >= 70 else "medium" if score >= 40 else "low",
    }


def _device(event: dict) -> dict:
    device_id = event.get("deviceId", "")
    trusted = event.get("deviceTrusted", False)
    score = 15 if trusted else 55
    if device_id.startswith("sim-"):
        score = 85
    return {
        "agent": "device",
        "riskScore": score,
        "finding": f"deviceId={device_id}, trusted={trusted}",
        "severity": "high" if score >= 70 else "low",
    }


def _geo(event: dict) -> dict:
    ip_country = event.get("ipCountry", "")
    card_country = event.get("cardCountry", "")
    score = 10 if ip_country and ip_country == card_country else 65
    return {
        "agent": "geo",
        "riskScore": score,
        "finding": f"ip={ip_country}, card={card_country}",
        "severity": "high" if score >= 60 else "low",
    }


def _merchant(event: dict) -> dict:
    merchant_id = event.get("merchantId", "")
    chargeback_rate = float(event.get("merchantChargebackRate", 0))
    score = min(100, int(chargeback_rate * 500))
    return {
        "agent": "merchant",
        "riskScore": score,
        "finding": f"merchant={merchant_id}, chargebackRate={chargeback_rate}",
        "severity": "high" if score >= 50 else "low",
    }


_HANDLERS = {
    "velocity": _velocity,
    "device": _device,
    "geo": _geo,
    "merchant": _merchant,
}


def lambda_handler(event: dict, context: Any) -> dict:
    body = event
    if isinstance(event.get("body"), str):
        body = json.loads(event["body"])
    handler = _HANDLERS.get(ROLE)
    if not handler:
        return {"statusCode": 400, "body": json.dumps({"error": f"unknown SPECIALIST_ROLE={ROLE}"})}
    result = handler(body)
    return {"statusCode": 200, "body": json.dumps(result)}
