import json
import os
import sys

import boto3

sys.path.append("package")

# pip install pymysql -t package/
import pymysql
import pymysql.cursors

db_host_name = os.environ["DB_HOST_NAME"]
db_port = int(os.environ["DB_PORT"])
db_name = os.environ["DB_NAME"]
db_user_name = os.environ["DB_USER_NAME"]
db_password = os.environ["DB_PASSWORD"]
aws_region = os.environ["AWS_REGION"]

# Path to the CA cert bundled with Lambda
SSL_CA_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "global-bundle.pem"
)


def get_auth_token():
    client = boto3.client("rds", region_name=aws_region)
    return client.generate_db_auth_token(
        DBHostname=db_host_name,
        Port=db_port,
        DBUsername=db_user_name,
        Region=aws_region,
    )


def lambda_handler(event, context):
    token = get_auth_token()

    try:
        conn = pymysql.connect(
            host=db_host_name,
            port=db_port,
            database=db_name,
            user=db_user_name,
            password=token,
            ssl={
                "ca": SSL_CA_PATH,  # Amazon RDS CA bundle
                "verify_cert": True,  # Verify server certificate
                "verify_identity": True,  # Verify hostname matches cert
            },
            cursorclass=pymysql.cursors.DictCursor,  # returns rows as dicts
        )

        cursor = conn.cursor()

        """
            To enable `get_auth_token` you have to change the authentication mode for the user and apply policy to allow to connect using rds-db
            `rds-db:connect`
            `"arn:aws:rds-db:us-east-1:271995869266:dbuser:*/admin"`

            # cursor.execute("ALTER USER 'admin'@'%' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS'");
            # cursor.execute("FLUSH PRIVILEGES")

            Select user from the mysql.user (list)
            # cursor.execute("SELECT user, plugin FROM mysql.user WHERE user = 'admin'")
            # result = cursor.fetchall()

            For Password User is IDENTIFIED with `caching_sha2_password`
        """

        cursor.execute("SELECT 1 as result")
        result = cursor.fetchall()

        cursor.close()
        conn.close()

        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Connected with SSL", "result": result}),
        }

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
