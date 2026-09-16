import { AspectRatioType } from '../types';
import { IMAGE_SIZE_MAP } from './kreaService';
import { analyzeLayout, type LayoutAnalyzeResult } from './layoutLmv3Service';

export type IdWorkflowId = 'id_front' | 'id_back' | 'liveness' | 'selfie';
export type BgOption =
  | 'speckled_stone'
  | 'laminate_desk'
  | 'oak_wood'
  | 'walnut_wood'
  | 'white_formica'
  | 'brushed_steel'
  | 'concrete'
  | 'marble_white'
  | 'granite'
  | 'terrazzo'
  | 'leather_desk'
  | 'linen_cloth'
  | 'navy_felt'
  | 'cork'
  | 'cardboard'
  | 'painted_white_wall'
  | 'drywall_offwhite'
  | 'glass_table'
  | 'asphalt'
  | 'transparent'
  | 'upload';

export const BG_SURFACES: { id: BgOption; label: string; prompt: string }[] = [
  {
    id: 'speckled_stone',
    label: 'Speckled stone',
    prompt:
      'Lying on a real light-grey speckled stone / quartz counter with visible mineral flecks, pores, and mild sheen variation.',
  },
  {
    id: 'laminate_desk',
    label: 'Laminate desk',
    prompt:
      'Lying on a worn office laminate desk: faint wood-print pattern, micro-scratches, coffee-ring ghosts, and edge wear.',
  },
  {
    id: 'oak_wood',
    label: 'Oak wood',
    prompt: 'Lying on light oak timber with open grain, growth rings, and soft directional grain highlights.',
  },
  {
    id: 'walnut_wood',
    label: 'Walnut',
    prompt: 'Lying on dark walnut wood with tight grain, oil sheen, and small dents from everyday use.',
  },
  {
    id: 'white_formica',
    label: 'White formica',
    prompt: 'Lying on white formica: slightly glossy, faint swirl mop marks, and tiny grey scuffs.',
  },
  {
    id: 'brushed_steel',
    label: 'Brushed steel',
    prompt: 'Lying on brushed stainless steel with linear grain, cool specular streaks, and fingerprint smudges.',
  },
  {
    id: 'concrete',
    label: 'Concrete',
    prompt: 'Lying on raw concrete with pores, hairline cracks, and uneven grey mottling.',
  },
  {
    id: 'marble_white',
    label: 'White marble',
    prompt: 'Lying on white marble with irregular grey veins, polish, and soft caustic highlights.',
  },
  {
    id: 'granite',
    label: 'Granite',
    prompt: 'Lying on speckled granite (black/grey/mica) with crystalline sparkle under room light.',
  },
  {
    id: 'terrazzo',
    label: 'Terrazzo',
    prompt: 'Lying on terrazzo: chips of marble and glass in a cement matrix, slightly polished.',
  },
  {
    id: 'leather_desk',
    label: 'Leather blotter',
    prompt: 'Lying on a brown leather desk blotter with creases, grain, and mild oil darkening.',
  },
  {
    id: 'linen_cloth',
    label: 'Linen cloth',
    prompt: 'Lying on wrinkled off-white linen: visible weave, folds, and soft shadow in the cloth valleys.',
  },
  {
    id: 'navy_felt',
    label: 'Navy felt',
    prompt: 'Lying on dense navy felt or mouse-mat fabric with short pile and matte absorption.',
  },
  {
    id: 'cork',
    label: 'Cork',
    prompt: 'Lying on a cork board/desk pad: clustered cork granules, pinholes, and warm ochre colour.',
  },
  {
    id: 'cardboard',
    label: 'Cardboard',
    prompt: 'Lying on corrugated cardboard: kraft colour, flute texture at a torn edge, and fibre pills.',
  },
  {
    id: 'painted_white_wall',
    label: 'White wall',
    prompt:
      'Subject in front of a plain white painted gypsum wall: roller marks, scuffs, dust specks, and uneven indoor light. Full depth of field — do not bokeh the wall.',
  },
  {
    id: 'drywall_offwhite',
    label: 'Off-white drywall',
    prompt: 'Behind/on slightly cream drywall with tape ridges, nail pops, and cheap rental paint sheen.',
  },
  {
    id: 'glass_table',
    label: 'Glass table',
    prompt: 'Lying on a glass table: faint reflections of the room, dust, and a soft contact shadow under the card.',
  },
  {
    id: 'asphalt',
    label: 'Asphalt',
    prompt: 'Lying on outdoor asphalt / tarmac: tar texture, small stones, and uneven daylight.',
  },
  {
    id: 'transparent',
    label: 'Transparent',
    prompt: 'Isolated on a true transparent alpha background. No desk, no studio sweep.',
  },
  {
    id: 'upload',
    label: 'Upload plate',
    prompt: 'Use the uploaded background plate as the only scene. Do not invent a different surface or room.',
  },
];
export type MediaFormat = 'png' | 'jpeg' | 'webp';
export type MediaTier = 'compact' | 'standard' | 'print';

