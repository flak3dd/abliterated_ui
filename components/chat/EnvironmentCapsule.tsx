import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Package, Download, FolderGit2, FlaskConical } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useChatStore } from '../../stores/useChatStore';
import { useSandboxStore } from '../../stores/useSandboxStore';

interface EnvironmentCapsuleProps {
  onOpenModal: () => void;
}

export const EnvironmentCapsule: React.FC<EnvironmentCapsuleProps> = ({
  onOpenModal,
}) => {
  const { getActiveEnvironment, downloadActiveEnvironmentZip } = useChatStore();
  const { status: sandboxStatus, runTestsForEnv } = useSandboxStore();
  const activeEnv = getActiveEnvironment();

  if (!activeEnv) return null;

  const files = Object.values(activeEnv.files);
  const fileCount = files.length;
  const totalBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownloadZip = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    downloadActiveEnvironmentZip();
  };

  const handleOpenFiles = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onOpenModal();
  };

  const handleQuickTest = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    runTestsForEnv();
  };

  const getDotColor = () => {
    switch (sandboxStatus) {
      case 'testing':
      case 'running':
      case 'building':
        return Colors.brand.sky;
      case 'failed':
        return Colors.brand.rose;
      case 'success':
        return Colors.brand.emerald;
      default:
        return Colors.brand.emerald;
    }
  };

  return (
    <View style={styles.strip}>
      {/* Left: Environment Identifier & Active Indicator */}
      <TouchableOpacity
        style={styles.envTag}
        onPress={handleOpenFiles}
        activeOpacity={0.7}
      >
        <Package size={13} color={getDotColor()} />
        <Text style={styles.envName} numberOfLines={1}>
          {activeEnv.name || activeEnv.id}
        </Text>
        <View style={[styles.liveDot, { backgroundColor: getDotColor() }]} />
      </TouchableOpacity>

      {/* Middle: File count & total size metrics */}
      <TouchableOpacity
        style={styles.metaRow}
        onPress={handleOpenFiles}
        activeOpacity={0.7}
      >
        <Text style={styles.metaText}>
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </Text>
        <Text style={styles.metaDivider}>•</Text>
        <Text style={styles.metaText}>{formatSize(totalBytes)}</Text>
      </TouchableOpacity>

      {/* Right: Quick Action Buttons (Test, Files & Export ZIP) */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={handleQuickTest}
          activeOpacity={0.7}
        >
          <FlaskConical size={11} color={Colors.brand.emerald} />
          <Text style={styles.btnSecondaryText}>Test</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={handleOpenFiles}
          activeOpacity={0.7}
        >
          <FolderGit2 size={12} color={Colors.text.secondary} />
          <Text style={styles.btnSecondaryText}>Files</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleDownloadZip}
          activeOpacity={0.8}
        >
          <Download size={11} color="#09090B" />
          <Text style={styles.btnPrimaryText}>ZIP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  strip: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(18, 18, 21, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  envTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 140,
  },
  envName: {
    fontSize: 11,
    fontFamily: 'Menlo',
    fontWeight: '600',
    color: Colors.text.primary,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.brand.emerald,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 10.5,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
  metaDivider: {
    fontSize: 9,
    color: Colors.text.tertiary,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  btnSecondaryText: {
    fontSize: 10,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: Colors.brand.emerald,
  },
  btnPrimaryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#09090B',
  },
});
