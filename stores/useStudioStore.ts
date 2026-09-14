import { create } from 'zustand';
import { AspectRatioType, GeneratedImage } from '../types';
import { useMeshStore } from './useMeshStore';
import { useChatStore } from './useChatStore';
import {
  generateKreaImage,
  listImageModels,
  loadImageModel,
  makeHistoryThumbnail,
  MODEL_SAMPLER_DEFAULTS,
} from '../services/kreaService';
import { fetchJsonWithTimeout, resolveApiUrl } from '../services/apiConfig';

export interface SparkGpuStats {
  name: string;
  tempC: number;
  gpuUtilPct: number;
  powerDrawW: number;
}

function resolveStudioImageHost(): string {
  const mesh = useMeshStore.getState();
  const activeHost = mesh.activeHost;
  const sparkEp =
    mesh.candidates.find(
      (c) =>
        c.isOnline &&
        (c.type === 'direct_lan' || c.type === 'tailscale' || c.type === 'secondary_lan')
    ) ||
    mesh.candidates.find(
      (c) =>
        c.type === 'direct_lan' || c.type === 'tailscale' || c.type === 'secondary_lan'
    );
  if (activeHost.includes('abliterated.') || activeHost.includes('featherless.')) {
    return sparkEp?.host || '192.168.4.103';
  }
  return activeHost;
}

let warmGen = 0;
let warmTimer: ReturnType<typeof setTimeout> | null = null;
let warmAbort: AbortController | null = null;

