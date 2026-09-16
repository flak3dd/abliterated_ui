# Spark Controller and Gateway

ComfyUI (:8188) is **not** part of this app. Image generation uses only the Diffusers bridge on :7860.

## Spark controller (:17325)
Runs on the Mac and via TCP bridge on Spark.
- GET / — dashboard
- GET /api/endpoints — service matrix
- GET /api/status — GPU thermals, power, Docker, VRAM
- GET /api/recipes — model recipes (qwen recipe servedName qwen-abliterated)
- POST /api/vllm — serve, stop, pull
- POST /api/image — image bridge lifecycle
- GET /api/logs?target=vllm|image
Verify: curl -s http://192.168.4.103:17325/api/endpoints

## Unified gateway (:8080)
Reverse proxy on the Mac (192.168.4.50 / 127.0.0.1).
- Slice A :8000 qwen-abliterated
- Slice B :8001 specialist/reasoning when that slice is up
- Slice C :7860 image bridge
- GET /v1/models aggregates slices
- POST /v1/chat/completions routes by model
- POST /v1/images/generations routes to :7860
Verify: curl -s http://127.0.0.1:8080/v1/models
