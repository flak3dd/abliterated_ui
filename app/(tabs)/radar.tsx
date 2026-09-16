import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Cpu, Flame, Zap, Radio, RefreshCw, Layers } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { WEB_SHELL, isDesktopWeb } from '../../theme/layout';
import { useMeshStore } from '../../stores/useMeshStore';
import { HeaderBar } from '../../components/ui/HeaderBar';
import { DrawerMenu } from '../../components/ui/DrawerMenu';
import { DesktopSidebar } from '../../components/ui/DesktopSidebar';
import { EnvironmentModal } from '../../components/chat/EnvironmentModal';
import { MetricGauge } from '../../components/telemetry/MetricGauge';
import { ModelStorageSection } from '../../components/telemetry/ModelStorageSection';
import { MeshProfileCard } from '../../components/telemetry/MeshProfileCard';
import { MeshEndpointList } from '../../components/telemetry/MeshEndpointList';
import { CloudCredentialsCard } from '../../components/telemetry/CloudCredentialsCard';
import { ImagePipeSwitcher } from '../../components/telemetry/ImagePipeSwitcher';
import { Toast } from '../../components/ui/Toast';

const SOURCE_LABEL: Record<string, string> = {
  live: 'UP',
  stale: 'OLD',
  emulated: 'SAMPLE',
  unavailable: 'DOWN',
};

