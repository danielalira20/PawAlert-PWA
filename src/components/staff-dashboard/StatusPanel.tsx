import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withDelay } from 'react-native-reanimated';
import { Brand, CondicionColors, normalizeCondicion, type Condicion } from '../../constants/theme';
import type { ReporteStaff } from '../../types/reportestaff';
import { getAnimales, condicionMasGrave } from '../../types/reporte';

interface Props {
  // Reportes activos (no cerrados) sobre los que se calcula el resumen
  reportes: ReporteStaff[];
}

const ORDEN: Condicion[] = ['estable', 'herido', 'grave'];
const LABELS: Record<Condicion, string> = { estable: 'Estable', herido: 'Herido', grave: 'Grave' };

function ConditionBar({
  condicion,
  count,
  total,
  delay,
}: {
  condicion: Condicion;
  count: number;
  total: number;
  delay: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(delay, withTiming(pct, { duration: 550 }));
  }, [pct, delay, width]);

  const animatedStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={styles.barBlock}>
      <View style={styles.barHeader}>
        <View style={styles.barLabelRow}>
          <View style={[styles.dot, { backgroundColor: CondicionColors[condicion] }]} />
          <Text style={styles.barLabel}>{LABELS[condicion]}</Text>
        </View>
        <Text style={styles.barCount}>{count} casos</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: CondicionColors[condicion] }, animatedStyle]} />
      </View>
    </View>
  );
}

export function StatusPanel({ reportes }: Props) {
  const counts = useMemo(() => {
    const base: Record<Condicion, number> = { estable: 0, herido: 0, grave: 0 };
    reportes.forEach((r) => {
      // Condición del caso = la más grave entre sus animales — el resumen
      // sigue contando por caso, no por animal.
      const c = normalizeCondicion(condicionMasGrave(getAnimales(r)));
      if (c) base[c] += 1;
    });
    return base;
  }, [reportes]);

  const total = reportes.length;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Resumen de condiciones</Text>
      {ORDEN.map((c, i) => (
        <ConditionBar key={c} condicion={c} count={counts[c]} total={total} delay={i * 120} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Brand.cardWarm, borderRadius: 20, padding: 16 },
  title: { fontSize: 14, fontWeight: '800', color: Brand.textDark, marginBottom: 14 },
  barBlock: { marginBottom: 12 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  barLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  barLabel: { fontSize: 13, color: Brand.textDark, fontWeight: '600' },
  barCount: { fontSize: 13, fontWeight: '800', color: Brand.textMuted },
  track: { height: 5, borderRadius: 10, backgroundColor: 'rgba(46,42,38,0.1)' },
  fill: { height: '100%', borderRadius: 10 },
});