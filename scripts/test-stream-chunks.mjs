import http from 'node:http';

const reqBody = JSON.stringify({
  model: 'qwen-abliterated',
  messages: [{ role: 'user', content: 'Create a simple hello world python file' }],
  max_tokens: 1000,
  stream: true,
  tools: [
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write a file to disk',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path', 'content'],
        },
      },
    },
  ],
  tool_choice: 'auto',
});

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: 8000,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(reqBody),
    },
  },
  (res) => {
    console.log('Status:', res.statusCode);
    res.on('data', (chunk) => {
      const str = chunk.toString();
      for (const line of str.split('\n')) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.choices?.[0]?.delta;
            if (delta) {
              console.log('CHUNK DELTA:', JSON.stringify(delta));
            }
          } catch {}
        }
      }
    });
    res.on('end', () => console.log('STREAM END'));
  }
);

req.on('error', (err) => console.error('Req error:', err));
req.write(reqBody);
req.end();
