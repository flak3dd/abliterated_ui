#!/usr/bin/env node
/**
 * Server-side cloud key proxy.
 * Injects FEATHERLESS_API_KEY / ABLITERATION_API_KEY so the browser never holds secrets.
 *
 * Local:  http://127.0.0.1:17332/featherless/v1/models
 *         http://127.0.0.1:17332/abliteration/v1/chat/completions
 * Vercel: /api/cloud/:provider/...
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.CLOUD_PROXY_PORT || 17332);
const HOST = process.env.CLOUD_PROXY_HOST || '127.0.0.1';

const UPSTREAM = {
  featherless: 'https://api.featherless.ai',
  abliteration: 'https://api.abliteration.ai',
};

function loadDotEnv() {
  for (const name of ['.env', '.env.local']) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    }
  }
}

loadDotEnv();

function keyFor(provider) {
  if (provider === 'featherless') {
    return process.env.FEATHERLESS_API_KEY || process.env.FEATHERLESS_KEY || '';
  }
  return (
    process.env.ABLITERATION_API_KEY ||
    process.env.ABLITERATED_API_KEY ||
    process.env.ABLITERATION_API ||
    process.env.ABLITERATION_KEY ||
    ''
  );
}

function clientKey(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) {
    const tok = auth.slice(7).trim();
    if (tok) return tok;
  }
  const headerKey = String(req.headers['x-api-key'] || '').trim();
  return headerKey;
}

function cors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, x-api-key');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

function parseProxyPath(urlPath) {
  const parts = String(urlPath || '').split('/').filter(Boolean);
  // /featherless/v1/models  OR  /api/cloud/featherless/v1/models
  if (parts[0] === 'api' && parts[1] === 'cloud') parts.splice(0, 2);
  const provider = parts[0];
  const rest = '/' + parts.slice(1).join('/');
  return { provider, rest: rest === '/' ? '/v1' : rest };
}

export async function proxyCloudRequest(req, res, urlPath, bodyBuf) {
  const origin = req.headers.origin || '*';
  cors(res, origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const { provider, rest } = parseProxyPath(urlPath);
  const upstreamBase = UPSTREAM[provider];
  if (!upstreamBase) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Unknown cloud provider' }));
    return;
  }

  const key = keyFor(provider) || clientKey(req);
  if (!key) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: false,
        error: `Missing server key for ${provider}. Set FEATHERLESS_API_KEY or ABLITERATION_API_KEY in .env`,
      })
    );
    return;
  }

  const search = String(req.url || '').includes('?') ? String(req.url).slice(String(req.url).indexOf('?')) : '';
  const target = upstreamBase + rest + search;
  const headers = {
    Accept: req.headers.accept || 'application/json',
    Authorization: 'Bearer ' + key,
    'x-api-key': key,
    'User-Agent': 'abliterated-cloud-proxy/1.0 (compatible; curl/8.0)',
  };
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

  const init = { method: req.method || 'GET', headers };
  if (bodyBuf && bodyBuf.length && req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = bodyBuf;
  }

  const upstream = await fetch(target, init);
  const contentType = upstream.headers.get('content-type') || 'application/json';
  const outHeaders = {
    'Content-Type': contentType,
    'Cache-Control': contentType.includes('text/event-stream') ? 'no-cache, no-transform' : 'no-store',
    'Access-Control-Allow-Origin': origin || '*',
  };
  if (contentType.includes('text/event-stream')) {
    outHeaders['X-Accel-Buffering'] = 'no';
  }
  res.writeHead(upstream.status, outHeaders);
  if (!upstream.body) {
    res.end();
    return;
  }
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = (req.url || '/').split('?')[0];
      if (urlPath === '/health') {
        cors(res, req.headers.origin);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            service: 'cloud-key-proxy',
            port: PORT,
            featherless: Boolean(keyFor('featherless')),
            abliteration: Boolean(keyFor('abliteration')),
          })
        );
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bodyBuf = Buffer.concat(chunks);
      await proxyCloudRequest(req, res, urlPath, bodyBuf);
    } catch (err) {
      if (!res.headersSent) {
        cors(res, req.headers.origin);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message || 'proxy failed' }));
      } else {
        try {
          res.end();
        } catch {
          /* already closed */
        }
      }
    }
  });
  server.listen(PORT, HOST, () => {
    console.log(`Cloud key proxy http://${HOST}:${PORT}/{featherless|abliteration}/v1/...`);
    console.log(
      `  keys: featherless=${keyFor('featherless') ? 'set' : 'MISSING'} abliteration=${keyFor('abliteration') ? 'set' : 'MISSING'}`
    );
  });
}
