# Model Storage Inventory (Spark NVMe)

Catalog shown in the telemetry Model Storage section. Sizes and paths are the UI inventory, not a live ls of disk.

## LLM
- Qwen3.6-35B-A3B-abliterated-NVFP4-MTP — ~22.0 GB NVFP4 — spark/models/Qwen3.6-35B-A3B-abliterated-NVFP4-MTP — typically LOADED_VRAM as qwen-abliterated

## Diffusion and vision
- Krea-2-Raw-FP8 — ~11.8 GB FP8 — spark-image/models/Krea-2-Raw — studio id krea2-raw-fp8
- Huihui-Qwen3-VL-4B-Instruct-FP8 — ~4.3 GB FP8 — spark-image/models/Huihui-Qwen3-VL — vision text encoder
- FLUX.2-Klein-9B-FP8 — ~9.4 GB FP8 — spark-image/models/flux2-klein-9b — studio id flux2-klein-9b
- Z-Image-Turbo-NSFW-NVFP4 — ~6.8 GB NVFP4 — spark-image/models/z-image-turbo — studio id z-image-turbo-nsfw-nvfp4
- Qwen-Image-Edit-2511-FP8 — ~8.6 GB FP8 — spark-image/models/qwen-edit-2511 — studio id qwen-edit-2511-fp8
- PornMaster-ComfyUI-Dolphin-SDXL — ~6.2 GB bfloat16 — ComfyUI/models/checkpoints/dolphin_master.safetensors — studio id comfy-dolphin

## Hardware context (UI)
Telemetry assumes ~2.0 TB NVMe PCIe Gen5 on Spark. GPU is NVIDIA GB10 Blackwell unified HBM. Do not invent VRAM totals; read live GET /api/status when asked for current thermals.
