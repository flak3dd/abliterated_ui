import { create } from 'zustand';
import { AspectRatioType, GeneratedImage } from '../types';
import type { BgOption, IdWorkflowId, MediaFormat, MediaTier } from '../services/kycIdWorkflows';
import { ID_WORKFLOWS, resolveWorkflowModel } from '../services/kycIdWorkflows';
import { useMeshStore } from './useMeshStore';
import { useChatStore } from './useChatStore';
import {
  generateKreaImage,
  listImageModels,
  loadImageModel,
  makeHistoryThumbnail,
  MODEL_SAMPLER_DEFAULTS,
  readImageProgress,
} from '../services/kreaService';
import { fetchJsonWithTimeout, resolveApiUrl } from '../services/apiConfig';
import { imageDebug } from '../services/imageDebugFeed';
import { imageLoadable } from '../services/modelResolve';
import { isImagePipeLoaded } from '../services/modelCatalog';
import { useModelSession } from './useModelSession';

export interface SparkGpuStats {
  name: string;
  tempC: number;
  gpuUtilPct: number;
  powerDrawW: number;
}

function resolveStudioImageHost(): string {
  const mesh = useMeshStore.getState();
  if (mesh.activeImageHost) return mesh.activeImageHost;
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
  return sparkEp?.host || '192.168.4.103';
}

