# Abliterated Spark Knowledge Dataset

Version **2026.09.14**. Local RAG corpus for the Expo client.

These files are the source of truth for cluster facts. The app loads the compiled
copy in `services/ragDataset.ts`. After editing markdown here, rebuild:

```bash
node ./scripts/build-rag-dataset.mjs
```

That writes:

- `knowledge/dataset.jsonl` — one JSON document per line (upload/ingest)
- `services/ragDataset.ts` — bundled seed loaded at app start

## What belongs here

Only **verifiable** facts about this workspace and Spark cluster: IPs, ports,
served model IDs, API paths, studio sampler defaults, scripts. Do not add
news, rumors, or post-cutoff world events.

## Ingest without rebuilding

Sandbox modal → **Knowledge** → paste or upload these `.md` files.
The bundled seed also auto-merges on launch (hash-replaced if the dataset changed).
