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

## Hardware context
- Unified memory spec: 128 GB LPDDR5x coherent (CPU+GPU), 273 GB/s, 256-bit.
- CUDA / Linux visible pool: ~121.7 GiB (MemTotal). nvidia-smi memory.used/total is N/A on GB10.
- Live used = MemTotal − MemAvailable from /proc/meminfo via Spark controller GET /api/status (gpu.unifiedUsedGb / gpu.unifiedTotalGb).
- GB10 SOC TDP 140 W; system PSU 240 W. nvidia-smi power.limit is N/A; UI uses 140 W as the GPU envelope.
- NVMe catalog in this UI assumes ~2.0 TB Gen5; actual SKUs are 1 TB or 4 TB.
