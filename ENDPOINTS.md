# Sovereign Spark Endpoint Directory & API Reference

Comprehensive reference guide for all microservices, network interfaces, REST routes, WebSocket streams, and hardware telemetry services across the **NVIDIA DGX Spark (Blackwell GB10 GPU)** cluster and local development environment.

---

## 1. Network Interfaces & Routing Matrix

| Route Name | Host IP / Address | Target Machine | Protocol | Role |
|---|---|---|---|---|
| **Abliterated Cloud AI (Primary)** | `api.abliterated.ai` | Sovereign Cloud Mesh | HTTPS (:443) | Primary sovereign cloud inference cluster (~15–35ms) |
| **Abliterated Cloud IO (Mirror)** | `api.abliterated.io` | Sovereign Cloud Cluster | HTTPS (:443) | High-throughput sovereign inference & image bridge (~15–35ms) |
| **Featherless AI Mesh** | `api.featherless.io` | Serverless Open-Weight Mesh | HTTPS (:443) | Global uncensored open-weight model router (~30–60ms) |
| **Direct LAN (Primary)** | `192.168.4.103` | NVIDIA DGX Spark (GB10) | Ethernet / Wi-Fi | Lowest latency route for home/studio devices (~10–13ms) |
| **Secondary LAN** | `192.168.4.101` | NVIDIA DGX Spark (NIC 2) | Ethernet | Redundant / secondary interface (~20–60ms) |
| **Tailscale VPN** | `100.94.45.77` (`gx10-d0e7`) | NVIDIA DGX Spark | WireGuard / TS | Secure remote mesh access outside the local network (~10–25ms) |
| **Mac Host LAN** | `192.168.4.50` | Admin's MacBook Pro | Wi-Fi / LAN | Local client host, Metro dev server, Gateway router (~1–3ms) |
| **Mac Tailscale** | `100.120.81.22` | Admin's MacBook Pro | WireGuard / TS | Remote mobile connection to Mac-hosted services (~2–5ms) |
| **Localhost** | `127.0.0.1` | Local loopback | IPC / TCP | Machine-local processes (<1ms) |

---

## 2. Quick-Reference Matrix for Cloud, Mobile & Desktop

| Component | Port | Cloud HTTPS URL (`api.abliterated.ai`) | Direct LAN URL (Phone Wi-Fi) | Tailscale URL (Remote Phone) | Localhost URL (Mac) |
|---|---|---|---|---|---|
| **vLLM Inference API** | `:443` / `:8000` | `https://api.abliterated.ai/v1/models` | `http://192.168.4.103:8000/v1/models` | `http://100.94.45.77:8000/v1/models` | `http://127.0.0.1:8000/v1/models` |
| **Chat Streaming** | `:443` / `:8000` | `https://api.abliterated.ai/v1/chat/completions` | `http://192.168.4.103:8000/v1/chat/completions` | `http://100.94.45.77:8000/v1/chat/completions` | `http://127.0.0.1:8000/v1/chat/completions` |
| **Image Bridge** | `:443` / `:7860` | `https://api.abliterated.ai/v1/images/generations` | `http://192.168.4.103:7860/health` | `http://100.94.45.77:7860/health` | `http://127.0.0.1:7860/health` |
| **ComfyUI Cluster** | `:8188` | — | `http://192.168.4.103:8188/` | `http://100.94.45.77:8188/` | `http://127.0.0.1:8188/` |
| **Spark Controller** | `:17325` | — | `http://192.168.4.103:17325/` | `http://100.94.45.77:17325/` | `http://127.0.0.1:17325/` |
| **Gateway Router** | `:8080` | — | `http://192.168.4.50:8080/v1/models` | `http://100.120.81.22:8080/v1/models` | `http://127.0.0.1:8080/v1/models` |
| **Public Web App** | `:443` / `:8081` | `https://web.abliterated.app` | `http://192.168.4.50:8081/` | `http://100.120.81.22:8081/` | `http://localhost:8081/` |

---

## 3. Detailed Component Specifications

