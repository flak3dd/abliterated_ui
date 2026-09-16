import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Globe, Image as ImageIcon, MessageSquare, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { isDesktopWeb } from '../../theme/layout';
import { useMeshStore } from '../../stores/useMeshStore';
import { useModelSession } from '../../stores/useModelSession';
import { isImageEndpoint, matchEndpoint } from '../../services/meshRouting';

function formatProbeAge(ts: number | null): string {
  if (!ts) return 'Not checked yet';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 8) return 'Checked just now';
  if (s < 60) return `Checked ${s}s ago`;
  if (s < 3600) return `Checked ${Math.round(s / 60)}m ago`;
  return `Checked ${Math.round(s / 3600)}h ago`;
}

function hostLabel(host: string, port: number): string {
  if (port === 443 || port === 80) return host;
  return `${host}:${port}`;
}

export const MeshProfileCard: React.FC = () => {
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWeb(width);
  const {
    meshMode,
    activeHost,
    activePort,
    activeImageHost,
    activeImagePort,
    lastProbeTime,
    servingModel,
    imageLoadedModel,
    candidates,
    setMeshMode,
  } = useMeshStore();
  const isSpark = meshMode === 'spark';
  const selectedChatModel = useModelSession((s) => s.chat.selectedId);
  const chatEp = matchEndpoint(candidates, activeHost, activePort);
  const imageEp = candidates.find(
    (ep) => isImageEndpoint(ep) && ep.host === activeImageHost && ep.port === (activeImagePort || 7860)
  );
  const chatReady = Boolean(chatEp?.isOnline);
  const imageReady = Boolean(imageEp?.isOnline);
  const chatModel = isSpark
    ? servingModel || chatEp?.defaultModel || selectedChatModel
    : selectedChatModel || chatEp?.defaultModel;

  const tapMode = (mode: 'spark' | 'cloud') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    setMeshMode(mode);
  };

  return (
    <View>
      <View style={styles.modeCard}>
        <Text style={styles.modeCardTitle}>Where should chat go?</Text>
        <Text style={styles.modeCardDescription}>
          Spark is the box on your network. Cloud is Featherless or Abliteration on the internet.
          Studio images stay on Spark unless you pick a different image server below.
        </Text>

        <View style={[styles.modeToggleRow, !isDesktop && styles.modeToggleRowMobile]}>
          <TouchableOpacity
            style={[styles.modeOption, isSpark && styles.modeOptionActiveSpark]}
            onPress={() => tapMode('spark')}
            activeOpacity={0.8}
          >
            <View style={styles.modeOptionTop}>
              <Zap size={15} color={isSpark ? '#10B981' : '#71717A'} />
              <Text style={[styles.modeOptionTitle, isSpark && styles.modeOptionTitleActiveSpark]}>
                Spark
              </Text>
            </View>
            <Text style={styles.modeOptionSubtitle} numberOfLines={2}>
              Home GPU · 192.168.4.103
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeOption, !isSpark && styles.modeOptionActiveCloud]}
            onPress={() => tapMode('cloud')}
            activeOpacity={0.8}
          >
            <View style={styles.modeOptionTop}>
              <Globe size={15} color={!isSpark ? '#38BDF8' : '#71717A'} />
              <Text style={[styles.modeOptionTitle, !isSpark && styles.modeOptionTitleActiveCloud]}>
                Cloud
              </Text>
            </View>
            <Text style={styles.modeOptionSubtitle} numberOfLines={2}>
              Featherless or Abliteration
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.checkAge}>{formatProbeAge(lastProbeTime)}</Text>
      </View>

      <View
        style={[
          styles.activeRouteCard,
          !isSpark && styles.activeRouteCardCloud,
          (chatReady || imageReady) && styles.activeRouteCardReady,
        ]}
      >
        <Text
          style={[
            styles.activeRouteTitle,
            !isSpark && { color: Colors.brand.sky },
            (chatReady || imageReady) && { color: Colors.brand.green },
          ]}
        >
          Now using
        </Text>
        <View style={[styles.routeGrid, isDesktop && styles.routeGridDesk]}>
          <View style={styles.routeCell}>
            <View style={styles.routeCellLabelRow}>
              <MessageSquare size={11} color={chatReady ? Colors.brand.green : Colors.text.tertiary} />
              <Text style={styles.routeCellLabel}>CHAT</Text>
              <Text style={[styles.routeReady, chatReady ? styles.routeReadyOn : styles.routeReadyOff]}>
                {chatReady ? 'UP' : 'DOWN'}
              </Text>
            </View>
            <Text style={styles.activeHostDisplay} numberOfLines={1}>
              {chatEp?.name || 'Chat server'}
            </Text>
            <Text style={styles.routeHost} numberOfLines={1}>
              {hostLabel(activeHost, activePort)}
            </Text>
            {chatModel ? (
              <Text style={[styles.routeModel, chatReady && styles.routeModelReady]} numberOfLines={1}>
                {chatModel}
              </Text>
            ) : null}
          </View>
          <View style={styles.routeCell}>
            <View style={styles.routeCellLabelRow}>
              <ImageIcon size={11} color={imageReady ? Colors.brand.green : Colors.text.tertiary} />
              <Text style={styles.routeCellLabel}>IMAGES</Text>
              <Text style={[styles.routeReady, imageReady ? styles.routeReadyOn : styles.routeReadyOff]}>
                {imageReady ? 'UP' : 'DOWN'}
              </Text>
            </View>
            <Text style={styles.activeHostDisplay} numberOfLines={1}>
              {imageEp?.name || 'Image server'}
            </Text>
            <Text style={styles.routeHost} numberOfLines={1}>
              {hostLabel(activeImageHost, activeImagePort)}
            </Text>
            {imageLoadedModel ? (
              <Text style={[styles.routeModel, imageReady && styles.routeModelReady]} numberOfLines={1}>
                {imageLoadedModel}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modeCard: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  modeCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  modeCardDescription: {
    fontSize: 12.5,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  modeToggleRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  modeToggleRowMobile: { flexDirection: 'column' },
  modeOption: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: 12,
  },
  modeOptionActiveSpark: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  modeOptionActiveCloud: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  modeOptionTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  modeOptionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text.secondary },
  modeOptionTitleActiveSpark: { color: '#10B981' },
  modeOptionTitleActiveCloud: { color: Colors.brand.sky },
  modeOptionSubtitle: { fontSize: 11.5, color: Colors.text.tertiary },
  checkAge: { fontSize: 11, color: Colors.text.tertiary },
  activeRouteCard: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.brand.emeraldGlow,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  activeRouteCardCloud: { borderColor: 'rgba(56, 189, 248, 0.35)' },
  activeRouteCardReady: { borderColor: Colors.brand.greenGlow },
  activeRouteTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brand.emerald,
    marginBottom: 10,
  },
  routeReady: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    fontFamily: 'Menlo',
    marginLeft: 4,
  },
  routeReadyOn: { color: Colors.brand.green },
  routeReadyOff: { color: Colors.brand.rose },
  routeModelReady: { color: Colors.brand.green },
  routeGrid: { gap: 12 },
  routeGridDesk: { flexDirection: 'row', gap: 20 },
  routeCell: { flex: 1, minWidth: 0 },
  routeCellLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  routeCellLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: Colors.text.tertiary,
  },
  activeHostDisplay: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  routeHost: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontFamily: 'Menlo',
    marginTop: 2,
  },
  routeModel: { fontSize: 11, color: Colors.text.secondary, fontFamily: 'Menlo', marginTop: 3 },
});
