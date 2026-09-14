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
import { CreditCard, Image as ImageIcon, User, Sparkles } from 'lucide-react-native';
import Colors from '../../theme/colors';
import { useStudioStore } from '../../stores/useStudioStore';
import { HeaderBar } from '../../components/ui/HeaderBar';
import { DrawerMenu } from '../../components/ui/DrawerMenu';
import { DesktopSidebar } from '../../components/ui/DesktopSidebar';
import { EnvironmentModal } from '../../components/chat/EnvironmentModal';
import { ModelPicker, SPARK_ID_MODELS } from '../../components/studio/ModelPicker';
import { Toast } from '../../components/ui/Toast';
import { AspectRatioType } from '../../types';

const ID_JOBS = [
  { id: 'id_clean', label: 'Restore front', needsIdentity: false },
  { id: 'id_back', label: 'Restore back', needsIdentity: false },
  { id: 'id_alter', label: 'Flatten / glare', needsIdentity: false },
  { id: 'id_portrait', label: 'Portrait swap', needsIdentity: true },
  { id: 'faceswap', label: 'Face swap', needsIdentity: true },
] as const;

const ID_TYPES = [
  { id: 'drivers_license', label: 'Licence' },
  { id: 'passport', label: 'Passport' },
  { id: 'national_id', label: 'National ID' },
  { id: 'residence_permit', label: 'Permit' },
  { id: 'other', label: 'Other' },
] as const;

export default function IdStudioScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 900;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [job, setJob] = useState<(typeof ID_JOBS)[number]['id']>('id_clean');
  const [docType, setDocType] = useState<(typeof ID_TYPES)[number]['id']>('drivers_license');
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [identityUri, setIdentityUri] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

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
  } = useStudioStore();

  useEffect(() => {
    setSelectedModel('ddb-edit');
    void refreshImageModels();
  }, []);

  const showToast = useCallback((msg: string) => setToastMsg(msg), []);

  const pickImage = async (target: 'document' | 'identity') => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.95,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        if (target === 'document') setDocumentUri(result.assets[0].uri);
        else setIdentityUri(result.assets[0].uri);
      }
    } catch (e) {
      console.warn('ID image picker', e);
    }
  };

  const needsIdentity = ID_JOBS.find((j) => j.id === job)?.needsIdentity;
  const aspect: AspectRatioType = docType === 'passport' ? '9:16' : '16:9';

  const handleGenerate = async () => {
    if (!documentUri) {
      showToast('Load a document scan first');
      return;
    }
    if (needsIdentity && !identityUri) {
      showToast('Portrait swap needs a headshot');
      return;
    }
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      /* ignore */
    }
    const result = await generateImage({
      prompt: notes.trim() || 'keep original printed data',
      model: selectedModel,
      imageUri: documentUri,
      identityUri: needsIdentity ? identityUri : null,
      intent: job,
      idType: docType,
      aspectRatio: aspect,
    });
    if (!result) showToast('Generation did not start');
    else if (result.isFallback) showToast(result.error || 'Bridge failed');
    else showToast('ID job complete');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.shell}>
        {isDesktop && isSidebarOpen && (
          <DesktopSidebar onOpenEnvModal={() => setEnvModalOpen(true)} />
        )}
        <View style={styles.main}>
          <HeaderBar
            title="ID Studio"
            subtitle="Document restore · portrait swap"
            onOpenDrawer={() => setDrawerOpen(true)}
            onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
            isSidebarOpen={isSidebarOpen}
            isDesktop={isDesktop}
          />
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.row}>
              <CreditCard size={16} color={Colors.brand.emerald} />
              <Text style={styles.kicker}>DDB_EDIT · xing0916 · LUMINA-DIMOO VQ</Text>
            </View>

            <Text style={styles.label}>JOB</Text>
            <View style={styles.chips}>
              {ID_JOBS.map((j) => (
                <TouchableOpacity
                  key={j.id}
                  style={[styles.chip, job === j.id && styles.chipOn]}
                  onPress={() => setJob(j.id)}
                >
                  <Text style={[styles.chipText, job === j.id && styles.chipTextOn]}>{j.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

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

            <Text style={styles.label}>ID MODELS</Text>
            <ModelPicker
              selected={selectedModel}
              onSelect={setSelectedModel}
              disabled={isGenerating}
              catalog={SPARK_ID_MODELS}
              availability={modelAvailability}
              warmingId={warmingModelId}
              loadedId={loadedModelId}
            />

            <View style={styles.dropRow}>
              <TouchableOpacity style={styles.drop} onPress={() => pickImage('document')}>
                {documentUri ? (
                  <RNImage source={{ uri: documentUri }} style={styles.preview} />
                ) : (
                  <>
                    <ImageIcon size={22} color={Colors.text.tertiary} />
                    <Text style={styles.dropText}>Document scan</Text>
                  </>
                )}
              </TouchableOpacity>
              {needsIdentity && (
                <TouchableOpacity style={styles.drop} onPress={() => pickImage('identity')}>
                  {identityUri ? (
                    <RNImage source={{ uri: identityUri }} style={styles.preview} />
                  ) : (
                    <>
                      <User size={22} color={Colors.text.tertiary} />
                      <Text style={styles.dropText}>Headshot</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.notes}
              placeholder="Optional notes (layout locked on the bridge)"
              placeholderTextColor={Colors.text.tertiary}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <TouchableOpacity
              style={[styles.go, isGenerating && styles.goBusy]}
              onPress={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color="#09090B" />
              ) : (
                <Sparkles size={16} color="#09090B" />
              )}
              <Text style={styles.goText}>
                {isGenerating ? generationStatusText : 'Run ID job'}
              </Text>
            </TouchableOpacity>

            {currentGeneratedImage?.uri ? (
              <RNImage
                source={{ uri: currentGeneratedImage.uri }}
                style={styles.result}
                resizeMode="contain"
              />
            ) : null}
          </ScrollView>
        </View>
      </View>
      <DrawerMenu visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <EnvironmentModal visible={envModalOpen} onClose={() => setEnvModalOpen(false)} />
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background.primary },
  shell: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
  body: { padding: 20, gap: 12, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: Colors.text.tertiary,
    fontWeight: '700',
  },
  label: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
  },
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
  result: { width: '100%', height: 360, borderRadius: 12, backgroundColor: '#050505' },
});
