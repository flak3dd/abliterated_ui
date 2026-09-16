import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Key } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { isDesktopWeb } from '../../theme/layout';
import { useMeshStore } from '../../stores/useMeshStore';
import { isImageEndpoint, isStatusOnlyEndpoint } from '../../services/meshRouting';
import { Endpoint } from '../../types';

function hostLabel(ep: Endpoint): string {
  if (ep.port === 443 || ep.port === 80) return ep.host;
  return `${ep.host}:${ep.port}`;
}

function endpointKind(ep: Endpoint): 'chat' | 'images' | 'status' {
  if (isImageEndpoint(ep)) return 'images';
  if (isStatusOnlyEndpoint(ep)) return 'status';
  return 'chat';
}

const KIND_LABEL = { chat: 'Chat', images: 'Images', status: 'Status only' };

export const MeshEndpointList: React.FC = () => {
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWeb(width);
  const {
    candidates,
    activeHost,
    activePort,
    activeImageHost,
    activeImagePort,
    featherlessApiKey,
    abliteratedApiKey,
    selectEndpoint,
  } = useMeshStore();

  const handleSelect = (ep: Endpoint) => {
    if (isStatusOnlyEndpoint(ep)) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    selectEndpoint(ep);
  };

  const clientKeyFor = (ep: Endpoint) => {
    if (ep.provider === 'featherless') return featherlessApiKey;
    if (ep.provider === 'abliterated') return abliteratedApiKey;
    return '';
  };

  const renderGroup = (group: 'local' | 'external') => {
    const rows = candidates.filter(
      (ep) => (ep.group || (ep.type === 'public_cloud' ? 'external' : 'local')) === group
    );
    return (
      <View style={[styles.meshCol, isDesktop && styles.meshColDesk]}>
        <Text style={styles.meshGroupLabel}>
          {group === 'local' ? 'ON SPARK' : 'CLOUD'}
        </Text>
        <View style={styles.endpointList}>
          {rows.map((ep) => {
            const kind = endpointKind(ep);
            const isSelected =
              kind === 'images'
                ? ep.host === activeImageHost && ep.port === (activeImagePort || 7860)
                : kind === 'chat' && ep.host === activeHost && ep.port === activePort;
            const statusOnly = kind === 'status';
            const clientKey = clientKeyFor(ep);
            const ready = Boolean(ep.isOnline);
            const accent = ready ? Colors.brand.green : Colors.brand.rose;
            const latencyColor = !ready
              ? Colors.brand.rose
              : ep.latencyMs <= 100
              ? Colors.brand.green
              : Colors.brand.amber;

            return (
              <TouchableOpacity
                key={ep.id}
                style={[
                  styles.endpointTile,
                  isSelected && styles.endpointTileActive,
                  isSelected && ready && styles.endpointTileReady,
                ]}
                onPress={() => handleSelect(ep)}
                activeOpacity={statusOnly ? 1 : 0.7}
                disabled={statusOnly}
              >
                <View style={styles.tileLeft}>
                  <View style={[styles.statusDot, { backgroundColor: accent }]} />
                  <View style={styles.tileMeta}>
                    <View style={styles.nameRow}>
                      <Text style={styles.endpointName} numberOfLines={1}>
                        {ep.name}
                      </Text>
                      {isSelected && (
                        <View style={[styles.activeBadge, ready && styles.activeBadgeReady]}>
                          <Text
                            style={[styles.activeBadgeText, ready && styles.activeBadgeTextReady]}
                          >
                            USING
                          </Text>
                        </View>
                      )}
                      {!!ep.provider && !!clientKey && (
                        <View style={styles.keyBadge}>
                          <Key size={9} color={Colors.brand.sky} />
                          <Text style={styles.keyBadgeText}>KEY</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.endpointKind}>{KIND_LABEL[kind]}</Text>
                    <Text style={styles.endpointUrl} numberOfLines={1}>
                      {hostLabel(ep)}
                    </Text>
                    {ep.defaultModel ? (
                      <Text style={styles.endpointModel} numberOfLines={1}>
                        {ep.defaultModel}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.tileRight}>
                  <Text style={[styles.liveBadge, { color: accent }]}>
                    {ready ? 'UP' : 'DOWN'}
                  </Text>
                  {ep.isOnline && ep.latencyMs > 0 ? (
                    <Text style={[styles.latencyText, { color: latencyColor }]}>
                      {ep.latencyMs}ms
                    </Text>
                  ) : null}
                  {!isSelected && !statusOnly && (
                    <Text style={styles.switchHint}>Use this</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>SERVERS</Text>
        <Text style={styles.sectionHint}>Tap Chat or Images to switch. Status rows are info only.</Text>
      </View>
      <View style={[styles.meshDesk, isDesktop && styles.meshDeskRow]}>
        {renderGroup('local')}
        {renderGroup('external')}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionHeader: {
    marginBottom: 10,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
  },
  sectionHint: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
  meshDesk: { marginBottom: 4 },
  meshDeskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  meshCol: { marginBottom: 16 },
  meshColDesk: { flex: 1, minWidth: 0, marginBottom: 16 },
  meshGroupLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: Colors.text.tertiary,
    marginBottom: 6,
  },
  endpointList: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 16,
    overflow: 'hidden',
  },
  endpointTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    gap: 12,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  endpointTileActive: {
    backgroundColor: Colors.background.surfaceElevated,
    borderLeftWidth: 3,
    borderLeftColor: Colors.brand.emerald,
  },
  endpointTileReady: { borderLeftColor: Colors.brand.green },
  tileLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  tileMeta: { flex: 1, minWidth: 0 },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  endpointName: { fontSize: 14, fontWeight: '700', color: Colors.text.primary, flexShrink: 1 },
  endpointKind: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginTop: 2,
  },
  activeBadge: {
    backgroundColor: Colors.brand.emeraldDim,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 9999,
  },
  activeBadgeReady: { backgroundColor: Colors.brand.greenDim },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.brand.emerald,
    letterSpacing: 0.5,
  },
  activeBadgeTextReady: { color: Colors.brand.green },
  keyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.brand.skyDim,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 9999,
  },
  keyBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.brand.sky, letterSpacing: 0.5 },
  endpointUrl: {
    fontSize: 11.5,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
    marginTop: 2,
    overflow: 'hidden',
  },
  endpointModel: { fontSize: 10, color: Colors.text.secondary, fontFamily: 'Menlo', marginTop: 2 },
  tileRight: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  liveBadge: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, fontFamily: 'Menlo' },
  latencyText: { fontSize: 13, fontWeight: '700', fontFamily: 'Menlo' },
  switchHint: { fontSize: 10, fontWeight: '600', color: Colors.text.tertiary, marginTop: 2 },
});
