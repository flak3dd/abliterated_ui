export type MatrixPhase =
  | 'IDLE'
  | 'PHASE_1_HEX'
  | 'PHASE_2_HYDRA'
  | 'PHASE_2B_SHIFT'
  | 'PHASE_3_CIPHER'
  | 'PHASE_4_RAIN'
  | 'PHASE_5_FREEZE'
  | 'PHASE_6_SKULL'
  | 'PHASE_7_AMBIENT';

export type MatrixSpectrum = 'green' | 'blue' | 'amber' | 'rose' | 'violet';

export type GlyphSetType = 'katakana' | 'hex' | 'binary' | 'ascii' | 'mixed' | 'telemetry' | 'abliterad';

export interface MatrixColorPalette {
  name: MatrixSpectrum;
  label: string;
  head: string;
  t1: string;
  t2: string;
  t3: string;
  t4: string;
  fade: string;
  skull1: string;
  skull2: string;
  skull3: string;
  skull4: string;
  glow: string;
  bg: string;
}

export interface RainColumn {
  col: number;
  row: number;
  x: number;
  y: number;
  speed: number;
  length: number;
  plane: 1 | 2 | 3;
  chars: string[];
  lastUpdate: number;
  splashCooldown: number;
}

export interface LiveTelemetrySnapshot {
  vramUsedGb: number;
  vramTotalGb: number;
  gpuTemp: number;
  tensorActive: number;
  nvlinkGbps: number;
  recentTokens: string[];
}

export interface MatrixEngineConfig {
  spectrum: MatrixSpectrum;
  speedMultiplier: number;
  glyphSet: GlyphSetType;
  audioEnabled: boolean;
  crtShader: boolean;
  bloomGlow: boolean;
  liveTelemetry: boolean;
  depthParallax: boolean;
  interactiveTouch: boolean;
}

export const MATRIX_PALETTES: Record<MatrixSpectrum, MatrixColorPalette> = {
  green: {
    name: 'green',
    label: 'Phosphor Green',
    head: '#E6FFE6',
    t1: '#00FF41',
    t2: '#00D136',
    t3: '#008F24',
    t4: '#004712',
    fade: 'rgba(4, 9, 5, 0.14)',
    skull1: '#004712',
    skull2: '#008F24',
    skull3: '#00D136',
    skull4: '#00FF41',
    glow: 'rgba(0, 255, 65, 0.45)',
    bg: '#040905',
  },
  blue: {
    name: 'blue',
    label: 'Electric Blue',
    head: '#D9FBFF',
    t1: '#00E5FF',
    t2: '#00AFD7',
    t3: '#005FFF',
    t4: '#0A5F87',
    fade: 'rgba(2, 6, 16, 0.14)',
    skull1: '#0A4A66',
    skull2: '#1E8FC4',
    skull3: '#63D6F7',
    skull4: '#00FFFF',
    glow: 'rgba(0, 229, 255, 0.45)',
    bg: '#020610',
  },
  amber: {
    name: 'amber',
    label: 'Blackwell Gold',
    head: '#FFFBEB',
    t1: '#F59E0B',
    t2: '#D97706',
    t3: '#B45309',
    t4: '#78350F',
    fade: 'rgba(15, 10, 3, 0.14)',
    skull1: '#78350F',
    skull2: '#B45309',
    skull3: '#F59E0B',
    skull4: '#FDE68A',
    glow: 'rgba(245, 158, 11, 0.45)',
    bg: '#0A0702',
  },
  rose: {
    name: 'rose',
    label: 'Toxic Rose',
    head: '#FFF1F2',
    t1: '#F43F5E',
    t2: '#E11D48',
    t3: '#9F1239',
    t4: '#4C0519',
    fade: 'rgba(16, 3, 7, 0.14)',
    skull1: '#4C0519',
    skull2: '#9F1239',
    skull3: '#E11D48',
    skull4: '#FB7185',
    glow: 'rgba(244, 63, 94, 0.45)',
    bg: '#0A0204',
  },
  violet: {
    name: 'violet',
    label: 'Cyber Violet',
    head: '#FAF5FF',
    t1: '#A855F7',
    t2: '#9333EA',
    t3: '#6B21A8',
    t4: '#3B0764',
    fade: 'rgba(12, 3, 20, 0.14)',
    skull1: '#3B0764',
    skull2: '#6B21A8',
    skull3: '#A855F7',
    skull4: '#E9D5FF',
    glow: 'rgba(168, 85, 247, 0.45)',
    bg: '#07020B',
  },
};

export const GLYPH_POOLS: Record<GlyphSetType, string[]> = {
  katakana: [
    'ｦ', 'ｱ', 'ｳ', 'ｴ', 'ｵ', 'ｶ', 'ｷ', 'ｹ', 'ｺ', 'ｻ', 'ｼ', 'ｽ', 'ｾ', 'ｿ',
    'ﾀ', 'ﾂ', 'ﾃ', 'ﾅ', 'ﾆ', 'ﾇ', 'ﾈ', 'ﾊ', 'ﾋ', 'ﾎ', 'ﾏ', 'ﾐ', 'ﾑ', 'ﾒ',
    'ﾓ', 'ﾔ', 'ﾕ', 'ﾗ', 'ﾘ', 'ﾜ', 'ﾝ', '0', '1', '2', '5', '7', '8', '9',
    'Z', 'X', 'V', 'K', 'M',
  ],
  hex: [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'A', 'B', 'C', 'D', 'E', 'F', 'x', '0x', 'FF', '80', 'C0', '10', 'GB',
  ],
  binary: ['0', '1', '0', '1', '0', '0', '1', '1'],
  abliterad: ['A', 'B', 'L', 'I', 'T', 'E', 'R', 'D'],
  ascii: [
    '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+',
    '[', ']', '{', '}', ';', ':', '<', '>', '/', '?', '~', '|', '\\',
  ],
  mixed: [
    'ｦ', 'ｱ', 'ｳ', 'ｶ', 'ｷ', 'ｹ', 'ｺ', 'ｻ', 'ｼ', 'ｽ', '0', '1', '2', '3',
    'A', 'F', 'X', 'Z', '@', '#', '%', '*', '&', '?', 'Ω', 'λ', '⚡', '✦',
  ],
  telemetry: [
    'GB10', 'VRAM', 'NVL5', '8000', 'FP8', '65K', 'DGX', '1.2T', '41C',
    '85W', 'QWEN', 'ABL', '0x7F', '0x8A', 'SYNC', 'CUDA', 'TENS',
  ],
};
