import { proxyCloudRequest } from '../../../scripts/cloud-key-proxy.mjs';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  const provider = String(req.query.provider || 'featherless');
  const rest = Array.isArray(req.query.path)
    ? '/' + req.query.path.join('/')
    : '/' + String(req.query.path || 'v1');
  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on('data', (c) => chunks.push(c));
    req.on('end', resolve);
    req.on('error', reject);
  });
  req.url = `/api/cloud/${provider}${rest}${req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  await proxyCloudRequest(req, res, `/api/cloud/${provider}${rest}`, Buffer.concat(chunks));
}
