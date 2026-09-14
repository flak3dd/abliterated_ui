import http from 'node:http';

async function generateImage(model, prompt, extra = {}) {
  const payload = JSON.stringify({
    model,
    prompt,
    size: '512x512',
    response_format: 'b64_json',
    steps: 12,
    ...extra
  });

  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = http.request(
      'http://192.168.4.103:7860/v1/images/generations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 240000,
      },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch {}
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          const b64 = json?.data?.[0]?.b64_json;
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            elapsed: elapsed + 's',
            model: json?.model || model,
            hasImage: Boolean(b64 && b64.length > 100),
            imageSizeKB: b64 ? Math.round(b64.length * 0.75 / 1024) : 0,
            magic: b64 ? Buffer.from(b64.slice(0, 16), 'base64').toString('hex') : null,
            error: json?.error || (res.statusCode >= 400 ? data.slice(0, 200) : null),
          });
        });
      }
    );
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timed out (240s)' }); });
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('--- Testing qwen-image-2512-fp8 ---');
  const res = await generateImage('qwen-image-2512-fp8', 'A high tech quantum computer chip with glowing fiber optics');
  console.log('Result qwen-image-2512-fp8:', JSON.stringify(res, null, 2));
}

main().catch(console.error);
