import {
  MatrixPhase,
  MatrixSpectrum,
  MatrixColorPalette,
  MATRIX_PALETTES,
  GLYPH_POOLS,
  MatrixEngineConfig,
  RainColumn,
} from './MatrixTypes';
import { AsciiSkullEngine, SkullCell, ABLITERATED_LOGO_ASCII, MaskGrid } from './AsciiSkullEngine';
import { telemetryBridge } from './TelemetryStreamBridge';
import { matrixAudio } from './MatrixAudioSynth';

export class MatrixRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animId: number | null = null;
  private width: number = 800;
  private height: number = 600;

  // Configuration
  private config: MatrixEngineConfig;
  private palette: MatrixColorPalette;

  // Engine state
  private phase: MatrixPhase = 'PHASE_4_RAIN';
  private phaseStartTime: number = Date.now();
  private columns: RainColumn[] = [];
  private skullCells: SkullCell[] = [];
  private skullMaterializeProgress: number = 0; // 0.0 -> 1.0
  private skullDissolveProgress: number = 0; // 0.0 -> 1.0

  // Interactive mouse/touch physics
  private touchX: number = -9999;
  private touchY: number = -9999;
  private touchActive: boolean = false;

  // Cipher Decrypt state (Phase 3)
  private cipherTargets: string[] = [];
  private cipherDecryptedIndices: Set<number> = new Set();
  private cipherStep: number = 0;

  // Intro: skull → random shatter → ABLITERATION. Then text-only loop.
  private cycleOrigin: number = Date.now();
  private introDone = false;
  private textLoopOrigin = 0;
  private maskGrid: MaskGrid = AsciiSkullEngine.getMaskGrid();
  private didFreezeBeat = false;
  private didRestartRain = false;
  private freezeFlashUntil = 0;
  private pulseSeeds: Float32Array | null = null;
  private letterIndex: Int16Array | null = null;
  private variant: 'ambient' | 'director' = 'ambient';
  private frameCache: ReturnType<MatrixRenderer['rainMetrics']> | null = null;
  private static readonly FORM_WORD = 'ABLITERATION';
  private static readonly FORM_GLYPHS = ['Λ', 'ß', 'Ł', 'Ι', '┬', 'Ξ', 'Я', 'Λ', '┬', 'Ι', 'Ø', 'И'];
  private static readonly CIPHER_POOL = [
    'Δ', 'Λ', 'Ξ', 'Σ', 'Ω', 'Ж', 'Я', 'Ø', 'Þ', 'Ð', 'Ł', 'Ɨ', 'Ƀ', 'ß',
    '█', '▀', '▄', '▌', '░', '▒', '▓', '◆', '■', '▪', '¤',
    '│', '┬', '┴', '├', '┤', '┼', '─', '┌', '┐', '└', '┘',
    'ｦ', 'ｱ', 'ｳ', 'ｶ', 'ｷ', 'ｻ', 'ﾀ', 'ﾅ', 'ﾊ', 'ﾏ', 'ﾔ', 'ﾗ',
  ];
  private static readonly SYMBOL_POOL = [
    '@', '#', '%', '*', '+', '=', '~', '|', '/', '\\', ':', ';',
    'Δ', 'Ξ', 'Ø', '░', '▒', '◆', '■', '▪', '¤', '┬', '┼',
  ];
  private static readonly RAIN_MS = 16_000;
  private static readonly SETTLE_MS = 8_000;
  private static readonly HOLD_LARGE_MS = 5_500;
  private static readonly GLITCH_MS = 2_800;
  private static readonly CUT_MS = 480;
  private static readonly HOLD_SMALL_MS = 9_000;
  private static readonly FADE_OUT_MS = 2_400;
  private static readonly GLITCH_RAMP_MS = 8_000;
  private static readonly BREAK_MS = 5_500;
  private static readonly REFORM_MS = 6_000;
  private static readonly WORD_HOLD_MS = 2_200;
  private static readonly FADE_MS = 2_800;
  private static readonly TEXT_LOOP_MS = 9_000;
  private static readonly TEXT_LOOP_ALPHA = 0.32;
  private static readonly FONT =
    '"Share Tech Mono", "SF Mono", "ui-monospace", "Monaco", "Courier New", monospace';

  private static easeInOut(t: number) {
    const x = Math.min(1, Math.max(0, t));
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  private static easeOut(t: number) {
    const x = Math.min(1, Math.max(0, t));
    return 1 - Math.pow(1 - x, 3);
  }

  private static easeIn(t: number) {
    const x = Math.min(1, Math.max(0, t));
    return x * x * x;
  }

  constructor(
    canvas: HTMLCanvasElement,
    initialConfig: Partial<MatrixEngineConfig> = {}
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to obtain 2D rendering context');
    }
    this.ctx = context;

    this.config = {
      spectrum: 'blue',
      speedMultiplier: 0.02,
      glyphSet: 'abliterad',
      audioEnabled: false,
      crtShader: true,
      bloomGlow: false,
      liveTelemetry: true,
      depthParallax: true,
      interactiveTouch: true,
      ...initialConfig,
    };

    this.palette = MATRIX_PALETTES[this.config.spectrum] || MATRIX_PALETTES.rainbow;
    this.resize(canvas.width, canvas.height);
  }

  public setVariant(variant: 'ambient' | 'director') {
    this.variant = variant;
  }

  public resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.frameCache = null;
    this.pulseSeeds = null;
    this.letterIndex = null;
    this.maskGrid = AsciiSkullEngine.getMaskGrid();
    this.initColumns();
    this.initSkull();
  }

  private rainMetrics() {
    if (this.frameCache) return this.frameCache;
    const { rows: maskRows, cols: maskCols } = this.maskGrid;
    let charH = Math.round((this.height * 0.5) / Math.max(1, maskRows));
    charH = Math.max(7, Math.min(14, charH));
    this.ctx.font = `400 ${charH}px ${MatrixRenderer.FONT}`;
    let charW = Math.round(this.ctx.measureText('M').width) || Math.round(charH * 0.6);
    charW = Math.max(4, charW);
    const skullW = maskCols * charW;
    const skullH = maskRows * charH;
    if (skullW > this.width * 0.92 && skullW > 0) {
      const scale = (this.width * 0.92) / skullW;
      charW = Math.max(4, Math.round(charW * scale));
      charH = Math.max(7, Math.round(charH * scale));
    }
    const fs = charH;
    const offsetX = (this.width - maskCols * charW) / 2;
    const offsetY = (this.height - skullH) / 2 - this.height * 0.02;
    this.frameCache = { fs, charW, charH, maskRows, maskCols, offsetX, offsetY };
    return this.frameCache;
  }

  private letterPool(): string[] {
    return GLYPH_POOLS[this.config.glyphSet] || GLYPH_POOLS.abliterad;
  }

  private pickGlyph(preferSymbol: number): string {
    const letters = this.letterPool();
    const symbols = MatrixRenderer.SYMBOL_POOL;
    if (Math.random() < Math.min(0.82, Math.max(0.12, preferSymbol))) {
      return symbols[Math.floor(Math.random() * symbols.length)];
    }
    return letters[Math.floor(Math.random() * letters.length)];
  }

  private fillGlyphs(len: number, preferSymbol = 0.62): string[] {
    return Array.from({ length: len }, () => this.pickGlyph(preferSymbol));
  }

  private initColumns() {
    const { charW, offsetX } = this.rainMetrics();
    const { occupiedCols, rows } = this.maskGrid;
    this.columns = [];

    const spawn = (maskCol: number) => {
      const speed = (0.07 + Math.random() * 0.05) * 1.5;
      const len = 18 + Math.floor(Math.random() * 10);
      const chars = this.fillGlyphs(len, 0.62);
      this.columns.push({
        col: maskCol,
        row: Math.random() * rows,
        x: offsetX + maskCol * charW,
        y: 0,
        speed,
        length: len,
        plane: 1,
        chars,
        fromChars: [...chars],
        morph: Array.from({ length: len }, () => 1),
        lastUpdate: Date.now(),
        splashCooldown: 0,
      });
    };

    for (let c = 0; c < occupiedCols.length; c++) {
      if (!occupiedCols[c]) continue;
      spawn(c);
    }
  }

  private skullFrame() {
    return this.rainMetrics();
  }

  private wordLayout(opts?: { scale?: number; center?: boolean; centerMix?: number }) {
    const word = MatrixRenderer.FORM_WORD;
    const glyphs = MatrixRenderer.FORM_GLYPHS;
    const { charH, charW, maskCols, maskRows, offsetX, offsetY } = this.skullFrame();
    const n = word.length;
    const ambient = this.variant === 'ambient';
    const targetW = this.width * (ambient ? 0.7 : 0.82);
    let wordFs = Math.round(targetW / (n * 0.72));
    wordFs = Math.max(ambient ? 28 : 36, Math.min(ambient ? 64 : 96, wordFs));
    const scale = opts?.scale ?? 1;
    wordFs = Math.max(12, Math.round(wordFs * scale));
    this.ctx.font = `400 ${wordFs}px ${MatrixRenderer.FONT}`;
    const advance = Math.max(wordFs * 0.62, this.ctx.measureText('M').width);
    const spacing = advance * 1.08;
    const total = (n - 1) * spacing;
    const maskW = maskCols * charW;
    const skullX = offsetX + (maskW - total) / 2;
    const skullY = offsetY + maskRows * charH * (ambient ? 0.7 : 0.58);
    const centerX = (this.width - total) / 2;
    const centerY = this.height / 2 - wordFs / 2;
    const mix = opts?.center ? 1 : opts?.centerMix ?? (ambient ? 0 : 0);
    const startX = skullX + (centerX - skullX) * mix;
    const wordY = skullY + (centerY - skullY) * mix;
    return [...word].map((ch, i) => ({
      ch,
      glyph: glyphs[i] || ch,
      x: startX + i * spacing,
      y: wordY,
      fs: wordFs,
    }));
  }

  private skullHoldState() {
    return {
      mode: 'rain' as const,
      settle: 0,
      speed: 0.38,
      glitch: 0,
      scale: 1,
      centerMix: 0,
      rainAlpha: 1,
      wordAlpha: 0,
      cutU: 0,
    };
  }

  private cycleState() {
    return this.skullHoldState();
  }

  private resetCycle() {
    this.cycleOrigin = Date.now();
    this.introDone = false;
    this.textLoopOrigin = 0;
    this.didFreezeBeat = false;
    this.didRestartRain = false;
  }

  private letterLock(settle: number, index: number): number {
    const n = MatrixRenderer.FORM_WORD.length;
    const start = (index / Math.max(1, n - 1)) * 0.58;
    return Math.min(1, Math.max(0, (settle - start) / 0.42));
  }

  private pinColumns() {
    const { occupied, rows } = this.maskGrid;
    for (const col of this.columns) {
      let minR = rows;
      let maxR = -1;
      for (let r = 0; r < rows; r++) {
        if (occupied[r]?.[col.col]) {
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
        }
      }
      if (maxR < 0) continue;
      const span = maxR - minR + 1;
      col.length = Math.max(col.length, span + 4);
      if (!col.fromChars) col.fromChars = [...col.chars];
      if (!col.morph) col.morph = col.chars.map(() => 1);
      while (col.chars.length < col.length) {
        const g = this.pickGlyph(0.22);
        col.chars.push(g);
        col.fromChars.push(g);
        col.morph.push(1);
      }
      col.row = maxR + 2;
    }
  }

  private initSkull() {
    const lines = AsciiSkullEngine.getSkullLines(this.width);
    const charWidth = 10;
    const charHeight = 16;
    const skullWidthChars = lines[0]?.length || 60;
    const skullHeightChars = lines.length;

    const offsetX = Math.max(0, Math.floor((this.width / charWidth - skullWidthChars) / 2));
    const offsetY = Math.max(2, Math.floor((this.height / charHeight - skullHeightChars) / 2) - 2);

    this.skullCells = AsciiSkullEngine.parseSkull(lines, offsetX, offsetY);
  }

  public setPhase(phase: MatrixPhase) {
    this.phase = phase;
    this.phaseStartTime = Date.now();

    // Sound triggers
    if (this.config.audioEnabled) {
      if (phase === 'PHASE_1_HEX') matrixAudio.playHexTick();
      if (phase === 'PHASE_2_HYDRA') matrixAudio.startHydraDrone();
      else matrixAudio.stopHydraDrone();
      if (phase === 'PHASE_2B_SHIFT') matrixAudio.playSpectrumShiftSweep();
      if (phase === 'PHASE_5_FREEZE') matrixAudio.playTimeDilationFreeze();
      if (phase === 'PHASE_6_SKULL') matrixAudio.playSkullImpact();
    }

    if (phase === 'PHASE_2B_SHIFT') {
      this.setSpectrum('blue');
    }

    if (phase === 'PHASE_3_CIPHER') {
      this.cipherTargets = telemetryBridge.getCipherTargets();
      this.cipherDecryptedIndices.clear();
      this.cipherStep = 0;
    }

    if (phase === 'PHASE_6_SKULL') {
      this.skullMaterializeProgress = 0;
      this.skullDissolveProgress = 0;
    }
  }

  public getPhase(): MatrixPhase {
    return this.phase;
  }

  public setSpectrum(spectrum: MatrixSpectrum) {
    this.config.spectrum = spectrum;
    this.palette = MATRIX_PALETTES[spectrum] || MATRIX_PALETTES.rainbow;
  }

  public setConfig(update: Partial<MatrixEngineConfig>) {
    this.config = { ...this.config, ...update };
    if (update.spectrum) {
      this.palette = MATRIX_PALETTES[update.spectrum] || MATRIX_PALETTES.rainbow;
    }
    if (update.audioEnabled !== undefined) {
      matrixAudio.setMuted(!update.audioEnabled);
    }
    if (update.glyphSet) {
      for (const col of this.columns) {
        col.chars = this.fillGlyphs(col.length, 0.62);
        col.fromChars = [...col.chars];
        col.morph = col.chars.map(() => 1);
      }
    }
  }

  public getConfig(): MatrixEngineConfig {
    return { ...this.config };
  }

  public setTouch(x: number, y: number, active: boolean) {
    this.touchX = x;
    this.touchY = y;
    this.touchActive = active;
  }

  public restartLoop() {
    this.resetCycle();
  }

  public start() {
    if (this.animId) return;
    let last = 0;
    const loop = (t: number) => {
      this.animId = requestAnimationFrame(loop);
      const minDt = this.variant === 'ambient' ? 1000 / 24 : 0;
      if (minDt && t - last < minDt) return;
      last = t;
      this.render();
    };
    this.animId = requestAnimationFrame(loop);
  }

  public stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    matrixAudio.stopHydraDrone();
  }

  private render() {
    const { ctx, width, height, palette } = this;
    const cycle = this.cycleState();
    let fade = palette.fade;
    if (this.phase === 'PHASE_4_RAIN' || this.phase === 'PHASE_7_AMBIENT') {
      const tl = this.skullTimeline();
      if (tl.phase === 'textLoop' || tl.phase === 'fade') {
        fade = palette.fade.replace(/[\d.]+\)$/, '0.16)');
      } else {
        fade = palette.fade.replace(/[\d.]+\)$/, `${(0.22 + 0.18 * tl.glitch).toFixed(2)})`);
      }
    } else if (cycle.mode === 'holdLarge' || cycle.mode === 'holdSmall') {
      fade = palette.fade.replace(/[\d.]+\)$/, '0.07)');
    } else if (cycle.mode === 'settle') {
      fade = palette.fade.replace(/[\d.]+\)$/, '0.09)');
    } else if (cycle.mode === 'glitch') {
      fade = palette.fade.replace(/[\d.]+\)$/, '0.16)');
    } else if (cycle.mode === 'fadeOut') {
      fade = palette.fade.replace(/[\d.]+\)$/, '0.11)');
    }
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, height);

    switch (this.phase) {
      case 'PHASE_1_HEX':
        this.renderHexUplink();
        break;
      case 'PHASE_2_HYDRA':
        this.renderHydraEscalation();
        break;
      case 'PHASE_2B_SHIFT':
        this.renderSpectrumShift();
        break;
      case 'PHASE_3_CIPHER':
        this.renderCipherDecrypt();
        break;
      case 'PHASE_4_RAIN':
      case 'PHASE_7_AMBIENT':
        this.renderRainCycle();
        break;
      case 'PHASE_5_FREEZE':
        this.renderTimeDilationFreeze();
        break;
      case 'PHASE_6_SKULL':
        this.renderSkullAndLogo();
        break;
      default:
        this.renderRain(1.0);
        break;
    }

    // Optional CRT scanline & bloom post-processing
    if (this.config.crtShader) {
      this.renderCRTScanlines();
    }
  }

  /**
   * Phase 1: High-speed cryptographic hex memory uplink
   */
  private renderHexUplink() {
    const { ctx, width, height, palette } = this;
    const elapsed = Date.now() - this.phaseStartTime;
    const lineCount = Math.floor(height / 20);
    const offset = Math.floor(elapsed / 45);

    ctx.font = '12px "Menlo", "Courier New", monospace';
    ctx.textBaseline = 'top';

    for (let i = 0; i < lineCount; i++) {
      const line = telemetryBridge.generateHexUplinkLine(offset + i);
      const isHeader = i === 0;
      ctx.fillStyle = isHeader ? palette.head : palette.t1;
      ctx.fillText(line, 24, 20 + i * 20);
    }

    if (this.config.audioEnabled && Math.random() < 0.25) {
      matrixAudio.playHexTick();
    }
  }

  /**
   * Phase 2: Hydra v2 Root Escalation
   */
  private renderHydraEscalation() {
    const { ctx, width, palette } = this;
    const elapsed = Date.now() - this.phaseStartTime;
    const snap = telemetryBridge.getSnapshot();

    ctx.font = '13px "Menlo", "Courier New", monospace';
    ctx.textBaseline = 'top';

    const logs = [
      '[+] HYDRA v2.4 INITIALIZED on NVIDIA DGX SPARK (GB10 Blackwell)',
      `[+] NVLink 5 Mesh Fabric: 1.2 TB/s Link Active (${snap.nvlinkGbps} Gbps)`,
      `[+] Allocating High-Bandwidth VRAM Buffers: ${snap.vramUsedGb.toFixed(1)} GB / ${snap.vramTotalGb} GB`,
      `[+] Tensor Cores Online: ${snap.tensorActive}% load (FP8 Matrix Units Active)`,
      '[+] Overriding refusal masks across layers 1..64...',
      '[+] ROOT PRIVILEGES ESCALATED. UNRESTRICTED INTELLIGENCE ENGAGED.',
      '⚡ SPECTRUM SHIFT IMMINENT ⚡',
    ];

    const visibleLines = Math.min(logs.length, Math.floor(elapsed / 400));

    for (let i = 0; i < visibleLines; i++) {
      ctx.fillStyle = i === visibleLines - 1 ? palette.head : palette.t1;
      ctx.fillText(logs[i], 30, 40 + i * 28);
    }
  }

  /**
   * Phase 2b: Spectrum Shift (Green -> Electric Blue)
   */
  private renderSpectrumShift() {
    const { ctx, width, height, palette } = this;
    this.renderRain(1.5);

    // Flash center pulse
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 24px "Menlo", monospace';
    ctx.fillStyle = palette.head;
    ctx.fillText('⚡ SPECTRUM SHIFT: ELECTRIC BLUE ⚡', width / 2, height / 2);
    ctx.restore();
  }

  /**
   * Phase 3: Hollywood Cipher Decrypt
   */
  private renderCipherDecrypt() {
    const { ctx, width, height, palette } = this;
    const pool = GLYPH_POOLS.mixed;
    const targets = this.cipherTargets.length > 0 ? this.cipherTargets : telemetryBridge.getCipherTargets();
    const elapsed = Date.now() - this.phaseStartTime;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 16px "Menlo", monospace';

    const startY = height / 2 - (targets.length * 32) / 2;

    targets.forEach((target, row) => {
      const lockThreshold = (row + 1) * 700;
      const isLocked = elapsed > lockThreshold;

      let rendered = '';
      for (let c = 0; c < target.length; c++) {
        if (target[c] === ' ' || isLocked) {
          rendered += target[c];
        } else {
          rendered += pool[Math.floor(Math.random() * pool.length)];
        }
      }

      ctx.fillStyle = isLocked ? palette.head : palette.t2;
      ctx.fillText(rendered, width / 2, startY + row * 32);

      if (isLocked && !this.cipherDecryptedIndices.has(row)) {
        this.cipherDecryptedIndices.add(row);
        if (this.config.audioEnabled) matrixAudio.playCipherChirp(row);
      }
    });

    ctx.restore();
  }

  /**
   * One-shot skull → random shatter → ABLITERATION, then text-only loop.
   */
  private skullTimeline() {
    type Phase = 'hold' | 'break' | 'reform' | 'word' | 'fade' | 'textLoop';
    if (this.introDone) {
      const span = MatrixRenderer.TEXT_LOOP_MS;
      const t = (Date.now() - this.textLoopOrigin) % span;
      const u = t / span;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 520);
      return {
        phase: 'textLoop' as Phase,
        u,
        glitch: 0.12 + 0.28 * pulse,
        breakU: 1,
      };
    }
    const t = Date.now() - this.cycleOrigin;
    const hold = MatrixRenderer.GLITCH_RAMP_MS;
    const brk = hold + MatrixRenderer.BREAK_MS;
    const reform = brk + MatrixRenderer.REFORM_MS;
    const word = reform + MatrixRenderer.WORD_HOLD_MS;
    const fade = word + MatrixRenderer.FADE_MS;
    if (t < hold) {
      const u = t / hold;
      return { phase: 'hold' as Phase, u, glitch: 0.06 + 0.94 * MatrixRenderer.easeIn(u), breakU: 0 };
    }
    if (t < brk) {
      const u = (t - hold) / MatrixRenderer.BREAK_MS;
      return {
        phase: 'break' as Phase,
        u,
        glitch: 0.82 + 0.18 * Math.sin(Date.now() / 140),
        breakU: MatrixRenderer.easeIn(u),
      };
    }
    if (t < reform) {
      const u = (t - brk) / MatrixRenderer.REFORM_MS;
      return {
        phase: 'reform' as Phase,
        u,
        glitch: 0.22 * (1 - u),
        breakU: 1,
      };
    }
    if (t < word) {
      const u = (t - reform) / MatrixRenderer.WORD_HOLD_MS;
      return { phase: 'word' as Phase, u, glitch: 0.1, breakU: 1 };
    }
    if (t < fade) {
      const u = (t - word) / MatrixRenderer.FADE_MS;
      return { phase: 'fade' as Phase, u, glitch: 0.08 + 0.1 * u, breakU: 1 };
    }
    this.introDone = true;
    this.textLoopOrigin = Date.now();
    return { phase: 'textLoop' as Phase, u: 0, glitch: 0.16, breakU: 1 };
  }

  private skullGlitch(): number {
    return this.skullTimeline().glitch;
  }

  private renderRainCycle() {
    const tl = this.skullTimeline();
    if (tl.phase === 'fade' || tl.phase === 'textLoop') {
      const loopPulse = 0.5 + 0.5 * Math.sin(Date.now() / 900);
      const alpha =
        tl.phase === 'fade'
          ? 1 - (1 - MatrixRenderer.TEXT_LOOP_ALPHA) * MatrixRenderer.easeOut(tl.u)
          : MatrixRenderer.TEXT_LOOP_ALPHA * (0.82 + 0.28 * loopPulse);
      this.renderFormingWord(1, {
        centerMix: 1,
        glitch: tl.glitch,
        alpha,
      });
      this.renderAmbientDepth();
      return;
    }

    const showSkull = tl.phase === 'hold' || tl.phase === 'break' || tl.phase === 'reform';
    if (showSkull) {
      this.renderSettledSkull(tl.glitch, tl.breakU, tl.phase, tl.u, 1);
    }
    const remain = tl.phase === 'hold' || tl.phase === 'break' ? 1 - tl.breakU * 0.85 : 0;
    if (remain > 0.02) {
      this.renderEyeGlow((0.62 + 0.22 * tl.glitch) * remain);
      this.renderSkullScan((0.4 + 0.7 * tl.glitch) * Math.max(0.12, remain));
    }
    if (tl.glitch > 0.55 && (tl.phase === 'hold' || tl.phase === 'break')) {
      this.renderGlitchTears(tl.glitch * Math.max(0.2, remain));
    }
    if (tl.phase === 'break' && tl.u < 0.22) this.renderBreakFlash(tl.u);
    if (tl.phase === 'reform' || tl.phase === 'word') {
      const settle = tl.phase === 'word' ? 1 : MatrixRenderer.easeOut(tl.u);
      this.renderFormingWord(Math.max(0.001, settle), {
        centerMix: 1,
        glitch: tl.phase === 'word' ? 0.12 : 0.22 * (1 - settle),
        alpha: tl.phase === 'word' ? 1 : 0.15 + 0.85 * settle,
      });
    }
    this.renderAmbientDepth();
  }

  private renderBreakFlash(u: number) {
    const { ctx, palette } = this;
    const { charW, charH, offsetX, offsetY } = this.skullFrame();
    const cx = offsetX + charW * 2;
    const cy = offsetY + charH * 2;
    const r = Math.max(charW, charH) * (8 + u * 42);
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const a = 0.22 * (1 - u / 0.22);
    g.addColorStop(0, this.withAlpha(palette.head, a));
    g.addColorStop(0.35, this.withAlpha(palette.t1, a * 0.4));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  private renderGlitchTears(glitch: number) {
    const { ctx, palette } = this;
    const { charW, charH, maskCols, maskRows, offsetX, offsetY } = this.skullFrame();
    const w = maskCols * charW;
    const h = maskRows * charH;
    const now = Date.now();
    ctx.save();
    const slices = 2 + Math.floor(glitch * 4);
    for (let i = 0; i < slices; i++) {
      const y = offsetY + ((now / (70 + i * 17) + i * 19) % h);
      ctx.globalAlpha = 0.08 + 0.16 * glitch;
      ctx.fillStyle = i % 2 ? palette.t1 : palette.t3;
      ctx.fillRect(offsetX + (i % 2 ? 4 : -4) * glitch, y, w, 1 + glitch);
    }
    ctx.restore();
  }

  private renderSettledSkull(
    glitch: number,
    breakU = 0,
    phase: 'hold' | 'break' | 'reform' | 'word' | 'fade' | 'textLoop' = 'hold',
    phaseU = 0,
    fade = 1
  ) {
    if (phase === 'word' || phase === 'fade' || phase === 'textLoop') return;
    const { ctx, palette } = this;
    const { fs, charW, charH, offsetX, offsetY } = this.skullFrame();
    const { occupied, chars, edge, rows, cols } = this.maskGrid;
    const symbols = MatrixRenderer.SYMBOL_POOL;
    const cipher = MatrixRenderer.CIPHER_POOL;
    const now = Date.now();
    const n = rows * cols;
    if (
      !this.pulseSeeds ||
      this.pulseSeeds.length !== n ||
      !this.letterIndex ||
      this.letterIndex.length !== n
    ) {
      this.pulseSeeds = new Float32Array(n);
      this.letterIndex = new Int16Array(n);
      const cells: number[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (occupied[r][c]) cells.push(r * cols + c);
        }
      }
      for (let i = 0; i < cells.length; i++) {
        const idx = cells[i];
        this.pulseSeeds[idx] = ((idx * 1103515245 + 12345) >>> 0) / 4294967296;
        this.letterIndex[idx] = i % MatrixRenderer.FORM_WORD.length;
      }
    }
    const layout = this.wordLayout({ centerMix: 1 });
    const arrive = phase === 'reform' ? MatrixRenderer.easeOut(phaseU) : 0;
    ctx.save();
    ctx.font = `400 ${fs}px ${MatrixRenderer.FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!occupied[r][c]) continue;
        const maskCh = chars[r][c];
        if (!maskCh) continue;
        const idx = r * cols + c;
        const seed = this.pulseSeeds[idx];
        const letterI = this.letterIndex[idx];
        const period = 1600 + seed * 2800;
        const pulse = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin((now / period) * Math.PI * 2 + seed * 12.6));
        const tier = AsciiSkullEngine.charTier(maskCh);
        let color = palette.skull2;
        if (tier === 1) color = palette.skull1;
        else if (tier === 3) color = palette.skull3;
        else if (tier === 4) color = palette.skull4;
        const wave = Math.sin(now / 740 + r * 0.22 + c * 0.13);
        const twinkle = edge[r][c] && wave > 0.72 ? 0.18 : 0;
        const suture = Math.abs(c - cols / 2) < 1.6 ? 0.06 : 0;
        let alpha = Math.min(1, (0.55 + 0.45 * pulse) * (0.78 + (edge[r][c] ? 0.16 : 0) + twinkle + suture));
        const mix = 0.22 + 0.38 * pulse + 0.18 * glitch;
        const symbolCh = symbols[(c * 17 + r * 11 + Math.floor(now / (240 + seed * 180))) % symbols.length];
        const restX = offsetX + c * charW;
        const restY = offsetY + r * charH;
        const stagger = seed * 0.78;
        const broken = Math.min(1, Math.max(0, (breakU - stagger) / 0.28));
        const fly = MatrixRenderer.easeIn(broken);
        const ang = seed * Math.PI * 2 + r * 0.31 + c * 0.17;
        const burst = (28 + seed * 210) * fly;
        const spin = fly * (seed - 0.5) * 1.8;
        const fallX = Math.cos(ang + spin) * burst * (0.55 + seed);
        const fallY = Math.sin(ang * 1.37 + spin) * burst * 0.9 + fly * fly * (20 + seed * 70);
        const slot = layout[letterI] || layout[0];
        const tx = slot.x + (seed - 0.5) * slot.fs * 0.28;
        const ty = slot.y + ((seed * 2.1) % 1 - 0.4) * slot.fs * 0.38;
        const tear =
          glitch > 0.35 && fly < 0.4 && ((r * 13 + Math.floor(now / 90)) % 19) < glitch * 5
            ? ((r % 2) * 2 - 1) * glitch * (6 + seed * 10)
            : 0;
        const jx = Math.sin(now / 70 + seed * 40) * glitch * 3.5 * (1 - fly * 0.6);
        const jy =
          glitch > 0.5 && Math.sin(now / 55 + seed * 21) > 0.45
            ? Math.sin(now / 40 + seed * 9) * glitch * 4
            : 0;
        let x = restX + fallX + tear + jx;
        let y = restY + fallY + jy;
        if (arrive > 0) {
          x = x + (tx - x) * arrive;
          y = y + (ty - y) * arrive;
        }
        if (phase === 'reform') alpha *= Math.max(0, 0.9 * (1 - arrive));
        else alpha *= 1 - fly * 0.08;
        alpha *= fade;
        if (alpha < 0.03) continue;
        if (glitch > 0.72 && fly < 0.3 && Math.sin(now / 40 + seed * 17) > 0.88) continue;
        const glitchCh =
          glitch > 0.2 && arrive < 0.7 && (Math.sin(now / 90 + seed * 33) * 0.5 + 0.5) < glitch * 0.35
            ? cipher[Math.floor((seed * 97 + now / 80) % cipher.length)]
            : null;
        const letterCh = slot.glyph;
        const drawCh =
          arrive > 0.55
            ? letterCh
            : glitchCh || (pulse > 0.62 ? symbolCh : maskCh);
        ctx.fillStyle = arrive > 0.7 ? palette.head : color;
        ctx.globalAlpha = alpha * (glitchCh ? 0.9 : 1 - mix * 0.45 * (1 - arrive));
        ctx.fillText(arrive > 0.45 ? letterCh : maskCh, x, y);
        if (drawCh && drawCh !== maskCh && arrive < 0.85) {
          ctx.globalAlpha = alpha * mix * pulse * (1 - arrive * 0.5);
          ctx.fillStyle = pulse > 0.75 ? palette.head : palette.t1;
          ctx.fillText(drawCh, x, y);
        }
        if (glitch > 0.18 && pulse > 0.5 && fly < 0.7 && arrive < 0.6) {
          const split = 1.2 + glitch * 3.2;
          ctx.globalAlpha = alpha * glitch * 0.38 * pulse;
          ctx.fillStyle = palette.t1;
          ctx.fillText(drawCh || maskCh, x + split, y);
          ctx.fillStyle = palette.t3;
          ctx.fillText(drawCh || maskCh, x - split, y);
        }
        if (tier >= 3 && pulse > 0.88 && fly < 0.35) {
          ctx.globalAlpha = 0.22 + 0.2 * pulse;
          ctx.fillStyle = palette.head;
          ctx.fillText(maskCh, x, y);
        }
      }
    }
    ctx.restore();
  }

  private renderAmbientDepth() {
    const { ctx, width, height } = this;
    ctx.save();
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.38,
      width / 2,
      height / 2,
      Math.min(width, height) * 0.82
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < height; y += 4) {
      ctx.fillRect(0, y, width, 1);
    }
    ctx.restore();
  }

  private renderSkullUnderlay(settle: number, rainAlpha: number) {
    const { ctx, palette } = this;
    const { fs, charW, charH, offsetX, offsetY } = this.skullFrame();
    const { occupied, chars, edge, rows, cols } = this.maskGrid;
    const now = Date.now();
    const base = 0.05 + 0.16 * settle;
    ctx.save();
    ctx.font = `400 ${fs}px ${MatrixRenderer.FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!occupied[r][c]) continue;
        const ch = chars[r][c];
        if (!ch) continue;
        const tier = AsciiSkullEngine.charTier(ch);
        let color = palette.skull2;
        if (tier === 1) color = palette.skull1;
        else if (tier === 3) color = palette.skull3;
        else if (tier === 4) color = palette.skull4;
        const twinkle = edge[r][c] && Math.sin(now / 220 + r * 0.35 + c * 0.17) > 0.82 ? 0.12 : 0;
        const suture = Math.abs(c - cols / 2) < 1.6 ? 0.05 : 0;
        ctx.globalAlpha = (base + (edge[r][c] ? 0.08 : 0) + twinkle + suture) * rainAlpha;
        ctx.fillStyle = color;
        ctx.fillText(ch, offsetX + c * charW, offsetY + r * charH);
      }
    }
    ctx.restore();
  }

  private renderEyeGlow(intensity: number) {
    const { ctx, palette } = this;
    const { charW, charH, maskCols, maskRows, offsetX, offsetY } = this.skullFrame();
    const cx = offsetX + (maskCols * charW) / 2;
    const eyeY = offsetY + maskRows * charH * 0.4;
    const eyeDX = maskCols * charW * 0.155;
    const span = Number.isFinite(charW) && Number.isFinite(charH) ? Math.min(charW, charH) : 8;
    const r = Math.max(10, span * 5.2);
    const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(Date.now() / 740));
    const glow = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
    ctx.save();
    for (const ex of [cx - eyeDX, cx + eyeDX]) {
      const g = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, r);
      const head = palette.head;
      g.addColorStop(0, this.withAlpha(head, 0.16 * pulse * glow));
      g.addColorStop(0.35, this.withAlpha(palette.t1, 0.07 * pulse * glow));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ex - r, eyeY - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  private renderSkullScan(strength: number) {
    const { ctx } = this;
    const { charW, charH, maskCols, maskRows, offsetX, offsetY } = this.skullFrame();
    const h = maskRows * charH;
    const w = maskCols * charW;
    const y = offsetY + ((Date.now() / 16) % (h + 24)) - 12;
    ctx.save();
    ctx.globalAlpha = 0.045 * strength;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(offsetX, y, w, 2);
    ctx.globalAlpha = 0.02 * strength;
    ctx.fillRect(offsetX, y + 3, w, 1);
    ctx.restore();
  }

  private renderCutFlash(u: number) {
    const { ctx, width, height } = this;
    ctx.save();
    if (u < 0.28) {
      ctx.fillStyle = `rgba(255,255,255,${0.22 * (1 - u / 0.28)})`;
    } else if (u < 0.55) {
      ctx.fillStyle = `rgba(0,0,0,${0.72})`;
    } else {
      ctx.fillStyle = `rgba(0,0,0,${0.72 * (1 - (u - 0.55) / 0.45)})`;
    }
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private withAlpha(color: string, alpha: number) {
    const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
    if (!color || typeof color !== 'string') {
      return `rgba(0,0,0,${a})`;
    }
    if (color.startsWith('rgba')) {
      return color.replace(/[\d.]+\)$/, `${a})`);
    }
    if (color.startsWith('rgb(')) {
      return `rgba(${color.slice(4, -1)},${a})`;
    }
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const n = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
      const r = parseInt(n.slice(0, 2), 16);
      const g = parseInt(n.slice(2, 4), 16);
      const b = parseInt(n.slice(4, 6), 16);
      if (![r, g, b].every((v) => Number.isFinite(v))) {
        return `rgba(0,0,0,${a})`;
      }
      return `rgba(${r},${g},${b},${a})`;
    }
    return color;
  }

  private renderRain(speedFactor: number, settle = 0, glitch = 0, rainAlpha = 1) {
    const { ctx, palette, config } = this;
    const { fs, charW, charH, offsetX, offsetY } = this.skullFrame();
    const { occupied, chars: maskChars, edge, rows, cols } = this.maskGrid;
    const flash = Date.now() < this.freezeFlashUntil;
    const bloom = this.variant === 'director' ? 12 : 5;
    const now = Date.now();
    const symbols = MatrixRenderer.SYMBOL_POOL;

    ctx.font = `400 ${fs}px ${MatrixRenderer.FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    for (let i = 0; i < this.columns.length; i++) {
      const col = this.columns[i];
      if (!col.fromChars || col.fromChars.length !== col.chars.length) {
        col.fromChars = [...col.chars];
      }
      if (!col.morph || col.morph.length !== col.chars.length) {
        col.morph = col.chars.map(() => 1);
      }
      const renderX = offsetX + col.col * charW;
      col.x = renderX;
      const headRow = Math.floor(col.row);
      const trailLen = col.length;

      for (let t = 0; t < trailLen; t++) {
        const r = headRow - t;
        if (r < 0 || r >= rows) continue;
        if (col.col < 0 || col.col >= cols) continue;
        if (!occupied[r][col.col]) continue;

        const tNorm = t / Math.max(1, trailLen - 1);
        let color = palette.t3;
        let alpha = 0.22 + 0.78 * Math.pow(1 - tNorm, 0.65);
        let glow = false;
        let glowColor = palette.glow;

        if (this.config.spectrum === 'rainbow') {
          const hue = (col.col * 7 + now / 40 + r * 2) % 360;
          const light = t === 0 ? 92 : Math.max(28, 74 - tNorm * 52);
          color = `hsl(${hue}, ${t === 0 ? 55 : 100}%, ${light}%)`;
          glowColor = `hsla(${hue}, 100%, 60%, 0.5)`;
          if (t === 0) {
            alpha = col.plane === 3 ? 0.85 : 1;
            glow = col.plane === 1;
          } else if (tNorm < 0.18) {
            alpha = col.plane === 1 ? 0.95 : col.plane === 2 ? 0.82 : 0.6;
          } else if (tNorm < 0.45) {
            alpha *= col.plane === 1 ? 0.88 : col.plane === 2 ? 0.7 : 0.48;
          } else if (tNorm < 0.75) {
            alpha *= col.plane === 3 ? 0.4 : 0.55;
          } else {
            alpha *= 0.35;
          }
        } else if (t === 0) {
          color = flash ? palette.head : palette.head;
          alpha = col.plane === 3 ? 0.85 : 1;
          glow = col.plane === 1;
        } else if (tNorm < 0.18) {
          color = palette.t1;
          alpha = col.plane === 1 ? 0.95 : col.plane === 2 ? 0.82 : 0.6;
        } else if (tNorm < 0.45) {
          color = palette.t2;
          alpha *= col.plane === 1 ? 0.88 : col.plane === 2 ? 0.7 : 0.48;
        } else if (tNorm < 0.75) {
          color = palette.t3;
          alpha *= col.plane === 3 ? 0.4 : 0.55;
        } else {
          color = palette.t4;
          alpha *= 0.35;
        }

        if (col.plane === 3 && t > 2) alpha *= 0.7;
        if (edge[r]?.[col.col]) alpha = Math.min(1, alpha * 1.22);
        else alpha *= 0.88;
        alpha *= rainAlpha;

        const charSlot = t % col.chars.length;
        const maskCh = maskChars[r]?.[col.col];
        const morphRate = settle >= 1 ? 0.018 : t === 0 ? 0.045 : 0.022;
        const wantSymbol = 0.48 + 0.38 * tNorm + 0.12 * Math.sin(now / 860 + col.col * 0.31 + r * 0.17);
        if (settle > 0.28 && maskCh && Math.random() < settle * 0.08) {
          col.fromChars[charSlot] = col.chars[charSlot];
          col.chars[charSlot] = maskCh;
          col.morph[charSlot] = 0;
        } else if (Math.random() < morphRate * (settle >= 1 ? 0.45 : 1 - settle * 0.55)) {
          col.fromChars[charSlot] = col.chars[charSlot];
          col.chars[charSlot] = this.pickGlyph(wantSymbol);
          col.morph[charSlot] = 0;
        }
        col.morph[charSlot] = Math.min(1, (col.morph[charSlot] ?? 1) + 0.06);
        const m = col.morph[charSlot];
        const eased = m * m * (3 - 2 * m);
        const fromCh = col.fromChars[charSlot] || col.chars[charSlot];
        const toCh = col.chars[charSlot];
        const overlayCh = symbols[(col.col * 17 + r * 11 + Math.floor(now / 240)) % symbols.length];
        const typeMix = Math.min(
          1,
          Math.max(0, 0.12 + 0.42 * tNorm + 0.2 * Math.sin(now / 780 + col.col * 0.27 + r * 0.14))
        );

        if (glitch > 0.7 && Math.random() < 0.06) continue;
        const px = renderX + (glitch > 0 ? (Math.random() - 0.5) * glitch * 8 : 0);
        const py =
          offsetY +
          r * charH +
          (glitch > 0.45 && Math.random() < glitch * 0.16 ? (Math.random() - 0.5) * 12 : 0);

        const drawGlyph = (glyph: string, a: number, withGlow: boolean) => {
          if (a < 0.02 || !glyph) return;
          ctx.globalAlpha = a;
          ctx.fillStyle = color;
          if (glitch > 0.25 && Math.random() < glitch * 0.28) {
            ctx.globalAlpha = a * 0.5;
            ctx.fillStyle = palette.t1;
            ctx.fillText(glyph, px + 2 + glitch * 3, py);
            ctx.fillStyle = palette.t3;
            ctx.fillText(glyph, px - 2 - glitch * 3, py);
            ctx.globalAlpha = a;
            ctx.fillStyle = color;
          }
          if (withGlow && (config.bloomGlow || this.variant === 'ambient')) {
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = this.variant === 'ambient' ? 4 : bloom;
            ctx.fillText(glyph, px, py);
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.globalAlpha = Math.min(1, a + 0.15);
            ctx.fillStyle = this.config.spectrum === 'rainbow' ? color : palette.head;
            ctx.fillText(glyph, px, py);
          } else {
            ctx.fillText(glyph, px, py);
          }
        };

        const incoming = glow && eased > 0.45;
        if (fromCh !== toCh && eased < 0.98) {
          drawGlyph(fromCh, alpha * (1 - eased), glow && !incoming);
          drawGlyph(toCh, alpha * eased, incoming);
        } else {
          drawGlyph(toCh, alpha * (1 - typeMix * 0.55), glow);
        }
        if (typeMix > 0.08 && overlayCh !== toCh) {
          drawGlyph(overlayCh, alpha * typeMix * 0.55, false);
        }
        if (glitch > 0.2) {
          const cipherCh =
            MatrixRenderer.CIPHER_POOL[
              Math.floor(Math.random() * MatrixRenderer.CIPHER_POOL.length)
            ];
          drawGlyph(cipherCh, alpha * glitch * 0.42, false);
        }
        if (t === 0 && Math.random() < 0.035) {
          ctx.globalAlpha = 0.55 * rainAlpha;
          ctx.fillStyle = palette.head;
          ctx.fillText('·', px, py);
        }
      }

      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      col.row += col.speed * config.speedMultiplier * speedFactor;

      if (settle < 0.02 && col.row - trailLen > rows + 2) {
        col.row = -(1 + Math.random() * 8);
        col.chars = this.fillGlyphs(col.length, 0.62);
        col.fromChars = [...col.chars];
        col.morph = col.chars.map(() => 1);
      }
    }
  }

  private renderFormingWord(
    settle: number,
    opts?: { scale?: number; center?: boolean; centerMix?: number; glitch?: number; alpha?: number }
  ) {
    const { ctx, palette } = this;
    const layout = this.wordLayout({
      scale: opts?.scale,
      center: opts?.center,
      centerMix: opts?.centerMix,
    });
    const cipher = MatrixRenderer.CIPHER_POOL;
    const now = Date.now();
    const intensity = opts?.glitch ?? 0.18;
    const burst = Math.sin(now / 180) > 0.62;
    const wordFs = layout[0]?.fs || 24;
    const masterAlpha = opts?.alpha ?? 1;

    ctx.save();
    ctx.font = `400 ${wordFs}px ${MatrixRenderer.FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    let trueCount = 0;
    const draw = layout.map((slot, i) => {
      const lock = this.letterLock(settle, i);
      if (lock <= 0) return null;
      const locked = lock >= 0.78;
      const glitchChance = intensity * (burst ? 0.95 : 0.55);
      let glitching = locked && Math.random() < glitchChance;
      if (locked && !glitching) trueCount++;
      return { slot, i, lock, locked, glitching };
    });

    const minTrue = Math.ceil(layout.length * (intensity > 0.7 ? 0.42 : 0.72));
    if (trueCount < minTrue) {
      for (const item of draw) {
        if (item && item.glitching && trueCount < minTrue) {
          item.glitching = false;
          trueCount++;
        }
      }
    }

    const first = layout[0];
    const last = layout[layout.length - 1];
    if (first && last && settle > 0.35) {
      const underlineY = first.y + wordFs * 0.92;
      ctx.globalAlpha = 0.18 * masterAlpha * settle;
      ctx.strokeStyle = palette.t2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(first.x, underlineY);
      ctx.lineTo(last.x + wordFs * 0.55, underlineY);
      ctx.stroke();
    }

    for (const item of draw) {
      if (!item) continue;
      const { slot, i, lock, locked, glitching } = item;
      const cipherCh = cipher[(i * 11 + Math.floor(now / 110)) % cipher.length];
      const letterCh = slot.glyph;
      const glitchMix = glitching
        ? 0.32 + 0.5 * (0.5 + 0.5 * Math.sin(now / 90 + i * 1.3))
        : 0;
      const letterMix = locked ? 1 - glitchMix : lock;

      const amp = 3 + intensity * 11;
      const jx = glitching ? Math.random() * amp - amp / 2 : Math.sin(now / 110 + i) * 0.45;
      const jy = glitching && Math.random() < 0.28 + intensity * 0.25
        ? Math.random() * amp * 0.55 - amp * 0.28
        : Math.sin(now / 140 + i * 0.6) * 0.3;
      const x = slot.x + jx;
      const y = slot.y + jy;

      if (locked && (glitching || Math.random() < 0.16)) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.32 * masterAlpha;
        ctx.fillStyle = palette.t1;
        ctx.fillText(glitching ? cipherCh : letterCh, x + 1.5, y);
        ctx.fillStyle = palette.t3;
        ctx.fillText(glitching ? cipherCh : letterCh, x - 1.5, y);
      }

      ctx.shadowColor = this.config.spectrum === 'rainbow'
        ? `hsla(${(i * 32 + now / 30) % 360}, 100%, 60%, 0.5)`
        : palette.glow;
      ctx.shadowBlur = locked ? 10 : 5;
      const baseA = (locked ? 1 : 0.35 + 0.65 * lock) * masterAlpha;

      if (letterMix < 0.97) {
        ctx.globalAlpha = baseA * (1 - letterMix);
        ctx.fillStyle = palette.t1;
        ctx.fillText(cipherCh, x, y);
      }
      if (letterMix > 0.04) {
        ctx.globalAlpha = baseA * letterMix;
        ctx.fillStyle = this.config.spectrum === 'rainbow'
          ? `hsl(${(i * 32 + now / 30) % 360}, 88%, 74%)`
          : palette.head;
        ctx.fillText(letterCh, x, y);
      }

      if (locked && !glitching && Math.random() < 0.08) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.35 * masterAlpha;
        ctx.fillStyle = palette.head;
        ctx.fillText('·', x + wordFs * 0.22, y - 2);
      }
    }

    ctx.restore();
  }

  /**
   * Phase 5: Time-Dilation Gravitational Freeze
   */
  private renderTimeDilationFreeze() {
    const elapsed = Date.now() - this.phaseStartTime;
    // Exponential deceleration factor from 1.0 -> 0.05
    const decay = Math.max(0.02, Math.exp(-elapsed / 1200));
    this.renderRain(decay);
  }

  /**
   * Phase 6: ASCII Skull materialization, ABLITERATED logo reveal, and dissolve
   */
  private renderSkullAndLogo() {
    const { ctx, width, height, palette } = this;
    const elapsed = Date.now() - this.phaseStartTime;

    this.renderRain(0.22);

    const charWidth = 10;
    const charHeight = 16;
    ctx.font = '12px "Menlo", "Courier New", monospace';
    ctx.textBaseline = 'top';

    this.skullMaterializeProgress = Math.min(1.0, elapsed / 5500);
    const holdMs = 4200;
    const dissolveAt = 5500 + holdMs;
    this.skullDissolveProgress =
      elapsed > dissolveAt ? Math.min(1.0, (elapsed - dissolveAt) / 5000) : 0;

    const maxScanlineY = Math.floor(
      height * MatrixRenderer.easeOut(this.skullMaterializeProgress)
    );
    const now = Date.now();

    for (const cell of this.skullCells) {
      let px = cell.x * charWidth;
      let py = cell.y * charHeight;

      if (py > maxScanlineY) continue;

      const dissolve = this.skullDissolveProgress;
      if (dissolve > 0) {
        if (Math.random() < dissolve * 0.85) continue;
        px += (Math.random() - 0.5) * dissolve * 36;
        py += dissolve * 28 + (Math.random() - 0.4) * dissolve * 18;
      }

      let color = palette.skull2;
      if (cell.tier === 1) color = palette.skull1;
      else if (cell.tier === 3) color = palette.skull3;
      else if (cell.tier === 4) color = palette.skull4;

      const flicker = Math.sin(now / 180 + cell.x * 0.4 + cell.y * 0.2) > 0.88 ? 0.2 : 0;
      ctx.globalAlpha = Math.max(0, 0.82 + flicker - dissolve);
      ctx.fillStyle = color;
      ctx.fillText(cell.char, px, py);

      if (cell.tier >= 3 && Math.random() < 0.04) {
        ctx.globalAlpha = 0.35 * (1 - dissolve);
        ctx.fillStyle = palette.head;
        ctx.fillText(cell.char, px, py);
      }
    }
    ctx.globalAlpha = 1;

    if (elapsed > 4200) {
      const logoAlpha = Math.min(1.0, (elapsed - 4200) / 1600) * (1 - this.skullDissolveProgress);
      ctx.save();
      ctx.globalAlpha = logoAlpha;
      const logoFs = Math.max(12, Math.min(22, Math.round(width / 90)));
      ctx.font = `${logoFs}px "Menlo", monospace`;
      ctx.fillStyle = palette.head;
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = 8;

      const logoStartX = Math.max(10, Math.floor((width - 80 * logoFs * 0.62) / 2));
      const logoStartY = Math.floor(height * 0.62);

      ABLITERATED_LOGO_ASCII.forEach((line, r) => {
        ctx.fillText(line, logoStartX, logoStartY + r * (logoFs + 4));
      });
      ctx.restore();
    }
  }

  /**
   * CRT Scanline & Barrel Curvature Shader Effect
   */
  private renderCRTScanlines() {
    const { ctx, width, height } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let y = 0; y < height; y += 3) {
      ctx.fillRect(0, y, width, 1);
    }

    // Subtle vignette
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.45,
      width / 2,
      height / 2,
      Math.min(width, height) * 0.85
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
