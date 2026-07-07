import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { CondicionColors, type Condicion } from '../../constants/theme';

const LABELS: Record<Condicion, string> = {
  estable: 'Estable',
  herido: 'Herido',
  grave: 'Grave',
};

// Texto oscuro sobre el amarillo (herido) por contraste; blanco en el resto.
const TEXT_COLOR: Record<Condicion, string> = {
  estable: '#ffffff',
  herido: '#2E2A26',
  grave: '#ffffff',
};

export function ConditionBadge({ condicion }: { condicion: Condicion }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (condicion === 'grave') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1, { duration: 150 });
    }
  }, [condicion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[styles.badge, { backgroundColor: CondicionColors[condicion] }, animatedStyle]}
    >
      <Text style={[styles.text, { color: TEXT_COLOR[condicion] }]}>{LABELS[condicion]}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: '800' },
});