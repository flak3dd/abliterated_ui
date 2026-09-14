import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Cpu,
  Flame,
  Zap,
  Radio,
  RefreshCw,
  Server,
  Layers,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useMeshStore } from '../../stores/useMeshStore';
import { HeaderBar } from '../../components/ui/HeaderBar';
import { DrawerMenu } from '../../components/ui/DrawerMenu';
import { MetricGauge } from '../../components/telemetry/MetricGauge';
import { ServiceCard } from '../../components/telemetry/ServiceCard';
import { ModelStorageSection } from '../../components/telemetry/ModelStorageSection';
import { Toast } from '../../components/ui/Toast';

export default function TelemetryScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const {
    activeHost,
    activePort,
    candidates,
    isProbing,
    telemetry,
    microservices,
    probeAll,
    setActiveHost,
  } = useMeshStore();

  const handleRefresh = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    await probeAll();
    setToastMsg('Probed all mesh endpoints');
  };

  const handleSelectHost = (host: string, name: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    setActiveHost(host);
    setToastMsg(`Switched route to ${name} (${host})`);
  };

  const getTempColor = (temp: number) => {
    if (temp < 60) return Colors.brand.emerald;
    if (temp <= 75) return Colors.brand.amber;
    return Colors.brand.rose;
  };

  const vramPercent = (telemetry.vramUsedGb / telemetry.vramTotalGb) * 100;
  const powerPercent = (telemetry.powerDrawWatts / telemetry.powerLimitWatts) * 100;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar
        onOpenDrawer={() => setDrawerOpen(true)}
        title="Hardware Radar"
        subtitle="GB10 Blackwell"
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isProbing}
            onRefresh={handleRefresh}
            tintColor={Colors.brand.emerald}
          />
        }
      >
        {/* Hardware Architecture Banner */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerLeft}>
            <Cpu size={22} color={Colors.brand.emerald} />
            <View>
              <Text style={styles.bannerTitle}>{telemetry.gpuModel}</Text>
              <Text style={styles.bannerSub}>
                NVLink 5 Fabric • 1.2 TB/s Unified HBM Bandwidth
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.probeBtn}
            onPress={handleRefresh}
            disabled={isProbing}
            activeOpacity={0.7}
          >
            <RefreshCw
              size={14}
              color={Colors.text.primary}
              style={isProbing ? styles.spinning : undefined}
            />
            <Text style={styles.probeBtnText}>
              {isProbing ? 'Probing...' : 'Probe'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Section 1: Vital Metrics Gauges Grid */}
        <Text style={styles.sectionLabel}>GB10 HARDWARE GAUGES</Text>
        <View style={styles.gaugeGrid}>
          <MetricGauge
            label="GPU Temperature"
            value={telemetry.gpuTemp}
            unit="°C"
            sublabel={`Normal Threshold (<${telemetry.gpuTempMax}°C)`}
            progressPercent={(telemetry.gpuTemp / telemetry.gpuTempMax) * 100}
            statusColor={getTempColor(telemetry.gpuTemp)}
            icon={<Flame size={16} color={getTempColor(telemetry.gpuTemp)} />}
          />

          <MetricGauge
            label="Unified VRAM"
            value={telemetry.vramUsedGb.toFixed(1)}
            unit={`/ ${telemetry.vramTotalGb.toFixed(1)} GB`}
            sublabel={`${vramPercent.toFixed(0)}% High-Bandwidth Memory`}
            progressPercent={vramPercent}
            statusColor={Colors.brand.emerald}
            icon={<Layers size={16} color={Colors.brand.emerald} />}
          />
        </View>

        <View style={styles.gaugeGrid}>
          <MetricGauge
            label="Power Consumption"
            value={telemetry.powerDrawWatts}
            unit={`/ ${telemetry.powerLimitWatts} W`}
            sublabel={`${powerPercent.toFixed(0)}% Peak Thermal Envelope`}
            progressPercent={powerPercent}
            statusColor={Colors.brand.sky}
            icon={<Zap size={16} color={Colors.brand.sky} />}
          />

          <MetricGauge
            label="Engine Clock"
            value={telemetry.gpuClockMhz}
            unit="MHz"
            sublabel={`Tensor Cores: ${telemetry.tensorCoresActive} Active`}
            statusColor={Colors.brand.amber}
            icon={<Radio size={16} color={Colors.brand.amber} />}
          />
        </View>

        {/* Section 2: Autonomous Mesh Network Probes */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>MESH NETWORK ENDPOINTS</Text>
          <Text style={styles.autoFailoverTag}>Zero-Config Failover</Text>
        </View>

        <View style={styles.meshCard}>
          {candidates.map((ep) => {
            const isSelected = ep.host === activeHost;
            const isLan = ep.type === 'direct_lan' || ep.type === 'secondary_lan';
            const dotColor = !ep.isOnline
              ? Colors.brand.rose
              : isLan
              ? Colors.brand.emerald
              : Colors.brand.amber;

            return (
              <TouchableOpacity
                key={ep.id}
                style={[styles.meshRow, isSelected && styles.meshRowActive]}
                onPress={() => handleSelectHost(ep.host, ep.name)}
                activeOpacity={0.7}
              >
                <View style={styles.meshLeft}>
                  <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                  <View>
                    <View style={styles.meshNameBadgeRow}>
                      <Text style={styles.meshName}>{ep.name}</Text>
                      {isSelected && (
                        <View style={styles.activePill}>
                          <Text style={styles.activePillText}>ACTIVE ROUTE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.meshHost}>
                      http://{ep.host}:{ep.port}
                    </Text>
                  </View>
                </View>

                <View style={styles.meshRight}>
                  {ep.isOnline ? (
                    <Text
                      style={[
                        styles.latencyBadge,
                        { color: ep.latencyMs <= 5 ? Colors.brand.emerald : Colors.brand.amber },
                      ]}
                    >
                      {ep.latencyMs} ms
                    </Text>
                  ) : (
                    <Text style={[styles.latencyBadge, { color: Colors.brand.rose }]}>
                      Offline
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Section 3: Active Microservices Cluster */}
        <Text style={styles.sectionLabel}>ACTIVE MICROSERVICES ({microservices.length})</Text>
        {microservices.map((service) => (
          <ServiceCard key={service.id} service={service} host={activeHost} />
        ))}

        {/* Section 4: Expanded DGX Spark NVMe Model Storage */}
        <ModelStorageSection />
      </ScrollView>

      <Toast
        message={toastMsg}
        visible={Boolean(toastMsg)}
        onDismiss={() => setToastMsg(null)}
      />

      <DrawerMenu visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  bannerSub: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  probeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  probeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  spinning: {
    transform: [{ rotate: '45deg' }],
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
  },
  autoFailoverTag: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.brand.emerald,
  },
  gaugeGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  meshCard: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  meshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  meshRowActive: {
    backgroundColor: Colors.background.surfaceElevated,
    borderLeftWidth: 3,
    borderLeftColor: Colors.brand.emerald,
  },
  meshLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  meshNameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meshName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  activePill: {
    backgroundColor: Colors.brand.emeraldDim,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 9999,
  },
  activePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.brand.emerald,
    letterSpacing: 0.5,
  },
  meshHost: {
    fontSize: 11.5,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
    marginTop: 2,
  },
  meshRight: {
    alignItems: 'flex-end',
  },
  latencyBadge: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Menlo',
  },
});
