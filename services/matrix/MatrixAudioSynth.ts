/**
 * Procedural Cyberpunk Audio Synthesizer
 * Built entirely with WebAudio API — zero external audio files or network requests.
 * Complies with browser autoplay policies (resumes on user interaction).
 */

class MatrixAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true; // Muted by default per policy
  private masterGain: GainNode | null = null;
  private hydraDroneOsc: OscillatorNode | null = null;
  private hydraDroneGain: GainNode | null = null;

  constructor() {
    // Lazy initialize on first interaction
  }

  private initContext() {
    if (this.ctx) return;
    try {
      const AudioCtx =
        typeof window !== 'undefined' &&
        (window.AudioContext || (window as any).webkitAudioContext);
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.4, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    } catch (e) {
      console.warn('[MatrixAudioSynth] WebAudio not available:', e);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    this.initContext();
    if (this.ctx && this.masterGain) {
      if (this.ctx.state === 'suspended' && !muted) {
        this.ctx.resume();
      }
      const targetGain = muted ? 0 : 0.4;
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Phase 1: Rapid cryptographic hex tick click
   */
  public playHexTick() {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1800 + Math.random() * 800, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.02);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, t);
    filter.Q.setValueAtTime(6, t);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.03);
  }

  /**
   * Phase 2: Hydra root escalation sub-bass drone
   */
  public startHydraDrone() {
    if (!this.ctx || !this.masterGain || this.hydraDroneOsc) return;
    const t = this.ctx.currentTime;
    this.hydraDroneOsc = this.ctx.createOscillator();
    this.hydraDroneGain = this.ctx.createGain();

    this.hydraDroneOsc.type = 'sawtooth';
    this.hydraDroneOsc.frequency.setValueAtTime(42, t);

    // Lowpass filter to muffle harsh harmonics
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, t);

    this.hydraDroneGain.gain.setValueAtTime(0.01, t);
    this.hydraDroneGain.gain.exponentialRampToValueAtTime(0.3, t + 1.5);

    this.hydraDroneOsc.connect(filter);
    filter.connect(this.hydraDroneGain);
    this.hydraDroneGain.connect(this.masterGain);

    this.hydraDroneOsc.start(t);
  }

  public stopHydraDrone() {
    if (!this.ctx || !this.hydraDroneGain || !this.hydraDroneOsc) return;
    const t = this.ctx.currentTime;
    this.hydraDroneGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    setTimeout(() => {
      try {
        this.hydraDroneOsc?.stop();
        this.hydraDroneOsc?.disconnect();
      } catch {}
      this.hydraDroneOsc = null;
      this.hydraDroneGain = null;
    }, 600);
  }

  /**
   * Phase 2b: Resonant filter sweep during spectrum shift (green -> blue)
   */
  public playSpectrumShiftSweep() {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 1.2);

    filter.type = 'bandpass';
    filter.Q.setValueAtTime(8, t);
    filter.frequency.setValueAtTime(180, t);
    filter.frequency.exponentialRampToValueAtTime(3600, t + 1.2);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 1.5);
  }

  /**
   * Phase 3: Hollywood dual-frequency cipher decrypter chirps
   */
  public playCipherChirp(toneIndex = 0) {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const baseFreq = 440 * Math.pow(2, (toneIndex % 12) / 12);
    osc1.type = 'sine';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(baseFreq, t);
    osc2.frequency.setValueAtTime(baseFreq * 1.5, t);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.1);
    osc2.stop(t + 0.1);
  }

  /**
   * Phase 5: Tape-stop / gravitational freeze pitch decay
   */
  public playTimeDilationFreeze() {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 1.8);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.9);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 2.0);
  }

  /**
   * Phase 6: Sub-bass sonic boom impact for skull materialization
   */
  public playSkullImpact() {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.6);

    gain.gain.setValueAtTime(0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 1.3);
  }
}

export const matrixAudio = new MatrixAudioSynthesizer();
