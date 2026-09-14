# vLLM Inference API (:8000)

OpenAI-compatible high-throughput engine on Blackwell GB10 with MTP and FP8 KV-cache.

## Served models
- Primary: qwen-abliterated — Qwen 3.6 35B-A3B NVFP4+MTP. Recipe container qwen-abliterated. max_model_len 65536. gpuMemoryUtilization 0.6. kvCacheDtype fp8. reasoningParser qwen3. toolCallParser qwen3_coder.
- Secondary recipe (when loaded): gpt-oss-120b-abliterated (120B MXFP4).
- A live probe of GET /v1/models on 192.168.4.103:8000 has returned only qwen-abliterated. Do not assume other text models are resident unless /v1/models lists them.
- There is no /v1/embeddings endpoint on this vLLM process (HTTP 404). Local RAG therefore uses on-device BM25 plus hashed dense vectors until an embedding model is served.

## REST
- GET /v1/models — loaded models
- POST /v1/chat/completions — SSE streaming chat; reasoning in <think> / reasoning_content
- POST /v1/completions — raw completions
- GET /health — 200 when up
- GET /metrics — Prometheus

## URLs
- Cloud: https://api.abliterated.ai/v1/chat/completions
- LAN: http://192.168.4.103:8000/v1/chat/completions
- Tailscale: http://100.94.45.77:8000/v1/chat/completions
- Loopback: http://127.0.0.1:8000/v1/chat/completions

## Example
```bash
curl -s http://192.168.4.103:8000/v1/models
curl -N -X POST http://192.168.4.103:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-abliterated","messages":[{"role":"user","content":"Reply with: PING"}],"stream":true}'
```

Anti-hallucination mode in the client sets temperature 0.0 and top_p 1.0. Unrestricted mode uses temperature 0.7 and top_p 0.95.
