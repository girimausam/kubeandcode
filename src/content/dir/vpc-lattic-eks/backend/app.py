from fastapi import FastAPI, HTTPException

app = FastAPI(title="catalog-backend")

CATALOG = {
    "item-1": {"id": "item-1", "name": "Widget", "qty": 10},
    "item-2": {"id": "item-2", "name": "Gadget", "qty": 3},
}


@app.get("/health")
def health():
    return {"status": "ok", "service": "catalog-backend"}


@app.get("/catalog/{item_id}")
def get_item(item_id: str):
    item = CATALOG.get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="item not found")
    return item
