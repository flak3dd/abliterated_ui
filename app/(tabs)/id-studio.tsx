import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  Image as RNImage,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { CreditCard, Image as ImageIcon, User, Sparkles, Camera } from 'lucide-react-native';
import Colors from '../../theme/colors';
import { isDesktopWeb, WEB_SHELL } from '../../theme/layout';
import { useStudioStore } from '../../stores/useStudioStore';
import { useMeshStore } from '../../stores/useMeshStore';
import { HeaderBar } from '../../components/ui/HeaderBar';
import { DrawerMenu } from '../../components/ui/DrawerMenu';
import { DesktopSidebar } from '../../components/ui/DesktopSidebar';
import { EnvironmentModal } from '../../components/chat/EnvironmentModal';
import { ModelPicker, SPARK_ID_MODELS } from '../../components/studio/ModelPicker';
import { LoadWeightsBar } from '../../components/studio/LoadWeightsBar';
import { isImagePipeLoaded } from '../../services/modelCatalog';
import { Toast } from '../../components/ui/Toast';
import { ImageDebugFeed } from '../../components/studio/ImageDebugFeed';
import { AspectRatioType } from '../../types';
import { IMAGE_SIZE_MAP } from '../../services/kreaService';
import { imageDebug } from '../../services/imageDebugFeed';
import {
  BG_SURFACES,
  ID_WORKFLOWS,
  buildKycPrompt,
  encodeKycMedia,
  resolveWorkflowModel,
  runKycGateAsync,
  type IdWorkflowId,
  type KycGate,
} from '../../services/kycIdWorkflows';

const ID_TYPES = [
  { id: 'drivers_license', label: 'Licence' },
  { id: 'passport', label: 'Passport' },
  { id: 'national_id', label: 'National ID' },
  { id: 'residence_permit', label: 'Permit' },
  { id: 'other', label: 'Other' },
] as const;

const RESOLUTIONS: { id: AspectRatioType; label: string }[] = [
  { id: '1:1', label: '1024×1024' },
  { id: '16:9', label: '1280×720 HD' },
  { id: '9:16', label: '720×1280' },
  { id: '4:5', label: '896×1120' },
  { id: '21:9', label: '1344×576' },
];



