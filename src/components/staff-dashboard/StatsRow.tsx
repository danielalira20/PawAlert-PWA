import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

export interface StatItem {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  primary?: boolean;
}

// Cuenta de 0 al valor final con easing ease-out-cubic.
// No usa Reanimated para el número en sí porque animar un <Text> numérico
// con valores compartidos requiere createAnimatedComponent(TextInput);
// esta versión con RAF + estado de React es más simple y suficiente aquí.
function useCountUp(target: number, duration = 420, delay = 0) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf: number;
    const timeout = setTimeout(() => {
      const start = Date.now();
      const step = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(eased * target));
        if (progress < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target, duration, delay]);

  return display;
}

function StatCard({ stat, index }: { stat: StatItem; index: number }) {
  const displayed = useCountUp(stat.value, 420, 180 + index * 80);

  if (stat.primary) {
    return (
      <Animated.View
        entering={FadeInUp.delay(80).duration(400)}
        style={[styles.card, styles.primaryCard]}
      >
        <LinearGradient
          colors={[Brand.primary, Brand.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.iconCirclePrimary}>
          <Ionicons name={stat.icon} size={18} color="#fff" />
        </View>
        <Text style={styles.valuePrimary}>{displayed}</Text>
        <Text style={styles.labelPrimary}>{stat.label}</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInUp.delay(80 + index * 90).duration(400)}
      style={[styles.card, styles.secondaryCard]}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${stat.color}26` }]}>
        <Ionicons name={stat.icon} size={17} color={stat.color} />
      </View>
      <Text style={styles.value}>{displayed}</Text>
      <Text style={styles.label}>{stat.label}</Text>
    </Animated.View>
  );
}

export function StatsRow({ stats }: { stats: StatItem[] }) {
  return (
    <View style={styles.row}>
      {stats.map((s, i) => (
        <StatCard key={s.label} stat={s} index={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },
  primaryCard: {
    flex: 1.45,
    paddingVertical: 18,
    shadowColor: Brand.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 6,
  },
  secondaryCard: {
    backgroundColor: Brand.cardWarm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCirclePrimary: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 26, fontWeight: '900', color: Brand.textDark },
  valuePrimary: { fontSize: 32, fontWeight: '900', color: '#fff' },
  label: { fontSize: 11, fontWeight: '600', color: Brand.textMuted, textAlign: 'center' },
  labelPrimary: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
  },
});