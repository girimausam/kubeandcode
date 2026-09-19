"""
frontend service for the document processing portal.

Exposed via the ALB Ingress -> frontend Service -> this pod.
On each request to /status this app actively tests every infra
requirement in the scenario and reports whether it's working.

Config sources (deliberately kept separate to mirror the real
sensitivity tiers):
  - SSM_*        -> non-secret runtime config, pulled from Parameter Store
  - WEBHOOK_*    -> secret, pulled from Secrets Manager (rotates independently)
  - DB_PASSWORD  -> secret, comes from a K8s Secret that was produced by
                    decrypting a SealedSecret (never plaintext in git)
  - LEGACY_DEBUG_TOKEN -> ANTI-PATTERN, hardcoded below on purpose so the
                    status check can demonstrate flagging it
"""

import os
import time
import uuid
import socket

import boto3
from botocore.exceptions import ClientError
from flask import Flask, jsonify

app = Flask(__name__)

REGION = os.environ.get("AWS_REGION", "us-east-1")

# ---------------------------------------------------------------------------
# Config that would normally come from SSM Parameter Store (non-secret)
# ---------------------------------------------------------------------------
SSM_PARAM_PREFIX = os.environ.get("SSM_PARAM_PREFIX", "/apps/frontend")
S3_BUCKET_PARAM = f"{SSM_PARAM_PREFIX}/s3_bucket_name"
DDB_TABLE_PARAM = f"{SSM_PARAM_PREFIX}/dynamodb_table_name"
FEATURE_FLAG_PARAM = f"{SSM_PARAM_PREFIX}/enable_uploads"

# ---------------------------------------------------------------------------
# Config that would come from a Sealed Secret -> K8s Secret -> env var
# ---------------------------------------------------------------------------
DB_PASSWORD = os.environ.get("DB_PASSWORD")  # populated by the sealed secret

# ---------------------------------------------------------------------------
# ANTI-PATTERN: hardcoded secret, embedded directly in source.
# This is here ONLY so the /status check can demonstrate detecting it.
# Never do this in real code -- it should be a Secrets Manager entry instead.
# ---------------------------------------------------------------------------
LEGACY_DEBUG_TOKEN = "sk_debug_4f9a2b7c1e8d3f6a9b0c1d2e3f4a5b6c"

EFS_MOUNT_PATH = os.environ.get("EFS_MOUNT_PATH", "/mnt/efs/scratch")
WEBHOOK_SECRET_ID = os.environ.get("WEBHOOK_SECRET_ID", "frontend/webhook-api-key")

ssm_client = boto3.client("ssm", region_name=REGION)
secrets_client = boto3.client("secretsmanager", region_name=REGION)
s3_client = boto3.client("s3", region_name=REGION)
dynamodb = boto3.resource("dynamodb", region_name=REGION)


def check_parameter_store():
    """Requirement: non-secret runtime config pulled at request time."""
    try:
        resp = ssm_client.get_parameters(
            Names=[S3_BUCKET_PARAM, DDB_TABLE_PARAM, FEATURE_FLAG_PARAM],
            WithDecryption=False,
        )
        found = {p["Name"]: p["Value"] for p in resp["Parameters"]}
        missing = [
            n for n in (S3_BUCKET_PARAM, DDB_TABLE_PARAM, FEATURE_FLAG_PARAM)
            if n not in found
        ]
        return {
            "ok": len(missing) == 0,
            "detail": "loaded" if not missing else f"missing: {missing}",
            "params_found": list(found.keys()),
        }
    except ClientError as e:
        return {"ok": False, "detail": str(e)}


def check_secrets_manager():
    """Requirement: rotating secret (webhook key) fetched, never baked in."""
    try:
        resp = secrets_client.get_secret_value(SecretId=WEBHOOK_SECRET_ID)
        secret_present = bool(resp.get("SecretString"))
        return {"ok": secret_present, "detail": "secret retrieved, value not logged"}
    except ClientError as e:
        return {"ok": False, "detail": e.response["Error"].get("Code", str(e))}