export default function RadarTabScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWeb(width);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const { isProbing, telemetry, telemetrySource, probeAll } = useMeshStore();
  const sidebarW = isDesktop && isSidebarOpen ? 260 : 0;
  const twoPane = isDesktop && width - sidebarW >= 1080;
  const gaugesLive = telemetrySource === 'live';

  const handleRefresh = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    await probeAll();
    setToastMsg('Checked servers');
  };

  const getTempColor = (temp: number) => {
    if (!gaugesLive) return Colors.text.tertiary;
    if (temp < 60) return Colors.brand.emerald;
    if (temp <= 75) return Colors.brand.amber;
    return Colors.brand.rose;
  };

  const vramPercent =
    telemetry.vramTotalGb > 0 ? (telemetry.vramUsedGb / telemetry.vramTotalGb) * 100 : 0;
  const powerPercent =
    telemetry.powerLimitWatts > 0
      ? (telemetry.powerDrawWatts / telemetry.powerLimitWatts) * 100
      : 0;
  const unified = telemetry.memoryKind === 'unified-lpddr5x';
  const specGb = telemetry.unifiedSpecGb || 128;
  const sourceColor =
    telemetrySource === 'live'
      ? Colors.brand.green
      : telemetrySource === 'emulated'
      ? Colors.brand.sky
      : telemetrySource === 'stale'
      ? Colors.brand.amber
      : Colors.brand.rose;

  const gauges = (
    <>
      <Text style={styles.sectionLabel}>SPARK GPU</Text>
      <View style={styles.gaugeGrid}>
        <MetricGauge
          label="GPU Temperature"
          value={gaugesLive ? telemetry.gpuTemp : '—'}
          unit={gaugesLive ? '°C' : ''}
          sublabel={`Normal Threshold (<${telemetry.gpuTempMax}°C)`}
          progressPercent={gaugesLive ? (telemetry.gpuTemp / telemetry.gpuTempMax) * 100 : 0}
          statusColor={getTempColor(telemetry.gpuTemp)}
          icon={<Flame size={16} color={getTempColor(telemetry.gpuTemp)} />}
        />
        <MetricGauge
          label={unified ? 'Unified Memory' : 'VRAM'}
          value={gaugesLive ? telemetry.vramUsedGb.toFixed(1) : '—'}
          unit={gaugesLive ? `/ ${telemetry.vramTotalGb.toFixed(1)} GB` : ''}
          sublabel={
            unified
              ? `${gaugesLive ? vramPercent.toFixed(0) : '0'}% of ${telemetry.vramTotalGb.toFixed(1)} GB CUDA-visible (${specGb} GB LPDDR5x spec)`
              : `${gaugesLive ? vramPercent.toFixed(0) : '0'}% device memory`
          }
          progressPercent={gaugesLive ? vramPercent : 0}
          statusColor={Colors.brand.emerald}
          icon={<Layers size={16} color={Colors.brand.emerald} />}
        />
        <MetricGauge
          label="Power Consumption"
          value={gaugesLive ? telemetry.powerDrawWatts : '—'}
          unit={gaugesLive ? `/ ${telemetry.powerLimitWatts} W` : ''}
          sublabel={`${gaugesLive ? powerPercent.toFixed(0) : '0'}% of ${gaugesLive ? telemetry.powerLimitWatts + ' W limit' : 'live TDP'}`}
          progressPercent={gaugesLive ? powerPercent : 0}
          statusColor={Colors.brand.sky}
          icon={<Zap size={16} color={Colors.brand.sky} />}
        />
        <MetricGauge
          label="Engine Clock"
          value={gaugesLive && telemetry.gpuClockMhz ? telemetry.gpuClockMhz : '—'}
          unit={gaugesLive && telemetry.gpuClockMhz ? 'MHz' : ''}
          sublabel={
            gaugesLive && unified
              ? `${telemetry.tensorCoresActive} SMs${telemetry.memoryClockMhz ? ` · mem ${telemetry.memoryClockMhz} MHz` : ''}`
              : gaugesLive
              ? `Util ${telemetry.busUsagePercent}%`
              : 'Live clock from nvidia-smi'
          }
          statusColor={Colors.brand.amber}
          icon={<Radio size={16} color={Colors.brand.amber} />}
        />
      </View>
    </>
  );

  const meshColumn = (
    <View style={twoPane ? styles.pane : undefined}>
      <MeshProfileCard />
      <MeshEndpointList />
      <ImagePipeSwitcher />
      <CloudCredentialsCard />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.shell}>
        {isDesktop && isSidebarOpen && (
          <DesktopSidebar onOpenEnvModal={() => setEnvModalOpen(true)} />
        )}
        <View style={styles.main}>
          <HeaderBar
            onOpenDrawer={() => setDrawerOpen(true)}
            onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
            isSidebarOpen={isSidebarOpen}
            isDesktop={isDesktop}
            title="Radar"
            subtitle="Chat and image servers"
          />

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesk]}
            refreshControl={
              <RefreshControl
                refreshing={isProbing}
                onRefresh={handleRefresh}
                tintColor={Colors.brand.emerald}
              />
            }
          >
            <View style={styles.bannerCard}>
              <View style={styles.bannerLeft}>
                <Cpu size={22} color={gaugesLive ? Colors.brand.green : Colors.text.tertiary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.bannerTitle}>
                    {gaugesLive ? telemetry.gpuModel : 'Spark GPU'}
                  </Text>
                  <Text style={styles.bannerSub}>
                    {gaugesLive && unified
                      ? `Live nvidia-smi · ${specGb} GB LPDDR5x`
                      : gaugesLive
                      ? 'Live GPU telemetry'
                      : 'Waiting for controller :17325'}
                  </Text>
                </View>
              </View>
              <View style={styles.bannerRight}>
                <View style={[styles.sourcePill, { borderColor: sourceColor }]}>
                  <Text style={[styles.sourcePillText, { color: sourceColor }]}>
                    {SOURCE_LABEL[telemetrySource] || 'UNAVAILABLE'}
                  </Text>
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
                  <Text style={styles.probeBtnText}>{isProbing ? 'Checking...' : 'Check'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {twoPane ? (
              <View style={styles.twoPane}>
                {meshColumn}
                <View style={styles.pane}>
                  {gauges}
                  <ModelStorageSection desktop={isDesktop} />
                </View>
              </View>
            ) : (
              <>
                {meshColumn}
                {gauges}
                <ModelStorageSection desktop={isDesktop} />
              </>
            )}
          </ScrollView>
        </View>
      </View>

      <Toast
        message={toastMsg}
        visible={Boolean(toastMsg)}
        onDismiss={() => setToastMsg(null)}
      />

      {!isDesktop && (
        <DrawerMenu visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      )}
      <EnvironmentModal visible={envModalOpen} onClose={() => setEnvModalOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
    ...WEB_SHELL,
  },
  shell: { flex: 1, flexDirection: 'row', minHeight: 0, minWidth: 0 },
  main: { flex: 1, minHeight: 0, minWidth: 0 },
  scrollArea: { flex: 1, minHeight: 0 },
  scrollContent: { padding: 16, paddingBottom: 40, width: '100%' },
  scrollContentDesk: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 48,
    maxWidth: 1440,
    alignSelf: 'center',
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
    gap: 12,
    flexWrap: 'wrap',
  },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  bannerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.text.primary },
  bannerSub: { fontSize: 11, color: Colors.text.tertiary, marginTop: 2 },
  sourcePill: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sourcePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, fontFamily: 'Menlo' },
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
  probeBtnText: { fontSize: 12, fontWeight: '600', color: Colors.text.primary },
  spinning: { transform: [{ rotate: '45deg' }] },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  gaugeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  twoPane: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  pane: { flex: 1, minWidth: 0 },
});