function warmSelectedModel(modelId: string) {
  const avail = useStudioStore.getState().modelAvailability[modelId];
  const loadable = imageLoadable(modelId, avail);
  useModelSession.getState().setImageSelected(modelId, loadable.ok ? null : loadable.reason);
  const defaults = MODEL_SAMPLER_DEFAULTS[modelId];
  useStudioStore.setState({
    warmingModelId: null,
    loadedModelId:
      useStudioStore.getState().loadedModelId === modelId
        ? modelId
        : useStudioStore.getState().loadedModelId,
    modelSwitchError: loadable.ok ? null : loadable.reason,
    generationStatusText: loadable.ok
      ? isImagePipeLoaded(modelId, useStudioStore.getState().loadedModelId, useStudioStore.getState().modelAvailability)
        ? 'Ready · ' + modelId
        : 'Selected · ' + modelId + ' — load weights to generate'
      : 'Unavailable · ' + modelId,
    ...(defaults ? { steps: defaults.steps, guidanceScale: defaults.guidanceScale } : {}),
  });
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
  loadProgress: number;
  loadStatusText: string;
  modelSwitchError: string | null;
  currentWorkflow: IdWorkflowId;
  bgOption: BgOption;
  bgSolidColor: string;
  bgUploadUri: string | null;
  mediaFormat: MediaFormat;
  mediaTier: MediaTier;

  // Actions
  setPrompt: (prompt: string) => void;
  setNegativePrompt: (neg: string) => void;
  setSelectedModel: (model: string) => void;
  refreshImageModels: () => Promise<void>;
  activateImageModel: (id: string) => Promise<string>;
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
  setCurrentWorkflow: (id: IdWorkflowId) => void;
  setBgOption: (bg: BgOption) => void;
  setBgSolidColor: (color: string) => void;
  setBgUploadUri: (uri: string | null) => void;
  setMediaFormat: (format: MediaFormat) => void;
  setMediaTier: (tier: MediaTier) => void;
  generateImage: (opts?: {
    prompt?: string;
    model?: string;
    imageUri?: string | null;
    identityUri?: string | null;
    intent?: string;
    idType?: string;
    aspectRatio?: AspectRatioType;
    extra?: Record<string, unknown>;
    negativePrompt?: string;
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
  guidanceScale: 3.5,
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
  loadProgress: 0,
  loadStatusText: '',
  modelSwitchError: null,
  currentWorkflow: 'id_front',
  bgOption: 'speckled_stone',
  bgSolidColor: '#1a1a1e',
  bgUploadUri: null,
  mediaFormat: 'png',
  mediaTier: 'standard',

  setCurrentWorkflow: (id) => {
    const wf = ID_WORKFLOWS.find((w) => w.id === id);
    if (!wf) {
      set({ currentWorkflow: id });
      return;
    }
    const model = resolveWorkflowModel(wf, get().modelAvailability);
    set({
      currentWorkflow: id,
      selectedModel: model,
      aspectRatio: wf.defaultAspect,
      modelSwitchError: null,
    });
    void warmSelectedModel(model);
  },
  setBgOption: (bgOption) => set({ bgOption }),
  setBgSolidColor: (bgSolidColor) => set({ bgSolidColor }),
  setBgUploadUri: (bgUploadUri) => set({ bgUploadUri }),
  setMediaFormat: (mediaFormat) => set({ mediaFormat }),
  setMediaTier: (mediaTier) => set({ mediaTier }),
  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setSelectedModel: (selectedModel) => {
    const defaults = MODEL_SAMPLER_DEFAULTS[selectedModel];
    set({
      selectedModel,
      modelSwitchError: null,
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

  activateImageModel: async (id: string) => {
    const host = resolveStudioImageHost();
    const defaults = MODEL_SAMPLER_DEFAULTS[id];
    if (get().isGenerating) {
      throw new Error('Cannot load weights while generating');
    }
    if (get().warmingModelId && get().warmingModelId !== id) {
      throw new Error('Another model is already loading');
    }
    if (isImagePipeLoaded(id, get().loadedModelId, get().modelAvailability)) {
      set({
        selectedModel: id,
        loadProgress: 100,
        loadStatusText: 'Already loaded · ' + id,
        generationStatusText: 'Ready · ' + id,
      });
      return get().loadedModelId || id;
    }
    set({
      selectedModel: id,
      warmingModelId: id,
      modelSwitchError: null,
      loadProgress: 4,
      loadStatusText: 'Connecting to :7860…',
      generationStatusText: 'Loading weights · ' + id,
      ...(defaults ? { steps: defaults.steps, guidanceScale: defaults.guidanceScale } : {}),
    });
    useModelSession.getState().setImageSelected(id);
    let pollBusy = false;
    const poll = setInterval(async () => {
      if (pollBusy) return;
      pollBusy = true;
      try {
        const snap = await readImageProgress(host, 7860);
        if (!snap) return;
        if (snap.busy || snap.status === 'loading') {
          const pct = Math.max(4, Math.min(95, snap.progress || 8));
          set({
            loadProgress: pct,
            loadStatusText:
              snap.status === 'loading'
                ? 'Loading weights · ' + (snap.prompt || id)
                : snap.status + ' · ' + Math.round(pct) + '%',
          });
        }
      } finally {
        pollBusy = false;
      }
    }, 700);
    try {
      const res = await loadImageModel(host, 7860, id);
      const served = res.model || id;
      const avail = { ...(get().modelAvailability || {}) };
      for (const key of Object.keys(avail)) {
        avail[key] = { ...avail[key], loaded: false };
      }
      avail[id] = { available: true, loaded: true };
      avail[served] = { available: true, loaded: true };
      set({
        loadedModelId: served,
        warmingModelId: null,
        loadProgress: 100,
        loadStatusText: 'Loaded · ' + served,
        generationStatusText: 'Ready · ' + served,
        modelAvailability: avail,
        modelSwitchError: null,
      });
      useMeshStore.setState({ imageLoadedModel: served });
      useModelSession.getState().setImageServing(served, 'ready', null);
      if (res.params?.steps) {
        set({
          steps: res.params.steps,
          guidanceScale: res.params.guidance || get().guidanceScale,
        });
      }
      return served;
    } catch (error: any) {
      const msg = error?.message || 'load failed';
      set({
        warmingModelId: null,
        loadProgress: 0,
        loadStatusText: 'Load failed',
        modelSwitchError: msg,
        generationStatusText: 'Load failed · ' + id,
      });
      useModelSession.getState().setImageServing(id, 'error', msg);
      throw error;
    } finally {
      clearInterval(poll);
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

    const loadable = imageLoadable(runModel, get().modelAvailability[runModel]);
    if (!loadable.ok) {
      set({
        generationStatusText: loadable.reason || 'Model unavailable',
        modelSwitchError: loadable.reason,
      });
      return null;
    }
    if (get().warmingModelId) {
      set({ generationStatusText: 'Wait for weights to finish loading' });
      return null;
    }
    const loadedId = get().loadedModelId || '';
    const alreadyLoaded = isImagePipeLoaded(runModel, loadedId, get().modelAvailability);
    if (!alreadyLoaded) {
      set({
        generationStatusText: 'Load weights first · ' + runModel,
        generationStepText: 'Weights not on GPU',
      });
      return null;
    }
    imageDebug('run_start', runPrompt.slice(0, 160) || opts?.intent || 'generate', {
      source: opts?.intent ? 'id-studio' : 'studio',
      model: runModel,
      host: imageHost,
      detail: { intent: opts?.intent, aspect: runAspect },
    });
    useModelSession.getState().setImageBusy(true);
    set({
      isGenerating: true,
      generationProgress: 4,
      generationStatusText: 'Connecting to DGX Spark (:7860)...',
      generationStepText: 'Starting sampler',
      generationElapsedSec: 0,
    });

    let pollBusy = false;
    let gpuTick = 0;
    const pollInterval: ReturnType<typeof setInterval> = setInterval(async () => {
      if (pollBusy) return;
      pollBusy = true;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      try {
        const snap = await readImageProgress(imageHost, 7860);

        if (snap && snap.busy) {
          const pct = snap.progress;
          const status = snap.status || 'running';
          const totalSteps = snap.steps || steps;
          const reportedStep = snap.step;

          let statusStr = 'Latent Diffusion Synthesis';
          let stepStr = '';
          let nextPct = Math.max(0, Math.min(99, pct));

          if (status === 'loading') {
            statusStr = 'Loading weights into GB10 unified LPDDR5x';
            stepStr = snap.prompt ? 'Loading ' + snap.prompt : 'Model Pipeline Init';
            nextPct = Math.max(1, Math.min(15, pct || 8));
          } else if (status === 'encoding') {
            statusStr = 'Neural VAE Decoding & Base64 Encode';
            stepStr = 'Finalizing Pixels';
          } else if (status === 'running') {
            const currentStep =
              typeof reportedStep === 'number'
                ? Math.max(0, Math.min(totalSteps, reportedStep))
                : Math.max(0, Math.min(totalSteps, Math.round(((pct - 5) / 90) * totalSteps)));
            stepStr =
              currentStep > 0
                ? 'Step ' + currentStep + ' of ' + totalSteps + ' (Denoising)'
                : 'Starting sampler · ' + totalSteps + ' steps';
            statusStr = 'Latent Diffusion Sampling';
          } else if (status === 'done') {
            statusStr = 'Render Complete';
            stepStr = 'Complete';
          }

          const prev = get();
          const prevPct = prev.generationProgress;
          const prevStatus = prev.generationStatusText;
          set({
            generationProgress: nextPct,
            generationStatusText: statusStr,
            generationStepText: stepStr,
            generationElapsedSec: elapsed,
          });
          if (statusStr !== prevStatus || Math.floor(nextPct / 10) !== Math.floor(prevPct / 10)) {
            imageDebug('progress', statusStr + ' ' + Math.round(nextPct) + '%', {
              source: 'progress',
              level: 'debug',
              model: runModel,
              host: imageHost,
              elapsedMs: elapsed * 1000,
              detail: { step: stepStr, busy: snap.busy },
            });
          }
        } else {
          set({ generationElapsedSec: elapsed });
        }
      } catch {
        set({ generationElapsedSec: elapsed });
      }

      try {
        gpuTick += 1;
        if (gpuTick % 3 === 1) {
          const urls = [
            resolveApiUrl('127.0.0.1', 17325, '/api/status'),
            resolveApiUrl(
              activeHost === '127.0.0.1' || activeHost === 'localhost' ? '127.0.0.1' : activeHost,
              17325,
              '/api/status'
            ),
          ];
          let gpu: Record<string, any> | null = null;
          for (const url of urls) {
            const ctrlRes = await fetchJsonWithTimeout(url, 2000);
            if (ctrlRes.ok && ctrlRes.data?.gpu && !ctrlRes.data.gpu.error) {
              gpu = ctrlRes.data.gpu;
              break;
            }
          }
          if (gpu) {
            set({
              sparkGpuStats: {
                name: gpu.name || 'NVIDIA GPU',
                tempC: gpu.tempC || 0,
                gpuUtilPct: gpu.gpuUtilPct || 0,
                powerDrawW: gpu.powerDrawW || 0,
              },
            });
          }
        }
      } catch {
        // GPU HUD is optional
      } finally {
        pollBusy = false;
      }
    }, 1000);

    try {
      const result = await generateKreaImage({
        host: imageHost,
        port: 7860,
        prompt: runPrompt || 'keep original printed data',
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
        extra: {
          ...(opts?.intent
            ? { mix_ratio: 0.5, timesteps: steps, cfg_scale: guidanceScale }
            : {}),
          ...(opts?.extra || {}),
        },
        negativePrompt: opts?.negativePrompt !== undefined ? opts.negativePrompt : negativePrompt.trim() || undefined,
      });

      const thumbUri = result.isFallback ? result.uri : await makeHistoryThumbnail(result.uri);
      const historyItem = { ...result, uri: thumbUri || '' };

      if (result.isFallback) {
        useModelSession.getState().setImageServing(runModel, 'error', result.error || 'generate failed');
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
        useMeshStore.setState({ imageLoadedModel: result.model });
        useModelSession.getState().setImageServing(result.model, 'ready', null);
        set((state) => ({
          isGenerating: false,
          generationProgress: 100,
          generationStatusText: 'Ready · ' + result.model,
          generationStepText: '100% Done',
          currentGeneratedImage: result,
          sourceImageUri: result.uri,
          loadedModelId: result.model,
          maskPaths: [],
          isMaskEnabled: false,
          history: [historyItem, ...state.history.slice(0, 29)],
        }));
      }
      return result;
    } catch (error: any) {
      console.error('Image generation error in StudioStore:', error);
      useModelSession.getState().setImageServing(runModel, 'error', error?.message || 'generate failed');
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