def check_sealed_secret():
    """Requirement: DB credential arrived via SealedSecret -> K8s Secret -> env."""
    if DB_PASSWORD:
        return {"ok": True, "detail": "DB_PASSWORD present via mounted K8s secret"}
    return {"ok": False, "detail": "DB_PASSWORD not set - sealed secret not applied?"}


def check_hardcoded_secret_finding():
    """
    Not a health check -- a security finding. Demonstrates that a scanner
    (or this endpoint) can detect the anti-pattern living in the image.
    """
    looks_like_a_secret = LEGACY_DEBUG_TOKEN.startswith("sk_") and len(LEGACY_DEBUG_TOKEN) > 20
    return {
        "ok": False,  # always reported as a finding, never "healthy"
        "detail": "hardcoded token found in source - move to Secrets Manager",
        "flagged_as_secret_like": looks_like_a_secret,
    }


def check_s3():
    """Requirement: durable storage for uploaded files."""
    try:
        bucket = ssm_client.get_parameter(Name=S3_BUCKET_PARAM)["Parameter"]["Value"]
        key = f"healthchecks/{uuid.uuid4()}.txt"
        s3_client.put_object(Bucket=bucket, Key=key, Body=b"status-check")
        s3_client.delete_object(Bucket=bucket, Key=key)
        return {"ok": True, "detail": f"put/delete round-trip succeeded on {bucket}"}
    except ClientError as e:
        return {"ok": False, "detail": e.response["Error"].get("Code", str(e))}


def check_dynamodb():
    """Requirement: fast metadata lookups alongside the S3 objects."""
    try:
        table_name = ssm_client.get_parameter(Name=DDB_TABLE_PARAM)["Parameter"]["Value"]
        table = dynamodb.Table(table_name)
        item_id = f"healthcheck-{uuid.uuid4()}"
        table.put_item(Item={"file_id": item_id, "status": "check", "ts": int(time.time())})
        table.get_item(Key={"file_id": item_id})
        table.delete_item(Key={"file_id": item_id})
        return {"ok": True, "detail": f"put/get/delete round-trip succeeded on {table_name}"}
    except ClientError as e:
        return {"ok": False, "detail": e.response["Error"].get("Code", str(e))}


def check_efs():
    """Requirement: shared scratch space visible to every replica."""
    try:
        os.makedirs(EFS_MOUNT_PATH, exist_ok=True)
        test_file = os.path.join(EFS_MOUNT_PATH, f".healthcheck-{socket.gethostname()}")
        with open(test_file, "w") as f:
            f.write(str(time.time()))
        with open(test_file) as f:
            f.read()
        os.remove(test_file)
        return {"ok": True, "detail": f"wrote/read/removed file on {EFS_MOUNT_PATH}"}
    except OSError as e:
        return {"ok": False, "detail": str(e)}


@app.route("/health")
def health():
    """Cheap liveness probe for the ALB Ingress health check."""
    return jsonify({"status": "alive"}), 200


@app.route("/status")
def status():
    """
    Exercises every requirement in the scenario and reports the result.
    This is the endpoint the ALB Ingress exposes for a human to check.
    """
    checks = {
        "parameter_store": check_parameter_store(),
        "secrets_manager": check_secrets_manager(),
        "sealed_secret": check_sealed_secret(),
        "hardcoded_secret_finding": check_hardcoded_secret_finding(),
        "s3": check_s3(),
        "dynamodb": check_dynamodb(),
        "efs": check_efs(),
    }

    # hardcoded_secret_finding is intentionally excluded from the pass/fail
    # rollup -- it's a security finding, not an infra health signal.
    infra_checks = {k: v for k, v in checks.items() if k != "hardcoded_secret_finding"}
    all_ok = all(c["ok"] for c in infra_checks.values())

    return jsonify({
        "overall": "ok" if all_ok else "degraded",
        "pod": socket.gethostname(),
        "checks": checks,
    }), 200 if all_ok else 503


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
