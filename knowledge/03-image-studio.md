# Image Studio and Diffusers Bridge (:7860)

Client: app/(tabs)/studio.tsx → useStudioStore.generateImage → generateKreaImage.
Bridge: POST http://{activeHost}:7860/v1/images/generations
Health: GET /health
Progress: GET /v1/progress then fallback GET /progress
Latent preview WS: ws://{activeHost}:7860/v1/images/stream

## Studio picker model IDs
- krea2-raw-fp8 — Krea 2 RAW, default, 24 steps, CFG 7.5
- flux2-klein-9b — 28 steps, CFG 3.5
- seedvr2-7b-fp8 — 20 steps, CFG 5.0 (alias seedvr2-7b)

Picker loads GET :7860/v1/models (available/loaded). Selecting a pill POSTs /v1/models/load to evict the previous pipe and warm weights before Generate. Missing weights are disabled. Sampler defaults match spark_models.sampler_params.
- z-image-turbo-nsfw-nvfp4 — Turbo NVFP4, 4 steps, CFG 1.0
- qwen-image-2512-fp8 — 30 steps, CFG 4.0
ID Studio (`/id-studio`) defaults to **ddb-edit** (`xing0916/DDB_Edit` + `Alpha-VLLM/Lumina-DiMOO` VQ-VAE). Official DDB defaults: timesteps 64, cfg 5.5, mix_ratio 0.5 (hybrid absorption). ID intents are routed to DDB unless the user explicitly picks Qwen-Edit. Qwen-Edit is fallback only.

- ddb-edit — inpaint, 24 steps, CFG 7.5

ENDPOINTS.md also lists krea2-raw-fp8, flux2-klein-9b, seedvr2-7b, qwen-image-2512-fp8 as bridge alternates.

## Request body (client)
model, prompt, negative_prompt, size as WIDTHxHEIGHT, width, height, num_inference_steps, guidance_scale, seed, response_format b64_json, image (data URL), mask (raster data URL).
Timeout 180 seconds. Source images are encoded to data URLs. Inpaint masks are white-on-black rasters scaled to the target size, not SVG path strings.

## Aspect sizes
- 1:1 1024x1024
- 9:16 720x1280
- 16:9 1280x720
- 4:5 896x1120
- 21:9 1344x576

## Failure handling
If the bridge is down, times out, or returns no image, the client marks isFallback true, shows SYNTHESIS FAILED / BRIDGE FAILED, and does not treat the placeholder SVG as a real PNG.

## GPU HUD
During generation the studio polls GET /api/status on 127.0.0.1:17325 then the mesh host :17325 for tempC, gpuUtilPct, powerDrawW.
