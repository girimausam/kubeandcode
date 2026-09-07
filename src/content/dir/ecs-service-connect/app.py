import os
from flask import Flask, jsonify
import requests

app = Flask(__name__)

APP_TYPE = os.getenv("APP_TYPE", "frontend")
PORT = int(os.getenv("PORT", "8080"))

ORDERS_HOST = os.getenv("ORDERS_HOST", "orders")
ORDERS_PORT = int(os.getenv("ORDERS_PORT", "8081"))

PAYMENTS_HOST = os.getenv("PAYMENTS_HOST", "payments")
PAYMENTS_PORT = int(os.getenv("PAYMENTS_PORT", "8082"))


@app.route("/")
def home():
    return jsonify({
        "app_type": APP_TYPE,
        "port": PORT,
        "orders": f"{ORDERS_HOST}:{ORDERS_PORT}",
        "payments": f"{PAYMENTS_HOST}:{PAYMENTS_PORT}"
    })


@app.route("/call")
def call():

    if APP_TYPE == "frontend":
        response = requests.get(
            f"http://{ORDERS_HOST}:{ORDERS_PORT}/order"
        )

        return jsonify({
            "service": "frontend",
            "orders_response": response.json()
        })

    if APP_TYPE == "orders":
        response = requests.get(
            f"http://{PAYMENTS_HOST}:{PAYMENTS_PORT}/payment"
        )

        return jsonify({
            "service": "orders",
            "payments_response": response.json()
        })

    if APP_TYPE == "payments":
        return jsonify({
            "service": "payments",
            "message": "Payment processed"
        })

    return jsonify({
        "error": f"Unknown APP_TYPE: {APP_TYPE}"
    }), 400


@app.route("/order")
def order():

    if APP_TYPE != "orders":
        return jsonify({
            "error": "Not orders service"
        }), 404

    response = requests.get(
        f"http://{PAYMENTS_HOST}:{PAYMENTS_PORT}/payment"
    )

    return jsonify({
        "service": "orders",
        "message": "Order created",
        "payment": response.json()
    })


@app.route("/payment")
def payment():

    if APP_TYPE != "payments":
        return jsonify({
            "error": "Not payments service"
        }), 404

    return jsonify({
        "service": "payments",
        "message": "Payment processed"
    })


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=PORT
    )