export interface IdWorkflow {
  id: IdWorkflowId;
  label: string;
  short: string;
  model: string;
  fallbackModel: string;
  intent: string;
  defaultAspect: AspectRatioType;
  needsDocument: boolean;
  needsIdentity: boolean;
  allowCamera: boolean;
  nativeLabel: string;
  zones: string[];
}

export const ID_WORKFLOWS: IdWorkflow[] = [
  {
    id: 'id_front',
    label: 'ID Front Portrait',
    short: 'Front',
    model: 'qwen-edit-2511-fp8',
    fallbackModel: 'ddb-edit',
    intent: 'id_clean',
    defaultAspect: '16:9',
    needsDocument: true,
    needsIdentity: false,
    allowCamera: false,
    nativeLabel: 'Front of ID',
    zones: ['headshot ROI', 'document borders', 'printed text'],
  },
  {
    id: 'id_back',
    label: 'ID Back Scan',
    short: 'Back',
    model: 'qwen-edit-2511-fp8',
    fallbackModel: 'seedvr2-7b-fp8',
    intent: 'id_back',
    defaultAspect: '16:9',
    needsDocument: true,
    needsIdentity: false,
    allowCamera: false,
    nativeLabel: 'Back of ID',
    zones: ['MRZ', 'barcode/QR', 'signature pad', 'secondary text'],
  },
  {
    id: 'liveness',
    label: 'Liveness Snapshot',
    short: 'Liveness',
    model: 'flux2-klein-9b',
    fallbackModel: 'krea2-raw-fp8',
    intent: 'id_portrait',
    defaultAspect: '16:9',
    needsDocument: false,
    needsIdentity: true,
    allowCamera: true,
    nativeLabel: 'Selfie',
    zones: ['eyes', 'nose', 'mouth', 'headroom'],
  },
  {
    id: 'selfie',
    label: 'Purpose Selfie',
    short: 'Selfie',
    model: 'krea2-raw-fp8',
    fallbackModel: 'flux2-klein-9b',
    intent: 'faceswap',
    defaultAspect: '16:9',
    needsDocument: true,
    needsIdentity: false,
    allowCamera: false,
    nativeLabel: 'face_still.png',
    zones: ['centred face', 'hair', 'collar', 'liveness cues'],
  },
];

const BG_PROMPT: Record<BgOption, string> = Object.fromEntries(
  BG_SURFACES.map((s) => [s.id, s.prompt])
) as Record<BgOption, string>;

function sizeLine(aspect: AspectRatioType, custom?: { width: number; height: number } | null): string {
  if (custom && custom.width > 0 && custom.height > 0) {
    return 'OUTPUT: ' + custom.width + '×' + custom.height + '.';
  }
  const s = IMAGE_SIZE_MAP[aspect] || IMAGE_SIZE_MAP['16:9'];
  return 'OUTPUT: ' + s.width + '×' + s.height + ' (' + aspect + ').';
}

