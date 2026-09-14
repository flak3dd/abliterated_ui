import { create } from 'zustand';
import { AspectRatioType, GeneratedImage } from '../types';
import { useMeshStore } from './useMeshStore';
import { useChatStore } from './useChatStore';
import { generateKreaImage, MODEL_SAMPLER_DEFAULTS } from '../services/kreaService';
import { fetchJsonWithTimeout, resolveApiUrl } from '../services/apiConfig';

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
  canvasSize: { width: number; height: number } | null;
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
  setCanvasSize: (size: { width: number; height: number }) => void;
  clearMask: () => void;
  generateImage: () => Promise<GeneratedImage | null>;
  enhancePrompt: () => Promise<'llm' | 'local' | false>;
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
  canvasSize: null,
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
  setSelectedModel: (selectedModel) => {
    const defaults = MODEL_SAMPLER_DEFAULTS[selectedModel];
    set({
      selectedModel,
      ...(defaults ? { steps: defaults.steps, guidanceScale: defaults.guidanceScale } : {}),
    });
  },
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
    set({
      sourceImageUri,
      currentGeneratedImage: null,
      maskPaths: [],
      isMaskEnabled: Boolean(sourceImageUri),
    }),
  setMaskPaths: (maskPaths) => set({ maskPaths }),
  setCanvasSize: (canvasSize) => {
    const prev = get().canvasSize;
    if (
      prev &&
      Math.abs(prev.width - canvasSize.width) < 1 &&
      Math.abs(prev.height - canvasSize.height) < 1
    ) {
      return;
    }
    set({ canvasSize });
  },
  clearMask: () => set({ maskPaths: [] }),

  generateImage: async () => {
    const {
      prompt,
      negativePrompt,
      selectedModel,
      aspectRatio,
      sourceImageUri,
      maskPaths,
      canvasSize,
      brushSize,
      isGenerating,
      steps,
      guidanceScale,
      seed,
    } = get();
    if (!prompt.trim() || isGenerating) return null;

    const startTime = Date.now();
    const activeHost = useMeshStore.getState().activeHost;

    set({
      isGenerating: true,
      generationProgress: 4,
      generationStatusText: 'Connecting to DGX Spark (:7860)...',
      generationStepText: 'Warming Blackwell GPU',
      generationElapsedSec: 0,
    });

    let pollBusy = false;
    const pollInterval: ReturnType<typeof setInterval> = setInterval(async () => {
      if (pollBusy) return;
      pollBusy = true;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      try {
        const progressUrls = [
          resolveApiUrl(activeHost, 7860, '/v1/progress'),
          resolveApiUrl(activeHost, 7860, '/progress'),
        ];
        let pData: any = null;
        for (const progressUrl of progressUrls) {
          const res = await fetchJsonWithTimeout(progressUrl, 900);
          if (res.ok && res.data) {
            pData = res.data;
            break;
          }
        }

        if (pData) {
          const rawPct = typeof pData.progress === 'number' ? pData.progress : 0;
          const pct = rawPct <= 1 ? rawPct * 100 : rawPct;
          const status = pData.status || 'running';
          const reportedStep =
            typeof pData.step === 'number'
              ? pData.step
              : typeof pData.current_step === 'number'
              ? pData.current_step
              : null;

          let statusStr = 'Latent Diffusion Synthesis';
          let stepStr = '';

          if (status === 'loading') {
            statusStr = 'Loading weights to GB10 Unified HBM';
            stepStr = 'Model Pipeline Init';
          } else if (status === 'encoding') {
            statusStr = 'Neural VAE Decoding & Base64 Encode';
            stepStr = 'Finalizing Pixels';
          } else if (status === 'running') {
            const currentStep =
              reportedStep !== null
                ? Math.max(1, Math.min(steps, reportedStep))
                : Math.max(1, Math.min(steps, Math.round(((pct - 5) / 90) * steps)));
            stepStr = 'Step ' + currentStep + ' of ' + steps + ' (Denoising)';
            statusStr = 'Latent Diffusion Sampling';
          } else if (status === 'done') {
            statusStr = 'Render Complete';
            stepStr = 'Complete';
          }

          set((state) => ({
            generationProgress: Math.max(state.generationProgress, Math.max(0, Math.min(99, pct))),
            generationStatusText: statusStr,
            generationStepText: stepStr,
            generationElapsedSec: elapsed,
          }));
        } else {
          set({ generationElapsedSec: elapsed });
        }
      } catch {
        set({ generationElapsedSec: elapsed });
      }

      try {
        const gpuHosts = Array.from(new Set(['127.0.0.1', activeHost].filter(Boolean)));
        for (const gpuHost of gpuHosts) {
          const ctrlRes = await fetchJsonWithTimeout(
            resolveApiUrl(gpuHost, 17325, '/api/status'),
            900
          );
          if (ctrlRes.ok && ctrlRes.data?.gpu && !ctrlRes.data.gpu.error) {
            set({
              sparkGpuStats: {
                name: ctrlRes.data.gpu.name || 'NVIDIA GB10',
                tempC: ctrlRes.data.gpu.tempC || 0,
                gpuUtilPct: ctrlRes.data.gpu.gpuUtilPct || 0,
                powerDrawW: ctrlRes.data.gpu.powerDrawW || 0,
              },
            });
            break;
          }
        }
      } catch {
        // GPU HUD is optional
      } finally {
        pollBusy = false;
      }
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
        canvasSize,
        brushSize,
        model: selectedModel,
        steps,
        guidanceScale,
        seed,
      });

      if (result.isFallback) {
        set((state) => ({
          isGenerating: false,
          generationProgress: 0,
          generationStatusText: result.error || 'Spark image bridge failed',
          generationStepText: 'Failed',
          currentGeneratedImage: result,
          maskPaths: [],
          isMaskEnabled: false,
          history: [result, ...state.history.slice(0, 29)],
        }));
      } else {
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
      }
      return result;
    } catch (error: any) {
      console.error('Image generation error in StudioStore:', error);
      set({
        isGenerating: false,
        generationProgress: 0,
        generationStatusText: error?.message || 'Error generating image',
        generationStepText: 'Failed',
      });
      return null;
    } finally {
      clearInterval(pollInterval);
    }
  },

  enhancePrompt: async () => {
    const { prompt } = get();
    const current = prompt.trim();
    if (!current) return false;

    const activeHost = useMeshStore.getState().activeHost;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(resolveApiUrl(activeHost, 8000, '/v1/chat/completions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen-abliterated',
          messages: [
            {
              role: 'system',
              content:
                'Rewrite the user image prompt for photorealistic diffusion. Keep the subject and intent. Add camera, lighting, and texture detail. Return ONLY the improved prompt with no quotes or preamble.',
            },
            { role: 'user', content: current },
          ],
          max_tokens: 180,
          temperature: 0.4,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        const enhanced = String(data?.choices?.[0]?.message?.content || '')
          .trim()
          .replace(/^["']|["']$/g, '');
        if (enhanced.length > 8 && enhanced.toLowerCase() !== current.toLowerCase()) {
          set({ prompt: enhanced });
          return 'llm';
        }
      }
    } catch (e) {
      console.warn('[studio] Prompt enhance via vLLM failed, using local tokens:', e);
    } finally {
      clearTimeout(timer);
    }

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
      set({ prompt: current + ', ' + missing.slice(0, 4).join(', ') });
      return 'local';
    }
    return false;
  },

  exportToSandbox: (img) => {
    const targetImage = img || get().currentGeneratedImage;
    if (!targetImage || !targetImage.uri || targetImage.isFallback) return false;

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
