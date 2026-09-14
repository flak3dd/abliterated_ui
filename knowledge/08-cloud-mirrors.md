# Cloud Mirrors and Client Providers

## Abliterated cloud
- https://api.abliterated.ai (primary)
- https://api.abliterated.io (mirror)
Models advertised: qwen-abliterated, gpt-oss-120b-abliterated, krea2-raw-fp8.
- GET /v1/models
- POST /v1/chat/completions (SSE)
- POST /v1/images/generations

## Featherless
- https://api.featherless.io
Default client model meta-llama/Meta-Llama-3.1-8B-Instruct.
Requires the Featherless API key stored in the mesh store. Do not print secrets.

## Client routing
useMeshStore picks the lowest-latency online candidate. Cloud hosts use port 443 and HTTPS via resolveApiUrl. LAN Spark uses HTTP and native ports (8000 chat, 7860 images).
Custom gateway / localhost is also a candidate when configured.
