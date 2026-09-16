# Cloud Mirrors and Client Providers

## Abliteration cloud
- https://api.abliteration.ai/v1
- Auth: `Authorization: Bearer` or `x-api-key` (required). Local Expo web uses `http://127.0.0.1:17332/abliteration/v1` (`npm run cloud-proxy`). Production HTTPS uses `/api/cloud/abliteration/v1`.
- Models: `abliterated-model`, `abliterated-model-large`, `abliterated-model-large-v2`
- GET /v1/models
- POST /v1/chat/completions (SSE)

## Featherless
- https://api.featherless.ai/v1
Default client model meta-llama/Meta-Llama-3.1-8B-Instruct.
Requires the Featherless API key stored in the mesh store. Do not print secrets.

## Client routing
useMeshStore picks the lowest-latency online candidate. Cloud hosts use port 443 and HTTPS via resolveApiUrl. LAN Spark uses HTTP and native ports (8000 chat, 7860 images).
Custom gateway / localhost is also a candidate when configured.
