import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useMeshStore } from '../../stores/useMeshStore';
import { matchEndpoint } from '../../services/meshRouting';

interface PingIndicatorProps {
  onPress?: () => void;
  showHostName?: boolean;
}

export const PingIndicator: React.FC<PingIndicatorProps> = ({
  onPress,
  showHostName = false,
}) => {
  const router = useRouter();
  const candidates = useMeshStore((s) => s.candidates);
  const activeHost = useMeshStore((s) => s.activeHost);
  const activePort = useMeshStore((s) => s.activePort);
  const activeEndpoint = matchEndpoint(candidates, activeHost, activePort);
  const isOnline = activeEndpoint?.isOnline ?? false;
  const latency = activeEndpoint?.latencyMs ?? -1;

  const isLan = activeEndpoint?.type === 'direct_lan' || activeEndpoint?.type === 'secondary_lan';
  const isTailscale = activeEndpoint?.type === 'tailscale';

  const dotColor = !isOnline
    ? Colors.brand.rose
    : isLan
    ? Colors.brand.emerald
    : isTailscale
    ? Colors.brand.amber
    : Colors.brand.sky;

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    if (onPress) {
      onPress();
    } else {
      router.push('/radar');
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.latencyText}>
        {showHostName && activeEndpoint ? `${activeEndpoint.name} · ` : ''}
        {isOnline && latency >= 0 ? `${latency}ms` : '—'}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  latencyText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.primary,
    fontFamily: 'Menlo',
  },
});
