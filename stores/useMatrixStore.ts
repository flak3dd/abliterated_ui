import { create } from 'zustand';
import {
  MatrixPhase,
  MatrixSpectrum,
  GlyphSetType,
  MATRIX_SPECTRUM_ORDER,
} from '../services/matrix/MatrixTypes';
import { matrixAudio } from '../services/matrix/MatrixAudioSynth';

interface MatrixState {
  isOpen: boolean;
  phase: MatrixPhase;
  spectrum: MatrixSpectrum;
  glyphSet: GlyphSetType;
  speedMultiplier: number;
  audioEnabled: boolean;
  crtShader: boolean;
  bloomGlow: boolean;
  interactiveTouch: boolean;

  // Actions
  setIsOpen: (open: boolean) => void;
  setPhase: (phase: MatrixPhase) => void;
  setSpectrum: (spectrum: MatrixSpectrum) => void;
  cycleSpectrum: () => void;
  setGlyphSet: (glyphSet: GlyphSetType) => void;
  setSpeedMultiplier: (speed: number) => void;
  toggleAudio: () => void;
  toggleCRT: () => void;
  nextPhase: () => void;
  prevPhase: () => void;
  resetSequence: () => void;
}

const PHASES_IN_ORDER: MatrixPhase[] = [
  'PHASE_3_CIPHER',
  'PHASE_4_RAIN',
  'PHASE_5_FREEZE',
  'PHASE_7_AMBIENT',
];

export const useMatrixStore = create<MatrixState>((set, get) => ({
  isOpen: false,
  phase: 'PHASE_4_RAIN',
  spectrum: 'blue',
  glyphSet: 'abliterad',
  speedMultiplier: 1.0,
  audioEnabled: false,
  crtShader: true,
  bloomGlow: true,
  interactiveTouch: true,

  setIsOpen: (open: boolean) => {
    set({ isOpen: open });
    if (!open) {
      matrixAudio.setMuted(true);
    } else if (get().audioEnabled) {
      matrixAudio.setMuted(false);
    }
  },

  setPhase: (phase: MatrixPhase) => {
    set({ phase });
    if (phase === 'PHASE_2B_SHIFT') {
      set({ spectrum: 'blue' });
    }
  },

  setSpectrum: (spectrum: MatrixSpectrum) => {
    set({ spectrum });
  },

  cycleSpectrum: () => {
    const order = MATRIX_SPECTRUM_ORDER;
    const idx = order.indexOf(get().spectrum);
    const next = order[(idx < 0 ? 0 : idx + 1) % order.length];
    set({ spectrum: next });
  },

  setGlyphSet: (glyphSet: GlyphSetType) => {
    set({ glyphSet });
  },

  setSpeedMultiplier: (speedMultiplier: number) => {
    set({ speedMultiplier });
  },

  toggleAudio: () => {
    const next = !get().audioEnabled;
    matrixAudio.setMuted(!next);
    set({ audioEnabled: next });
  },

  toggleCRT: () => {
    set((state) => ({ crtShader: !state.crtShader }));
  },

  nextPhase: () => {
    const current = get().phase;
    const idx = PHASES_IN_ORDER.indexOf(current);
    if (idx !== -1 && idx < PHASES_IN_ORDER.length - 1) {
      get().setPhase(PHASES_IN_ORDER[idx + 1]);
    } else {
      get().setPhase(PHASES_IN_ORDER[0]);
    }
  },

  prevPhase: () => {
    const current = get().phase;
    const idx = PHASES_IN_ORDER.indexOf(current);
    if (idx > 0) {
      get().setPhase(PHASES_IN_ORDER[idx - 1]);
    } else {
      get().setPhase(PHASES_IN_ORDER[PHASES_IN_ORDER.length - 1]);
    }
  },

  resetSequence: () => {
    set({ phase: 'PHASE_4_RAIN', spectrum: 'blue' });
  },
}));