export function buildKycPrompt(opts: {
  workflow: IdWorkflow;
  notes: string;
  bg: BgOption;
  solidColor?: string;
  aspect: AspectRatioType;
  customSize?: { width: number; height: number } | null;
  docType: string;
}): { prompt: string; negative: string } {
  const wf = opts.workflow;
  const size = sizeLine(opts.aspect, opts.customSize);
  const bg = BG_PROMPT[opts.bg] || BG_PROMPT.speckled_stone;
  const notes = opts.notes.trim();
  const lock =
    'PRESERVE EXACTLY all printed text, names, numbers, dates, signatures, barcodes, MRZ, holograms, and the embedded portrait. Do not invent or correct fields. Identity locked to the source photo.';

  let body = '';
  if (wf.id === 'id_front') {
    body =
      'Document side: FRONT of the identity document (' +
      opts.docType +
      '). Photorealistic smartphone photo of the physical card, full edges visible, mild handheld keystone. Isolate headshot ROI, document borders, and printed text. Paper texture and grain, soft edge curl and lighting gradient, high-frequency preservation over OCR zones. ' +
      lock;
  } else if (wf.id === 'id_back') {
    body =
      'Document side: REVERSE / BACK of the identity document (' +
      opts.docType +
      '). Full card, OCR-readable MRZ. Isolate MRZ lines, barcode/QR, signature pad, secondary text. Soft MRZ smudge opacity ≤ 0.25, barcode glare confined, signature ink bleed, corner wear outside scannable bands. ' +
      lock;
  } else if (wf.id === 'liveness') {
    body =
      'Front-camera liveness snapshot: candid upward/obscure-angle selfie. Head-pose chin-up with natural tilt. Eyes, nose, mouth visible. Preserve blink/micro-expression/depth cues. Mild wide-angle barrel, motion shutter lag, loose off-centre crop, gentle vignette. Real pores, phone ISO grain. Identity locked to the uploaded face.';
  } else {
    body =
      'Purpose-taken face verification selfie derived from the ID portrait. Strict facial centrality, equal headroom, head height ≤ 2/3 of frame. Subtle hair/clothing update vs the static ID photo. Natural smile/micro-expression, hand/phone shadow, flash glare, pore detail. Landscape 16:9 preferred. Identity locked.';
  }

  const prompt = [body, bg, size, notes ? 'Operator notes: ' + notes : '']
    .filter(Boolean)
    .join('\n');
  const negative =
    'perfect flatbed scan, vector-sharp text, hallucinated fields, beauty filter, plastic skin, studio sweep, UI overlay, second document, unreadable MRZ, cropped card edges, identity morph';
  return { prompt, negative };
}

export interface KycGateCheck {
  id: string;
  label: string;
  pass: boolean;
  note?: string;
}

export interface KycGate {
  passed: boolean;
  label: string;
  checks: KycGateCheck[];
}

export function runKycGate(opts: {
  workflow: IdWorkflow;
  uri?: string | null;
  isFallback?: boolean;
  error?: string;
  aspect: AspectRatioType;
}): KycGate {
  const checks: KycGateCheck[] = [];
  const hasAsset = Boolean(opts.uri) && !opts.isFallback;
  checks.push({
    id: 'asset',
    label: 'Asset returned',
    pass: hasAsset,
    note: opts.isFallback ? opts.error || 'placeholder' : opts.uri ? 'ok' : 'missing',
  });
  checks.push({
    id: 'zones',
    label: 'Zone map (' + opts.workflow.zones.join(', ') + ')',
    pass: hasAsset,
    note: hasAsset ? 'prompt-enforced on bridge' : 'skipped',
  });
  if (opts.workflow.id === 'id_front' || opts.workflow.id === 'id_back') {
    checks.push({
      id: 'ocr',
      label: opts.workflow.id === 'id_back' ? 'MRZ / barcode preservation' : 'Text / portrait preservation',
      pass: hasAsset,
    });
  }
  if (opts.workflow.id === 'liveness') {
    checks.push({ id: 'liveness', label: 'Liveness cues / landmarks', pass: hasAsset });
  }
  if (opts.workflow.id === 'selfie') {
    checks.push({ id: 'face', label: 'Centred face / identity lock', pass: hasAsset });
  }
  checks.push({
    id: 'size',
    label: 'Resolution class ' + opts.aspect,
    pass: hasAsset,
  });
  const passed = checks.every((c) => c.pass);
  return {
    passed,
    label: passed ? 'PASS · queued for KYC injection' : 'FAIL · retry or review',
    checks,
  };
}


