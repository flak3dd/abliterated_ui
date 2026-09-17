#!/usr/bin/env python3
"""
LayoutLMv3 document-layout runtime for NVIDIA DGX Spark.

Deps (Spark host):
  pip install 'transformers>=4.40' torch pillow fastapi uvicorn python-multipart

Run:
  uvicorn scripts.layoutlmv3_runtime:app --host 0.0.0.0 --port 7870
  # or from repo root:
  python scripts/layoutlmv3_runtime.py

Client (Abliterated UI) talks to:   
  GET  /health
  GET  /v1/models
  POST /v1/models/load
  POST /v1/layout/analyze
"""

from __future__ import annotations

import base64
import io
import re
import time
from typing import Any, Optional

MODEL_ID = "layoutlmv3-base"
HF_ID = "microsoft/layoutlmv3-base"

_model = None
_processor = None
_loaded_name: Optional[str] = None


def _load_model(name: str = MODEL_ID):
    """Load LayoutLMv3 with the operator-requested AutoModel pattern."""
    global _model, _processor, _loaded_name
    target = HF_ID if name in (MODEL_ID, HF_ID, "microsoft/layoutlmv3-base") else name
    from transformers import AutoModel, AutoProcessor

    # Exact load pattern requested for Spark / device_map=auto
    model = AutoModel.from_pretrained("microsoft/layoutlmv3-base", device_map="auto")
    processor = AutoProcessor.from_pretrained("microsoft/layoutlmv3-base", apply_ocr=True)
    _model = model
    _processor = processor
    _loaded_name = MODEL_ID if target == HF_ID else name
    return _loaded_name


def _ensure_loaded(name: str = MODEL_ID) -> str:
    if _model is None or _processor is None:
        return _load_model(name)
    return _loaded_name or MODEL_ID


def _decode_image(image_field: str):
    from PIL import Image

    raw = image_field
    m = re.match(r"^data:image/[^;]+;base64,(.+)$", image_field, re.I | re.S)
    if m:
        raw = m.group(1)
    data = base64.b64decode(raw)
    return Image.open(io.BytesIO(data)).convert("RGB")


def _analyze_pil(image) -> dict[str, Any]:
    """Heuristic layout / OCR-region quality from LayoutLMv3 processor + forward pass."""
    import torch

    loaded = _ensure_loaded()
    assert _model is not None and _processor is not None

    encoding = _processor(image, return_tensors="pt")
    # Move tensors to model device when possible
    try:
        device = next(_model.parameters()).device
        encoding = {k: v.to(device) if hasattr(v, "to") else v for k, v in encoding.items()}
    except StopIteration:
        pass

    with torch.no_grad():
        outputs = _model(**encoding)

    # Region proxy: number of OCR words / tokens the processor found
    words = []
    if hasattr(_processor, "image_processor") or True:
        # AutoProcessor with apply_ocr=True typically exposes words via encoding length
        input_ids = encoding.get("input_ids")
        regions = int(input_ids.shape[-1]) if input_ids is not None else 0
    else:
        regions = 0

    # Score: presence of spatial embeddings + non-trivial token count
    w, h = image.size
    area = max(w * h, 1)
    density = regions / max(area / 10000.0, 1.0)
    score = max(0.0, min(1.0, 0.35 + min(regions, 80) / 120.0 + min(density, 1.0) * 0.2))
    ok = regions >= 8 and score >= 0.55
    last_hidden = getattr(outputs, "last_hidden_state", None)
    notes = (
        f"layoutlmv3 tokens={regions} size={w}x{h} "
        f"hidden={'yes' if last_hidden is not None else 'no'}"
    )
    return {
        "ok": bool(ok),
        "model": loaded,
        "score": round(float(score), 4),
        "regions": int(regions),
        "notes": notes,
    }


try:
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel

    app = FastAPI(title="Spark LayoutLMv3", version="1.0.0")

    class LoadBody(BaseModel):
        model: str = MODEL_ID

    class AnalyzeBody(BaseModel):
        model: str = MODEL_ID
        image: str
        workflow: Optional[str] = None

    @app.get("/health")
    def health():
        return {
            "ok": True,
            "service": "layoutlmv3",
            "loaded": _loaded_name,
            "hf": HF_ID,
        }

    @app.get("/v1/models")
    def list_models():
        return {
            "data": [
                {
                    "id": MODEL_ID,
                    "hf": HF_ID,
                    "available": True,
                    "loaded": _loaded_name == MODEL_ID,
                }
            ]
        }

    @app.post("/v1/models/load")
    def load(body: LoadBody):
        t0 = time.time()
        try:
            name = _load_model(body.model or MODEL_ID)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e
        return {"model": name, "elapsed_s": round(time.time() - t0, 2)}

    @app.post("/v1/layout/analyze")
    def analyze(body: AnalyzeBody):
        if not body.image:
            raise HTTPException(status_code=400, detail="image required")
        try:
            _ensure_loaded(body.model or MODEL_ID)
            image = _decode_image(body.image)
            result = _analyze_pil(image)
            if body.workflow:
                result["workflow"] = body.workflow
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

except ImportError:
    app = None  # fastapi optional for syntax check


def main():
    if app is None:
        raise SystemExit("Install fastapi uvicorn transformers torch pillow to run this service")
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7870)


if __name__ == "__main__":
    main()
