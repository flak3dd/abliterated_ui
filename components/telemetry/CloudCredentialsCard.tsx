import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Key } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { isDesktopWeb } from '../../theme/layout';
import { useMeshStore } from '../../stores/useMeshStore';

export const CloudCredentialsCard: React.FC = () => {
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWeb(width);
  const { featherlessApiKey, abliteratedApiKey, setApiKey, probeAll } = useMeshStore();
  const [keyInput, setKeyInput] = useState(featherlessApiKey);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [abliterationKeyInput, setAbliterationKeyInput] = useState(abliteratedApiKey);
  const [abliterationSaved, setAbliterationSaved] = useState(false);

  useEffect(() => {
    setKeyInput(featherlessApiKey);
  }, [featherlessApiKey]);
  useEffect(() => {
    setAbliterationKeyInput(abliteratedApiKey);
  }, [abliteratedApiKey]);

  const save = async (provider: 'featherless' | 'abliterated', value: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    await setApiKey(provider, value);
    if (provider === 'featherless') {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } else {
      setAbliterationSaved(true);
      setTimeout(() => setAbliterationSaved(false), 2500);
    }
    probeAll();
  };

  return (
    <View style={styles.apiKeyCard}>
      <View style={styles.apiKeyHeader}>
        <Key size={16} color={Colors.brand.sky} />
        <Text style={styles.apiKeyTitle}>CLOUD KEYS (OPTIONAL)</Text>
      </View>
      <Text style={styles.apiKeyNote}>
        Optional. Local web uses the key proxy on :17332. Paste a key here only if that proxy is down.
      </Text>

      <View style={styles.credBlock}>
        <View style={styles.credLabelRow}>
          <Text style={styles.credLabel}>FEATHERLESS</Text>
          <Text
            style={[
              styles.credStatus,
              { color: featherlessApiKey ? Colors.brand.emerald : Colors.text.tertiary },
            ]}
          >
            {featherlessApiKey ? 'SAVED' : 'EMPTY'}
          </Text>
        </View>
        <View style={[styles.apiKeyInputRow, !isDesktop && styles.apiKeyInputRowStack]}>
          <TextInput
            style={styles.apiKeyInput}
            value={keyInput}
            onChangeText={setKeyInput}
            placeholder="Enter Featherless API Key..."
            placeholderTextColor="#71717A"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={() => save('featherless', keyInput)}
          />
          <TouchableOpacity
            style={styles.saveKeyBtn}
            onPress={() => save('featherless', keyInput)}
            activeOpacity={0.8}
          >
            <Text style={styles.saveKeyBtnText}>{savedSuccess ? 'Saved ✓' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.credDivider} />

      <View style={styles.credBlock}>
        <View style={styles.credLabelRow}>
          <Text style={[styles.credLabel, styles.credLabelAbliteration]}>ABLITERATION</Text>
          <Text
            style={[
              styles.credStatus,
              { color: abliteratedApiKey ? Colors.brand.sky : Colors.text.tertiary },
            ]}
          >
            {abliteratedApiKey ? 'SAVED' : 'EMPTY'}
          </Text>
        </View>
        <View style={[styles.apiKeyInputRow, !isDesktop && styles.apiKeyInputRowStack]}>
          <TextInput
            style={styles.apiKeyInput}
            value={abliterationKeyInput}
            onChangeText={setAbliterationKeyInput}
            placeholder="Enter Abliteration API Key..."
            placeholderTextColor="#71717A"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={() => save('abliterated', abliterationKeyInput)}
          />
          <TouchableOpacity
            style={[styles.saveKeyBtn, styles.saveKeyBtnAbliteration]}
            onPress={() => save('abliterated', abliterationKeyInput)}
            activeOpacity={0.8}
          >
            <Text style={styles.saveKeyBtnText}>{abliterationSaved ? 'Saved ✓' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  apiKeyCard: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  apiKeyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  apiKeyTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brand.sky,
    letterSpacing: 0.6,
  },
  apiKeyNote: { fontSize: 12, color: Colors.text.tertiary, lineHeight: 16, marginBottom: 12 },
  credBlock: { gap: 8 },
  credDivider: { height: 1, backgroundColor: Colors.border.default, marginVertical: 14 },
  credLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  credLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: Colors.brand.emerald,
  },
  credLabelAbliteration: { color: Colors.brand.sky },
  credStatus: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, fontFamily: 'Menlo' },
  apiKeyInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  apiKeyInputRowStack: { flexWrap: 'wrap' },
  apiKeyInput: {
    flex: 1,
    minWidth: 160,
    height: 38,
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: Colors.text.primary,
    fontSize: 12.5,
    fontFamily: 'Menlo',
  },
  saveKeyBtn: {
    backgroundColor: Colors.brand.emerald,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveKeyBtnAbliteration: { backgroundColor: Colors.brand.sky },
  saveKeyBtnText: { color: '#09090B', fontSize: 12, fontWeight: '700' },
});
