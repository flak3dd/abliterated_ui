import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '../../theme/colors';

export type JobNotice = {
  jobId: string;
  status: string;
  excerpt?: string;
  prompt?: string;
  needsAttention?: boolean;
};

export const JobNoticeCard: React.FC<{ notice: JobNotice }> = ({ notice }) => (
  <View
    style={[
      styles.card,
      notice.needsAttention || notice.status === 'attention'
        ? styles.cardWarn
        : styles.cardOk,
    ]}
  >
    <Text style={styles.title}>
      Background job · {notice.jobId} · {notice.status}
    </Text>
    {notice.prompt ? <Text style={styles.prompt}>{notice.prompt}</Text> : null}
    {notice.excerpt ? (
      <Text style={styles.excerpt} numberOfLines={8}>
        {notice.excerpt}
      </Text>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  card: {
    marginVertical: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  cardOk: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  cardWarn: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderColor: 'rgba(245,158,11,0.35)',
  },
  title: { fontSize: 11, fontWeight: '700', fontFamily: 'Menlo', color: Colors.text.primary },
  prompt: { marginTop: 4, fontSize: 10, fontFamily: 'Menlo', color: Colors.text.secondary },
  excerpt: { marginTop: 6, fontSize: 10, fontFamily: 'Menlo', color: Colors.text.code },
});
