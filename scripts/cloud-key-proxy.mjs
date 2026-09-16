#!/usr/bin/env node
/**
 * Server-side cloud key + Spark LAN proxy.
 * Injects FEATHERLESS_API_KEY / ABLITERATION_API_KEY so the browser never holds secrets.
 * Also proxies private Spark / LAN inference so Firefox (and similar) can avoid
 * Local Network Access blocks on direct 192.168.x fetches from Expo web.
 *
 * Local:  http://127.0.0.1:17332/featherless/v1/models
 *         http://127.0.0.1:17332/abliteration/v1/chat/completions
 *         http://127.0.0.1:17332/spark/192.168.4.103/8000/v1/chat/completions
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

function isAllowedSparkUpstream(host) {
  const h = String(host || '').toLowerCase();
  if (!h || h.includes('/') || h.includes('\\') || h.includes('@')) return false;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (h.endsWith('.local')) return true;
  // RFC1918 + Tailscale CGNAT (100.64/10)
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

function defaultSparkUpstream() {
  const host = process.env.SPARK_HOST || '192.168.4.103';
  const port = Number(process.env.SPARK_PORT || 8000) || 8000;
  return { host, port };
}

function parseProxyPath(urlPath) {
  const parts = String(urlPath || '').split('/').filter(Boolean);
  // /featherless/v1/models  OR  /api/cloud/featherless/v1/models
  // /spark/192.168.4.103/8000/v1/models  OR  /spark/v1/models
  if (parts[0] === 'api' && parts[1] === 'cloud') parts.splice(0, 2);
  if (parts[0] === 'spark') {
    if (parts[1] && parts[2] && /^\d+$/.test(parts[2])) {
      const host = parts[1];
      const port = Number(parts[2]) || 8000;
      const rest = '/' + parts.slice(3).join('/');
      return { kind: 'spark', host, port, rest: rest === '/' ? '/v1' : rest };
    }
    const def = defaultSparkUpstream();
    const rest = '/' + parts.slice(1).join('/');
    return { kind: 'spark', host: def.host, port: def.port, rest: rest === '/' ? '/v1' : rest };
  }
  const provider = parts[0];
  const rest = '/' + parts.slice(1).join('/');
  return { kind: 'cloud', provider, rest: rest === '/' ? '/v1' : rest };
}

async function pipeUpstream(req, res, target, bodyBuf, extraHeaders = {}) {
  const origin = req.headers.origin || '*';
  const headers = {
    Accept: req.headers.accept || 'application/json',
    'User-Agent': 'abliterated-cloud-proxy/1.0 (compatible; curl/8.0)',
    ...extraHeaders,
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

export async function proxyCloudRequest(req, res, urlPath, bodyBuf) {
  const origin = req.headers.origin || '*';
  cors(res, origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = parseProxyPath(urlPath);
  const search = String(req.url || '').includes('?') ? String(req.url).slice(String(req.url).indexOf('?')) : '';

  if (parsed.kind === 'spark') {
    if (!isAllowedSparkUpstream(parsed.host)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Spark upstream host not allowed' }));
      return;
    }
    const port = Number(parsed.port) || 8000;
    if (port < 1 || port > 65535) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid Spark upstream port' }));
      return;
    }
    const target = `http://${parsed.host}:${port}${parsed.rest}${search}`;
    await pipeUpstream(req, res, target, bodyBuf);
    return;
  }

  const { provider, rest } = parsed;
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

  const target = upstreamBase + rest + search;
  await pipeUpstream(req, res, target, bodyBuf, {
    Authorization: 'Bearer ' + key,
    'x-api-key': key,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = (req.url || '/').split('?')[0];
      if (urlPath === '/health') {
        cors(res, req.headers.origin);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const spark = defaultSparkUpstream();
        res.end(
          JSON.stringify({
            ok: true,
            service: 'cloud-key-proxy',
            port: PORT,
            featherless: Boolean(keyFor('featherless')),
            abliteration: Boolean(keyFor('abliteration')),
            spark: { host: spark.host, port: spark.port },
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
    const spark = defaultSparkUpstream();
    console.log(`Cloud key proxy http://${HOST}:${PORT}/{featherless|abliteration}/v1/...`);
    console.log(`  spark LAN: http://${HOST}:${PORT}/spark/<host>/<port>/v1/... (default ${spark.host}:${spark.port})`);
    console.log(
      `  keys: featherless=${keyFor('featherless') ? 'set' : 'MISSING'} abliteration=${keyFor('abliteration') ? 'set' : 'MISSING'}`
    );
  });
}
