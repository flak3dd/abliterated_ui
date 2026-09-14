import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Radio,
  X,
  RefreshCw,
  Server,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../theme/colors';
import { useMeshStore } from '../stores/useMeshStore';

export default function RadarModalScreen() {
  const router = useRouter();
  const {
    activeHost,
    activePort,
    candidates,
    isProbing,
    simulationMode,
    probeAll,
    setActiveHost,
    toggleSimulationMode,
  } = useMeshStore();

  const handleClose = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    router.back();
  };

  const handleProbe = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    await probeAll();
  };

  const handleSelectHost = (host: string, port = 8000) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    setActiveHost(host, port);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Modal Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Radio size={20} color={Colors.brand.emerald} />
          <View>
            <Text style={styles.title}>Network Mesh Radar</Text>
            <Text style={styles.subtitle}>Autonomous Endpoint Failover</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <X size={20} color={Colors.text.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* Active Route Summary Card */}
        <View style={styles.activeRouteCard}>
          <View style={styles.activeRouteHeader}>
            <ShieldCheck size={18} color={Colors.brand.emerald} />
            <Text style={styles.activeRouteTitle}>ACTIVE DATA ROUTE</Text>
          </View>
          <Text style={styles.activeHostDisplay}>
            http://{activeHost}:{activePort}
          </Text>
          <Text style={styles.routeNote}>
            All vLLM completions and Krea 2 RAW generative payloads stream over this
            direct connection with zero cloud proxies.
          </Text>
        </View>

        {/* Candidate Endpoints */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>AVAILABLE ENDPOINTS</Text>
          <TouchableOpacity
            style={styles.probeAction}
            onPress={handleProbe}
            disabled={isProbing}
            activeOpacity={0.7}
          >
            <RefreshCw
              size={13}
              color={Colors.brand.emerald}
              style={isProbing ? styles.spinning : undefined}
            />
            <Text style={styles.probeActionText}>
              {isProbing ? 'Probing...' : 'Probe All'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.endpointList}>
          {candidates.map((ep) => {
            const isSelected = ep.host === activeHost;
            const isLan = ep.type === 'direct_lan' || ep.type === 'secondary_lan';
            const dotColor = !ep.isOnline
              ? Colors.brand.rose
              : isLan
              ? Colors.brand.emerald
              : Colors.brand.amber;

            return (
              <View
                key={ep.id}
                style={[styles.endpointTile, isSelected && styles.endpointTileActive]}
              >
                <View style={styles.tileLeft}>
                  <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                  <View>
                    <View style={styles.nameRow}>
                      <Text style={styles.endpointName}>{ep.name}</Text>
                      {isSelected && (
                        <View style={styles.activeBadge}>
                          <Text style={styles.activeBadgeText}>CONNECTED</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.endpointUrl}>
                      http://{ep.host}:{ep.port}
                    </Text>
                  </View>
                </View>

                <View style={styles.tileRight}>
                  <Text
                    style={[
                      styles.latencyText,
                      {
                        color: !ep.isOnline
                          ? Colors.brand.rose
                          : ep.latencyMs <= 5
                          ? Colors.brand.emerald
                          : Colors.brand.amber,
                      },
                    ]}
                  >
                    {ep.isOnline ? `${ep.latencyMs}ms` : 'Offline'}
                  </Text>

                  {!isSelected && (
                    <TouchableOpacity
                      style={styles.switchBtn}
                      onPress={() => handleSelectHost(ep.host, ep.port)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.switchBtnText}>Switch</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Resilient Emulation Mode Toggle */}
        <View style={styles.simulationCard}>
          <View style={styles.simTextWrapper}>
            <Text style={styles.simTitle}>Hardware Emulation Fallback</Text>
            <Text style={styles.simDesc}>
              Simulates GB10 telemetry and vLLM streaming tokens when physical node is offline
              during local development.
            </Text>
          </View>
          <Switch
            value={simulationMode}
            onValueChange={toggleSimulationMode}
            trackColor={{ false: '#27272A', true: 'rgba(16, 185, 129, 0.4)' }}
            thumbColor={simulationMode ? Colors.brand.emerald : '#71717A'}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.background.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  activeRouteCard: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.brand.emeraldGlow,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  activeRouteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  activeRouteTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brand.emerald,
    letterSpacing: 0.8,
  },
  activeHostDisplay: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text.primary,
    fontFamily: 'Menlo',
    marginBottom: 6,
  },
  routeNote: {
    fontSize: 12,
    color: Colors.text.tertiary,
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
  },
  probeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.brand.emeraldDim,
  },
  probeActionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.brand.emerald,
  },
  spinning: {
    transform: [{ rotate: '45deg' }],
  },
  endpointList: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  endpointTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  endpointTileActive: {
    backgroundColor: Colors.background.surfaceElevated,
    borderLeftWidth: 3,
    borderLeftColor: Colors.brand.emerald,
  },
  tileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  endpointName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  activeBadge: {
    backgroundColor: Colors.brand.emeraldDim,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 9999,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.brand.emerald,
    letterSpacing: 0.5,
  },
  endpointUrl: {
    fontSize: 11.5,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
    marginTop: 2,
  },
  tileRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  latencyText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Menlo',
  },
  switchBtn: {
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  switchBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  simulationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 14,
    padding: 14,
  },
  simTextWrapper: {
    flex: 1,
    paddingRight: 12,
  },
  simTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  simDesc: {
    fontSize: 11.5,
    color: Colors.text.tertiary,
    lineHeight: 16,
  },
});
