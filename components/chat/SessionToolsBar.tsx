import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Search, Download, GitBranch } from 'lucide-react-native';
import Colors from '../../theme/colors';
import { useChatStore } from '../../stores/useChatStore';
import { useChatExtrasStore } from '../../stores/useChatExtrasStore';

export const SessionToolsBar: React.FC<{
  onExport?: () => void;
  onBranch?: () => void;
  tokenEstimate?: number;
}> = ({ onExport, onBranch, tokenEstimate }) => {
  const { searchQuery, setSearchQuery } = useChatExtrasStore();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => setOpen((v) => !v)}>
        <Search size={13} color={Colors.text.secondary} />
      </TouchableOpacity>
      {open ? (
        <TextInput
          style={styles.input}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search this chat…"
          placeholderTextColor={Colors.text.tertiary}
          autoFocus
        />
      ) : (
        <Text style={styles.hint}>Search · Export · Branch</Text>
      )}
      {typeof tokenEstimate === 'number' ? (
        <Text style={styles.tokens}>~{tokenEstimate} tok</Text>
      ) : null}
      <TouchableOpacity style={styles.iconBtn} onPress={onBranch} accessibilityLabel="Branch session">
        <GitBranch size={13} color={Colors.brand.sky} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconBtn} onPress={onExport} accessibilityLabel="Export session">
        <Download size={13} color={Colors.brand.emerald} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  iconBtn: { padding: 4 },
  input: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Menlo',
    color: Colors.text.primary,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  } as any,
  hint: { flex: 1, fontSize: 10, color: Colors.text.tertiary, fontFamily: 'Menlo' },
  tokens: { fontSize: 10, color: Colors.brand.sky, fontFamily: 'Menlo', fontWeight: '700' },
});
