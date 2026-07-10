import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import { useGeneralStats } from '../../hooks/useGeneralStats';

const items: {
  key: 'asociacionesActivas' | 'reportesAtendidos' | 'animalesRescatados';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  toneBg: string;
}[] = [
  {
    key: 'asociacionesActivas',
    label: 'Asociaciones activas',
    icon: 'business-outline',
    tone: Brand.secondary,
    toneBg: 'rgba(102,188,180,0.12)',
  },
  {
    key: 'reportesAtendidos',
    label: 'Reportes atendidos',
    icon: 'document-text-outline',
    tone: Brand.primary,
    toneBg: 'rgba(236,128,43,0.10)',
  },
  {
    key: 'animalesRescatados',
    label: 'Animales rescatados',
    icon: 'paw-outline',
    tone: Brand.textDark,
    toneBg: 'rgba(46,42,38,0.05)',
  },
];

export function GeneralStatsStrip() {
  const { stats, isLoading } = useGeneralStats();
  const { width } = useWindowDimensions();
  const isWide = width >= 640;

  return (
    <View style={[styles.card, !isWide && styles.cardNarrow]}>
      <View style={styles.headingWrap}>
        <View style={styles.accentBar} />
        <Text style={[styles.heading, !isWide && styles.headingNarrow]}>
          Lo que la comunidad <Text style={styles.headingAccent}>PawAlert</Text> ha logrado
        </Text>
      </View>

      {isLoading || !stats ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Brand.primary} />
        </View>
      ) : (
        <View style={[styles.grid, !isWide && styles.gridStacked]}>
          {items.map((item) => (
            <View key={item.key} style={[styles.statCard, !isWide && styles.statCardNarrow]}>
              <View style={[styles.iconCircle, { backgroundColor: item.toneBg }]}>
                <Ionicons name={item.icon} size={30} color={item.tone} />
              </View>
              <Text style={styles.value}>{stats[item.key]}</Text>
              <Text style={styles.label}>{item.label}</Text>
              <View style={[styles.underline, { backgroundColor: item.tone }]} />
            </View>
          ))}
        </View>
      )}

      <Text style={styles.footer}>Actualizado en tiempo real · Estadísticas oficiales de la red</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    padding: 40,
    marginBottom: 20,
    shadowColor: '#2E2A26',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 3,
  },
  headingWrap: { alignItems: 'center', marginBottom: 32 },
  accentBar: { height: 4, width: 48, borderRadius: 2, backgroundColor: Brand.secondary, marginBottom: 14 },
  heading: {
    fontSize: 26,
    fontWeight: '900',
    color: Brand.textDark,
    textAlign: 'center',
  },
  headingAccent: { color: Brand.primary },
  loadingWrap: { paddingVertical: 30, alignItems: 'center' },

  grid: { flexDirection: 'row', gap: 20 },
  gridStacked: { flexDirection: 'column' },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: '#fff',
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  statCardNarrow: { paddingVertical: 24 },
  cardNarrow: { padding: 24, borderRadius: 24 },
  headingNarrow: { fontSize: 19 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  value: { fontSize: 42, fontWeight: '900', color: Brand.textDark, marginBottom: 6, lineHeight: 46 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'rgba(46,42,38,0.6)',
    textAlign: 'center',
  },
  underline: { marginTop: 14, height: 3, width: 36, borderRadius: 1.5, opacity: 0.6 },
  footer: {
    marginTop: 28,
    textAlign: 'center',
    fontSize: 10,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: 'rgba(46,42,38,0.4)',
  },
});