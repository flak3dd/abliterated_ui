import { create } from 'zustand';
import { AspectRatioType, GeneratedImage } from '../types';
import { useMeshStore } from './useMeshStore';
import { useChatStore } from './useChatStore';
import { generateKreaImage } from '../services/kreaService';

export interface SparkGpuStats {
  name: string;
  tempC: number;
  gpuUtilPct: number;
  powerDrawW: number;
}

interface StudioState {
  prompt: string;
  negativePrompt: string;
  selectedModel: string;
  aspectRatio: AspectRatioType;
  brushSize: number;
  isMaskEnabled: boolean;
  sourceImageUri: string | null;
  maskPaths: string[];
  history: GeneratedImage[];
  isGenerating: boolean;
  currentGeneratedImage: GeneratedImage | null;
  steps: number;
  guidanceScale: number;
  seed: number | null;
  isHistoryOpen: boolean;

  // Real-time generation telemetry & processing data
  generationProgress: number;
  generationStatusText: string;
  generationStepText: string;
  generationElapsedSec: number;
  sparkGpuStats: SparkGpuStats | null;

  // Actions
  setPrompt: (prompt: string) => void;
  setNegativePrompt: (neg: string) => void;
  setSelectedModel: (model: string) => void;
  setAspectRatio: (ratio: AspectRatioType) => void;
  setBrushSize: (size: number) => void;
  setSteps: (steps: number) => void;
  setGuidanceScale: (scale: number) => void;
  setSeed: (seed: number | null) => void;
  toggleHistoryOpen: (open?: boolean) => void;
  toggleMaskEnabled: (enabled?: boolean) => void;
  setSourceImageUri: (uri: string | null) => void;
  setMaskPaths: (paths: string[]) => void;
  clearMask: () => void;
  generateImage: () => Promise<void>;
  enhancePrompt: () => void;
  exportToSandbox: (img?: GeneratedImage | null) => boolean;
  selectFromHistory: (image: GeneratedImage) => void;
  clearHistory: () => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  prompt: 'Cyberpunk rainy alleyway with emerald volumetric neon lighting and hyper-detailed wet reflections, 8k raw',
  negativePrompt: 'blurry, low quality, artifacts, watermark, duplicate, deformed, extra limbs',
  selectedModel: 'krea2-raw-fp8',
  aspectRatio: '1:1',
  brushSize: 28,
  isMaskEnabled: false,
  sourceImageUri: null,
  maskPaths: [],
  history: [],
  isGenerating: false,
  currentGeneratedImage: null,
  steps: 24,
  guidanceScale: 7.5,
  seed: null,
  isHistoryOpen: false,

  // Initial telemetry state
  generationProgress: 0,
  generationStatusText: 'Ready',
  generationStepText: '',
  generationElapsedSec: 0,
  sparkGpuStats: null,

  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setSteps: (steps) => set({ steps }),
  setGuidanceScale: (guidanceScale) => set({ guidanceScale }),
  setSeed: (seed) => set({ seed }),
  toggleHistoryOpen: (open) =>
    set((state) => ({
      isHistoryOpen: open !== undefined ? open : !state.isHistoryOpen,
    })),
  toggleMaskEnabled: (enabled) =>
    set((state) => ({
      isMaskEnabled: enabled !== undefined ? enabled : !state.isMaskEnabled,
    })),
  setSourceImageUri: (sourceImageUri) =>
    set({ sourceImageUri, maskPaths: [], isMaskEnabled: false }),
  setMaskPaths: (maskPaths) => set({ maskPaths }),
  clearMask: () => set({ maskPaths: [] }),

