# LayoutLMv3 Document AI (:7870)

ID Studio OCR / layout gate helper. Not a Diffusers image model.

## Model
- UI id: `layoutlmv3-base`
- HF: `microsoft/layoutlmv3-base`
- Load:
  ```python
  from transformers import AutoModel
  model = AutoModel.from_pretrained("microsoft/layoutlmv3-base", device_map="auto")
  ```

## Spark runtime
```bash
# on DGX Spark, from abliterated_ui checkout or copied script
python scripts/layoutlmv3_runtime.py
# listens 0.0.0.0:7870
```

## Client
- `services/layoutLmv3Service.ts` — ping / load / analyze
- `runKycGateAsync` in `services/kycIdWorkflows.ts` calls analyze for `id_front` / `id_back`
- Soft-fail: if :7870 is down, OCR check keeps asset-present behaviour and notes `layoutlm: skipped`

## Routes
- GET `/health`
- GET `/v1/models`
- POST `/v1/models/load`
- POST `/v1/layout/analyze`
