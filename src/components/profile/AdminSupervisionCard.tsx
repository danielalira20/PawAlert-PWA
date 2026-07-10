import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import { AsociacionPendienteResumen } from '../../hooks/useAdminSupervision';

interface Props {
  pendientes: AsociacionPendienteResumen[];
  totalPendientes: number;
  isLoading: boolean;
  onOpenAdminPanel: () => void;
}

export function AdminSupervisionCard({ pendientes, totalPendientes, isLoading, onOpenAdminPanel }: Props) {
  const sinPendientes = !isLoading && totalPendientes === 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.topCard}>
        <View style={styles.headerInner}>
          <View>
            <Text style={styles.headerTitle}>Tu impacto</Text>
            <Text style={styles.headerSubtitle}>Administrador en PawAlert</Text>
          </View>
          <View style={styles.headerIconCircle}>
            <Ionicons name="shield-checkmark" size={22} color={Brand.primary} />
          </View>
        </View>

        <View style={styles.topDivider} />

        <View style={styles.body}>
          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Brand.primary} />
            </View>
          ) : sinPendientes ? (
            <View style={styles.okRow}>
              <Ionicons name="checkmark-circle" size={22} color={Brand.secondary} />
              <Text style={styles.okText}>No hay asociaciones pendientes de revisión. Todo al día.</Text>
            </View>
          ) : (
            <>
              <View style={styles.alertRow}>
                <View style={styles.alertIconCircle}>
                  <Ionicons name="alert-circle" size={20} color={Brand.primary} />
                </View>
                <Text style={styles.alertText}>
                  Tienes <Text style={styles.alertTextStrong}>{totalPendientes}</Text>{' '}
                  {totalPendientes === 1 ? 'asociación pendiente' : 'asociaciones pendientes'} de revisión.
                </Text>
              </View>

              <View style={{ gap: 8, marginTop: 16 }}>
                {pendientes.slice(0, 3).map((a) => (
                  <View key={a.id} style={styles.itemRow}>
                    <View style={styles.itemIconCircle}>
                      <Ionicons name="business-outline" size={16} color={Brand.textMuted} />
                    </View>
                    <Text style={styles.itemText} numberOfLines={1}>
                      {a.nombre}
                    </Text>
                  </View>
                ))}
                {totalPendientes > 3 && (
                  <Text style={styles.masText}>y {totalPendientes - 3} más...</Text>
                )}
              </View>

              <TouchableOpacity onPress={onOpenAdminPanel} activeOpacity={0.85} style={styles.ctaButton}>
                <Text style={styles.ctaText}>Ir al panel de administrador</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  topCard: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(46,42,38,0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  headerInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: Brand.primary },
  headerSubtitle: { fontSize: 13, color: Brand.textMuted, marginTop: 4, fontWeight: '600' },
  headerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(236,128,43,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topDivider: { height: 1, backgroundColor: 'rgba(46,42,38,0.08)' },
  body: { padding: 22 },
  loadingWrap: { alignItems: 'center', paddingVertical: 20 },

  okRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  okText: { flex: 1, fontSize: 13, color: Brand.textMuted, lineHeight: 19 },

  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  alertIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(236,128,43,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertText: { flex: 1, fontSize: 14, color: Brand.textDark, lineHeight: 20 },
  alertTextStrong: { fontWeight: '900', color: Brand.primary },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Brand.cardWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: { flex: 1, fontSize: 13, fontWeight: '600', color: Brand.textDark },
  masText: { fontSize: 12, color: Brand.textFaint, marginLeft: 4 },

  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Brand.primary,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 18,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});