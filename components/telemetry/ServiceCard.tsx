import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { Microservice } from '../../types';

interface ServiceCardProps {
  service: Microservice;
  host: string;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, host }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ONLINE':
        return Colors.brand.emerald;
      case 'READY':
        return Colors.brand.sky;
      case 'STANDBY':
        return Colors.brand.amber;
      case 'OFFLINE':
      default:
        return Colors.brand.rose;
    }
  };

  const statusColor = getStatusColor(service.status);
  const targetUrl = `http://${host}:${service.port}`;

  const handleOpenEndpoint = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    Linking.openURL(targetUrl).catch((err) => {
      console.warn('Could not open endpoint URL:', err);
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.serviceNameRow}>
          <Text style={styles.serviceName}>{service.name}</Text>
          <Text style={styles.portBadge}>:{service.port}</Text>
        </View>

        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {service.status}
          </Text>
        </View>
      </View>

      <Text style={styles.modelTag}>{service.model}</Text>
      <Text style={styles.description}>{service.description}</Text>

      <TouchableOpacity
        style={styles.endpointRow}
        onPress={handleOpenEndpoint}
        activeOpacity={0.7}
      >
        <Text style={styles.endpointText}>{targetUrl}</Text>
        <ExternalLink size={13} color={Colors.brand.emerald} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  serviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  portBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brand.emerald,
    fontFamily: 'Menlo',
    backgroundColor: Colors.brand.emeraldDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  modelTag: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontFamily: 'Menlo',
    marginBottom: 4,
  },
  description: {
    fontSize: 12.5,
    color: Colors.text.tertiary,
    lineHeight: 18,
    marginBottom: 8,
  },
  endpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  endpointText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
});
