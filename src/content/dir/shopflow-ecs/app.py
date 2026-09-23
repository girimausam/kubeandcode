"""
ShopFlow sample microservices — one image, role selected by APP_ROLE.

Roles: storefront | orders | payments | inventory
East-west calls use Service Connect DNS names (orders, payments, inventory).
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("shopflow")

APP_ROLE = os.getenv("APP_ROLE", "storefront")
PORT = int(os.getenv("PORT", "8080"))

ORDERS_HOST = os.getenv("ORDERS_HOST", "orders")
ORDERS_PORT = int(os.getenv("ORDERS_PORT", "8081"))
PAYMENTS_HOST = os.getenv("PAYMENTS_HOST", "payments")
PAYMENTS_PORT = int(os.getenv("PAYMENTS_PORT", "8082"))
INVENTORY_HOST = os.getenv("INVENTORY_HOST", "inventory")
INVENTORY_PORT = int(os.getenv("INVENTORY_PORT", "8083"))

EFS_AUDIT_DIR = Path(os.getenv("EFS_AUDIT_DIR", "/mnt/efs/audit"))
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "5"))


app = Flask(__name__)


def _sc_url(host: str, port: int, path: str) -> str:
    return f"http://{host}:{port}{path}"


def _append_audit(event: dict) -> None:
    if not EFS_AUDIT_DIR.exists():
        return
    EFS_AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    line = json.dumps({**event, "ts": datetime.now(timezone.utc).isoformat()})
    (EFS_AUDIT_DIR / f"orders-{day}.jsonl").open("a", encoding="utf-8").write(line + "\n")


@app.get("/health")
def health():
    return jsonify({"status": "ok", "role": APP_ROLE})


@app.get("/ready")
def ready():
    if APP_ROLE == "storefront":
        try:
            requests.get(_sc_url(ORDERS_HOST, ORDERS_PORT, "/health"), timeout=HTTP_TIMEOUT)
        except requests.RequestException as exc:
            return jsonify({"ready": False, "reason": str(exc)}), 503
    return jsonify({"ready": True, "role": APP_ROLE})


@app.post("/api/checkout")
def checkout():
    if APP_ROLE != "storefront":
        return jsonify({"error": "wrong role"}), 404
    body = request.get_json(silent=True) or {}
    sku = body.get("sku", "SKU-DEFAULT")
    qty = int(body.get("quantity", 1))
    order_id = body.get("orderId") or f"ord-{int(time.time())}"
    payload = {"orderId": order_id, "sku": sku, "quantity": qty, "amountCents": qty * 1999}
    resp = requests.post(
        _sc_url(ORDERS_HOST, ORDERS_PORT, "/internal/orders"),
        json=payload,
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    return jsonify({"storefront": True, "order": resp.json()})


@app.post("/internal/orders")
def create_order():
    if APP_ROLE != "orders":
        return jsonify({"error": "wrong role"}), 404
    body = request.get_json(silent=True) or {}
    order_id = body.get("orderId", "unknown")

    inv = requests.post(
        _sc_url(INVENTORY_HOST, INVENTORY_PORT, "/internal/reserve"),
        json={"sku": body.get("sku"), "quantity": body.get("quantity", 1)},
        timeout=HTTP_TIMEOUT,
    )
    inv.raise_for_status()

    pay = requests.post(
        _sc_url(PAYMENTS_HOST, PAYMENTS_PORT, "/internal/charge"),
        json={"orderId": order_id, "amountCents": body.get("amountCents", 0)},
        timeout=HTTP_TIMEOUT,
    )
    pay.raise_for_status()

    record = {
        "orderId": order_id,
        "inventory": inv.json(),
        "payment": pay.json(),
        "status": "PLACED",
    }
    _append_audit(record)
    return jsonify(record)


@app.post("/internal/charge")
def charge():
    if APP_ROLE != "payments":
        return jsonify({"error": "wrong role"}), 404
    body = request.get_json(silent=True) or {}
    return jsonify({"charged": True, "orderId": body.get("orderId"), "processor": "shopflow-mock"})


@app.post("/internal/reserve")
def reserve():
    if APP_ROLE != "inventory":
        return jsonify({"error": "wrong role"}), 404
    body = request.get_json(silent=True) or {}
    return jsonify({"reserved": True, "sku": body.get("sku"), "quantity": body.get("quantity", 1)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
