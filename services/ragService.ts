export type RagSourceKind = 'sandbox' | 'upload' | 'seed' | 'paste';

export interface RagDocument {
  id: string;
  title: string;
  path?: string;
  content: string;
  source: RagSourceKind;
  envId?: string;
  updatedAt: number;
  contentHash: string;
}

export interface RagChunk {
  id: string;
  docId: string;
  title: string;
  path?: string;
  source: RagSourceKind;
  text: string;
  index: number;
  embedding: number[];
}

export interface RagHit {
  chunk: RagChunk;
  score: number;
  bm25: number;
  dense: number;
}

export const EMBED_DIM = 256;
export const CHUNK_CHARS = 900;
export const CHUNK_OVERLAP = 140;

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'is', 'it',
  'this', 'that', 'with', 'as', 'at', 'by', 'be', 'are', 'was', 'were', 'from',
]);

export function hashContent(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_./:-]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

export function embedText(text: string): number[] {
  const vec = new Array(EMBED_DIM).fill(0);
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i++) {
    vec[hash32(tokens[i]) % EMBED_DIM] += 1;
    if (i + 1 < tokens.length) {
      vec[hash32(tokens[i] + '_' + tokens[i + 1]) % EMBED_DIM] += 0.65;
    }
  }
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function chunkText(content: string, chunkChars = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
  const trimmed = content.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return [];
  if (trimmed.length <= chunkChars) return [trimmed];

  const blocks: string[] = [];
  const fenceSplit = trimmed.split(/(```[\s\S]*?```)/g);
  for (const block of fenceSplit) {
    if (!block.trim()) continue;
    if (block.startsWith('```') || block.length <= chunkChars) {
      blocks.push(block.trim());
      continue;
    }
    const paras = block.split(/\n{2,}/g);
    let buf = '';
    for (const para of paras) {
      if ((buf + '\n\n' + para).length > chunkChars && buf) {
        blocks.push(buf.trim());
        buf = para;
      } else {
        buf = buf ? buf + '\n\n' + para : para;
      }
    }
    if (buf.trim()) blocks.push(buf.trim());
  }

  const chunks: string[] = [];
  for (const block of blocks) {
    if (block.length <= chunkChars) {
      chunks.push(block);
      continue;
    }
    let start = 0;
    while (start < block.length) {
      const end = Math.min(block.length, start + chunkChars);
      chunks.push(block.slice(start, end).trim());
      if (end >= block.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  }
  return chunks.filter(Boolean);
}

export function buildChunks(documents: RagDocument[]): RagChunk[] {
  const chunks: RagChunk[] = [];
  for (const doc of documents) {
    const parts = chunkText(doc.content);
    parts.forEach((text, index) => {
      chunks.push({
        id: doc.id + '#' + index,
        docId: doc.id,
        title: doc.title,
        path: doc.path,
        source: doc.source,
        text,
        index,
        embedding: embedText(doc.title + '\n' + text),
      });
    });
  }
  return chunks;
}

interface Bm25Index {
  N: number;
  avgdl: number;
  df: Map<string, number>;
  tfs: Map<string, number>[];
  lengths: number[];
}

function buildBm25(chunks: RagChunk[]): Bm25Index {
  const tfs: Map<string, number>[] = [];
  const df = new Map<string, number>();
  const lengths: number[] = [];
  let totalLen = 0;
  for (const chunk of chunks) {
    const tokens = tokenize(chunk.title + ' ' + chunk.text);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    tfs.push(tf);
    lengths.push(tokens.length);
    totalLen += tokens.length;
    const seen = new Set(tf.keys());
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  return {
    N: chunks.length,
    avgdl: chunks.length ? totalLen / chunks.length : 0,
    df,
    tfs,
    lengths,
  };
}

function bm25Score(index: Bm25Index, chunkIdx: number, queryTokens: string[]): number {
  if (!index.N) return 0;
  const k1 = 1.5;
  const b = 0.75;
  const tf = index.tfs[chunkIdx];
  const dl = index.lengths[chunkIdx] || 1;
  let score = 0;
  const seen = new Set<string>();
  for (const term of queryTokens) {
    if (seen.has(term)) continue;
    seen.add(term);
    const f = tf.get(term) || 0;
    if (!f) continue;
    const n = index.df.get(term) || 0;
    const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
    score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / (index.avgdl || 1)))));
  }
  return score;
}

export function retrieveChunks(chunks: RagChunk[], query: string, k = 6): RagHit[] {
  if (!chunks.length || !query.trim()) return [];
  const qEmbed = embedText(query);
  const qTokens = tokenize(query);
  const bm25 = buildBm25(chunks);

  let maxBm = 0;
  const raw = chunks.map((chunk, i) => {
    const bm = bm25Score(bm25, i, qTokens);
    if (bm > maxBm) maxBm = bm;
    const dense = cosine(qEmbed, chunk.embedding);
    return { chunk, bm, dense };
  });

  const hits: RagHit[] = raw
    .map((row) => {
      const bm25n = maxBm > 0 ? row.bm / maxBm : 0;
      const denseN = (row.dense + 1) / 2;
      return {
        chunk: row.chunk,
        bm25: row.bm,
        dense: row.dense,
        score: 0.62 * bm25n + 0.38 * denseN,
      };
    })
    .filter((h) => h.score > 0.18)
    .sort((a, b) => b.score - a.score);

  const deduped: RagHit[] = [];
  const usedDocs = new Map<string, number>();
  for (const hit of hits) {
    const taken = usedDocs.get(hit.chunk.docId) || 0;
    if (taken >= 3) continue;
    usedDocs.set(hit.chunk.docId, taken + 1);
    deduped.push(hit);
    if (deduped.length >= k) break;
  }
  return deduped;
}

export function formatRagContext(hits: RagHit[]): string {
  if (!hits.length) return '';
  return hits
    .map((hit, i) => {
      const loc = hit.chunk.path || hit.chunk.title;
      return (
        '[' +
        (i + 1) +
        '] ' +
        loc +
        ' (' +
        hit.chunk.source +
        ', score ' +
        hit.score.toFixed(2) +
        ')\n' +
        hit.chunk.text
      );
    })
    .join('\n\n');
}

export function hitsToCitations(hits: RagHit[]) {
  return hits.map((hit) => ({
    title: hit.chunk.title,
    path: hit.chunk.path,
    source: hit.chunk.source,
    score: Number(hit.score.toFixed(3)),
    snippet: hit.chunk.text.slice(0, 220),
  }));
}

export function upsertDocument(
  documents: RagDocument[],
  incoming: Omit<RagDocument, 'contentHash'> & { contentHash?: string }
): RagDocument[] {
  const contentHash = incoming.contentHash || hashContent(incoming.content);
  const next: RagDocument = { ...incoming, contentHash };
  const idx = documents.findIndex((d) => d.id === next.id);
  if (idx === -1) return [...documents, next];
  const copy = documents.slice();
  copy[idx] = next;
  return copy;
}