export default function IdStudioScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWeb(width);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [docType, setDocType] = useState<(typeof ID_TYPES)[number]['id']>('drivers_license');
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [identityUri, setIdentityUri] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [gate, setGate] = useState<KycGate | null>(null);
  const [outputUri, setOutputUri] = useState<string | null>(null);
  const [outputExt, setOutputExt] = useState('png');

  const {
    selectedModel,
    setSelectedModel,
    isGenerating,
    currentGeneratedImage,
    generationStatusText,
    generateImage,
    refreshImageModels,
    modelAvailability,
    loadedModelId,
    warmingModelId,
    currentWorkflow,
    setCurrentWorkflow,
    bgOption,
    setBgOption,
    bgSolidColor,
    setBgSolidColor,
    bgUploadUri,
    setBgUploadUri,
    mediaFormat,
    setMediaFormat,
    mediaTier,
    setMediaTier,
    aspectRatio,
    setAspectRatio,
  } = useStudioStore();
  const activeHost = useMeshStore((s) => s.activeHost);

  const workflow = ID_WORKFLOWS.find((w) => w.id === currentWorkflow) || ID_WORKFLOWS[0];
  const weightsReady = isImagePipeLoaded(selectedModel, loadedModelId, modelAvailability);

  useEffect(() => {
    void refreshImageModels();
    const model = resolveWorkflowModel(workflow, useStudioStore.getState().modelAvailability);
    setSelectedModel(model);
  }, []);

  const showToast = useCallback((msg: string) => setToastMsg(msg), []);

  const pickImage = async (target: 'document' | 'identity' | 'bg', camera = false) => {
    try {
      const result = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.95 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.95,
          });
      if (!result.canceled && result.assets[0]?.uri) {
        const uri = result.assets[0].uri;
        if (target === 'document') setDocumentUri(uri);
        else if (target === 'identity') setIdentityUri(uri);
        else setBgUploadUri(uri);
      }
    } catch (e) {
      console.warn('ID image picker', e);
    }
  };

  const selectWorkflow = (id: IdWorkflowId) => {
    setCurrentWorkflow(id);
    setGate(null);
    const wf = ID_WORKFLOWS.find((w) => w.id === id);
    if (wf) {
      imageDebug('workflow', wf.label + ' → ' + wf.model, {
        source: 'id-studio',
        model: wf.model,
        detail: { intent: wf.intent, zones: wf.zones },
      });
    }
  };

  const handleGenerate = async () => {
    if (!weightsReady) {
      showToast('Load weights first');
      return;
    }
    if (workflow.needsDocument && !documentUri) {
      showToast('Load a document scan first');
      return;
    }
    if (workflow.needsIdentity && !identityUri) {
      showToast('Load a face / liveness capture first');
      return;
    }
    if (bgOption === 'upload' && !bgUploadUri) {
      showToast('Upload a background plate or pick another backdrop');
      return;
    }
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      /* ignore */
    }
    const model = resolveWorkflowModel(workflow, modelAvailability);
    if (model !== selectedModel) setSelectedModel(model);
    const { prompt, negative } = buildKycPrompt({
      workflow,
      notes,
      bg: bgOption,
      solidColor: bgSolidColor,
      aspect: aspectRatio,
      docType,
    });
    const primary = workflow.needsIdentity ? identityUri : documentUri;
    const identity = workflow.id === 'selfie' ? documentUri : workflow.needsIdentity ? identityUri : null;
    imageDebug('kyc_run', workflow.nativeLabel, {
      source: 'id-studio',
      model,
      detail: { bg: bgOption, format: mediaFormat, tier: mediaTier, aspect: aspectRatio },
    });
    const result = await generateImage({
      prompt,
      negativePrompt: negative,
      model,
      imageUri: primary,
      identityUri: identity,
      intent: workflow.intent,
      idType: docType,
      aspectRatio,
      extra: {
        workflow: workflow.id,
        bg: bgOption,
        bgColor: bgSolidColor,
        bgPlate: bgUploadUri || undefined,
        mediaFormat,
        mediaTier,
        nativeLabel: workflow.nativeLabel,
        zones: workflow.zones,
      },
    });
    if (!result) {
      showToast('Generation did not start');
      return;
    }
    const nextGate = await runKycGateAsync({
      workflow,
      uri: result.uri,
      isFallback: result.isFallback,
      error: result.error,
      aspect: aspectRatio,
      host: activeHost,
    });
    setGate(nextGate);
    if (result.isFallback) {
      setOutputUri(result.uri);
      showToast(result.error || 'Bridge failed — review gate');
      return;
    }
    const encoded = await encodeKycMedia(result.uri, mediaFormat, mediaTier);
    setOutputUri(encoded.uri);
    setOutputExt(encoded.ext);
    showToast(nextGate.passed ? workflow.nativeLabel + ' · PASS' : 'Gate FAIL — retry');
  };

  const handleDownload = () => {
    const uri = outputUri || currentGeneratedImage?.uri;
    if (!uri || Platform.OS !== 'web') return;
    const a = document.createElement('a');
    a.href = uri;
    a.download = workflow.nativeLabel.replace(/\s+/g, '_') + '.' + outputExt;
    a.click();
  };

  const size = IMAGE_SIZE_MAP[aspectRatio] || IMAGE_SIZE_MAP['16:9'];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.shell}>
        {isDesktop && isSidebarOpen && (
          <DesktopSidebar onOpenEnvModal={() => setEnvModalOpen(true)} />
        )}
        <View style={styles.main}>
          <HeaderBar
            title="ID Studio"
            subtitle="KYC pipelines · zone-aware"
            onOpenDrawer={() => setDrawerOpen(true)}
            onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
            isSidebarOpen={isSidebarOpen}
            isDesktop={isDesktop}
          />
          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={[styles.body, isDesktop && styles.bodyDesktop]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.row}>
              <CreditCard size={16} color={Colors.brand.emerald} />
              <Text style={styles.kicker}>
                {workflow.nativeLabel} · {selectedModel} · {size.width}×{size.height}
              </Text>
            </View>

            <Text style={styles.label}>WORKFLOW</Text>
            <View style={styles.chips}>
              {ID_WORKFLOWS.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={[styles.chip, currentWorkflow === w.id && styles.chipOn]}
                  onPress={() => selectWorkflow(w.id)}
                >
                  <Text style={[styles.chipText, currentWorkflow === w.id && styles.chipTextOn]}>
                    {w.short}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.help}>
              {workflow.label} — zones: {workflow.zones.join(', ')}. Lane {workflow.model}
              {workflow.fallbackModel ? ' (fallback ' + workflow.fallbackModel + ')' : ''}.
            </Text>

            <Text style={styles.label}>DOCUMENT TYPE</Text>
            <View style={styles.chips}>
              {ID_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.chip, docType === t.id && styles.chipOn]}
                  onPress={() => setDocType(t.id)}
                >
                  <Text style={[styles.chipText, docType === t.id && styles.chipTextOn]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>SURFACE</Text>
            <View style={styles.chips}>
              {BG_SURFACES.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.chip, bgOption === b.id && styles.chipOn]}
                  onPress={() => setBgOption(b.id)}
                >
                  <Text style={[styles.chipText, bgOption === b.id && styles.chipTextOn]}>{b.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {bgOption === 'upload' ? (
              <TouchableOpacity style={styles.bgDrop} onPress={() => pickImage('bg')}>
                {bgUploadUri ? (
                  <RNImage source={{ uri: bgUploadUri }} style={styles.bgPreview} />
                ) : (
                  <Text style={styles.dropText}>Upload background plate</Text>
                )}
              </TouchableOpacity>
            ) : null}

            <Text style={styles.label}>RESOLUTION</Text>
            <View style={styles.chips}>
              {RESOLUTIONS.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.chip, aspectRatio === r.id && styles.chipOn]}
                  onPress={() => setAspectRatio(r.id)}
                >
                  <Text style={[styles.chipText, aspectRatio === r.id && styles.chipTextOn]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>MEDIA SIZE</Text>
            <View style={styles.chips}>
              {(['png', 'jpeg', 'webp'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.chip, mediaFormat === f && styles.chipOn]}
                  onPress={() => setMediaFormat(f)}
                >
                  <Text style={[styles.chipText, mediaFormat === f && styles.chipTextOn]}>
                    {f.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
              {(['compact', 'standard', 'print'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, mediaTier === t && styles.chipOn]}
                  onPress={() => setMediaTier(t)}
                >
                  <Text style={[styles.chipText, mediaTier === t && styles.chipTextOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>MODEL LANE</Text>
            <ModelPicker
              selected={selectedModel}
              onSelect={setSelectedModel}
              disabled={isGenerating || Boolean(warmingModelId)}
              catalog={SPARK_ID_MODELS}
              availability={modelAvailability}
              warmingId={warmingModelId}
              loadedId={loadedModelId}
            />
            <LoadWeightsBar compact />

            <View style={styles.dropRow}>
              {workflow.needsDocument && (
                <TouchableOpacity style={styles.drop} onPress={() => pickImage('document')}>
                  {documentUri ? (
                    <RNImage source={{ uri: documentUri }} style={styles.preview} />
                  ) : (
                    <>
                      <ImageIcon size={22} color={Colors.text.tertiary} />
                      <Text style={styles.dropText}>
                        {workflow.id === 'selfie' ? 'ID portrait' : 'Document scan'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {workflow.needsIdentity && (
                <TouchableOpacity style={styles.drop} onPress={() => pickImage('identity')}>
                  {identityUri ? (
                    <RNImage source={{ uri: identityUri }} style={styles.preview} />
                  ) : (
                    <>
                      <User size={22} color={Colors.text.tertiary} />
                      <Text style={styles.dropText}>Face / liveness still</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {workflow.allowCamera && (
                <TouchableOpacity style={styles.drop} onPress={() => pickImage('identity', true)}>
                  <Camera size={22} color={Colors.brand.emerald} />
                  <Text style={styles.dropText}>Front camera</Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.notes}
              placeholder="Optional operator notes (layout / identity stay locked)"
              placeholderTextColor={Colors.text.tertiary}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <TouchableOpacity
              style={[styles.go, (isGenerating || !weightsReady) && styles.goBusy]}
              onPress={handleGenerate}
              disabled={isGenerating || !weightsReady}
            >
              {isGenerating ? (
                <ActivityIndicator color="#09090B" />
              ) : (
                <Sparkles size={16} color="#09090B" />
              )}
              <Text style={styles.goText}>
                {isGenerating
                  ? generationStatusText
                  : weightsReady
                  ? 'Run ' + workflow.short
                  : 'Load weights first'}
              </Text>
            </TouchableOpacity>

            {gate ? (
              <View style={[styles.gate, gate.passed ? styles.gatePass : styles.gateFail]}>
                <Text style={styles.gateTitle}>{gate.label}</Text>
                {gate.checks.map((c) => (
                  <Text key={c.id} style={styles.gateLine}>
                    {c.pass ? '✓' : '✗'} {c.label}
                    {c.note ? ' — ' + c.note : ''}
                  </Text>
                ))}
                {gate.passed && outputUri ? (
                  <TouchableOpacity style={styles.dl} onPress={handleDownload}>
                    <Text style={styles.dlText}>
                      Download {workflow.nativeLabel}.{outputExt}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {(outputUri || currentGeneratedImage?.uri) ? (
              <RNImage
                source={{ uri: outputUri || currentGeneratedImage?.uri || '' }}
                style={styles.result}
                resizeMode="contain"
              />
            ) : null}

            <ImageDebugFeed />
          </ScrollView>
        </View>
      </View>
      <DrawerMenu visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <EnvironmentModal visible={envModalOpen} onClose={() => setEnvModalOpen(false)} />
      <Toast message={toastMsg} visible={Boolean(toastMsg)} onDismiss={() => setToastMsg(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background.primary, ...WEB_SHELL },
  shell: { flex: 1, flexDirection: 'row', minHeight: 0, minWidth: 0 },
  main: { flex: 1, minHeight: 0, minWidth: 0 },
  mainScroll: { flex: 1, minHeight: 0 },
  body: { padding: 20, gap: 12, paddingBottom: 48 },
  bodyDesktop: { maxWidth: 1120, width: '100%', alignSelf: 'center', paddingHorizontal: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: Colors.text.tertiary,
    fontWeight: '700',
    flexShrink: 1,
  },
  label: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
  },
  help: { fontSize: 12, color: Colors.text.secondary, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0c0d12',
  },
  chipOn: {
    borderColor: Colors.brand.emerald,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  chipText: { color: Colors.text.secondary, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  hex: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: 'Menlo',
  },
  bgDrop: {
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bgPreview: { width: '100%', height: 72 },
  dropRow: { flexDirection: 'row', gap: 12 },
  drop: {
    flex: 1,
    minHeight: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0c0d12',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dropText: { marginTop: 8, color: Colors.text.tertiary, fontSize: 12 },
  preview: { width: '100%', height: 160 },
  notes: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    padding: 12,
    textAlignVertical: 'top',
  },
  go: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brand.emerald,
    borderRadius: 12,
    paddingVertical: 14,
  },
  goBusy: { opacity: 0.7 },
  goText: { color: '#09090B', fontWeight: '800', fontSize: 14 },
  gate: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  gatePass: { borderColor: 'rgba(16,185,129,0.45)', backgroundColor: 'rgba(16,185,129,0.08)' },
  gateFail: { borderColor: 'rgba(244,63,94,0.45)', backgroundColor: 'rgba(244,63,94,0.08)' },
  gateTitle: { fontWeight: '800', color: '#fff', fontSize: 13 },
  gateLine: { fontSize: 12, color: Colors.text.secondary, fontFamily: 'Menlo' },
  dl: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: Colors.brand.emerald,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  dlText: { color: '#09090B', fontWeight: '800', fontSize: 12 },
  result: { width: '100%', height: 360, borderRadius: 12, backgroundColor: '#050505' },
});