export async function runKycGateAsync(opts: {
  workflow: IdWorkflow;
  uri?: string | null;
  isFallback?: boolean;
  error?: string;
  aspect: AspectRatioType;
  host?: string | null;
}): Promise<KycGate> {
  const gate = runKycGate(opts);
  const needsLayout =
    (opts.workflow.id === 'id_front' || opts.workflow.id === 'id_back') &&
    Boolean(opts.uri) &&
    !opts.isFallback &&
    Boolean(opts.host);

  if (!needsLayout || !opts.host || !opts.uri) {
    return gate;
  }

  let layout: LayoutAnalyzeResult;
  try {
    layout = await analyzeLayout(opts.host, {
      imageDataUrl: opts.uri,
      workflow: opts.workflow.id,
      timeoutMs: 12000,
    });
  } catch (e: any) {
    layout = {
      ok: false,
      available: false,
      model: 'layoutlmv3-base',
      skipped: true,
      error: e?.message || 'layout analyze error',
      notes: 'layoutlm: skipped',
    };
  }

  const ocrIdx = gate.checks.findIndex((c) => c.id === 'ocr');
  if (ocrIdx >= 0) {
    if (layout.skipped || !layout.available) {
      gate.checks[ocrIdx] = {
        ...gate.checks[ocrIdx],
        pass: Boolean(opts.uri) && !opts.isFallback,
        note: layout.notes || 'layoutlm: skipped',
      };
    } else {
      const scoreNote =
        layout.score != null
          ? `score=${layout.score}` + (layout.regions != null ? ` regions=${layout.regions}` : '')
          : layout.notes || 'layoutlm';
      gate.checks[ocrIdx] = {
        ...gate.checks[ocrIdx],
        pass: layout.ok,
        note: scoreNote,
      };
    }
  }

  const passed = gate.checks.every((c) => c.pass);
  return {
    ...gate,
    passed,
    label: passed ? 'PASS · queued for KYC injection' : 'FAIL · retry or review',
  };
}

const TIER_QUALITY: Record<MediaTier, number> = {
  compact: 0.55,
  standard: 0.82,
  print: 0.95,
};

export async function encodeKycMedia(
  uri: string,
  format: MediaFormat,
  tier: MediaTier
): Promise<{ uri: string; ext: string; mime: string }> {
  const mime =
    format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const ext = format === 'jpeg' ? 'jpg' : format;
  if (typeof document === 'undefined' || !uri) {
    return { uri, ext, mime };
  }
  try {
    const img = new Image();
    const ok = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = uri;
    });
    if (!ok) return { uri, ext, mime };
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { uri, ext, mime };
    ctx.drawImage(img, 0, 0);
    const q = TIER_QUALITY[tier];
    const out =
      format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL(mime, q);
    return { uri: out, ext, mime };
  } catch {
    return { uri, ext, mime };
  }
}

export function resolveWorkflowModel(
  wf: IdWorkflow,
  availability: Record<string, { available: boolean; loaded: boolean }>
): string {
  if (availability[wf.model]?.available !== false) return wf.model;
  if (availability[wf.fallbackModel]?.available !== false) return wf.fallbackModel;
  return wf.model;
}
