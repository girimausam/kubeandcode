import json
import os
import sys

import boto3

sys.path.append("package")

# pip install psycopg2-binary -t package/
import psycopg2

# ── Config from environment variables ──────────────────────────────
ENDPOINT = os.environ["DB_HOST_NAME"]
PORT = os.environ["DB_PORT"]
DBNAME = os.environ["DB_NAME"]
USER = os.environ["DB_USER_NAME"]
REGION = os.environ["AWS_REGION"]

SSL_CA_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "global-bundle.pem"
)

# ── IAM Auth Token ──────────────────────────────────────────────────
client = boto3.client("rds", region_name=REGION)
token = client.generate_db_auth_token(
    DBHostname=ENDPOINT, Port=PORT, DBUsername=USER, Region=REGION
)


# ── Lambda Handler ──────────────────────────────────────────────────
def lambda_handler(event, context):
    try:
        conn = psycopg2.connect(
            host=ENDPOINT,
            port=PORT,
            database=DBNAME,
            user=USER,
            password=token,
            sslmode="verify-full",  # PostgreSQL SSL mode
            sslrootcert=SSL_CA_PATH,  # CA cert path
        )

        cur = conn.cursor()
        cur.execute("""SELECT now()""")
        query_results = cur.fetchall()
        print(query_results)

        cur.close()
        conn.close()

        return {
            "statusCode": 200,
            "body": json.dumps(
                {"message": "Connected successfully", "result": str(query_results)}
            ),
        }

    except Exception as e:
        print("Database connection failed due to {}".format(e))
        return {
            "statusCode": 500,
            "body": json.dumps(
                {"error": "Database connection failed due to {}".format(e)}
            ),
        }
