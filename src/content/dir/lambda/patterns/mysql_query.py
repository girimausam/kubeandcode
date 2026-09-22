"""MySQL (RDS): run a parameterized query. Layer/zip: pymysql.

Env: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
Event: {"sql": "SELECT id, name FROM users WHERE id = %s", "params": [1]}
"""

import os

import pymysql
import pymysql.cursors

CONN = {
    "host": os.environ["DB_HOST"],
    "port": int(os.environ.get("DB_PORT", "3306")),
    "user": os.environ["DB_USER"],
    "password": os.environ["DB_PASSWORD"],
    "database": os.environ["DB_NAME"],
    "cursorclass": pymysql.cursors.DictCursor,
}


def lambda_handler(event, context):
    sql = event["sql"]
    params = event.get("params") or []

    conn = pymysql.connect(**CONN)
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            if sql.strip().upper().startswith("SELECT"):
                rows = cur.fetchall()
                return {"rows": rows}
            conn.commit()
            return {"rowcount": cur.rowcount}
    finally:
        conn.close()
