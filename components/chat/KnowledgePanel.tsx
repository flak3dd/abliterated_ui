import React, { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BookOpen, RefreshCw, Trash2, Upload, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useRagStore } from '../../stores/useRagStore';
import { useChatStore } from '../../stores/useChatStore';

export const KnowledgePanel: React.FC = () => {
  const {
    enabled,
    documents,
    chunks,
    lastIndexedAt,
    datasetVersion,
    toggleEnabled,
    ingestText,
    ingestEnvironment,
    removeDocument,
    clearUploads,
    reindex,
    reloadSeedDataset,
  } = useRagStore();
  const activeEnv = useChatStore((s) => s.getActiveEnvironment());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const uploads = documents.filter((d) => d.source !== 'sandbox');
  const sandboxDocs = documents.filter((d) => d.source === 'sandbox');

  const handleIngest = () => {
    if (!body.trim()) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    ingestText({
      title: title.trim() || 'Pasted note',
      content: body,
      source: 'paste',
    });
    setTitle('');
    setBody('');
  };

  const handleReindexSandbox = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    ingestEnvironment(activeEnv);
  };

  const handleUpload = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.md,.txt,.json,.py,.ts,.tsx,.js,.csv,.yml,.yaml,.toml,.html';
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      for (const file of files) {
        const content = await file.text();
        ingestText({
          title: file.name,
          path: file.name,
          content,
          source: 'upload',
        });
      }
    };
    input.click();
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.callout}>
        <BookOpen size={14} color={Colors.brand.emerald} />
        <Text style={styles.calloutText}>
          Local RAG indexes sandbox files plus notes you ingest. Retrieval is hybrid BM25 + on-device
          dense vectors. Spark currently has no /v1/embeddings model; when bge-m3 or nomic-embed is
          served, this client can switch without retraining the LLM.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.toggle, enabled && styles.toggleOn]}
        onPress={toggleEnabled}
        activeOpacity={0.75}
      >
        <Text style={[styles.toggleText, enabled && styles.toggleTextOn]}>
          {enabled ? 'RAG: ON — retrieved chunks injected into chat' : 'RAG: OFF — full file dump fallback'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.stats}>
        dataset {datasetVersion} • {documents.length} docs • {chunks.length} chunks
        {lastIndexedAt ? ' • indexed ' + new Date(lastIndexedAt).toLocaleTimeString() : ''}
      </Text>

      <View style={styles.row}>
        <TouchableOpacity style={styles.action} onPress={handleReindexSandbox} activeOpacity={0.75}>
          <RefreshCw size={12} color={Colors.brand.emerald} />
          <Text style={styles.actionText}>Reindex sandbox ({sandboxDocs.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.action}
          onPress={() => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch {}
            reloadSeedDataset();
          }}
          activeOpacity={0.75}
        >
          <RefreshCw size={12} color={Colors.brand.emerald} />
          <Text style={styles.actionText}>Reload bundled dataset</Text>
        </TouchableOpacity>
        {Platform.OS === 'web' && (
          <TouchableOpacity style={styles.action} onPress={handleUpload} activeOpacity={0.75}>
            <Upload size={12} color={Colors.brand.emerald} />
            <Text style={styles.actionText}>Upload files</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.label}>INGEST NOTE (2024–2026 FACTS, DOCS, LOGS)</Text>
      <TextInput
        style={styles.titleInput}
        placeholder="Title (optional)"
        placeholderTextColor="#52525B"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.bodyInput}
        placeholder="Paste verifiable notes, API changes, runbooks, or document text..."
        placeholderTextColor="#52525B"
        value={body}
        onChangeText={setBody}
        multiline
      />
      <TouchableOpacity
        style={[styles.ingestBtn, !body.trim() && styles.ingestBtnDisabled]}
        onPress={handleIngest}
        disabled={!body.trim()}
        activeOpacity={0.8}
      >
        <Plus size={14} color="#09090B" />
        <Text style={styles.ingestBtnText}>Add to local index</Text>
      </TouchableOpacity>

      <View style={styles.listHeader}>
        <Text style={styles.label}>INDEXED SOURCES</Text>
        {uploads.some((d) => d.source !== 'seed') && (
          <TouchableOpacity onPress={clearUploads} activeOpacity={0.7}>
            <Text style={styles.clearText}>Clear uploads</Text>
          </TouchableOpacity>
        )}
      </View>

      {documents.map((doc) => (
        <View key={doc.id} style={styles.docRow}>
          <View style={styles.docMeta}>
            <Text style={styles.docTitle} numberOfLines={1}>
              {doc.title}
            </Text>
            <Text style={styles.docSub}>
              {doc.source}
              {doc.path ? ' • ' + doc.path : ''} • {doc.content.length} chars
            </Text>
          </View>
          {doc.source !== 'seed' && (
            <TouchableOpacity onPress={() => removeDocument(doc.id)} hitSlop={8}>
              <Trash2 size={14} color="#F43F5E" />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { paddingVertical: 12, gap: 10, paddingBottom: 28 },
  callout: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  calloutText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#A1A1AA',
  },
  toggle: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  toggleOn: {
    borderColor: 'rgba(59, 130, 246, 0.45)',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  toggleText: { fontSize: 12, fontWeight: '700', color: '#A1A1AA' },
  toggleTextOn: { color: '#93C5FD' },
  stats: { fontSize: 11, color: '#71717A', fontFamily: 'Menlo' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  actionText: { fontSize: 11.5, fontWeight: '600', color: '#93C5FD' },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#71717A',
    letterSpacing: 0.7,
    marginTop: 4,
  },
  titleInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#F4F4F5',
    fontSize: 13,
  },
  bodyInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#F4F4F5',
    fontSize: 13,
    textAlignVertical: 'top',
  },
  ingestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.brand.emerald,
    borderRadius: 10,
    paddingVertical: 10,
  },
  ingestBtnDisabled: { opacity: 0.45 },
  ingestBtnText: { fontSize: 13, fontWeight: '800', color: '#09090B' },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  clearText: { fontSize: 11, color: '#F43F5E', fontWeight: '600' },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  docMeta: { flex: 1 },
  docTitle: { fontSize: 12.5, fontWeight: '700', color: '#E4E4E7' },
  docSub: { fontSize: 10.5, color: '#71717A', marginTop: 2, fontFamily: 'Menlo' },
});
