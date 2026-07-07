import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Brand, CondicionColors } from '../../constants/theme';
import { StaffMapMarkers } from './StaffMapMarkers'; // resuelve .native.tsx / .web.tsx automático
import type { ReporteStaff } from '../../types/reportestaff';

interface Props {
  reportes: ReporteStaff[];
  onSelectReporte?: (reporte: ReporteStaff) => void;
  height?: number;
}

const LEYENDA: { key: keyof typeof CondicionColors; label: string }[] = [
  { key: 'estable', label: 'Estable' },
  { key: 'herido', label: 'Herido' },
  { key: 'grave', label: 'Grave' },
];

export function MapCard({ reportes, onSelectReporte, height = 224 }: Props) {
  return (
    <Animated.View entering={FadeIn.duration(350)} style={[styles.container, { height }]}>
      <StaffMapMarkers reportes={reportes} onSelectReporte={onSelectReporte} />



      <View style={styles.legend}>
        {LEYENDA.map((item) => (
          <View key={item.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: CondicionColors[item.key] }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Brand.backgroundWarm,
  },
  countBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  countBadgeText: { fontSize: 12, fontWeight: '800', color: Brand.textDark },
  legend: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    gap: 5,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: Brand.textDark, fontWeight: '700' },
});