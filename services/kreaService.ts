import { AspectRatioType, GeneratedImage } from '../types';
import { resolveApiUrl } from './apiConfig';

export const IMAGE_SIZE_MAP: Record<AspectRatioType, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '9:16': { width: 720, height: 1280 },
  '16:9': { width: 1280, height: 720 },
  '4:5': { width: 896, height: 1120 },
  '21:9': { width: 1344, height: 576 },
};

export const MODEL_SAMPLER_DEFAULTS: Record<string, { steps: number; guidanceScale: number }> = {
  'krea2-raw-fp8': { steps: 24, guidanceScale: 7.5 },
  'flux2-klein-9b': { steps: 28, guidanceScale: 3.5 },
  'z-image-turbo-nsfw-nvfp4': { steps: 4, guidanceScale: 1.0 },
  'qwen-image-2512-fp8': { steps: 30, guidanceScale: 4.0 },
  'qwen-edit-2511-fp8': { steps: 24, guidanceScale: 4.0 },
  'comfy-dolphin': { steps: 24, guidanceScale: 7.5 },
  'ddb-edit': { steps: 24, guidanceScale: 7.5 },
  'seedvr2-7b': { steps: 20, guidanceScale: 5.0 },
};

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
  port = 7860,
  prompt,
  negativePrompt,
  aspectRatio,
  imageUri,
  maskData,
  canvasSize,
  brushSize = 28,
  model = 'krea2-raw-fp8',
  steps = 24,
  guidanceScale = 7.5,
  seed = null,
}: GenerateImageParams): Promise<GeneratedImage> {
  const url = resolveApiUrl(host, port, '/v1/images/generations');
  const size = IMAGE_SIZE_MAP[aspectRatio] || IMAGE_SIZE_MAP['1:1'];
  const { width, height } = size;
  const hasMaskInput = Boolean(
    (typeof maskData === 'string' && maskData.length > 0) ||
      (Array.isArray(maskData) && maskData.length > 0)
  );

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
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

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        negative_prompt: negativePrompt || undefined,
        size: width + 'x' + height,
        width,
        height,
        num_inference_steps: steps,
        guidance_scale: guidanceScale,
        seed: seed !== null ? seed : undefined,
        response_format: 'b64_json',
        image: encodedImage || undefined,
        mask: encodedMask || undefined,
      }),
      signal: controller.signal,
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[kreaService] Received response from Spark (model: ' + (data.model || model) + ')');
      const generatedUrl = extractGeneratedUrl(data);
      if (generatedUrl) {
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
      const errText = await response.text().catch(() => '');
      errorMsg = 'Spark Image Bridge HTTP ' + response.status + (errText ? ': ' + errText.slice(0, 120) : '');
      console.warn('[kreaService] ' + errorMsg);
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      errorMsg = 'Image generation timed out after 180 seconds';
    } else {
      errorMsg = e?.message || 'Network/generation error';
    }
    console.warn('[kreaService] ' + errorMsg);
  } finally {
    clearTimeout(timeout);
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
