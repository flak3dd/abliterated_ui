import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Image as RNImage,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import {
  Camera,
  Image as ImageIcon,
  Paintbrush,
  Share2,
  Sparkles,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Dices,
  Trash2,
  X,
  History,
  Download,
  Copy,
  FlaskConical,
  Eye,
  Layers,
  Expand,
  Shrink,
} from 'lucide-react-native';
import Colors from '../../theme/colors';
import { useStudioStore } from '../../stores/useStudioStore';
import { HeaderBar } from '../../components/ui/HeaderBar';
import { DrawerMenu } from '../../components/ui/DrawerMenu';
import { DesktopSidebar } from '../../components/ui/DesktopSidebar';
import { EnvironmentModal } from '../../components/chat/EnvironmentModal';
import { TouchInpaintCanvas } from '../../components/studio/TouchInpaintCanvas';
import { AspectRatioPicker } from '../../components/studio/AspectRatioPicker';
import { ModelPicker, SPARK_IMAGE_MODELS } from '../../components/studio/ModelPicker';
import { BrushSizeSlider } from '../../components/studio/BrushSizeSlider';
import { Toast } from '../../components/ui/Toast';
import { dataUrlToRawBase64, extensionForImageUri, uriToDataUrl } from '../../services/kreaService';

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

const PRESET_IDEAS = [
  'Studio RAW portrait, 85mm f/1.2 lens, soft rim lighting, ultra-detailed skin textures, 8k',
  'Cyberpunk street with emerald volumetric neon lighting and wet reflections, 8k raw',
  'Blackwell GB10 GPU die architecture on holographic workbench, schematic traces',
  'Macro water droplet reflecting deep space galaxy, 100mm macro f/2.8, hyper-detailed',
  'Anime studio portrait with obsidian armor, glowing emerald runic engravings',
];

