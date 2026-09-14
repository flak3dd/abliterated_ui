import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing } from 'react-native';
import Colors from '../../theme/colors';
import { VoiceState } from '../../types';

interface VoiceOrbProps {
  state: VoiceState;
}

export const PulsingVoiceOrb: React.FC<VoiceOrbProps> = ({ state }) => {
  const outerScale = useRef(new Animated.Value(1)).current;
  const outerOpacity = useRef(new Animated.Value(0.3)).current;
  const midScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;

    if (state === 'listening') {
      anim = Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(outerScale, {
              toValue: 1.2,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
            Animated.timing(outerScale, {
              toValue: 1.0,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(outerOpacity, {
              toValue: 0.65,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
            Animated.timing(outerOpacity, {
              toValue: 0.3,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(midScale, {
              toValue: 1.1,
              duration: 900,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
            Animated.timing(midScale, {
              toValue: 1.0,
              duration: 900,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
          ])
        ),
      ]);
      anim.start();
    } else if (state === 'thinking') {
      anim = Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(outerScale, {
              toValue: 1.25,
              duration: 500,
              easing: Easing.ease,
              useNativeDriver: false,
            }),
            Animated.timing(outerScale, {
              toValue: 1.08,
              duration: 500,
              easing: Easing.ease,
              useNativeDriver: false,
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(outerOpacity, {
              toValue: 0.85,
              duration: 500,
              useNativeDriver: false,
            }),
            Animated.timing(outerOpacity, {
              toValue: 0.35,
              duration: 500,
              useNativeDriver: false,
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(midScale, {
              toValue: 1.18,
              duration: 400,
              useNativeDriver: false,
            }),
            Animated.timing(midScale, {
              toValue: 1.0,
              duration: 400,
              useNativeDriver: false,
            }),
          ])
        ),
      ]);
      anim.start();
    } else if (state === 'speaking') {
      anim = Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(outerScale, {
              toValue: 1.35,
              duration: 260,
              easing: Easing.out(Easing.ease),
              useNativeDriver: false,
            }),
            Animated.timing(outerScale, {
              toValue: 1.1,
              duration: 240,
              easing: Easing.in(Easing.ease),
              useNativeDriver: false,
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(outerOpacity, {
              toValue: 1.0,
              duration: 300,
              useNativeDriver: false,
            }),
            Animated.timing(outerOpacity, {
              toValue: 0.4,
              duration: 300,
              useNativeDriver: false,
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(midScale, {
              toValue: 1.22,
              duration: 260,
              useNativeDriver: false,
            }),
            Animated.timing(midScale, {
              toValue: 1.0,
              duration: 260,
              useNativeDriver: false,
            }),
          ])
        ),
      ]);
      anim.start();
    } else {
      Animated.parallel([
        Animated.timing(outerScale, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.timing(outerOpacity, { toValue: 0.2, duration: 400, useNativeDriver: false }),
        Animated.timing(midScale, { toValue: 1, duration: 400, useNativeDriver: false }),
      ]).start();
    }

    return () => {
      if (anim) anim.stop();
    };
  }, [state, outerScale, outerOpacity, midScale]);

  const ringColor =
    state === 'thinking'
      ? Colors.brand.sky
      : state === 'speaking'
      ? Colors.brand.emerald
      : '#10B981';

  return (
    <View style={styles.wrapper}>
      {/* Outermost Reactive Pulse Ring */}
      <Animated.View
        style={[
          styles.outerPulse,
          {
            backgroundColor: ringColor,
            transform: [{ scale: outerScale }],
            opacity: outerOpacity,
          },
        ]}
      />

      {/* Mid Layer Dispersion Ring */}
      <Animated.View
        style={[
          styles.midRing,
          {
            borderColor: ringColor,
            transform: [{ scale: midScale }],
          },
        ]}
      />

      {/* Core Obsidian AI Orb */}
      <View
        style={[
          styles.coreOrb,
          {
            borderColor:
              state === 'thinking'
                ? 'rgba(56, 189, 248, 0.6)'
                : 'rgba(16, 185, 129, 0.6)',
          },
        ]}
      >
        <View
          style={[
            styles.innerNucleus,
            {
              backgroundColor:
                state === 'thinking' ? Colors.brand.sky : Colors.brand.emerald,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  outerPulse: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    opacity: 0.35,
  },
  midRing: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 2,
    opacity: 0.7,
  },
  coreOrb: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0E0E12',
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOpacity: 0.6,
    shadowRadius: 28,
    elevation: 12,
  },
  innerNucleus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    opacity: 0.85,
  },
});