function warmSelectedModel(modelId: string) {
  if (warmTimer) clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    warmTimer = null;
    void (async () => {
      const gen = ++warmGen;
      warmAbort?.abort();
      const ac = new AbortController();
      warmAbort = ac;
      const host = resolveStudioImageHost();
      useStudioStore.setState({
        warmingModelId: modelId,
        generationStatusText: 'Loading ' + modelId + ' weights…',
      });
      try {
        const result = await loadImageModel(host, 7860, modelId, ac.signal);
        if (gen !== warmGen) return;
        const defaults = MODEL_SAMPLER_DEFAULTS[result.model];
        const steps = result.params?.steps || defaults?.steps;
        const guidance = result.params?.guidance ?? defaults?.guidanceScale;
        useStudioStore.setState((s) => ({
          warmingModelId: null,
          loadedModelId: result.model,
          modelSwitchError: null,
          generationStatusText: 'Ready · ' + result.model,
          ...(s.selectedModel === modelId && steps
            ? { steps, guidanceScale: guidance ?? s.guidanceScale }
            : {}),
          modelAvailability: {
            ...s.modelAvailability,
            [result.model]: { available: true, loaded: true },
          },
        }));
      } catch (err: any) {
        if (ac.signal.aborted || gen !== warmGen) return;
        useStudioStore.setState({
          warmingModelId: null,
          modelSwitchError: err?.message || 'Weight load failed',
          generationStatusText: 'Weight load failed',
        });
      }
    })();
  }, 180);
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
  modelAvailability: Record<string, { available: boolean; loaded: boolean }>;
  loadedModelId: string | null;
  warmingModelId: string | null;
  modelSwitchError: string | null;

  // Actions
  setPrompt: (prompt: string) => void;
  setNegativePrompt: (neg: string) => void;
  setSelectedModel: (model: string) => void;
  refreshImageModels: () => Promise<void>;
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
  generateImage: (opts?: {
    prompt?: string;
    model?: string;
    imageUri?: string | null;
    identityUri?: string | null;
    intent?: string;
    idType?: string;
    aspectRatio?: AspectRatioType;
  }) => Promise<GeneratedImage | null>;
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
  modelAvailability: {},
  loadedModelId: null,
  warmingModelId: null,
  modelSwitchError: null,

  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setSelectedModel: (selectedModel) => {
    const defaults = MODEL_SAMPLER_DEFAULTS[selectedModel];
    set({
      selectedModel,
      modelSwitchError: null,
      warmingModelId: selectedModel,
      ...(defaults ? { steps: defaults.steps, guidanceScale: defaults.guidanceScale } : {}),
    });
    void warmSelectedModel(selectedModel);
  },
  refreshImageModels: async () => {
    const host = resolveStudioImageHost();
    try {
      const { models, loaded } = await listImageModels(host, 7860);
      const availability: Record<string, { available: boolean; loaded: boolean }> = {};
      for (const m of models) {
        availability[m.id] = { available: m.available, loaded: m.loaded };
        if (m.steps && MODEL_SAMPLER_DEFAULTS[m.id] === undefined) {
          MODEL_SAMPLER_DEFAULTS[m.id] = {
            steps: m.steps,
            guidanceScale: m.guidance ?? 3.5,
          };
        }
      }
      const current = get().selectedModel;
      const currentAvail = availability[current];
      set({
        modelAvailability: availability,
        loadedModelId: loaded[0] || get().loadedModelId,
      });
      if (currentAvail?.available === false) {
        const fallback =
          models.find((m) => m.available)?.id || 'krea2-raw-fp8';
        if (fallback !== current) get().setSelectedModel(fallback);
      } else if (currentAvail?.available && !currentAvail.loaded && !get().isGenerating) {
        void warmSelectedModel(current);
      }
    } catch {
      set({ modelSwitchError: 'Could not list models on :7860' });
    }
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

  generateImage: async (opts) => {
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
    const runPrompt = (opts?.prompt ?? prompt).trim();
    const runModel = opts?.model || selectedModel;
    const runImage = opts?.imageUri !== undefined ? opts.imageUri : sourceImageUri;
    const runAspect = opts?.aspectRatio || aspectRatio;
    if (!runPrompt && !opts?.intent) return null;
    if (isGenerating) return null;

    const startTime = Date.now();
    const imageHost = resolveStudioImageHost();
    const activeHost = imageHost;

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
          resolveApiUrl(imageHost, 7860, '/v1/progress'),
          resolveApiUrl(imageHost, 7860, '/progress'),
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
            statusStr = 'Loading weights into GB10 unified LPDDR5x';
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
        host: imageHost,
        port: 7860,
        prompt: runPrompt || 'keep original printed data',
        negativePrompt: negativePrompt.trim() || undefined,
        aspectRatio: runAspect,
        imageUri: runImage,
        maskData: opts?.intent ? undefined : maskPaths,
        canvasSize,
        brushSize,
        model: runModel,
        steps,
        guidanceScale,
        seed,
        intent: opts?.intent,
        idImageUri: opts?.identityUri,
        idType: opts?.idType,
        extra: opts?.intent
          ? { mix_ratio: 0.5, timesteps: steps, cfg_scale: guidanceScale }
          : undefined,
      });

      const thumbUri = result.isFallback ? result.uri : await makeHistoryThumbnail(result.uri);
      const historyItem = { ...result, uri: thumbUri || '' };

      if (result.isFallback) {
        set((state) => ({
          isGenerating: false,
          generationProgress: 0,
          generationStatusText: result.error || 'Spark image bridge failed',
          generationStepText: 'Failed',
          currentGeneratedImage: result,
          maskPaths: [],
          isMaskEnabled: false,
          history: [historyItem, ...state.history.slice(0, 29)],
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
          history: [historyItem, ...state.history.slice(0, 29)],
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
        const filename = `assets/studio_render_${cleanTimestamp}.md`;
        const note =
          '# Studio render\n\n' +
          '- id: `' +
          targetImage.id +
          '`\n' +
          '- model: `' +
          targetImage.model +
          '`\n' +
          '- aspect: `' +
          targetImage.aspectRatio +
          '`\n' +
          '- prompt: ' +
          targetImage.prompt.slice(0, 400) +
          '\n\nBinary PNG is not stored in the chat vault. Open Neural Studio to view the current canvas.\n';
        chatState.addOrUpdateFile(envId, filename, note, 'markdown');
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
