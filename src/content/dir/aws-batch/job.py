"""Batch job: read JSON invoices from S3, write aggregated summary to S3."""

import json
import os
import sys
from decimal import Decimal

import boto3

s3 = boto3.client("s3")


def main() -> None:
    bucket = os.environ["INPUT_BUCKET"]
    input_key = os.environ["INPUT_KEY"]
    output_key = os.environ.get("OUTPUT_KEY", "output/summary.json")

    obj = s3.get_object(Bucket=bucket, Key=input_key)
    payload = json.loads(obj["Body"].read(), parse_float=Decimal)
    invoices = payload.get("invoices", [])

    total = sum(Decimal(str(i.get("amount", 0))) for i in invoices)
    summary = {
        "count": len(invoices),
        "total_amount": str(total),
        "currency": payload.get("currency", "USD"),
    }

    s3.put_object(
        Bucket=bucket,
        Key=output_key,
        Body=json.dumps(summary, indent=2).encode("utf-8"),
        ContentType="application/json",
    )

    print(json.dumps(summary))
    print(f"Wrote s3://{bucket}/{output_key}", file=sys.stderr)


if __name__ == "__main__":
    main()
