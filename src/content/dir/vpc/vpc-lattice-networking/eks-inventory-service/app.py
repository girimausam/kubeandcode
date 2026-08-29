from fastapi import FastAPI, HTTPException

app = FastAPI(title="Inventory Service")
inventory = {
    "SKU-001": {"sku": "SKU-001", "name": "Laptop", "available": 15},
    "SKU-002": {"sku": "SKU-002", "name": "Monitor", "available": 8},
    "SKU-003": {"sku": "SKU-003", "name": "Keyboard", "available": 42}
}

@app.get("/health")
def health():
    return {"status": "ok", "service": "inventory-service"}

@app.get("/inventory/{sku}")
def get_inventory(sku: str):
    if sku not in inventory:
        raise HTTPException(status_code=404, detail="SKU not found")
    return inventory[sku]
