from fastapi import FastAPI

app = FastAPI(title="Private Configuration Resource")

@app.get("/health")
def health():
    return {"status": "ok", "resource": "private-config"}

@app.get("/config")
def config():
    return {
        "environment": "demo",
        "order_processing": "enabled",
        "max_order_quantity": 10
    }
