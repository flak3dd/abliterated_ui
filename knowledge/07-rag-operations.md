# Local RAG Operations

Abliterated UI implements Option 2 local RAG retrieval inside this app (no Open WebUI, AnythingLLM, Chroma, LanceDB, or Qdrant). Hybrid BM25 (weight 0.62) + 256-d hashed dense cosine (weight 0.38). Ingest from the Knowledge tab.

## Pipeline
1. Documents: bundled knowledge dataset (source=seed), sandbox files (source=sandbox), pasted notes (source=paste), uploads (source=upload).
2. Chunking: ~900 characters with ~140 overlap; fenced code blocks kept intact.
3. Retrieval: Top 6 hits, max 3 chunks per document. Hits below score 0.18 dropped.
4. Chat injects retrieved passages into the system prompt (even if anti-hallucination is off) and attaches ragCitations on the assistant message. Sandbox file *names* are listed; full file bodies are not dumped. Chat history is the last 12 turns, each capped at 4000 characters. ingestEnvironment is skipped when the sandbox fingerprint (path + content hash) is unchanged.
5. Persistence: AsyncStorage key @spark_rag_index_v1. Seed docs are hash-merged on load so dataset rebuilds replace stale seeds without wiping user uploads.

## Embedding upgrade path
Hugging Face (optional, not currently served):
- nomic-ai/nomic-embed-text-v1.5
- BAAI/bge-m3
Serve on Spark as POST /v1/embeddings. Until that exists, do not call /v1/embeddings (404).

## Operator actions
- Ingest: Knowledge tab paste or upload .md .txt .json .py .ts .tsx .js .csv .yml .yaml .toml .html
- Rebuild bundled corpus: node ./scripts/build-rag-dataset.mjs
- Test retriever: npm run test-rag