### 3.1 vLLM Server (`:8000`)
OpenAI-compatible high-throughput inference engine running on the Blackwell GB10 GPU with speculative Multi-Token Prediction (MTP) and FP8 KV-caching.

- **Primary Model**: `qwen-abliterated` (Qwen 3.6 35B-A3B NVFP4+MTP)
- **Secondary Model**: `gpt-oss-120b-abliterated` (120B MXFP4)

#### REST Endpoints
- **`GET /v1/models`**: Returns the list of served models and current GPU memory residency.
- **`POST /v1/chat/completions`**: Server-Sent Events (SSE) streaming chat completions with tool-calling and reasoning tags (`<think>`).
- **`POST /v1/completions`**: Raw completion endpoint.
- **`GET /health`**: Health probe returning HTTP 200 OK.
- **`GET /metrics`**: Prometheus metrics (tokens per second, KV cache allocation, queue depth).

#### Verification Command
```bash
curl -s http://192.168.4.103:8000/v1/models
```

---

### 3.2 vLLM Micro-Inference Engine
Fast token generation roundtrip test utilizing SSE streaming pipes.

- **Request URL**: `POST http://192.168.4.103:8000/v1/chat/completions`
- **Headers**: `Content-Type: application/json`

#### Example JSON Request Body
```json
{
  "model": "qwen-abliterated",
  "messages": [
    { "role": "system", "content": "You are a concise AI assistant." },
    { "role": "user", "content": "Reply with: PING" }
  ],
  "max_tokens": 16,
  "temperature": 0.1,
  "stream": true
}
```

#### Streaming Verification Command
```bash
curl -N -X POST http://192.168.4.103:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-abliterated","messages":[{"role":"user","content":"Reply with: PING"}],"stream":true}'
```

---

### 3.3 Image Diffusers Bridge (`:7860`)
OpenAI-compatible image synthesis, generation, and inpainting server built on FastAPI and Diffusers runtime.

- **Active Model**: `krea2-raw-fp8` (Build D Diffusers hero model)
- **Alternate Models**: `flux2-klein-9b`, `seedvr2-7b`, `qwen-image-2512-fp8`
- **Host Binding**: `0.0.0.0:7860`

#### REST Endpoints
- **`GET /health`**: Checks pipeline readiness and GPU tensor allocation.
- **`GET /v1/models`**: Lists available diffusion model checkpoints.
- **`POST /v1/images/generations`**: Generates high-fidelity images (returns base64 PNG data or URL).
- **`GET /v1/progress`**: Polls live denoising step percentage and latent previews.
- **`GET /docs`**: Interactive FastAPI Swagger documentation.

#### Verification Command
```bash
curl -s http://192.168.4.103:7860/health
```

---

### 3.4 ComfyUI Graph Engine (`:8188`)
Modular generative AI workspace supporting complex node graphs, ControlNet, inpainting, and custom workflows.

- **Host Binding**: `0.0.0.0:8188`

#### Endpoints & Protocols
- **`GET /`**: Interactive ComfyUI Web Canvas.
- **`GET /system_stats`**: Real-time GPU VRAM, system RAM, and device telemetry.
- **`POST /prompt`**: Submits a workflow JSON graph to the execution queue.
- **`GET /queue`**: Current execution queue state.
- **`GET /history`**: Generation history and generated image file references.
- **`WS /ws`**: Live WebSocket stream for node progress and intermediate latents.
- **`GET /view?filename={name}`**: Downloads or views a generated image asset.

#### Verification Command
```bash
curl -s http://192.168.4.103:8188/system_stats
```

---

### 3.5 Spark Controller Daemon (`:17325`)
Central supervisor daemon and management dashboard for the DGX Spark environment.

- **Host Binding**: `0.0.0.0:17325` on Mac + TCP Bridge on DGX Spark (`147129`)

