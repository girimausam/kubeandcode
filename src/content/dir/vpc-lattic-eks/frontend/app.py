import os
import urllib.error
import urllib.request
import json

from fastapi import FastAPI, HTTPException

app = FastAPI(title="catalog-frontend")

BACKEND_HOST = os.environ.get("BACKEND_HOST", "catalog.lattice.lab.internal")
BACKEND_SCHEME = os.environ.get("BACKEND_SCHEME", "http")


@app.get("/health")
def health():
    return {"status": "ok", "service": "catalog-frontend", "backend_host": BACKEND_HOST}


@app.get("/fetch/{item_id}")
def fetch_item(item_id: str):
    url = f"{BACKEND_SCHEME}://{BACKEND_HOST}/catalog/{item_id}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=e.code, detail=e.reason)
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"backend unreachable: {e.reason}")
    return {"via": "private-hosted-zone", "backend_url": url, "item": body}
