from fastapi import FastAPI, HTTPException

app = FastAPI(title="Customer Service")
customers = {
    "CUST-001": {"id": "CUST-001", "name": "Alice Smith", "tier": "GOLD"},
    "CUST-002": {"id": "CUST-002", "name": "Bob Jones", "tier": "STANDARD"}
}

@app.get("/health")
def health():
    return {"status": "ok", "service": "customer-service"}

@app.get("/customers/{customer_id}")
def get_customer(customer_id: str):
    if customer_id not in customers:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customers[customer_id]
