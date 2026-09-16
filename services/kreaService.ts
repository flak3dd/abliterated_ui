import { AspectRatioType, GeneratedImage } from '../types';
import { resolveApiUrl } from './apiConfig';
import { imageDebug } from './imageDebugFeed';

const HISTORY_THUMB_EDGE = 128;

export async function makeHistoryThumbnail(uri: string, maxEdge = HISTORY_THUMB_EDGE): Promise<string> {
  if (!uri || uri.length < 32) return uri;
  if (typeof document === 'undefined') {
    return uri.startsWith('data:') && uri.length > 12000 ? '' : uri;
  }
  try {
    const img = new Image();
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = uri;
    });
    if (!loaded || !img.width || !img.height) return '';
    const scale = maxEdge / Math.max(img.width, img.height);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return '';
  }
}

export const IMAGE_SIZE_MAP: Record<AspectRatioType, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '9:16': { width: 720, height: 1280 },
  '16:9': { width: 1280, height: 720 },
  '4:5': { width: 896, height: 1120 },
  '21:9': { width: 1344, height: 576 },
};

export const MODEL_SAMPLER_DEFAULTS: Record<string, { steps: number; guidanceScale: number }> = {
  'krea2-raw-fp8': { steps: 24, guidanceScale: 3.5 },
  'krea2-turbo': { steps: 8, guidanceScale: 0.0 },
  'flux2-klein-9b': { steps: 4, guidanceScale: 1.0 },
  'flux2-klein-9b-base': { steps: 28, guidanceScale: 1.0 },
  'z-image-turbo-nsfw-nvfp4': { steps: 8, guidanceScale: 1.0 },
  'qwen-image-2512-fp8': { steps: 30, guidanceScale: 4.0 },
  'qwen-edit-2511-fp8': { steps: 28, guidanceScale: 3.5 },

  'ddb-edit': { steps: 64, guidanceScale: 5.5 },
  'xing0916/DDB_Edit': { steps: 64, guidanceScale: 5.5 },
  'seedvr2-7b': { steps: 20, guidanceScale: 5.0 },
  'seedvr2-7b-fp8': { steps: 20, guidanceScale: 5.0 },
};

export interface BridgeImageModel {
  id: string;
  available: boolean;
  loaded: boolean;
  steps?: number;
  guidance?: number;
  pipelineClass?: string;
}

export async function listImageModels(
  host: string,
  port = 7860
): Promise<{ models: BridgeImageModel[]; loaded: string[] }> {
  const url = resolveApiUrl(host, port, '/v1/models');
  const t0 = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) {
    imageDebug('models_fail', 'GET /v1/models HTTP ' + res.status, {
      source: 'bridge',
      level: 'error',
      host,
      httpStatus: res.status,
      elapsedMs: Date.now() - t0,
    });
    throw new Error(`models ${res.status}`);
  }
  const data = await res.json();
  const rows = Array.isArray(data?.data) ? data.data : [];
  const models: BridgeImageModel[] = rows.map((row: any) => ({
    id: String(row.id || ''),
    available: row.available !== false,
    loaded: Boolean(row.loaded),
    steps: typeof row.steps === 'number' ? row.steps : undefined,
    guidance: typeof row.guidance === 'number' ? row.guidance : undefined,
    pipelineClass: row.pipelineClass,
  })).filter((m: BridgeImageModel) => m.id);
  const loaded = Array.isArray(data?.loaded)
    ? data.loaded.map(String)
    : models.filter((m) => m.loaded).map((m) => m.id);
  imageDebug('models_ok', 'listed ' + models.length + ' models', {
    source: 'bridge',
    host,
    elapsedMs: Date.now() - t0,
    detail: { available: models.filter((m) => m.available).map((m) => m.id), loaded },
  });
  return { models, loaded };
}

const IMAGE_BRIDGE_PORT = 7860;
const BUSY_PROGRESS = new Set(['running', 'loading', 'encoding']);

