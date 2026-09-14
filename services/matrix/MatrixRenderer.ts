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

  // One-shot: 10s fall → 5s settle into ABLITERATED → hold the word
  private cycleOrigin: number = Date.now();
  private maskGrid: MaskGrid = AsciiSkullEngine.getMaskGrid();
  private didFreezeBeat = false;
  private freezeFlashUntil = 0;
  private variant: 'ambient' | 'director' = 'ambient';
  private frameCache: ReturnType<MatrixRenderer['rainMetrics']> | null = null;
  private static readonly FORM_WORD = 'ABLITERATED';
  // Cyber letterforms that still read as ABLITERATED (Menlo / system unicode)
  private static readonly FORM_GLYPHS = ['Λ', 'ß', 'Ł', 'Ι', '┬', 'Ξ', 'Я', 'Λ', '┬', 'Ξ', 'Ð'];
  private static readonly CIPHER_POOL = [
    'Δ', 'Λ', 'Ξ', 'Σ', 'Ω', 'Ж', 'Я', 'Ø', 'Þ', 'Ð', 'Ł', 'Ɨ', 'Ƀ', 'ß',
    '█', '▀', '▄', '▌', '░', '▒', '▓', '◆', '■', '▪', '¤',
    '│', '┬', '┴', '├', '┤', '┼', '─', '┌', '┐', '└', '┘',
    'ｦ', 'ｱ', 'ｳ', 'ｶ', 'ｷ', 'ｻ', 'ﾀ', 'ﾅ', 'ﾊ', 'ﾏ', 'ﾔ', 'ﾗ',
  ];
  private static readonly RAIN_MS = 10_000;
  private static readonly SETTLE_MS = 5_000;
  private static readonly FONT =
    '"Share Tech Mono", "SF Mono", "ui-monospace", "Monaco", "Courier New", monospace';

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
      spectrum: 'green',
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

    this.palette = MATRIX_PALETTES[this.config.spectrum] || MATRIX_PALETTES.green;
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

  private rainPool(): string[] {
    return GLYPH_POOLS[this.config.glyphSet] || GLYPH_POOLS.abliterad;
  }

  private initColumns() {
    const { charW, offsetX } = this.rainMetrics();
    const pool = this.rainPool();
    const { occupiedCols, rows } = this.maskGrid;
    this.columns = [];

    const spawn = (maskCol: number, plane: 1 | 2 | 3) => {
      const speed =
        plane === 1
          ? 0.28 + Math.random() * 0.14
          : plane === 2
          ? 0.16 + Math.random() * 0.1
          : 0.08 + Math.random() * 0.06;
      const len =
        plane === 1
          ? 32 + Math.floor(Math.random() * 15)
          : plane === 2
          ? 24 + Math.floor(Math.random() * 13)
          : 18 + Math.floor(Math.random() * 11);
      this.columns.push({
        col: maskCol,
        row: -Math.random() * rows,
        x: offsetX + maskCol * charW,
        y: 0,
        speed,
        length: len,
        plane,
        chars: Array.from({ length: len }, () =>
          pool[Math.floor(Math.random() * pool.length)]
        ),
        lastUpdate: Date.now(),
        splashCooldown: 0,
      });
    };

    for (let c = 0; c < occupiedCols.length; c++) {
      if (!occupiedCols[c]) continue;
      const rand = Math.random();
      const plane: 1 | 2 | 3 = rand < 0.28 ? 1 : rand < 0.75 ? 2 : 3;
      spawn(c, plane);
      if (Math.random() < 0.4) spawn(c, 3);
    }
  }

  private skullFrame() {
    return this.rainMetrics();
  }

  private wordLayout() {
    const word = MatrixRenderer.FORM_WORD;
    const glyphs = MatrixRenderer.FORM_GLYPHS;
    const { charH, charW, maskCols, offsetX, offsetY } = this.skullFrame();
    const wordFs = Math.max(20, Math.min(34, Math.round(charH * 2.6)));
    this.ctx.font = `400 ${wordFs}px ${MatrixRenderer.FONT}`;
    const advance = Math.max(wordFs * 0.62, this.ctx.measureText('M').width);
    const spacing = advance * 1.15;
    const total = (word.length - 1) * spacing;
    const maskW = maskCols * charW;
    const startX = offsetX + (maskW - total) / 2;
    const wordY = offsetY + 27 * charH;
    return [...word].map((ch, i) => ({
      ch,
      glyph: glyphs[i] || ch,
      x: startX + i * spacing,
      y: wordY,
      fs: wordFs,
    }));
  }

  private cycleState() {
    const t = Date.now() - this.cycleOrigin;
    if (t < MatrixRenderer.RAIN_MS) {
      return { mode: 'rain' as const, settle: 0, speed: 1 };
    }
    if (t < MatrixRenderer.RAIN_MS + MatrixRenderer.SETTLE_MS) {
      const settle = (t - MatrixRenderer.RAIN_MS) / MatrixRenderer.SETTLE_MS;
      return {
        mode: 'settle' as const,
        settle,
        speed: Math.pow(1 - settle, 2.6),
      };
    }
    return { mode: 'hold' as const, settle: 1, speed: 0 };
  }

  private letterLock(settle: number, index: number): number {
    const n = MatrixRenderer.FORM_WORD.length;
    const start = (index / n) * 0.35;
    return Math.min(1, Math.max(0, (settle - start) / 0.4));
  }

  private pinColumns() {
    const { occupied, rows } = this.maskGrid;
    const pool = this.rainPool();
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
      if (col.chars.length < col.length) {
        while (col.chars.length < col.length) {
          col.chars.push(pool[Math.floor(Math.random() * pool.length)]);
        }
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
    this.palette = MATRIX_PALETTES[spectrum] || MATRIX_PALETTES.green;
  }

  public setConfig(update: Partial<MatrixEngineConfig>) {
    this.config = { ...this.config, ...update };
    if (update.spectrum) {
      this.palette = MATRIX_PALETTES[update.spectrum] || MATRIX_PALETTES.green;
    }
    if (update.audioEnabled !== undefined) {
      matrixAudio.setMuted(!update.audioEnabled);
    }
    if (update.glyphSet) {
      const pool = this.rainPool();
      for (const col of this.columns) {
        col.chars = Array.from({ length: col.length }, () =>
          pool[Math.floor(Math.random() * pool.length)]
        );
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

  public start() {
    if (this.animId) return;
    const loop = () => {
      this.render();
      this.animId = requestAnimationFrame(loop);
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
    if (cycle.mode === 'hold') {
      fade = palette.fade.replace(/[\d.]+\)$/, '0.08)');
    } else if (cycle.mode === 'settle') {
      fade = palette.fade.replace(/[\d.]+\)$/, '0.10)');
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
   * One-shot: rain for 10s, settle for 5s into ABLITERATED, then hold the word.
   */
  private renderRainCycle() {
    const cycle = this.cycleState();
    if (cycle.mode === 'settle' && !this.didFreezeBeat) {
      this.pinColumns();
      this.didFreezeBeat = true;
      this.freezeFlashUntil = Date.now() + 80;
      if (this.variant === 'director' && this.config.audioEnabled) {
        matrixAudio.playTimeDilationFreeze();
      }
    }
    this.renderRain(cycle.speed, cycle.settle);
    if (cycle.settle > 0) {
      this.renderFormingWord(cycle.settle);
    }
  }

  private renderRain(speedFactor: number, settle = 0) {
    const { ctx, palette, config } = this;
    const pool = this.rainPool();
    const { fs, charW, charH, offsetX, offsetY } = this.skullFrame();
    const { occupied, rows, cols } = this.maskGrid;
    const flash = Date.now() < this.freezeFlashUntil;
    const bloom = this.variant === 'director' ? 12 : 8;

    ctx.font = `400 ${fs}px ${MatrixRenderer.FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    for (let i = 0; i < this.columns.length; i++) {
      const col = this.columns[i];
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

        if (t === 0) {
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

        const charSlot = t % col.chars.length;
        const morph = settle >= 1 ? 0.08 : t === 0 ? 0.14 : 0.06;
        if (Math.random() < morph * (settle >= 1 ? 1 : 1 - settle * 0.5)) {
          col.chars[charSlot] = pool[Math.floor(Math.random() * pool.length)];
        }
        const ch = col.chars[charSlot];
        const px = renderX;
        const py = offsetY + r * charH;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;

        if (glow && config.bloomGlow) {
          ctx.shadowColor = palette.glow;
          ctx.shadowBlur = bloom;
          ctx.fillText(ch, px, py);
          ctx.shadowBlur = 0;
          ctx.shadowColor = 'transparent';
          ctx.globalAlpha = 1;
          ctx.fillStyle = palette.head;
          ctx.fillText(ch, px, py);
        } else {
          ctx.fillText(ch, px, py);
        }
      }

      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      col.row += col.speed * config.speedMultiplier * speedFactor;

      if (settle < 0.02 && col.row - trailLen > rows + 2) {
        col.row = -(1 + Math.random() * 8);
        col.chars = Array.from({ length: col.length }, () =>
          pool[Math.floor(Math.random() * pool.length)]
        );
      }
    }
  }

  private renderFormingWord(settle: number) {
    const { ctx, palette } = this;
    const layout = this.wordLayout();
    const cipher = MatrixRenderer.CIPHER_POOL;
    const now = Date.now();
    const burst = Math.sin(now / 160) > 0.55;
    const wordFs = layout[0]?.fs || 24;

    ctx.save();
    ctx.font = `400 ${wordFs}px ${MatrixRenderer.FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    let trueCount = 0;
    const draw = layout.map((slot, i) => {
      const lock = this.letterLock(settle, i);
      if (lock <= 0) return null;
      const locked = lock >= 0.7;
      const glitchChance = burst ? 0.5 : 0.18;
      let glitching = locked && Math.random() < glitchChance;
      if (locked && !glitching) trueCount++;
      return { slot, i, lock, locked, glitching };
    });

    const minTrue = Math.ceil(layout.length * 0.64);
    if (trueCount < minTrue) {
      for (const item of draw) {
        if (item && item.glitching && trueCount < minTrue) {
          item.glitching = false;
          trueCount++;
        }
      }
    }

    for (const item of draw) {
      if (!item) continue;
      const { slot, i, lock, locked, glitching } = item;
      const ch = !locked || glitching
        ? cipher[Math.floor(Math.random() * cipher.length)]
        : slot.glyph;

      const jx = glitching ? Math.random() * 8 - 4 : Math.sin(now / 90 + i) * 0.6;
      const jy = glitching && Math.random() < 0.35 ? Math.random() * 6 - 3 : 0;
      const x = slot.x + jx;
      const y = slot.y + jy;

      if (locked && (glitching || Math.random() < 0.22)) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = palette.t1;
        ctx.fillText(ch, x + 2, y);
        ctx.fillStyle = palette.t3;
        ctx.fillText(ch, x - 2, y);
      }

      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = locked ? 14 : 6;
      ctx.globalAlpha = locked ? (glitching ? 0.85 : 1) : 0.4 + 0.6 * lock;
      ctx.fillStyle = glitching ? palette.t1 : palette.head;
      ctx.fillText(ch, x, y);
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

    // First render background rain at slow speed
    this.renderRain(0.3);

    const charWidth = 10;
    const charHeight = 16;
    ctx.font = '12px "Menlo", "Courier New", monospace';
    ctx.textBaseline = 'top';

    // Scanline materialization (progresses 0 -> 1 over 2.5s)
    this.skullMaterializeProgress = Math.min(1.0, elapsed / 2500);

    // After 4.0s, dissolve starts
    this.skullDissolveProgress = elapsed > 4000 ? Math.min(1.0, (elapsed - 4000) / 3000) : 0;

    const maxScanlineY = Math.floor(height * this.skullMaterializeProgress);

    const pool = GLYPH_POOLS[this.config.glyphSet];

    for (const cell of this.skullCells) {
      let px = cell.x * charWidth;
      let py = cell.y * charHeight;

      if (py > maxScanlineY) continue; // Not yet materialized

      let color = palette.skull2;
      if (cell.tier === 1) color = palette.skull1;
      else if (cell.tier === 3) color = palette.skull3;
      else if (cell.tier === 4) color = palette.skull4;

      ctx.fillStyle = color;
      ctx.fillText(cell.char, px, py);
    }

    // Render ABLITERATED ASCII Logo plate after skull materializes (at 2.0s)
    if (elapsed > 2000) {
      const logoAlpha = Math.min(1.0, (elapsed - 2000) / 1000);
      ctx.save();
      ctx.globalAlpha = logoAlpha;
      ctx.font = '9px "Menlo", monospace';
      ctx.fillStyle = palette.head;

      const logoStartX = Math.max(10, Math.floor((width - 80 * 7.5) / 2));
      const logoStartY = Math.floor(height * 0.65);

      ABLITERATED_LOGO_ASCII.forEach((line, r) => {
        ctx.fillText(line, logoStartX, logoStartY + r * 13);
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
