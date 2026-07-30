import React, { useMemo } from 'react';
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
  const ofertasAgrupadas = useMemo(() => {
    const agrupadas = new Map<string, (typeof ofertas)[number]>();
    ofertas.forEach((oferta) => {
      const key = `${oferta.subcategoria || oferta.categoria}-${oferta.unidad}`;
      const existente = agrupadas.get(key);
      if (!existente) {
        agrupadas.set(key, { ...oferta });
        return;
      }
      agrupadas.set(key, {
        ...existente,
        capacidad_declarada: existente.capacidad_declarada + oferta.capacidad_declarada,
        capacidad_disponible: existente.capacidad_disponible + oferta.capacidad_disponible,
        activa: existente.activa || oferta.activa,
      });
    });
    return Array.from(agrupadas.values());
  }, [ofertas]);

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
              <View style={[styles.statBlock, resumen && styles.statBlockSummary]}>
                <View style={[styles.statIcon, { backgroundColor: 'rgba(236,128,43,0.12)' }]}>
                  <Ionicons name="gift-outline" size={19} color={Brand.primary} />
                </View>
                <View style={styles.statCopy}>
                  <Text style={styles.statValue}>{total_contribuciones}</Text>
                  <Text style={styles.statLabel}>
                    {total_contribuciones === 1 ? 'Contribución realizada' : 'Contribuciones realizadas'}
                  </Text>
                </View>
              </View>
              <View style={[styles.statBlock, resumen && styles.statBlockSummary]}>
                <View style={[styles.statIcon, { backgroundColor: 'rgba(102,188,180,0.15)' }]}>
                  <Ionicons name="people-outline" size={19} color={Brand.secondary} />
                </View>
                <View style={styles.statCopy}>
                  <Text style={styles.statValue}>{asociaciones_ayudadas}</Text>
                  <Text style={styles.statLabel}>
                    {asociaciones_ayudadas === 1 ? 'Asociación ayudada' : 'Asociaciones ayudadas'}
                  </Text>
                </View>
              </View>
            </View>

            {!resumen && ofertasAgrupadas.length > 0 && (
              <>
                <View style={styles.sectionDivider} />
                <View style={styles.sectionHeading}>
                  <View>
                    <Text style={styles.sectionTitle}>Capacidad ofrecida</Text>
                    <Text style={styles.sectionHelper}>Seguimiento de lo utilizado y lo que aún está disponible.</Text>
                  </View>
                  <Ionicons name="analytics-outline" size={20} color={Brand.secondary} />
                </View>
                <View style={styles.offersGrid}>
                  {ofertasAgrupadas.map((oferta) => {
                    const utilizada = Math.max(0, oferta.capacidad_declarada - oferta.capacidad_disponible);
                    const pct = oferta.capacidad_declarada > 0
                      ? Math.min(100, Math.round((utilizada / oferta.capacidad_declarada) * 100))
                      : 0;
                    return (
                      <View key={`${oferta.subcategoria || oferta.categoria}-${oferta.unidad}`} style={styles.offerCard}>
                        <View style={styles.ofertaTopRow}>
                          <Text style={styles.ofertaLabel} numberOfLines={1}>
                            {oferta.subcategoria || oferta.categoria}
                          </Text>
                          <View style={[styles.offerStatus, !oferta.activa && styles.offerStatusPaused]}>
                            <Text style={[styles.offerStatusText, !oferta.activa && styles.offerStatusTextPaused]}>
                              {oferta.activa ? 'Activa' : 'Pausada'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.offerNumbers}>
                          <View>
                            <Text style={styles.offerNumberLabel}>Disponible</Text>
                            <Text style={styles.ofertaValue}>
                              {oferta.capacidad_disponible} {oferta.unidad}
                            </Text>
                          </View>
                          <Text style={styles.offerPercent}>{pct}% utilizado</Text>
                        </View>
                        <View style={styles.miniBarTrack}>
                          <View style={[styles.miniBarFill, { width: `${pct}%` }]} />
                        </View>
                        <Text style={styles.offerTotal}>
                          {utilizada} de {oferta.capacidad_declarada} {oferta.unidad} aplicados
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {!resumen && aplicaciones.length > 0 && (
              <>
                <View style={styles.sectionDivider} />
                <View style={styles.sectionHeading}>
                  <View>
                    <Text style={styles.sectionTitle}>Actividad reciente</Text>
                    <Text style={styles.sectionHelper}>Aplicaciones confirmadas de tus aportaciones.</Text>
                  </View>
                  <Ionicons name="time-outline" size={20} color={Brand.primary} />
                </View>
                <View style={{ gap: 8 }}>
                  {aplicaciones.map((aplicacion, index) => (
                    <View key={index} style={styles.aplicacionRow}>
                      <View style={styles.activityIcon}>
                        <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                      </View>
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

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBlock: {
    minWidth: 210,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(46,42,38,0.06)',
  },
  statBlockSummary: { minWidth: 125, paddingHorizontal: 10 },
  statIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statCopy: { flex: 1, marginLeft: 11 },
  statValue: { fontSize: 24, fontWeight: '900', color: Brand.textDark },
  statLabel: { fontSize: 11, color: Brand.textMuted, fontWeight: '600', marginTop: 1 },

  sectionDivider: { height: 1, backgroundColor: 'rgba(46,42,38,0.08)', marginVertical: 20 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: Brand.textDark },
  sectionHelper: { fontSize: 11, color: Brand.textMuted, marginTop: 3 },

  offersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  offerCard: {
    minWidth: 230,
    flex: 1,
    padding: 14,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(46,42,38,0.06)',
  },
  ofertaTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  ofertaLabel: { fontSize: 13, fontWeight: '700', color: Brand.textDark, flexShrink: 1, marginRight: 8 },
  offerStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(39,174,96,0.1)' },
  offerStatusPaused: { backgroundColor: 'rgba(140,122,107,0.12)' },
  offerStatusText: { color: '#248A4E', fontSize: 9, fontWeight: '800' },
  offerStatusTextPaused: { color: Brand.textMuted },
  offerNumbers: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 },
  offerNumberLabel: { color: Brand.textFaint, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  ofertaValue: { fontSize: 15, fontWeight: '900', color: Brand.textDark, marginTop: 2 },
  offerPercent: { color: Brand.secondary, fontSize: 10, fontWeight: '800' },
  miniBarTrack: { height: 8, borderRadius: 4, backgroundColor: '#EEE8E1', overflow: 'hidden', marginTop: 10 },
  miniBarFill: { height: '100%', backgroundColor: Brand.secondary, borderRadius: 4 },
  offerTotal: { fontSize: 9, color: Brand.textFaint, marginTop: 6 },

  aplicacionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  activityIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: Brand.secondary,
  },
  aplicacionLeft: { flex: 1, marginRight: 10 },
  aplicacionNota: { fontSize: 13, fontWeight: '700', color: Brand.textDark },
  aplicacionFecha: { fontSize: 11, color: Brand.textFaint, marginTop: 2 },
  aplicacionCantidad: { fontSize: 13, fontWeight: '800', color: Brand.primary },
});
