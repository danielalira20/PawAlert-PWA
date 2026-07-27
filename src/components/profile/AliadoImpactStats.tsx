import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Brand } from '../../constants/theme';
import type { ImpactoAliado } from '../../hooks/useAliadoImpact';

interface Props {
  impacto: ImpactoAliado;
  isLoading: boolean;
  // Versión resumida para el cuerpo de Mi Perfil (solo los 2 números
  // principales) — el desglose completo de ofertas/aplicaciones vive en
  // AliadoDashboardScreen, que usa este mismo componente sin este prop.
  resumen?: boolean;
}

const TIPO_SUBTITULO: Record<string, string> = {
  donante_comunitario: 'Donante comunitario en PawAlert',
  aliado_local: 'Aliado local en PawAlert',
  patrocinador_institucional: 'Patrocinador institucional en PawAlert',
};

export function AliadoImpactStats({ impacto, isLoading, resumen }: Props) {
  const { tipo, total_contribuciones, asociaciones_ayudadas, ofertas, aplicaciones } = impacto;
  const sinDatos = total_contribuciones === 0 && ofertas.length === 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.topCard}>
        <View style={styles.headerInner}>
          <View>
            <Text style={styles.headerTitle}>Tu impacto como aliado</Text>
            <Text style={styles.headerSubtitle}>{(tipo && TIPO_SUBTITULO[tipo]) || 'Aliado en PawAlert'}</Text>
          </View>
          <View style={styles.headerIconCircle}>
            <Ionicons name="heart" size={22} color={Brand.primary} />
          </View>
        </View>

        <View style={styles.topDivider} />

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Brand.primary} />
          </View>
        ) : sinDatos ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              Cuando hagas tu primera contribución u oferta, aquí verás tu impacto.
            </Text>
          </View>
        ) : (
          <View style={styles.body}>
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{total_contribuciones}</Text>
                <Text style={styles.statLabel}>
                  {total_contribuciones === 1 ? 'Contribución realizada' : 'Contribuciones realizadas'}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{asociaciones_ayudadas}</Text>
                <Text style={styles.statLabel}>
                  {asociaciones_ayudadas === 1 ? 'Asociación ayudada' : 'Asociaciones ayudadas'}
                </Text>
              </View>
            </View>

            {!resumen && ofertas.length > 0 && (
              <>
                <View style={styles.sectionDivider} />
                <Text style={styles.sectionLabel}>Tu capacidad ofrecida</Text>
                <View style={{ gap: 14 }}>
                  {ofertas.map((oferta) => {
                    const pct = oferta.capacidad_declarada > 0
                      ? Math.round((oferta.capacidad_disponible / oferta.capacidad_declarada) * 100)
                      : 0;
                    return (
                      <View key={oferta.oferta_id}>
                        <View style={styles.ofertaTopRow}>
                          <Text style={styles.ofertaLabel} numberOfLines={1}>
                            {oferta.subcategoria || oferta.categoria}
                          </Text>
                          <Text style={styles.ofertaValue}>
                            {oferta.capacidad_disponible} / {oferta.capacidad_declarada} {oferta.unidad}
                          </Text>
                        </View>
                        <View style={styles.miniBarTrack}>
                          <View style={[styles.miniBarFill, { width: `${pct}%` }]} />
                        </View>
                        {!oferta.activa && <Text style={styles.ofertaInactiva}>Oferta pausada</Text>}
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {!resumen && aplicaciones.length > 0 && (
              <>
                <View style={styles.sectionDivider} />
                <Text style={styles.sectionLabel}>Historial de aplicaciones</Text>
                <View style={{ gap: 8 }}>
                  {aplicaciones.map((aplicacion, index) => (
                    <View key={index} style={styles.aplicacionRow}>
                      <View style={styles.aplicacionLeft}>
                        <Text style={styles.aplicacionNota} numberOfLines={1}>
                          {aplicacion.nota || 'Aplicación'}
                        </Text>
                        <Text style={styles.aplicacionFecha}>
                          {format(new Date(aplicacion.fecha), "d 'de' MMMM yyyy", { locale: es })}
                        </Text>
                      </View>
                      {aplicacion.cantidad && (
                        <Text style={styles.aplicacionCantidad}>{aplicacion.cantidad}</Text>
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
  elevation: 2,
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  topCard: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(46,42,38,0.08)',
    overflow: 'hidden',
    ...CARD_SHADOW,
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
  loadingWrap: { alignItems: 'center', paddingVertical: 30 },
  emptyWrap: { padding: 22 },
  emptyText: { fontSize: 14, color: Brand.textMuted, lineHeight: 20 },

  body: { padding: 22 },

  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBlock: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '900', color: Brand.textDark },
  statLabel: { fontSize: 12, color: Brand.textMuted, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  statDivider: { width: 1, height: 40, backgroundColor: 'rgba(46,42,38,0.08)' },

  sectionDivider: { height: 1, backgroundColor: 'rgba(46,42,38,0.08)', marginVertical: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Brand.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 14,
  },

  ofertaTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  ofertaLabel: { fontSize: 13, fontWeight: '700', color: Brand.textDark, flexShrink: 1, marginRight: 8 },
  ofertaValue: { fontSize: 13, fontWeight: '800', color: Brand.textDark },
  miniBarTrack: { height: 8, borderRadius: 4, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  miniBarFill: { height: '100%', backgroundColor: Brand.secondary, borderRadius: 4 },
  ofertaInactiva: { fontSize: 11, color: Brand.textFaint, marginTop: 4, fontStyle: 'italic' },

  aplicacionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  aplicacionLeft: { flex: 1, marginRight: 10 },
  aplicacionNota: { fontSize: 13, fontWeight: '700', color: Brand.textDark },
  aplicacionFecha: { fontSize: 11, color: Brand.textFaint, marginTop: 2 },
  aplicacionCantidad: { fontSize: 13, fontWeight: '800', color: Brand.primary },
});