  generateImage: async () => {
    const { prompt, negativePrompt, selectedModel, aspectRatio, sourceImageUri, maskPaths, isGenerating, steps, guidanceScale, seed } = get();
    if (!prompt.trim() || isGenerating) return;

    const startTime = Date.now();
    const activeHost = useMeshStore.getState().activeHost;

    set({
      isGenerating: true,
      generationProgress: 4,
      generationStatusText: 'Connecting to DGX Spark (:7860)...',
      generationStepText: 'Warming Blackwell GPU',
      generationElapsedSec: 0,
    });

    let pollInterval: ReturnType<typeof setInterval> | null = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      // 1. Query Spark Image Bridge progress
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 900);
        const res = await fetch('http://' + activeHost + ':7860/progress', { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const pData = await res.json();
          const pct = typeof pData.progress === 'number' ? pData.progress : 0;
          const status = pData.status || 'running';

          let statusStr = 'Latent Diffusion Synthesis';
          let stepStr = '';

          if (status === 'loading') {
            statusStr = 'Loading weights to GB10 Unified HBM';
            stepStr = 'Model Pipeline Init';
          } else if (status === 'encoding') {
            statusStr = 'Neural VAE Decoding & Base64 Encode';
            stepStr = 'Finalizing Pixels';
          } else if (status === 'running') {
            const currentStep = Math.max(1, Math.min(steps, Math.round(((pct - 5) / 90) * steps)));
            stepStr = 'Step ' + currentStep + ' of ' + steps + ' (Denoising)';
            statusStr = 'Latent Diffusion Sampling';
          } else if (status === 'done') {
            statusStr = 'Render Complete';
            stepStr = 'Complete';
          }

          set((state) => ({
            generationProgress: Math.max(state.generationProgress, pct),
            generationStatusText: statusStr,
            generationStepText: stepStr,
            generationElapsedSec: elapsed,
          }));
        }
      } catch {}

      // 2. Query Spark Controller for real-time GPU thermals & compute load
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 900);
        const ctrlRes = await fetch('http://127.0.0.1:17325/api/status', { signal: controller.signal });
        clearTimeout(timeout);

        if (ctrlRes.ok) {
          const ctrlData = await ctrlRes.json();
          if (ctrlData.gpu && !ctrlData.gpu.error) {
            set({
              sparkGpuStats: {
                name: ctrlData.gpu.name || 'NVIDIA GB10',
                tempC: ctrlData.gpu.tempC || 0,
                gpuUtilPct: ctrlData.gpu.gpuUtilPct || 0,
                powerDrawW: ctrlData.gpu.powerDrawW || 0,
              },
            });
          }
        }
      } catch {}
    }, 700);

    try {
      const result = await generateKreaImage({
        host: activeHost,
        port: 7860,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        aspectRatio,
        imageUri: sourceImageUri,
        maskData: maskPaths,
        model: selectedModel,
        steps,
        guidanceScale,
        seed,
      });

      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }

      set((state) => ({
        isGenerating: false,
        generationProgress: 100,
        generationStatusText: 'Synthesis complete',
        generationStepText: '100% Done',
        currentGeneratedImage: result,
        sourceImageUri: result.uri,
        maskPaths: [],
        isMaskEnabled: false,
        history: [result, ...state.history.slice(0, 29)],
      }));
    } catch (error) {
      console.error('Image generation error in StudioStore:', error);
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      set({
        isGenerating: false,
        generationStatusText: 'Error generating image',
      });
    }
  },

  enhancePrompt: () => {
    const { prompt } = get();
    const current = prompt.trim();
    if (!current) return;

    // Check if already has optical and studio tokens
    const enhancements = [
      '8k raw photo',
      'cinematic volumetric emerald lighting',
      'hyper-detailed raytraced reflections',
      'shot on 35mm f/1.8 lens',
      'photorealistic textures',
      'masterpiece composition',
      'octane render 32bpc depth',
    ];

    const missing = enhancements.filter(
      (token) => !current.toLowerCase().includes(token.split(' ')[0])
    );

    if (missing.length > 0) {
      const addedTokens = missing.slice(0, 4).join(', ');
      set({ prompt: `${current}, ${addedTokens}` });
    }
  },

  exportToSandbox: (img) => {
    const targetImage = img || get().currentGeneratedImage;
    if (!targetImage || !targetImage.uri) return false;

    try {
      const chatState = useChatStore.getState();
      const activeEnv = chatState.getActiveEnvironment();
      let envId = activeEnv?.id;

      if (!envId) {
        // Find or create session
        const session = chatState.sessions[0];
        if (session && session.envId) {
          envId = session.envId;
        } else {
          chatState.createNewSession();
          const newSession = useChatStore.getState().sessions[0];
          envId = newSession?.envId;
        }
      }

      if (envId) {
        const cleanTimestamp = Date.now();
        const filename = `assets/studio_render_${cleanTimestamp}.png`;
        chatState.addOrUpdateFile(envId, filename, targetImage.uri, 'image/png');
        return true;
      }
    } catch (e) {
      console.warn('Failed to export image to sandbox environment:', e);
    }
    return false;
  },

  selectFromHistory: (image) => {
    set({
      currentGeneratedImage: image,
      sourceImageUri: image.uri,
      aspectRatio: image.aspectRatio,
      prompt: image.prompt,
      maskPaths: [],
      isMaskEnabled: false,
    });
  },

  clearHistory: () => set({ history: [] }),
}));
