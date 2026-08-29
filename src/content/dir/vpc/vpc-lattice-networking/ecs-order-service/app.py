from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from uuid import uuid4

app = FastAPI(title="Order Service")
orders = [
    {"id": "ORD-001", "customer_id": "CUST-001", "sku": "SKU-001", "quantity": 2, "status": "CREATED"}
]

class OrderRequest(BaseModel):
    customer_id: str
    sku: str
    quantity: int

@app.get("/health")
def health():
    return {"status": "ok", "service": "order-service"}

@app.get("/orders")
def list_orders():
    return orders

@app.get("/orders/{order_id}")
def get_order(order_id: str):
    for order in orders:
        if order["id"] == order_id:
            return order
    raise HTTPException(status_code=404, detail="Order not found")

@app.post("/orders", status_code=201)
def create_order(request: OrderRequest):
    order = {
        "id": f"ORD-{str(uuid4())[:8].upper()}",
        "customer_id": request.customer_id,
        "sku": request.sku,
        "quantity": request.quantity,
        "status": "CREATED"
    }
    orders.append(order)
    return order
