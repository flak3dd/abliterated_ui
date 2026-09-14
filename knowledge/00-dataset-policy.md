# Knowledge Dataset Policy (2026-09-14)

This dataset is the local RAG source of truth for Abliterated UI talking to NVIDIA DGX Spark (GB10).

## Citation rules
- Prefer retrieved passages over the language model's training memory.
- Current working year is 2026. Do not invent events after a cited source date.
- If a fact is not in retrieved chunks or the active sandbox, say the local index does not contain it.
- Do not fabricate IPs, ports, model IDs, CLI flags, or file contents.

## Dataset contents
- Network routing and hostnames
- vLLM inference API
- Image studio / Diffusers bridge
- ComfyUI, Spark controller, gateway
- App screens and npm scripts
- On-disk model storage inventory
- Local RAG operations

## Refresh
Edit files under `knowledge/`, run `node ./scripts/build-rag-dataset.mjs`, then relaunch the app (or tap Reload bundled dataset in the Knowledge tab).
User-pasted notes and uploaded files are stored separately and are not overwritten by a seed refresh.