export type ImageProgress = {
  progress: number;
  status: string;
  prompt?: string;
  busy: boolean;
  step?: number;
  steps?: number;
};

function normalizeProgress(data: any): ImageProgress {
  const status = String(data?.status || '').trim().toLowerCase() || 'idle';
  const rawPct = typeof data?.progress === 'number' ? data.progress : 0;
  const progress = rawPct <= 1 && rawPct > 0 ? rawPct * 100 : rawPct;
  const busyFlag = data?.busy === true;
  const busy = busyFlag || BUSY_PROGRESS.has(status);
  return {
    progress: Number.isFinite(progress) ? progress : 0,
    status: busy ? status : status || 'idle',
    prompt: typeof data?.prompt === 'string' ? data.prompt : undefined,
    busy,
    step: typeof data?.step === 'number' ? data.step : undefined,
    steps: typeof data?.steps === 'number' ? data.steps : undefined,
  };
}

export async function readImageProgress(host: string, port: number): Promise<ImageProgress | null> {
  try {
    const res = await fetch(resolveApiUrl(host, port, '/v1/progress'), {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    return normalizeProgress(await res.json());
  } catch {
    return null;
  }
}

/** Wait only while the bridge reports an in-flight job. Empty/unreachable progress is not busy. */
async function waitForBridgeIdle(host: string, port: number, timeoutMs = 30000): Promise<void> {
  const started = Date.now();
  let lastKey = '';
  let lastChange = Date.now();
  let lastLog = 0;
  const STALL_MS = 25000;
  while (Date.now() - started < timeoutMs) {
    const snap = await readImageProgress(host, port);
    if (!snap || !snap.busy) return;
    const key = snap.status + '|' + Math.round(snap.progress) + '|' + (snap.prompt || '');
    if (key !== lastKey) {
      lastKey = key;
      lastChange = Date.now();
    } else if (Date.now() - lastChange >= STALL_MS) {
      const msg =
        'Weight load stalled at ' +
        Math.round(snap.progress) +
        '% (' +
        (snap.prompt || snap.status) +
        '). GPU may be full — retry Load weights.';
      imageDebug('gen_stall', msg, { source: 'krea', level: 'error', host });
      throw new Error(msg);
    }
    if (Date.now() - lastLog >= 8000) {
      lastLog = Date.now();
      imageDebug(
        'gen_wait',
        'bridge busy (' + snap.status + ' ' + Math.round(snap.progress) + '%) — waiting',
        { source: 'krea', level: 'warn', host }
      );
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export async function pingImageBridge(host: string, port = IMAGE_BRIDGE_PORT, timeoutMs = 2500): Promise<boolean> {
  const url = resolveApiUrl(host, port, '/health');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    imageDebug(res.ok ? 'health_ok' : 'health_fail', 'GET /health HTTP ' + res.status, {
      source: 'bridge',
      level: res.ok ? 'info' : 'warn',
      host,
      httpStatus: res.status,
    });
    return res.ok;
  } catch (e: any) {
    imageDebug('health_slow', e?.message || 'GET /health timed out', {
      source: 'bridge',
      level: 'warn',
      host,
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadImageModel(
  host: string,
  port = IMAGE_BRIDGE_PORT,
  model: string,
  signal?: AbortSignal
): Promise<{ model: string; params?: { steps?: number; guidance?: number }; skipped?: boolean }> {
  imageDebug('load_start', 'POST /v1/models/load', { source: 'bridge', host, model });
  if (!(await pingImageBridge(host, port))) {
    imageDebug('load_skip', 'health slow — still attempting load', {
      source: 'bridge',
      level: 'warn',
      host,
      model,
    });
  }
  const url = resolveApiUrl(host, port, '/v1/models/load');
  const tLoad = Date.now();
  await waitForBridgeIdle(host, port, 180000);
  let res: Response | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: signal || AbortSignal.timeout(10 * 60 * 1000),
    });
    if (res.status !== 429) break;
    imageDebug('load_busy', 'HTTP 429 — wait then retry load ' + (attempt + 1), {
      source: 'bridge',
      level: 'warn',
      host,
      model,
      httpStatus: 429,
    });
    await waitForBridgeIdle(host, port, 90000);
    await new Promise((r) => setTimeout(r, 800));
  }
  if (!res) throw new Error('load failed');
  if (res.status === 404) {
    imageDebug('load_skip', 'no /v1/models/load on this bridge — generate will load the pipe', {
      source: 'bridge',
      level: 'warn',
      host,
      model,
      httpStatus: 404,
      elapsedMs: Date.now() - tLoad,
    });
    return { model, skipped: true };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    imageDebug('load_fail', text || 'HTTP ' + res.status, {
      source: 'bridge',
      level: 'error',
      host,
      model,
      httpStatus: res.status,
      elapsedMs: Date.now() - tLoad,
    });
    throw new Error(text || `load ${res.status}`);
  }
  const data = await res.json();
  imageDebug('load_ok', String(data.model || model), {
    source: 'bridge',
    host,
    model: String(data.model || model),
    elapsedMs: Date.now() - tLoad,
  });
  return {
    model: String(data.model || model),
    params: data.params
      ? {
          steps: Number(data.params.steps),
          guidance: Number(data.params.guidance),
        }
      : undefined,
  };
}

export interface GenerateImageParams {
  host: string;
  port?: number;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatioType;
  imageUri?: string | null;
  maskData?: string[] | string | null;
  canvasSize?: { width: number; height: number } | null;
  brushSize?: number;
  model?: string;
  steps?: number;
  guidanceScale?: number;
  seed?: number | null;
  intent?: string;
  idImageUri?: string | null;
  idType?: string;
  extra?: Record<string, unknown>;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function utf8ToBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

export async function uriToDataUrl(uri: string): Promise<string> {
  if (!uri) return uri;
  if (uri.startsWith('data:')) return uri;

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read source image (HTTP ' + response.status + ')');
  }
  const contentType = response.headers.get('content-type') || 'image/png';
  const buffer = await response.arrayBuffer();
  return 'data:' + contentType.split(';')[0] + ';base64,' + bytesToBase64(new Uint8Array(buffer));
}

export function extensionForImageUri(uri: string): string {
  const lower = uri.slice(0, 64).toLowerCase();
  if (lower.includes('image/svg')) return 'svg';
  if (lower.includes('image/jpeg') || lower.includes('image/jpg')) return 'jpg';
  if (lower.includes('image/webp')) return 'webp';
  if (lower.includes('image/gif')) return 'gif';
  return 'png';
}

export function dataUrlToRawBase64(uri: string): { mime: string; base64: string } | null {
  const match = uri.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

type PathCmd = { type: 'M' | 'L'; x: number; y: number };

function parseSvgPath(d: string): PathCmd[] {
  const parts = d.trim().split(/\s+/);
  const out: PathCmd[] = [];
  for (let i = 0; i < parts.length; ) {
    const cmd = parts[i];
    if (cmd === 'M' || cmd === 'L') {
      const x = Number(parts[i + 1]);
      const y = Number(parts[i + 2]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        out.push({ type: cmd, x, y });
      }
      i += 3;
    } else {
      i += 1;
    }
  }
  return out;
}

export async function rasterizeInpaintMask(opts: {
  paths: string[];
  brushSize: number;
  canvasWidth: number;
  canvasHeight: number;
  targetWidth: number;
  targetHeight: number;
}): Promise<string | null> {
  const { paths, brushSize, canvasWidth, canvasHeight, targetWidth, targetHeight } = opts;
  if (!paths.length || canvasWidth <= 0 || canvasHeight <= 0) return null;

  const scaleX = targetWidth / canvasWidth;
  const scaleY = targetHeight / canvasHeight;
  const stroke = Math.max(1, brushSize * Math.min(scaleX, scaleY));

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = stroke;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const path of paths) {
        const cmds = parseSvgPath(path);
        if (!cmds.length) continue;
        ctx.beginPath();
        cmds.forEach((c, idx) => {
          const x = c.x * scaleX;
          const y = c.y * scaleY;
          if (idx === 0 || c.type === 'M') ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      return canvas.toDataURL('image/png');
    }
  }

  const scaled = paths
    .map((p) =>
      parseSvgPath(p)
        .map((c, idx) => {
          const cmd = idx === 0 || c.type === 'M' ? 'M' : 'L';
          return cmd + ' ' + (c.x * scaleX).toFixed(1) + ' ' + (c.y * scaleY).toFixed(1);
        })
        .join(' ')
    )
    .filter(Boolean);

  if (!scaled.length) return null;

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    targetWidth +
    '" height="' +
    targetHeight +
    '" viewBox="0 0 ' +
    targetWidth +
    ' ' +
    targetHeight +
    '">' +
    '<rect width="100%" height="100%" fill="#000"/>' +
    scaled
      .map(
        (d) =>
          '<path d="' +
          d +
          '" stroke="#fff" stroke-width="' +
          stroke +
          '" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
      )
      .join('') +
    '</svg>';

  return 'data:image/svg+xml;base64,' + utf8ToBase64(svg);
}

function extractGeneratedUrl(data: any): string | null {
  const b64 = data?.data?.[0]?.b64_json;
  let generatedUrl: string | null =
    data?.data?.[0]?.url || data?.images?.[0] || data?.image || null;
  if (!generatedUrl && typeof b64 === 'string' && b64.length > 32) {
    generatedUrl = b64.startsWith('data:') ? b64 : 'data:image/png;base64,' + b64;
  }
  if (typeof generatedUrl === 'string' && generatedUrl.length > 32) {
    return generatedUrl;
  }
  return null;
}

export async function generateKreaImage({
  host,
  port = IMAGE_BRIDGE_PORT,
  prompt,
  negativePrompt,
  aspectRatio,
  imageUri,
  maskData,
  canvasSize,
  brushSize = 28,
  model = 'krea2-raw-fp8',
  steps = 24,
  guidanceScale = 3.5,
  seed = null,
  intent,
  idImageUri,
  idType,
  extra,
}: GenerateImageParams): Promise<GeneratedImage> {
  if (port !== IMAGE_BRIDGE_PORT) {
    console.warn('[kreaService] Forcing image bridge port 7860 (got ' + port + ')');
    port = IMAGE_BRIDGE_PORT;
  }
  const url = resolveApiUrl(host, port, '/v1/images/generations');
  const hasMaskInput = Boolean(
    (typeof maskData === 'string' && maskData.length > 0) ||
      (Array.isArray(maskData) && maskData.length > 0)
  );
  imageDebug('gen_start', (prompt || '').slice(0, 160), {
    source: 'krea',
    host,
    model,
    detail: { steps, guidanceScale, aspectRatio, hasImage: Boolean(imageUri), hasMask: hasMaskInput },
  });
  if (!(await pingImageBridge(host, port))) {
    imageDebug('health_slow', 'GET /health slow — POSTing generate without idle wait', {
      source: 'krea',
      level: 'warn',
      host,
      model,
    });
  }
  const size = IMAGE_SIZE_MAP[aspectRatio] || IMAGE_SIZE_MAP['1:1'];
  const { width, height } = size;

  let encodedImage: string | undefined;
  if (imageUri) {
    try {
      encodedImage = await uriToDataUrl(imageUri);
    } catch (e: any) {
      console.warn('[kreaService] Could not encode source image:', e?.message || e);
      if (imageUri.startsWith('http://') || imageUri.startsWith('https://') || imageUri.startsWith('data:')) {
        encodedImage = imageUri;
      }
    }
  }

  let encodedMask: string | undefined;
  if (typeof maskData === 'string' && maskData.startsWith('data:')) {
    encodedMask = maskData;
  } else if (Array.isArray(maskData) && maskData.length > 0) {
    const layoutW = canvasSize?.width && canvasSize.width > 0 ? canvasSize.width : width;
    const layoutH = canvasSize?.height && canvasSize.height > 0 ? canvasSize.height : height;
    try {
      encodedMask =
        (await rasterizeInpaintMask({
          paths: maskData,
          brushSize,
          canvasWidth: layoutW,
          canvasHeight: layoutH,
          targetWidth: width,
          targetHeight: height,
        })) || undefined;
    } catch (e: any) {
      console.warn('[kreaService] Mask rasterization failed:', e?.message || e);
    }
  }

  let encodedIdImage: string | undefined;
  if (idImageUri) {
    try {
      encodedIdImage = await uriToDataUrl(idImageUri);
    } catch {
      if (idImageUri.startsWith('http') || idImageUri.startsWith('data:')) {
        encodedIdImage = idImageUri;
      }
    }
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  const HARD_CAP_MS = 12 * 60 * 1000;
  const SOFT_IDLE_MS = 180000;
  const watchdog = setInterval(async () => {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= HARD_CAP_MS) {
      controller.abort();
      return;
    }
    const snap = await readImageProgress(host, port);
    if (snap?.busy) return;
    if (elapsed >= SOFT_IDLE_MS) controller.abort();
  }, 3000);
  let errorMsg: string | undefined;

  try {
    console.log(
      '[kreaService] Requesting synthesis from ' +
        url +
        ' (model: ' +
        model +
        ', size: ' +
        width +
        'x' +
        height +
        ')'
    );

    const payload = JSON.stringify({
      model,
      prompt,
      negative_prompt: negativePrompt || undefined,
      size: width + 'x' + height,
      width,
      height,
      steps,
      num_inference_steps: steps,
      guidance_scale: guidanceScale,
      seed: seed !== null ? seed : undefined,
      response_format: 'b64_json',
      image: encodedImage || undefined,
      mask: encodedMask || undefined,
      intent: intent || undefined,
      id_image: encodedIdImage || undefined,
      extra: {
        ...(extra || {}),
        ...(idType ? { id_type: idType } : {}),
      },
    });

    await waitForBridgeIdle(host, port, 120000);
    let response: Response | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: controller.signal,
      });
      if (response.status !== 429) break;
      imageDebug('gen_busy', 'HTTP 429 already running — wait then retry ' + (attempt + 1), {
        source: 'krea',
        level: 'warn',
        host,
        model,
        httpStatus: 429,
      });
      await waitForBridgeIdle(host, port, 90000);
      await new Promise((r) => setTimeout(r, 1500));
    }

    if (response && response.ok) {
      const data = await response.json();
      console.log('[kreaService] Received response from Spark (model: ' + (data.model || model) + ')');
      const generatedUrl = extractGeneratedUrl(data);
      if (generatedUrl) {
        imageDebug('gen_ok', 'got image ' + (data.model || model), {
          source: 'krea',
          host,
          model: data.model || model,
          httpStatus: response.status,
        });
        return {
          id: 'img_' + Date.now(),
          uri: generatedUrl,
          prompt,
          aspectRatio,
          model: data.model || model,
          timestamp: Date.now(),
          hasMask: Boolean(encodedMask),
          isFallback: false,
        };
      }
      errorMsg = 'Spark returned HTTP 200 but no image payload';
      console.warn('[kreaService] ' + errorMsg + ':', Object.keys(data || {}));
    } else {
      const errText = response ? await response.text().catch(() => '') : '';
      errorMsg =
        'Spark Image Bridge HTTP ' +
        (response ? response.status : 0) +
        (errText ? ': ' + errText.slice(0, 120) : '');
      imageDebug('gen_fail', errorMsg, {
        source: 'krea',
        level: 'error',
        host,
        model,
        httpStatus: response ? response.status : 0,
      });
      console.warn('[kreaService] ' + errorMsg);
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      const secs = Math.round((Date.now() - startedAt) / 1000);
      errorMsg =
        secs >= Math.round(HARD_CAP_MS / 1000)
          ? 'Image generation timed out after ' + secs + ' seconds'
          : 'Image generation stalled after ' + secs + ' seconds (bridge not busy)';
    } else {
      errorMsg = e?.message || 'Network/generation error';
    }
    console.warn('[kreaService] ' + errorMsg);
  } finally {
    clearInterval(watchdog);
  }

  return createSyntheticImage(prompt, aspectRatio, hasMaskInput, model, errorMsg);
}

function createSyntheticImage(
  prompt: string,
  aspectRatio: AspectRatioType,
  hasMask: boolean,
  model = 'krea2-raw-fp8',
  error?: string
): GeneratedImage {
  const { width, height } = IMAGE_SIZE_MAP[aspectRatio] || IMAGE_SIZE_MAP['1:1'];

  const seed = Math.abs(prompt.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));
  const hue1 = (seed * 37) % 360;
  const hue2 = (hue1 + 75) % 360;
  const errorLabel = (error || 'BRIDGE OFFLINE').replace(/[<>&]/g, '');

  const svgContent =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    width +
    '" height="' +
    height +
    '" viewBox="0 0 ' +
    width +
    ' ' +
    height +
    '">' +
    '<defs>' +
    '<linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" stop-color="hsl(' +
    hue1 +
    ', 70%, 10%)" />' +
    '<stop offset="50%" stop-color="#09090B" />' +
    '<stop offset="100%" stop-color="hsl(' +
    hue2 +
    ', 80%, 8%)" />' +
    '</linearGradient>' +
    '<radialGradient id="glow" cx="50%" cy="40%" r="50%">' +
    '<stop offset="0%" stop-color="hsl(' +
    hue1 +
    ', 90%, 55%)" stop-opacity="0.6"/>' +
    '<stop offset="100%" stop-color="#000000" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<filter id="blurFilter"><feGaussianBlur stdDeviation="30" /></filter>' +
    '</defs>' +
    '<rect width="100%" height="100%" fill="url(#bgGrad)" />' +
    '<circle cx="' +
    width * 0.5 +
    '" cy="' +
    height * 0.45 +
    '" r="' +
    Math.min(width, height) * 0.35 +
    '" fill="url(#glow)" filter="url(#blurFilter)" />' +
    (hasMask
      ? '<circle cx="' +
        width * 0.5 +
        '" cy="' +
        height * 0.45 +
        '" r="70" fill="rgba(59, 130, 246, 0.35)" stroke="#3B82F6" stroke-width="3"/>' +
        '<text x="' +
        width * 0.5 +
        '" y="' +
        height * 0.46 +
        '" font-family="sans-serif" font-size="14" fill="#3B82F6" text-anchor="middle" font-weight="bold">INPAINT APPLIED</text>'
      : '') +
    '<text x="28" y="45" font-family="monospace" font-size="16" fill="#F43F5E" font-weight="bold">SYNTHESIS FAILED</text>' +
    '<text x="28" y="70" font-family="sans-serif" font-size="13" fill="#A1A1AA">' +
    prompt.slice(0, 45) +
    (prompt.length > 45 ? '...' : '') +
    '</text>' +
    '<text x="28" y="94" font-family="sans-serif" font-size="12" fill="#F43F5E">' +
    errorLabel.slice(0, 72) +
    '</text>' +
    '<text x="28" y="' +
    (height - 28) +
    '" font-family="monospace" font-size="12" fill="#71717A">MODEL: ' +
    model +
    ' • ' +
    width +
    'x' +
    height +
    ' • PLACEHOLDER</text>' +
    '</svg>';

  let encodedSvg: string;
  try {
    encodedSvg = 'data:image/svg+xml;base64,' + utf8ToBase64(svgContent);
  } catch {
    encodedSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgContent);
  }

  return {
    id: 'img_' + Date.now(),
    uri: encodedSvg,
    prompt,
    aspectRatio,
    model,
    timestamp: Date.now(),
    hasMask,
    isFallback: true,
    error: error || 'Abliterated image bridge unavailable',
  };
}