#### Endpoints & Protocols
- **`GET /`**: Spark Controller Web Dashboard.
- **`GET /api/endpoints`**: Complete service matrix across all local and remote hosts.
- **`GET /api/status`**: Real-time GPU thermals, power draw, Docker containers, and VRAM metrics.
- **`GET /api/recipes`**: Served model recipes and configuration presets.
- **`POST /api/vllm`**: Lifecycle actions (`serve`, `stop`, `pull`).
- **`POST /api/image`**: Diffusers image bridge lifecycle and model switching.
- **`GET /api/comfy` & `POST /api/comfy`**: ComfyUI status and service controls.
- **`GET /api/logs?target=vllm|image|comfy`**: Real-time streaming log viewer.

#### Verification Command
```bash
curl -s http://192.168.4.103:17325/api/endpoints
```

---

### 3.6 Spark Unified Gateway Router (`:8080`)
Dynamic reverse proxy providing a single entry point for all model slices with automatic routing.

- **Slice A (`:8000`)**: Primary Flagship LLM (`qwen-abliterated`)
- **Slice B (`:8001`)**: Specialist / Reasoning LLM (`deepseek-14b`, `minimax-heretic`)
- **Slice C (`:7860`)**: Diffusers Image Bridge (`krea2-raw-fp8`, `flux2-klein-9b`)
- **Slice D (`:8188`)**: ComfyUI Graph Engine Cluster

#### REST Endpoints
- **`GET /v1/models`**: Aggregates all model slices into a single unified catalog.
- **`POST /v1/chat/completions`**: Intelligently routes requests to `:8000` or `:8001` based on the `model` field.
- **`POST /v1/images/generations`**: Routes image synthesis requests to `:7860`.
- **`GET /health`**: Gateway router status check.

#### Verification Command
```bash
curl -s http://127.0.0.1:8080/v1/models
```

---

### 3.7 Spark Mobile Client App (`:8081`)
Mobile PWA and Expo development server for iOS, Android, and Web.

#### Web Screens & Navigation
- **`GET /`**: Primary vLLM Streaming Chat screen with reasoning accordion and code blocks.
- **`GET /voice`**: Full-duplex conversational voice mode with reactive audio orb and speech recognition.
- **`GET /studio`**: Krea 2 Touch Inpaint Studio with pan-responder brush canvas and aspect ratio picker.
- **`GET /telemetry`**: DGX Spark hardware gauges (thermals, VRAM bar, power) and active microservices cluster.
- **`GET /radar`**: Autonomous Mesh Radar modal with 1-tap route switching.

#### Verification Command
```bash
curl -s -I http://localhost:8081
```

---

### 3.8 Abliterated Cloud AI Endpoints (`api.abliterated.ai` & `api.abliterated.io`)
High-throughput sovereign inference cluster serving uncensored open weights over encrypted HTTPS.

- **Primary URL**: `https://api.abliterated.ai`
- **Mirror URL**: `https://api.abliterated.io`
- **Supported Models**:
  - `qwen-abliterated` (Default sovereign text generation)
  - `gpt-oss-120b-abliterated` (Deep analytical reasoning)
  - `krea2-raw-fp8` (Generative diffusion & inpainting)

#### REST Endpoints
- **`GET https://api.abliterated.ai/v1/models`**: List active loaded models and availability.
- **`POST https://api.abliterated.ai/v1/chat/completions`**: Server-Sent Events (SSE) streaming chat completions.
- **`POST https://api.abliterated.ai/v1/images/generations`**: High-resolution latent diffusion and inpaint generation.

#### Verification Commands
```bash
# Check model availability
curl -s https://api.abliterated.ai/v1/models

# Test streaming completion
curl -N -s https://api.abliterated.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen-abliterated", "messages": [{"role": "user", "content": "Ping"}], "stream": true}'
```

---

## 4. Diagnostics & Automation Scripts

You can audit or restart these services at any time using the bundled project scripts in `/Users/adminuser/abliterated_ui`:

```bash
# Run full 8-point automated preflight diagnostic
npm run preflight

# Bootstrap and verify all standby services (:7860, :8188, :17325)
npm run start-services

# Test and verify local & remote Controller listeners
npm run test-controller

# Launch interactive autonomous Spark agent
npm run agent
```
