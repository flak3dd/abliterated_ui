import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Activity, RefreshCw, X } from 'lucide-react-native';
import Colors from '../../theme/colors';
import { useDiagnosticsStore } from '../../stores/useDiagnosticsStore';

export const DiagnosticsStrip: React.FC = () => {
  const { items, banner, checking, refresh, clearBanner, lastCheckedAt } = useDiagnosticsStore();

  useEffect(() => {
    refresh();
    const id = setInterval(() => refresh(), 15000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!banner && items.every((i) => i.status === 'ok' || i.status === 'unknown')) {
    return (
      <View style={styles.quiet}>
        <Activity size={11} color={Colors.brand.emerald} />
        <Text style={styles.quietText}>
          Mesh OK · Runner {items.find((i) => i.id === 'runner')?.status === 'ok' ? 'OK' : '…'}
          {lastCheckedAt ? '' : ''}
        </Text>
        <TouchableOpacity onPress={refresh} hitSlop={8} disabled={checking}>
          <RefreshCw size={11} color={Colors.text.tertiary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.banner}>
      <Activity size={12} color={Colors.brand.amber} />
      <Text style={styles.bannerText} numberOfLines={2}>
        {banner || items.map((i) => `${i.label}:${i.status}`).join(' · ')}
      </Text>
      <TouchableOpacity onPress={refresh} style={styles.btn} disabled={checking}>
        <Text style={styles.btnText}>Retry probe</Text>
      </TouchableOpacity>
      {banner ? (
        <TouchableOpacity onPress={clearBanner} hitSlop={8}>
          <X size={14} color={Colors.text.tertiary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  quiet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  quietText: {
    flex: 1,
    fontSize: 10,
    fontFamily: 'Menlo',
    color: Colors.text.tertiary,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.35)',
  },
  bannerText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Menlo',
    color: Colors.brand.amber,
  },
  btn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  btnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.primary,
  },
});
