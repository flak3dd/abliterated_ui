import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CheckCircle2, Download, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useStudioStore } from '../../stores/useStudioStore';
import { useMeshStore } from '../../stores/useMeshStore';
import { isImagePipeLoaded } from '../../services/modelCatalog';
import { resolveApiUrl } from '../../services/apiConfig';

export const LoadWeightsBar: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const selectedModel = useStudioStore((s) => s.selectedModel);
  const loadedModelId = useStudioStore((s) => s.loadedModelId);
  const warmingModelId = useStudioStore((s) => s.warmingModelId);
  const loadProgress = useStudioStore((s) => s.loadProgress);
  const loadStatusText = useStudioStore((s) => s.loadStatusText);
  const modelAvailability = useStudioStore((s) => s.modelAvailability);
  const modelSwitchError = useStudioStore((s) => s.modelSwitchError);
  const isGenerating = useStudioStore((s) => s.isGenerating);
  const activateImageModel = useStudioStore((s) => s.activateImageModel);
  const imageHost = useMeshStore((s) => s.activeImageHost) || '192.168.4.103';

  const loaded = isImagePipeLoaded(selectedModel, loadedModelId, modelAvailability);
  const loading = Boolean(warmingModelId);
  const pct = loading ? Math.max(4, Math.min(99, loadProgress || 4)) : loaded ? 100 : 0;
  const label = selectedModel.replace(/^.*\//, '');

  const onLoad = async () => {
    if (loading || isGenerating || loaded) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    try {
      await activateImageModel(selectedModel);
    } catch {
      /* status is on the store */
    }
  };

  const onCancel = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    try {
      await fetch(resolveApiUrl(imageHost, 7860, '/v1/reset'), { method: 'POST', signal: AbortSignal.timeout(2500) });
    } catch {}
    useStudioStore.setState({
      warmingModelId: null,
      loadProgress: 0,
      loadStatusText: 'Cancelled',
      generationStatusText: 'Load cancelled',
    });
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.topRow}>
        <Text style={styles.kicker}>WEIGHTS ON GB10</Text>
        <Text style={[styles.state, loaded && styles.stateReady, loading && styles.stateLoad]}>
          {loading ? 'LOADING' : loaded ? 'READY' : 'NOT LOADED'}
        </Text>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            loaded && !loading && styles.fillReady,
            { width: pct + '%' },
          ]}
        />
      </View>

      <Text style={styles.status} numberOfLines={2}>
        {modelSwitchError
          ? modelSwitchError
          : loading
          ? loadStatusText || 'Loading ' + label + ' · ' + Math.round(pct) + '%'
          : loaded
          ? 'Loaded · ' + (loadedModelId || label)
          : 'Load ' + label + ' onto unified memory before generate'}
      </Text>

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[
            styles.btn,
            loaded && styles.btnReady,
            (loading || isGenerating) && styles.btnDisabled,
            { flex: 1 },
          ]}
          onPress={onLoad}
          disabled={loading || isGenerating || loaded}
          activeOpacity={0.8}
        >
          {loading ? (
            <>
              <ActivityIndicator size="small" color="#09090B" />
              <Text style={styles.btnText}>Loading {Math.round(pct)}%</Text>
            </>
          ) : loaded ? (
            <>
              <CheckCircle2 size={14} color="#09090B" />
              <Text style={styles.btnText}>Weights loaded</Text>
            </>
          ) : (
            <>
              <Download size={14} color="#09090B" />
              <Text style={styles.btnText}>Load weights</Text>
            </>
          )}
        </TouchableOpacity>
        {loading ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
            <X size={14} color={Colors.text.primary} />
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginTop: 10,
  },
  wrapCompact: { marginTop: 8, padding: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: Colors.text.tertiary,
  },
  state: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: Colors.brand.amber },
  stateReady: { color: Colors.brand.green },
  stateLoad: { color: Colors.brand.sky },
  track: {
    height: 8,
    borderRadius: 99,
    backgroundColor: '#1F1F23',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: Colors.brand.sky,
  },
  fillReady: { backgroundColor: Colors.brand.green },
  status: { fontSize: 11.5, color: Colors.text.secondary, lineHeight: 16 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand.sky,
    borderRadius: 10,
    paddingVertical: 10,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border.active,
    backgroundColor: Colors.background.surface,
  },
  cancelText: { fontSize: 12, fontWeight: '700', color: Colors.text.primary },
  btnReady: { backgroundColor: Colors.brand.green },
  btnDisabled: { opacity: 0.7 },
  btnText: { fontSize: 13, fontWeight: '800', color: '#09090B' },
});
