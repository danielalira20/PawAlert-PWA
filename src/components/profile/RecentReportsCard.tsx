import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Brand } from '../../constants/theme';
import { RecentReportItem } from './RecentReportItem';
import { RecentReportsEmptyState } from './RecentReportsEmptyState';
import type { ReporteResumen } from '../../hooks/useRecentReports';

// NOTA: no tengo el hex exacto de petzen.colors.teal/tealDark — usé nuestro
// Brand.secondary + un tono más oscuro como aproximación. Ajusta estos 2
// valores si quieres el match exacto con el header real de MisReportesScreen.
const TEAL = Brand.secondary;
const TEAL_DARK = '#3F8E86';

interface Props {
  reportes: ReporteResumen[];
  totalReportes: number;
  isLoading: boolean;
  onOpenMisReportes: () => void;
}

export function RecentReportsCard({ reportes, totalReportes, isLoading, onOpenMisReportes }: Props) {
  const hasReports = totalReportes > 0;

  return (
    <View style={styles.card}>
      {/* Header con degradado teal — mismo lenguaje visual que el header
          real de MisReportesScreen, para que "Ver todos" no se sienta como
          entrar a una pantalla distinta */}
      <LinearGradient
        colors={[TEAL, TEAL_DARK]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIconCircle}>
            <Ionicons name="paw" size={18} color="#fff" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.title}>Reportes recientes</Text>
            <Text style={styles.subtitle}>Animales que has reportado como ciudadano</Text>
          </View>
        </View>
        {hasReports && !isLoading && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {totalReportes} {totalReportes === 1 ? 'reporte' : 'reportes'}
            </Text>
          </View>
        )}
      </LinearGradient>

      <View style={styles.body}>
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Brand.primary} />
          </View>
        ) : hasReports ? (
          <>
            <View style={{ gap: 12 }}>
              {reportes.map((r) => (
                <RecentReportItem key={r.id} reporte={r} onPress={onOpenMisReportes} />
              ))}
            </View>

            <View style={styles.footerDivider} />

            <TouchableOpacity onPress={onOpenMisReportes} activeOpacity={0.85} style={styles.verTodosButton}>
              <Text style={styles.verTodosText}>Ver todos mis reportes</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <RecentReportsEmptyState />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  countBadge: { backgroundColor: Brand.primary, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  countText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  body: { padding: 22 },
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },
  footerDivider: { height: 1, backgroundColor: 'rgba(46,42,38,0.08)', marginTop: 16, marginBottom: 16 },
  verTodosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Brand.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  verTodosText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});