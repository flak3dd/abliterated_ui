# ComfyUI, Spark Controller, and Gateway

## ComfyUI graph engine (:8188)
Host binding 0.0.0.0:8188.
- GET / — web canvas
- GET /system_stats — VRAM, RAM, device
- POST /prompt — queue a workflow JSON
- GET /queue, GET /history
- WS /ws — node progress
- GET /view?filename={name} — view generated asset
Verify: curl -s http://192.168.4.103:8188/system_stats

The studio ComfyUI Dolphin picker still posts to the :7860 images API, not ComfyUI /prompt, unless a separate Comfy client is used.

## Spark controller (:17325)
Runs on the Mac and via TCP bridge on Spark (port 147129 mentioned in ENDPOINTS.md).
- GET / — dashboard
- GET /api/endpoints — service matrix
- GET /api/status — GPU thermals, power, Docker, VRAM
- GET /api/recipes — model recipes (qwen recipe servedName qwen-abliterated, compose docker-compose.qwen-abliterated.yml)
- POST /api/vllm — serve, stop, pull
- POST /api/image — image bridge lifecycle
- GET/POST /api/comfy
- GET /api/logs?target=vllm|image|comfy
Verify: curl -s http://192.168.4.103:17325/api/endpoints

## Unified gateway (:8080)
Reverse proxy on the Mac (192.168.4.50 / 127.0.0.1).
- Slice A :8000 qwen-abliterated
- Slice B :8001 specialist/reasoning (deepseek-14b, minimax-heretic) when that slice is up
- Slice C :7860 image bridge
- Slice D :8188 ComfyUI
- GET /v1/models aggregates slices
- POST /v1/chat/completions routes by model
- POST /v1/images/generations routes to :7860
Verify: curl -s http://127.0.0.1:8080/v1/models
