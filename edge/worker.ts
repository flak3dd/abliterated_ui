/**
 * Cloudflare Worker: Edge Routing, TLS 1.3 Termination, Rate Limiting & Origin Proxy.
 */

// Ambient Cloudflare Worker types
interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException?(): void;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  ORIGIN_GATEWAY_URL: string; // e.g. "https://gateway.abliteration.ai" or direct origin IP
  RATE_LIMIT_KV?: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS Preflight Handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 2. Client IP & Geolocation Enrichment
    const clientIP = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
    const clientCountry = request.headers.get('CF-IPCountry') || 'XX';
    const clientASN = request.cf?.asn || 'unknown';

    // 3. Edge Rate Limiting (120 req/minute per IP)
    // Uses Cloudflare Cache API for sub-millisecond edge counter tracking
    const cacheKey = new Request(`https://rate-limit.internal/${clientIP}`, { method: 'GET' });
    const cache = caches.default;
    let rateCount = 1;

    const cachedRes = await cache.match(cacheKey);
    if (cachedRes) {
      const current = parseInt(await cachedRes.text(), 10) || 0;
      rateCount = current + 1;
      if (rateCount > 120) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Edge rate limit exceeded (120 req/min). Please throttle requests.',
            clientIP,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '30',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }
    }

    // Update rate limit counter in edge cache (60-second TTL)
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(rateCount.toString(), {
          headers: { 'Cache-Control': 'max-age=60' },
        })
      )
    );

    // 4. Edge Caching for Model Catalog GET /v1/models (60 seconds)
    if (request.method === 'GET' && url.pathname === '/v1/models') {
      const modelCacheKey = new Request(request.url, { method: 'GET' });
      const modelCached = await cache.match(modelCacheKey);
      if (modelCached) {
        const res = new Response(modelCached.body, modelCached);
        res.headers.set('X-Edge-Cache', 'HIT');
        return res;
      }
    }

    // 5. Proxy Downstream to Concurrent Go Gateway
    const originBase = env.ORIGIN_GATEWAY_URL || 'http://127.0.0.1:8080';
    const targetUrl = new URL(url.pathname + url.search, originBase);

    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set('X-Forwarded-For', clientIP);
    proxyHeaders.set('X-Edge-Country', clientCountry);
    proxyHeaders.set('X-Edge-ASN', String(clientASN));
    proxyHeaders.set('X-Edge-Router', 'Cloudflare-Worker/1.0');

    try {
      const originResponse = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: proxyHeaders,
        body: request.body,
        redirect: 'follow',
      });

      // Clone response to attach edge headers
      const response = new Response(originResponse.body, originResponse);
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('X-Edge-Latency-Ms', String(Date.now()));

      // Cache model catalog on edge
      if (request.method === 'GET' && url.pathname === '/v1/models' && originResponse.status === 200) {
        ctx.waitUntil(cache.put(new Request(request.url, { method: 'GET' }), originResponse.clone()));
      }

      return response;
    } catch (err: unknown) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Origin gateway unreachable: ${err instanceof Error ? err.message : String(err)}`,
          target: targetUrl.toString(),
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};