export default function StudioScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 900;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'info' | 'warning'>('info');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNegative, setShowNegative] = useState(false);
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);

  const {
    prompt,
    negativePrompt,
    selectedModel,
    aspectRatio,
    brushSize,
    isMaskEnabled,
    sourceImageUri,
    maskPaths,
    history,
    isGenerating,
    currentGeneratedImage,
    generationProgress,
    generationStatusText,
    generationStepText,
    generationElapsedSec,
    sparkGpuStats,
    steps,
    guidanceScale,
    seed,
    isHistoryOpen,
    setPrompt,
    setNegativePrompt,
    setSelectedModel,
    setAspectRatio,
    setBrushSize,
    setSteps,
    setGuidanceScale,
    setSeed,
    toggleHistoryOpen,
    toggleMaskEnabled,
    setSourceImageUri,
    setMaskPaths,
    setCanvasSize,
    clearMask,
    generateImage,
    enhancePrompt,
    exportToSandbox,
    selectFromHistory,
    clearHistory,
  } = useStudioStore();

  const showToast = useCallback((msg: string, type: 'success' | 'info' | 'warning' = 'info') => {
    setToastType(type);
    setToastMsg(msg);
  }, []);

  const handleGenerate = useCallback(async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}
    const result = await generateImage();
    if (!result) {
      const status = useStudioStore.getState().generationStatusText;
      showToast(
        status && status !== 'Ready' ? status : 'Enter a vision prompt first',
        'warning'
      );
      return;
    }
    if (result.isFallback) {
      showToast(result.error || 'Spark image bridge failed', 'warning');
    } else {
      showToast('Synthesis complete', 'success');
    }
  }, [generateImage, showToast]);

  // Desktop keyboard shortcuts: ⌘+Enter to generate, Esc to exit expanded stage
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          if (!isGenerating && prompt.trim()) {
            handleGenerate();
          }
        } else if (e.key === 'Escape' && isCanvasExpanded) {
          setIsCanvasExpanded(false);
          setIsSidebarOpen(true);
          setIsInspectorCollapsed(false);
          showToast('Standard Stage active');
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [prompt, isGenerating, isCanvasExpanded, handleGenerate, showToast]);

  const handlePickImage = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.95,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setSourceImageUri(result.assets[0].uri);
        showToast('Photo loaded — draw a mask to inpaint');
      }
    } catch (e) {
      console.warn('Image picker error:', e);
    }
  };

  const handleLaunchCamera = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showToast('Camera permission required', 'warning');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.95,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setSourceImageUri(result.assets[0].uri);
        showToast('Camera capture ready — draw a mask to inpaint');
      }
    } catch (e) {
      console.warn('Camera launch error:', e);
    }
  };

  const handleEnhance = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    const mode = await enhancePrompt();
    if (mode === 'llm') {
      showToast('Prompt rewritten by Spark', 'success');
    } else if (mode === 'local') {
      showToast('Prompt enriched with studio optics tokens');
    } else {
      showToast('Prompt already fully enhanced');
    }
  };

  const handleDownload = async () => {
    const uri = currentGeneratedImage?.uri || sourceImageUri;
    if (!uri) return;
    if (currentGeneratedImage?.isFallback) {
      showToast('Nothing to save — generation failed', 'warning');
      return;
    }
    try {
      const ext = extensionForImageUri(uri);
      if (Platform.OS === 'web') {
        const dataUrl = uri.startsWith('data:') ? uri : await uriToDataUrl(uri);
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `krea2-studio-${selectedModel}-${aspectRatio.replace(':', 'x')}-${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
        showToast('Image downloaded', 'success');
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch (e) {
      console.warn('Download error:', e);
      showToast('Download failed', 'warning');
    }
  };

  const handleCopyImage = async () => {
    const uri = currentGeneratedImage?.uri || sourceImageUri;
    if (!uri) return;
    if (currentGeneratedImage?.isFallback) {
      showToast('Nothing to copy — generation failed', 'warning');
      return;
    }
    try {
      const dataUrl = uri.startsWith('data:') ? uri : await uriToDataUrl(uri);
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.write) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'image/png';
        const ClipboardItemCtor = (globalThis as any).ClipboardItem;
        if (!ClipboardItemCtor) {
          throw new Error('ClipboardItem unavailable');
        }
        await navigator.clipboard.write([new ClipboardItemCtor({ [type]: blob })]);
        showToast('Image copied to clipboard', 'success');
        return;
      }
      const parsed = dataUrlToRawBase64(dataUrl);
      if (parsed) {
        try {
          const pkg = 'expo-clipboard';
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const ExpoClipboard = require(pkg);
          if (ExpoClipboard?.setImageAsync) {
            await ExpoClipboard.setImageAsync(parsed.base64);
            showToast('Image copied to clipboard', 'success');
            return;
          }
        } catch {}
      }
      showToast('Could not copy image bytes', 'warning');
    } catch (e) {
      console.warn('Copy image error:', e);
      showToast('Could not copy image', 'warning');
    }
  };

  const handleSendToSandbox = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    const success = exportToSandbox();
    if (success) {
      showToast('Synced to Chat Sandbox (assets/)', 'success');
    } else {
      showToast('Failed to sync to sandbox', 'warning');
    }
  };

  const handleInpaintThis = () => {
    const uri = currentGeneratedImage?.uri;
    if (uri) {
      setSourceImageUri(uri);
      toggleMaskEnabled(true);
      showToast('Output set as inpainting source');
    }
  };

  const handleRandomizeSeed = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    const newSeed = Math.floor(Math.random() * 99999999);
    setSeed(newSeed);
    showToast('Seed randomized: ' + newSeed);
  };

  const currentModelObj = SPARK_IMAGE_MODELS.find((m) => m.id === selectedModel);

  const toggleExpandCanvas = () => {
    const nextExpanded = !isCanvasExpanded;
    setIsCanvasExpanded(nextExpanded);
    if (nextExpanded) {
      setIsSidebarOpen(false);
      setIsInspectorCollapsed(true);
      showToast('Theater Stage expanded (Press ESC to restore)');
    } else {
      setIsSidebarOpen(true);
      setIsInspectorCollapsed(false);
      showToast('Standard Stage active');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.appRow}>
        {/* Persistent Desktop Sidebar */}
        {isDesktop && isSidebarOpen && (
          <DesktopSidebar onOpenEnvModal={() => setEnvModalOpen(true)} />
        )}

        {/* Main Studio Workstation Column */}
        <View style={styles.mainWorkspace}>
          {/* Header Bar */}
          <HeaderBar
            onOpenDrawer={() => setDrawerOpen(true)}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            isSidebarOpen={isSidebarOpen}
            isDesktop={isDesktop}
            title="Neural Studio"
            subtitle="RAW FP8"
            modelTag={currentModelObj ? `${currentModelObj.name} (${currentModelObj.badge})` : 'Krea 2 RAW'}
            modelSub="DGX Spark :7860"
          />

          {/* Top Global Sub-Bar on Desktop */}
          {isDesktop && (
            <View style={styles.desktopSubBar}>
              <View style={styles.subBarLeft}>
                <View style={styles.activeEngineDot} />
                <Text style={styles.subBarTitle}>CREATIVE DIFFUSION WORKSTATION</Text>
                <Text style={styles.subBarSep}>•</Text>
                <Text style={styles.subBarSpecs}>GB10 Blackwell Unified HBM3e</Text>
              </View>

              <View style={styles.subBarRight}>
                <TouchableOpacity
                  style={[styles.stageExpandBtn, isCanvasExpanded && styles.stageExpandBtnActive]}
                  onPress={toggleExpandCanvas}
                  activeOpacity={0.75}
                >
                  {isCanvasExpanded ? (
                    <>
                      <Shrink size={13} color="#09090B" />
                      <Text style={[styles.stageExpandText, styles.stageExpandTextActive]}>
                        Standard Stage
                      </Text>
                    </>
                  ) : (
                    <>
                      <Expand size={13} color={Colors.brand.emerald} />
                      <Text style={styles.stageExpandText}>Expand Canvas</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.historyToggleBtn, isHistoryOpen && styles.historyToggleBtnActive]}
                  onPress={() => toggleHistoryOpen()}
                  activeOpacity={0.75}
                >
                  <History size={13} color={isHistoryOpen ? '#09090B' : Colors.brand.emerald} />
                  <Text style={[styles.historyToggleText, isHistoryOpen && styles.historyToggleTextActive]}>
                    History ({history.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Desktop Workspace Split-Pane */}
          {isDesktop ? (
            <View style={styles.desktopPaneWrapper}>
              {/* Left Inspector Controls Column */}
              {!isInspectorCollapsed && (
                <ScrollView
                  style={styles.inspectorScroll}
                  contentContainerStyle={styles.inspectorContent}
                  showsVerticalScrollIndicator={false}
                >
                {/* 1. Prompt Engineering Box */}
                <View style={styles.cardSection}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.sectionLabel}>VISION PROMPT</Text>
                    <View style={styles.promptActions}>
                      <TouchableOpacity
                        style={styles.enhanceBtn}
                        onPress={handleEnhance}
                        activeOpacity={0.7}
                      >
                        <Sparkles size={11} color={Colors.brand.emerald} />
                        <Text style={styles.enhanceBtnText}>Spark Enhance</Text>
                      </TouchableOpacity>
                      {prompt.length > 0 && (
                        <TouchableOpacity
                          style={styles.clearBtn}
                          onPress={() => setPrompt('')}
                          activeOpacity={0.7}
                        >
                          <Trash2 size={11} color="#71717A" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <TextInput
                    style={styles.desktopPromptInput}
                    placeholder="Describe your vision in raw photographic detail..."
                    placeholderTextColor="#52525B"
                    value={prompt}
                    onChangeText={setPrompt}
                    multiline
                  />

                  {/* Preset Inspiration Pills */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.presetScrollRow}
                  >
                    {PRESET_IDEAS.map((idea, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.presetPill}
                        onPress={() => {
                          try {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          } catch (e) {}
                          setPrompt(idea);
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.presetPillText} numberOfLines={1}>
                          {idea.split(',')[0]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Negative Prompt Expandable Accordion */}
                  <View style={styles.negativeToggleRow}>
                    <TouchableOpacity
                      style={styles.negativeToggleBtn}
                      onPress={() => setShowNegative(!showNegative)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.negativeToggleText}>
                        {showNegative ? '− Hide Negative Prompt' : '+ Add Negative Prompt'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {showNegative && (
                    <TextInput
                      style={styles.negativePromptInput}
                      placeholder="blurry, low quality, artifacts, distortion..."
                      placeholderTextColor="#52525B"
                      value={negativePrompt}
                      onChangeText={setNegativePrompt}
                      multiline
                    />
                  )}
                </View>

                {/* 2. Aspect Ratio Selector */}
                <View style={styles.cardSection}>
                  <Text style={styles.sectionLabel}>ASPECT RATIO & FRAMING</Text>
                  <AspectRatioPicker
                    selected={aspectRatio}
                    onSelect={setAspectRatio}
                    disabled={isGenerating}
                  />
                </View>

                {/* 3. Diffusion Engine Cards */}
                <View style={styles.cardSection}>
                  <Text style={styles.sectionLabel}>DIFFUSION ENGINE (SPARK :7860)</Text>
                  <ModelPicker
                    selected={selectedModel}
                    onSelect={setSelectedModel}
                    disabled={isGenerating}
                    isGrid={true}
                  />
                </View>

                {/* 4. Advanced Generation Parameters Accordion */}
                <View style={styles.cardSection}>
                  <TouchableOpacity
                    style={styles.accordionHeader}
                    onPress={() => setShowAdvanced(!showAdvanced)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.accordionTitleRow}>
                      <Sliders size={13} color={Colors.brand.emerald} />
                      <Text style={styles.sectionLabel}>ADVANCED PARAMETERS</Text>
                    </View>
                    {showAdvanced ? (
                      <ChevronUp size={14} color="#71717A" />
                    ) : (
                      <ChevronDown size={14} color="#71717A" />
                    )}
                  </TouchableOpacity>

                  {showAdvanced && (
                    <View style={styles.advancedBody}>
                      {/* Steps */}
                      <View style={styles.paramRow}>
                        <View style={styles.paramLabelCol}>
                          <Text style={styles.paramTitle}>Inference Steps</Text>
                          <Text style={styles.paramSubtitle}>Sampling iterations ({steps} steps)</Text>
                        </View>
                        <View style={styles.stepperWrap}>
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() => setSteps(Math.max(4, steps - 4))}
                          >
                            <Text style={styles.stepBtnText}>-</Text>
                          </TouchableOpacity>
                          <Text style={styles.stepperVal}>{steps}</Text>
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() => setSteps(Math.min(50, steps + 4))}
                          >
                            <Text style={styles.stepBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Guidance Scale */}
                      <View style={styles.paramRow}>
                        <View style={styles.paramLabelCol}>
                          <Text style={styles.paramTitle}>Guidance (CFG)</Text>
                          <Text style={styles.paramSubtitle}>Prompt adherence scale ({guidanceScale})</Text>
                        </View>
                        <View style={styles.stepperWrap}>
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() => setGuidanceScale(Math.max(1, Number((guidanceScale - 0.5).toFixed(1))))}
                          >
                            <Text style={styles.stepBtnText}>-</Text>
                          </TouchableOpacity>
                          <Text style={styles.stepperVal}>{guidanceScale}</Text>
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() => setGuidanceScale(Math.min(15, Number((guidanceScale + 0.5).toFixed(1))))}
                          >
                            <Text style={styles.stepBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Seed */}
                      <View style={styles.paramRow}>
                        <View style={styles.paramLabelCol}>
                          <Text style={styles.paramTitle}>Generation Seed</Text>
                          <Text style={styles.paramSubtitle}>
                            {seed !== null ? `Seed: ${seed}` : 'Random Seed (Automatic)'}
                          </Text>
                        </View>
                        <View style={styles.seedActions}>
                          <TouchableOpacity
                            style={styles.diceBtn}
                            onPress={handleRandomizeSeed}
                            activeOpacity={0.7}
                          >
                            <Dices size={13} color={Colors.brand.emerald} />
                            <Text style={styles.diceBtnText}>Randomize</Text>
                          </TouchableOpacity>
                          {seed !== null && (
                            <TouchableOpacity
                              style={styles.resetSeedBtn}
                              onPress={() => setSeed(null)}
                            >
                              <Text style={styles.resetSeedText}>Auto</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  )}
                </View>

                {/* 5. Inpaint Masking & Upload Tools */}
                <View style={styles.cardSection}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.sectionLabel}>INPAINT & RETOUCH</Text>
                    <TouchableOpacity
                      style={[styles.maskToggleBtn, isMaskEnabled && styles.maskToggleBtnActive]}
                      onPress={() => toggleMaskEnabled()}
                      activeOpacity={0.7}
                    >
                      <Paintbrush
                        size={12}
                        color={isMaskEnabled ? Colors.brand.rose : Colors.text.secondary}
                      />
                      <Text
                        style={[
                          styles.maskToggleText,
                          isMaskEnabled && styles.maskToggleTextActive,
                        ]}
                      >
                        {isMaskEnabled ? 'Inpaint ON' : 'Draw Mask'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Upload Image Buttons */}
                  <View style={styles.uploadRow}>
                    <TouchableOpacity
                      style={styles.uploadBtn}
                      onPress={handlePickImage}
                      activeOpacity={0.7}
                    >
                      <ImageIcon size={14} color="#A1A1AA" />
                      <Text style={styles.uploadBtnText}>Upload Photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.uploadBtn}
                      onPress={handleLaunchCamera}
                      activeOpacity={0.7}
                    >
                      <Camera size={14} color="#A1A1AA" />
                      <Text style={styles.uploadBtnText}>Camera</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Brush Size Slider (if mask enabled) */}
                  {isMaskEnabled && (
                    <View style={styles.brushRow}>
                      <BrushSizeSlider
                        brushSize={brushSize}
                        onBrushSizeChange={setBrushSize}
                      />
                    </View>
                  )}
                </View>

                {/* 6. Big Radiant Synthesis CTA */}
                <View style={styles.ctaWrapper}>
                  <TouchableOpacity
                    style={[styles.primaryGenerateBtn, isGenerating && styles.primaryGenerateBtnDisabled]}
                    onPress={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    activeOpacity={0.8}
                  >
                    {isGenerating ? (
                      <View style={styles.progressBtnWrap}>
                        <View
                          style={[
                            styles.progressBtnFill,
                            { width: Math.max(5, Math.min(100, generationProgress)) + '%' },
                          ]}
                        />
                        <View style={styles.progressBtnInner}>
                          <ActivityIndicator size="small" color="#09090B" />
                          <Text style={styles.progressBtnText}>
                            {Math.round(generationProgress) + '% • ' + (generationStepText || generationStatusText || 'Diffusing...') + ' (' + formatElapsed(generationElapsedSec) + ')'}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.btnContentRow}>
                        <Sparkles size={18} color="#09090B" />
                        <Text style={styles.primaryGenerateBtnText}>
                          {maskPaths.length > 0 ? 'Inpaint with ' : 'Synthesize with '}
                          {currentModelObj?.name || 'Krea 2 RAW'}
                        </Text>
                        <Text style={styles.kbdHint}>⌘↵</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

              {/* Center Canvas Stage */}
              <View style={[styles.centerCanvasStage, isCanvasExpanded && styles.centerCanvasStageExpanded]}>
                {isInspectorCollapsed && (
                  <TouchableOpacity
                    style={styles.floatingControlsBtn}
                    onPress={() => {
                      setIsInspectorCollapsed(false);
                      setIsCanvasExpanded(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Sliders size={13} color={Colors.brand.emerald} />
                    <Text style={styles.floatingControlsText}>Show Inspector</Text>
                  </TouchableOpacity>
                )}

                <TouchInpaintCanvas
                  imageUri={currentGeneratedImage?.uri || sourceImageUri}
                  originalImageUri={history[1]?.uri || sourceImageUri}
                  brushSize={brushSize}
                  isMaskEnabled={isMaskEnabled}
                  aspectRatio={aspectRatio}
                  onMaskChange={setMaskPaths}
                  onClearMask={clearMask}
                  onCanvasLayout={setCanvasSize}
                  isFallback={Boolean(currentGeneratedImage?.isFallback)}
                  onImageDrop={(dataUrl) => {
                    setSourceImageUri(dataUrl);
                    showToast('Image loaded onto canvas');
                  }}
                  onDownloadImage={handleDownload}
                  onCopyImage={handleCopyImage}
                  onSendToSandbox={handleSendToSandbox}
                  onInpaintThis={handleInpaintThis}
                  onRegenerate={handleGenerate}
                  isGenerating={isGenerating}
                  progress={generationProgress}
                  statusText={generationStatusText}
                  stepText={generationStepText}
                  elapsedSec={generationElapsedSec}
                  modelName={currentModelObj?.name || 'Krea 2 RAW'}
                  gpuStats={sparkGpuStats}
                  isDesktop={true}
                  isExpanded={isCanvasExpanded}
                  onToggleExpand={toggleExpandCanvas}
                />
              </View>

              {/* Right History Deck (Collapsible) */}
              {isHistoryOpen && (
                <View style={styles.historyDeck}>
                  <View style={styles.historyDeckHeader}>
                    <View style={styles.historyTitleRow}>
                      <History size={14} color={Colors.brand.emerald} />
                      <Text style={styles.historyDeckTitle}>CREATIONS ({history.length})</Text>
                    </View>
                    {history.length > 0 && (
                      <TouchableOpacity
                        onPress={() => clearHistory()}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.clearHistoryText}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <ScrollView
                    style={styles.historyListScroll}
                    contentContainerStyle={styles.historyListContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {history.length === 0 ? (
                      <View style={styles.emptyHistory}>
                        <ImageIcon size={28} color="#3F3F46" />
                        <Text style={styles.emptyHistoryText}>No creations yet</Text>
                        <Text style={styles.emptyHistorySub}>
                          Synthesized images will appear here in this session
                        </Text>
                      </View>
                    ) : (
                      history.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.historyCard, item.isFallback && styles.historyCardFailed]}
                          onPress={() => selectFromHistory(item)}
                          activeOpacity={0.75}
                        >
                          <RNImage
                            source={{ uri: item.uri }}
                            style={styles.historyCardImage}
                            resizeMode="cover"
                          />
                          <View style={styles.historyCardMeta}>
                            <Text style={styles.historyAspectRatioBadge}>{item.aspectRatio}</Text>
                            <Text style={styles.historyModelTag}>
                              {item.isFallback ? 'FAILED' : item.model.split('-')[0]}
                            </Text>
                          </View>
                          <Text style={styles.historyCardPrompt} numberOfLines={3}>
                            {item.isFallback ? item.error || item.prompt : item.prompt}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          ) : (
            /* Mobile / Tablet Viewport Stack */
            <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
              {/* Preset Idea Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetScroll}
              >
                {PRESET_IDEAS.map((idea, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.ideaChip}
                    onPress={() => {
                      try {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      } catch (e) {}
                      setPrompt(idea);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.ideaText} numberOfLines={1}>
                      {idea.split(',')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Prompt Input & Capture Bar */}
              <View style={styles.promptCard}>
                <TextInput
                  style={styles.promptInput}
                  placeholder="Describe your vision (e.g., Cyberpunk neon street, 8k raw)..."
                  placeholderTextColor={Colors.text.tertiary}
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                />

                <View style={styles.promptTools}>
                  <View style={styles.toolsLeft}>
                    <TouchableOpacity
                      style={styles.toolIconBtn}
                      onPress={handleLaunchCamera}
                      activeOpacity={0.7}
                    >
                      <Camera size={18} color={Colors.text.secondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.toolIconBtn}
                      onPress={handlePickImage}
                      activeOpacity={0.7}
                    >
                      <ImageIcon size={18} color={Colors.text.secondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.toolIconBtn}
                      onPress={handleEnhance}
                      activeOpacity={0.7}
                    >
                      <Sparkles size={16} color={Colors.brand.emerald} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.maskToggleBtn,
                      isMaskEnabled && styles.maskToggleBtnActive,
                    ]}
                    onPress={() => toggleMaskEnabled()}
                    activeOpacity={0.7}
                  >
                    <Paintbrush
                      size={16}
                      color={isMaskEnabled ? Colors.brand.rose : Colors.text.secondary}
                    />
                    <Text
                      style={[
                        styles.maskToggleText,
                        isMaskEnabled && styles.maskToggleTextActive,
                      ]}
                    >
                      {isMaskEnabled ? 'Inpaint ON' : 'Draw Mask'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Diffusion Model Selector */}
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>IMAGE MODEL (SPARK :7860)</Text>
                <ModelPicker
                  selected={selectedModel}
                  onSelect={setSelectedModel}
                  disabled={isGenerating}
                />
              </View>

              {/* Aspect Ratio Selector */}
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>ASPECT RATIO</Text>
                <AspectRatioPicker
                  selected={aspectRatio}
                  onSelect={setAspectRatio}
                  disabled={isGenerating}
                />
              </View>

              {/* Brush Size Slider (Visible if mask enabled) */}
              {isMaskEnabled && (
                <View style={styles.sectionRow}>
                  <BrushSizeSlider
                    brushSize={brushSize}
                    onBrushSizeChange={setBrushSize}
                  />
                </View>
              )}

              {/* Inpainting Canvas */}
              <View style={styles.canvasWrapper}>
                <TouchInpaintCanvas
                  imageUri={currentGeneratedImage?.uri || sourceImageUri}
                  originalImageUri={history[1]?.uri || sourceImageUri}
                  brushSize={brushSize}
                  isMaskEnabled={isMaskEnabled}
                  aspectRatio={aspectRatio}
                  onMaskChange={setMaskPaths}
                  onClearMask={clearMask}
                  onCanvasLayout={setCanvasSize}
                  isFallback={Boolean(currentGeneratedImage?.isFallback)}
                  onImageDrop={(dataUrl) => {
                    setSourceImageUri(dataUrl);
                    showToast('Image loaded onto canvas');
                  }}
                  onDownloadImage={handleDownload}
                  onCopyImage={handleCopyImage}
                  onSendToSandbox={handleSendToSandbox}
                  onInpaintThis={handleInpaintThis}
                  onRegenerate={handleGenerate}
                  isGenerating={isGenerating}
                  progress={generationProgress}
                  statusText={generationStatusText}
                  stepText={generationStepText}
                  elapsedSec={generationElapsedSec}
                  modelName={currentModelObj?.name || selectedModel}
                  gpuStats={sparkGpuStats}
                  isDesktop={false}
                  isExpanded={isCanvasExpanded}
                  onToggleExpand={toggleExpandCanvas}
                />
              </View>

              {/* Primary Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.generateBtn, isGenerating && styles.generateBtnDisabled]}
                  onPress={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                  activeOpacity={0.8}
                >
                  {isGenerating ? (
                    <View style={styles.generateBtnProgressWrap}>
                      <View style={[styles.generateBtnProgressBar, { width: Math.max(5, Math.min(100, generationProgress)) + '%' }]} />
                      <View style={styles.generateBtnInner}>
                        <ActivityIndicator size="small" color="#09090B" />
                        <Text style={styles.generateBtnTextActive}>
                          {Math.round(generationProgress) + '% • ' + (generationStepText || generationStatusText || 'Synthesizing...') + ' (' + formatElapsed(generationElapsedSec) + ')'}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <>
                      <Sparkles size={18} color="#09090B" />
                      <Text style={styles.generateBtnText}>
                        {maskPaths.length > 0 ? 'Inpaint with ' + (currentModelObj?.name || 'Krea 2') : 'Generate with ' + (currentModelObj?.name || 'Krea 2')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {sourceImageUri && (
                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={handleDownload}
                    activeOpacity={0.7}
                  >
                    <Download size={18} color={Colors.text.primary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Recent Creations History */}
              {history.length > 0 && (
                <View style={styles.historySection}>
                  <Text style={styles.sectionTitle}>GENERATION HISTORY</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.historyGrid}>
                      {history.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.historyThumb, item.isFallback && styles.historyCardFailed]}
                          onPress={() => selectFromHistory(item)}
                          activeOpacity={0.7}
                        >
                          <RNImage
                            source={{ uri: item.uri }}
                            style={styles.historyMobileThumbImage}
                            resizeMode="cover"
                          />
                          <Text style={styles.historyModelTag}>
                            {item.isFallback ? 'FAILED' : item.aspectRatio}
                          </Text>
                          <Text style={styles.historyPrompt} numberOfLines={2}>
                            {item.isFallback ? item.error || item.prompt : item.prompt}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>

      {/* Toast Feedback */}
      <Toast
        message={toastMsg}
        visible={Boolean(toastMsg)}
        type={toastType}
        onDismiss={() => setToastMsg(null)}
      />

      {/* Mobile Drawer Menu */}
      <DrawerMenu visible={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Ephemeral Environment Modal */}
      <EnvironmentModal
        visible={envModalOpen}
        onClose={() => setEnvModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08080B',
  },
  appRow: {
    flex: 1,
    flexDirection: 'row',
  },
  mainWorkspace: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  // Desktop Sub Bar
  desktopSubBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: 'rgba(12, 13, 18, 0.75)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  subBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeEngineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3B82F6',
  },
  subBarTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#A1A1AA',
    letterSpacing: 0.8,
    fontFamily: 'Menlo',
  },
  subBarSep: {
    color: '#3F3F46',
  },
  subBarSpecs: {
    fontSize: 11,
    color: '#71717A',
  },
  subBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stageExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  stageExpandBtnActive: {
    backgroundColor: Colors.brand.emerald,
    borderColor: Colors.brand.emerald,
  },
  stageExpandText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brand.emerald,
  },
  stageExpandTextActive: {
    color: '#09090B',
  },
  historyToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  historyToggleBtnActive: {
    backgroundColor: Colors.brand.emerald,
    borderColor: Colors.brand.emerald,
  },
  historyToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brand.emerald,
  },
  historyToggleTextActive: {
    color: '#09090B',
  },

  // Desktop Split Pane
  desktopPaneWrapper: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  inspectorScroll: {
    width: 390,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0a0a0e',
  },
  inspectorContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  cardSection: {
    backgroundColor: 'rgba(18, 18, 22, 0.75)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#71717A',
    letterSpacing: 0.8,
    fontFamily: 'Menlo',
  },
  promptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  enhanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  enhanceBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: Colors.brand.emerald,
  },
  clearBtn: {
    padding: 4,
  },
  desktopPromptInput: {
    color: '#F4F4F5',
    fontSize: 13.5,
    minHeight: 76,
    textAlignVertical: 'top',
    lineHeight: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  presetScrollRow: {
    gap: 6,
    paddingVertical: 2,
  },
  presetPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    maxWidth: 220,
  },
  presetPillText: {
    fontSize: 11,
    color: '#A1A1AA',
    fontWeight: '500',
  },
  negativeToggleRow: {
    alignItems: 'flex-start',
  },
  negativeToggleBtn: {
    paddingVertical: 2,
  },
  negativeToggleText: {
    fontSize: 11,
    color: '#71717A',
    fontWeight: '600',
  },
  negativePromptInput: {
    color: '#F4F4F5',
    fontSize: 12,
    minHeight: 48,
    textAlignVertical: 'top',
    lineHeight: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },

  // Advanced accordion
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accordionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  advancedBody: {
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  paramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paramLabelCol: {
    flex: 1,
  },
  paramTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#E4E4E7',
  },
  paramSubtitle: {
    fontSize: 10.5,
    color: '#71717A',
    marginTop: 1,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  stepBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  stepBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E4E4E7',
  },
  stepperVal: {
    minWidth: 36,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brand.emerald,
    fontFamily: 'Menlo',
  },
  seedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  diceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  diceBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brand.emerald,
  },
  resetSeedBtn: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  resetSeedText: {
    fontSize: 10.5,
    color: '#A1A1AA',
    fontWeight: '600',
  },

  // Upload Row
  uploadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  uploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  uploadBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  brushRow: {
    paddingTop: 4,
  },

  // Primary CTA Button
  ctaWrapper: {
    marginTop: 4,
  },
  primaryGenerateBtn: {
    backgroundColor: Colors.brand.emerald,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primaryGenerateBtnDisabled: {
    opacity: 0.6,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryGenerateBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#09090B',
    letterSpacing: -0.2,
  },
  kbdHint: {
    fontSize: 11,
    fontFamily: 'Menlo',
    fontWeight: '700',
    color: '#1D4ED8',
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  progressBtnWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBtnFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#2563EB',
    opacity: 0.4,
  },
  progressBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
  },
  progressBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#09090B',
  },

  // Center Canvas Stage
  centerCanvasStage: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#070709',
    position: 'relative',
  },
  centerCanvasStageExpanded: {
    padding: 8,
    backgroundColor: '#040406',
  },
  floatingControlsBtn: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9999,
    backgroundColor: 'rgba(18, 18, 22, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  floatingControlsText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brand.emerald,
  },

  // Right History Deck
  historyDeck: {
    width: 290,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0a0a0e',
    display: 'flex',
    flexDirection: 'column',
  },
  historyDeckHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  historyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyDeckTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#A1A1AA',
    letterSpacing: 0.6,
    fontFamily: 'Menlo',
  },
  clearHistoryText: {
    fontSize: 11,
    color: '#71717A',
    fontWeight: '600',
  },
  historyListScroll: {
    flex: 1,
  },
  historyListContent: {
    padding: 12,
    gap: 10,
  },
  emptyHistory: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyHistoryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#71717A',
  },
  emptyHistorySub: {
    fontSize: 11,
    color: '#52525B',
    textAlign: 'center',
    lineHeight: 16,
  },
  historyCard: {
    backgroundColor: 'rgba(18, 18, 22, 0.7)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    gap: 6,
  },
  historyCardFailed: {
    borderColor: 'rgba(244, 63, 94, 0.45)',
  },
  historyCardImage: {
    width: '100%',
    height: 88,
    borderRadius: 8,
    backgroundColor: '#09090B',
  },
  historyCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyAspectRatioBadge: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    fontWeight: '800',
    color: Colors.brand.emerald,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyModelTag: {
    fontSize: 9.5,
    color: '#71717A',
    fontFamily: 'Menlo',
  },
  historyCardPrompt: {
    fontSize: 11.5,
    color: '#D4D4D8',
    lineHeight: 16,
  },

  // Mobile Styles
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  presetScroll: {
    gap: 8,
    marginBottom: 12,
  },
  ideaChip: {
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    maxWidth: 240,
  },
  ideaText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  promptCard: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  promptInput: {
    color: Colors.text.primary,
    fontSize: 14.5,
    minHeight: 64,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  promptTools: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
  },
  toolsLeft: {
    flexDirection: 'row',
    gap: 8,
  },
  toolIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.background.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  maskToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  maskToggleBtnActive: {
    borderColor: 'rgba(244, 63, 94, 0.4)',
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
  },
  maskToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  maskToggleTextActive: {
    color: Colors.brand.rose,
  },
  sectionRow: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  canvasWrapper: {
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  generateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand.emerald,
    borderRadius: 14,
    paddingVertical: 13,
  },
  generateBtnProgressWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateBtnProgressBar: {
    position: 'absolute',
    left: -16,
    right: -16,
    top: -13,
    bottom: -13,
    backgroundColor: '#2563EB',
    opacity: 0.35,
    borderRadius: 14,
  },
  generateBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 2,
  },
  generateBtnTextActive: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#09090B',
    letterSpacing: 0.2,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    color: '#09090B',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  shareBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historySection: {
    marginTop: 10,
  },
  historyGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  historyThumb: {
    width: 140,
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 12,
    padding: 10,
  },
  historyMobileThumbImage: {
    width: '100%',
    height: 72,
    borderRadius: 8,
    backgroundColor: '#09090B',
    marginBottom: 8,
  },
  historyPrompt: {
    fontSize: 11.5,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
});
