import { LiveTelemetrySnapshot } from './MatrixTypes';
import { useMeshStore } from '../../stores/useMeshStore';

/**
 * Live Telemetry Stream Bridge
 * Feeds live hardware telemetry from DGX Spark GB10 cluster and real-time inference tokens
 * into the Matrix rain and cipher decryption streams.
 */
class TelemetryBridge {
  private recentTokens: string[] = [
    'SOVEREIGN', 'SPARK', 'GB10', 'BLACKWELL', 'FP8',
    'NVLINK5', '1.2TB/S', 'UNRESTRICTED', 'TENSOR', '65536'
  ];

  public recordToken(token: string) {
    const clean = token.trim().replace(/[^a-zA-Z0-9_$#@]/g, '');
    if (clean.length >= 2 && clean.length <= 16) {
      this.recentTokens.unshift(clean.toUpperCase());
      if (this.recentTokens.length > 30) {
        this.recentTokens.pop();
      }
    }
  }

  public getSnapshot(): LiveTelemetrySnapshot {
    const telemetry = useMeshStore.getState().telemetry;

    return {
      vramUsedGb: telemetry?.vramUsedGb || 0,
      vramTotalGb: telemetry?.vramTotalGb || 0,
      gpuTemp: telemetry?.gpuTemp || 0,
      tensorActive: telemetry?.tensorCoresActive || 0,
      nvlinkGbps: 1200, // 1.2 TB/s NVLink 5
      recentTokens: [...this.recentTokens],
    };
  }

  /**
   * Generates authentic hex memory address streams embedding real GB10 telemetry
   */
  public generateHexUplinkLine(index: number): string {
    const snap = this.getSnapshot();
    const hexBase = (0x7fff00000000 + index * 0x1000).toString(16).toUpperCase();
    const token = this.recentTokens[index % this.recentTokens.length] || 'ACTIVE';

    const patterns = [
      `0x${hexBase}  [VRAM:${snap.vramUsedGb.toFixed(1)}/${snap.vramTotalGb}GB]  TENSORS:${snap.tensorActive}%  // ${token}`,
      `0x${hexBase}  NVLINK_5: 1.2TB/s [GB10]  TEMP:${snap.gpuTemp}°C  PWR:85W  HEX_${token}`,
      `0x${hexBase}  REFUSAL_MASK: [0x00000000]  FP8_INFERENCE: READY  // ${token}`,
      `0x${hexBase}  SOVEREIGN_CLUSTER_BRIDGE: MESH_ACTIVE (192.168.4.103:8000)`,
    ];

    return patterns[index % patterns.length];
  }

  /**
   * Generates dynamic cipher targets for Phase 3
   */
  public getCipherTargets(): string[] {
    const snap = this.getSnapshot();
    return [
      'NVIDIA DGX SPARK GB10',
      `VRAM ACTIVE: ${snap.vramUsedGb.toFixed(1)} GB / 128 GB`,
      'NVLINK 5 INTERCONNECT: 1.2 TB/S',
      'FP8 TENSOR CORES: UNRESTRICTED',
      'SOVEREIGN SPARK: FULL SPECTRUM ACTIVE',
    ];
  }
}

export const telemetryBridge = new TelemetryBridge();
