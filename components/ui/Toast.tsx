import React, { useEffect } from 'react';
import { StyleSheet, Text, Animated, View } from 'react-native';
import Colors from '../../theme/colors';

interface ToastProps {
  message: string | null;
  visible: boolean;
  type?: 'success' | 'info' | 'warning';
  onDismiss?: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  visible,
  type = 'info',
  onDismiss,
}) => {
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && message) {
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.delay(2200),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onDismiss?.();
      });
    }
  }, [visible, message]);

  if (!visible || !message) return null;

  const borderColor =
    type === 'success'
      ? Colors.brand.emerald
      : type === 'warning'
      ? Colors.brand.amber
      : Colors.brand.sky;

  return (
    <Animated.View style={[styles.container, { opacity, borderColor }]}>
      <View
        style={[
          styles.dot,
          {
            backgroundColor:
              type === 'success'
                ? Colors.brand.emerald
                : type === 'warning'
                ? Colors.brand.amber
                : Colors.brand.sky,
          },
        ]}
      />
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 54,
    alignSelf: 'center',
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.surfaceElevated,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9999,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: '90%',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  text: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
});
