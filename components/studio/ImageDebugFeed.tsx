import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Radio, Trash2 } from 'lucide-react-native';
import Colors from '../../theme/colors';
import { IMAGE_DEBUG_HTTP, IMAGE_DEBUG_LOG_PATH, useImageDebugStore } from '../../services/imageDebugFeed';

const LEVEL_COLOR: Record<string, string> = {
  debug: '#71717A',
  info: Colors.brand.emerald,
  warn: '#F59E0B',
  error: '#F43F5E',
};

export const ImageDebugFeed: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const events = useImageDebugStore((s) => s.events);
  const clear = useImageDebugStore((s) => s.clear);
  const lastError = useImageDebugStore((s) => s.lastError);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [events.length]);

  const visible = compact ? events.slice(-40) : events.slice(-80);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Radio size={12} color={Colors.brand.emerald} />
        <Text style={styles.title}>LIVE DEBUG FEED</Text>
        <Text style={styles.count}>{events.length}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={clear} hitSlop={8}>
          <Trash2 size={12} color="#71717A" />
        </TouchableOpacity>
      </View>
      <Text style={styles.agentHint} selectable>
        agent: tail -f {IMAGE_DEBUG_LOG_PATH} · GET {IMAGE_DEBUG_HTTP}
      </Text>
      {lastError ? <Text style={styles.lastError}>last error: {lastError}</Text> : null}
      <ScrollView
        ref={scrollRef}
        style={styles.scroller}
        contentContainerStyle={styles.scrollerInner}
        nestedScrollEnabled
      >
        {visible.length === 0 ? (
          <Text style={styles.empty}>waiting for image-gen events…</Text>
        ) : (
          visible.map((evt, i) => (
            <Text key={evt.t + '-' + i} style={[styles.line, { color: LEVEL_COLOR[evt.level] || '#A1A1AA' }]}>
              {evt.ts.slice(11, 23)} [{evt.level[0]}] {evt.event} {evt.message}
              {evt.model ? ' · ' + evt.model : ''}
              {typeof evt.elapsedMs === 'number' ? ' · ' + evt.elapsedMs + 'ms' : ''}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.28)',
    backgroundColor: 'rgba(9, 9, 11, 0.85)',
    borderRadius: 10,
    padding: 8,
    gap: 4,
    minHeight: 140,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: Colors.brand.emerald,
  },
  count: { fontSize: 10, color: '#71717A', fontFamily: 'Menlo' },
  agentHint: { fontSize: 9, color: '#52525B', fontFamily: 'Menlo' },
  lastError: { fontSize: 10, color: '#F43F5E' },
  scroller: { maxHeight: 180 },
  scrollerInner: { gap: 2, paddingBottom: 6 },
  empty: { fontSize: 11, color: '#52525B', fontFamily: 'Menlo' },
  line: { fontSize: 10, fontFamily: 'Menlo', lineHeight: 14 },
});
