import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Colors from '../../theme/colors';

interface MetricGaugeProps {
  label: string;
  value: string | number;
  unit?: string;
  sublabel?: string;
  progressPercent?: number;
  statusColor?: string;
  icon?: React.ReactNode;
}

export const MetricGauge: React.FC<MetricGaugeProps> = ({
  label,
  value,
  unit = '',
  sublabel,
  progressPercent,
  statusColor = Colors.brand.emerald,
  icon,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {icon && <View style={styles.iconBox}>{icon}</View>}
      </View>

      <View style={styles.valueRow}>
        <Text style={styles.valueText}>{value}</Text>
        {unit ? <Text style={styles.unitText}>{unit}</Text> : null}
      </View>

      {/* Progress Bar if percentage supplied */}
      {progressPercent !== undefined && (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                backgroundColor: statusColor,
              },
            ]}
          />
        </View>
      )}

      {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 16,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  iconBox: {
    opacity: 0.8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 8,
  },
  valueText: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.5,
    fontFamily: 'Menlo',
  },
  unitText: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  sublabel: {
    fontSize: 11,
    color: Colors.text.tertiary,
  },
});
