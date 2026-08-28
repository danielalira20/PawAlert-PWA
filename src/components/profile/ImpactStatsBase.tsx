import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Brand } from '../../constants/theme';
import { AnimalIcon } from './AnimalIcon';
import { CONDICION_PREVIEW, ESTADO_PREVIEW } from './condicionEstadoColors';
import type { ImpactoReportante } from '../../hooks/useRecentReports';

export interface ImpactStatsCopy {
  // "Reportante en PawAlert" / "Asociación en PawAlert" / etc.
  roleLabel: string;
  // Prefijo antes de "desde [mes año]" en el subtítulo — ej. "Miembro" o "Activa"
  desdePrefijo: string;
  // Mensaje cálido según cuántos se rescataron
  mensajeCalido: (rescatados: number) => string;
  // Texto de detalle bajo el mensaje ("Has realizado X reportes..." / "Tu
  // asociación ha gestionado X reportes...")
  detalleTexto: (total: number, enProceso: number) => string;
  // Encabezado de la sección de especies ("Animales reportados" / "Animales atendidos")
  tituloEspecies: string;
}

interface Props {
  impacto: ImpactoReportante;
  isLoading: boolean;
  copy: ImpactStatsCopy;
}

const RING_SIZE = 110;
const STROKE_WIDTH = 12;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ORDEN_ESTADOS = ['pendiente', 'asignado', 'en_camino', 'en_atencion', 'rescatado', 'cerrado'];
const ORDEN_CONDICION = ['estable', 'herido', 'grave'] as const;

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function ImpactStatsBase({ impacto, isLoading, copy }: Props) {
  const { width } = useWindowDimensions();
  const isWide = width >= 640;

  const {
    total,
    enProceso,
    porcentajeRescate,
    porTipoAnimal,
    porEstado,
    porCondicion,
    primerReporte,
    mesesActivos,
  } = impacto;

  const dashOffset = CIRCUMFERENCE * (1 - porcentajeRescate / 100);
  const estadosConDatos = ORDEN_ESTADOS.filter((clave) => (porEstado[clave] ?? 0) > 0);
  const desdeFecha = primerReporte
    ? capitalizar(format(new Date(primerReporte), 'MMMM yyyy', { locale: es }))
    : null;

  const totalEspecies = porTipoAnimal.perro + porTipoAnimal.gato + porTipoAnimal.otro;
  const pctPerros = totalEspecies > 0 ? Math.round((porTipoAnimal.perro / totalEspecies) * 100) : 0;
  const pctGatos = totalEspecies > 0 ? Math.round((porTipoAnimal.gato / totalEspecies) * 100) : 0;
  const pctOtros = totalEspecies > 0 ? Math.round((porTipoAnimal.otro / totalEspecies) * 100) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.topCard}>
        <View style={styles.headerInner}>
          <View>
            <Text style={styles.headerTitle}>Tu impacto</Text>
            <Text style={styles.headerSubtitle}>
              {copy.roleLabel}{desdeFecha ? ` · ${copy.desdePrefijo} desde ${desdeFecha}` : ''}
            </Text>
          </View>
          
        </View>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Brand.primary} />
          </View>
        ) : total === 0 ? (
          <>
            <View style={styles.topDivider} />
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{copy.mensajeCalido(0)}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.topDivider} />
            <View style={[styles.innerRow, !isWide && styles.innerRowStacked]}>
              <View style={[styles.ringSection, !isWide && styles.stackedCardReset]}>
                <View style={styles.ringWrap}>
                  <Svg 
                    width={RING_SIZE} 
                    height={RING_SIZE} 
                    style={{ transform: [{ rotate: '-90deg' }] }}
                  >
                    <Circle
                      cx={RING_SIZE / 2}
                      cy={RING_SIZE / 2}
                      r={RADIUS}
                      stroke={Brand.backgroundWarm}
                      strokeWidth={STROKE_WIDTH}
                      fill="none"
                    />
                    <Circle
                      cx={RING_SIZE / 2}
                      cy={RING_SIZE / 2}
                      r={RADIUS}
                      stroke={Brand.primary}
                      strokeWidth={STROKE_WIDTH}
                      strokeDasharray={CIRCUMFERENCE}
                      strokeDashoffset={dashOffset}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </Svg>
                  <View style={styles.ringLabel}>
                    <Text style={styles.ringPercent}>{porcentajeRescate}%</Text>
                    <Text style={styles.ringCaption}>rescatados</Text>
                  </View>
                </View>

                <View style={styles.ringTextCol}>
                  <Text style={styles.message}>{copy.mensajeCalido(impacto.animalesRescatados)}</Text>
                  <Text style={styles.detail}>{copy.detalleTexto(total, enProceso)}</Text>
                  <View style={styles.activePill}>
                    <Ionicons name="trending-up-outline" size={13} color={Brand.secondary} />
                    <Text style={styles.activePillText}>
                      {mesesActivos} {mesesActivos === 1 ? 'mes activo' : 'meses activos'} en la comunidad
                    </Text>
                  </View>
                </View>
              </View>

              <View style={isWide ? styles.verticalDivider : styles.horizontalDividerInRow} />

              <View style={[styles.speciesSection, !isWide && styles.stackedCardReset]}>
                <Text style={styles.sectionLabel}>{copy.tituloEspecies}</Text>

                <View style={{ gap: 14, flex: 1 }}>
                  <View>
                    <View style={styles.speciesTopRow}>
                      <View style={styles.speciesLeft}>
                        <View style={styles.speciesIconSquare}>
                          <AnimalIcon tipoAnimal="perro" condicion={null} size={20} bare />
                        </View>
                        <Text style={styles.speciesLabel}>Perros</Text>
                      </View>
                      <Text style={styles.speciesValue}>{porTipoAnimal.perro}</Text>
                    </View>
                    <View style={styles.miniBarTrack}>
                      <View style={[styles.miniBarFill, { width: `${pctPerros}%` }]} />
                    </View>
                  </View>

                  <View>
                    <View style={styles.speciesTopRow}>
                      <View style={styles.speciesLeft}>
                        <View style={styles.speciesIconSquare}>
                          <AnimalIcon tipoAnimal="gato" condicion={null} size={20} bare />
                        </View>
                        <Text style={styles.speciesLabel}>Gatos</Text>
                      </View>
                      <Text style={styles.speciesValue}>{porTipoAnimal.gato}</Text>
                    </View>
                    <View style={styles.miniBarTrack}>
                      <View style={[styles.miniBarFill, { width: `${pctGatos}%` }]} />
                    </View>
                  </View>

                  {porTipoAnimal.otro > 0 && (
                    <View>
                      <View style={styles.speciesTopRow}>
                        <View style={styles.speciesLeft}>
                          <View style={styles.speciesIconSquare}>
                            <AnimalIcon tipoAnimal={null} condicion={null} size={20} bare />
                          </View>
                          <Text style={styles.speciesLabel}>Otros</Text>
                        </View>
                        <Text style={styles.speciesValue}>{porTipoAnimal.otro}</Text>
                      </View>
                      <View style={styles.miniBarTrack}>
                        <View style={[styles.miniBarFill, { width: `${pctOtros}%` }]} />
                      </View>
                    </View>
                  )}
                </View>

                <View style={styles.speciesFooter}>
                  <Text style={styles.speciesFooterLabel}>Total</Text>
                  <Text style={styles.speciesFooterValue}>{totalEspecies}</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </View>

      {!isLoading && total > 0 && (
        <View style={[styles.rowWrap, !isWide && styles.rowWrapStacked]}>
          <View style={[styles.card, styles.statusCard, !isWide && styles.stackedCardReset]}>
            <View style={styles.statusHeader}>
              <Text style={styles.sectionLabel}>Estado de tus reportes</Text>
              <Text style={styles.statusTotal}>
                {total} {total === 1 ? 'caso total' : 'casos totales'}
              </Text>
            </View>

            <View style={styles.stackedBar}>
              {estadosConDatos.map((clave) => (
                <View
                  key={clave}
                  style={{ flex: porEstado[clave], backgroundColor: ESTADO_PREVIEW[clave]?.color ?? '#64748B' }}
                />
              ))}
            </View>

            <View style={styles.legendGrid}>
              {estadosConDatos.map((clave) => (
                <View key={clave} style={styles.legendGridItem}>
                  <View style={styles.legendGridLeft}>
                    <View style={[styles.legendDot, { backgroundColor: ESTADO_PREVIEW[clave]?.color ?? '#64748B' }]} />
                    <Text style={styles.legendText}>{ESTADO_PREVIEW[clave]?.label ?? clave}</Text>
                  </View>
                  <Text style={styles.legendCount}>{porEstado[clave]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.card, styles.condCard, !isWide && styles.stackedCardReset]}>
            <Text style={styles.sectionLabel}>Condición</Text>
            <View style={{ gap: 10 }}>
              {ORDEN_CONDICION.map((clave) => (
                <View
                  key={clave}
                  style={[styles.condItemRow, { backgroundColor: CONDICION_PREVIEW[clave].bg }]}
                >
                  <View style={styles.condLeft}>
                    <View style={[styles.legendDot, { backgroundColor: CONDICION_PREVIEW[clave].color }]} />
                    <Text style={[styles.condLabel, { color: CONDICION_PREVIEW[clave].color }]}>
                      {CONDICION_PREVIEW[clave].label}
                    </Text>
                  </View>
                  <Text style={[styles.condValue, { color: CONDICION_PREVIEW[clave].color }]}>
                    {porCondicion[clave]}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
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
    marginBottom: 16,
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

  innerRow: { flexDirection: 'row', flexWrap: 'wrap' },
  innerRowStacked: { flexDirection: 'column' },
  horizontalDividerInRow: { height: 1, backgroundColor: 'rgba(46,42,38,0.08)', marginHorizontal: 22 },
  stackedCardReset: { flexBasis: 'auto', flexGrow: 0, minWidth: 0 },
  ringSection: {
    flexGrow: 2,
    flexBasis: 300,
    minWidth: 280,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    padding: 22,
  },
  verticalDivider: { width: 1, backgroundColor: 'rgba(46,42,38,0.08)' },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ringLabel: { position: 'absolute', alignItems: 'center' },
  ringPercent: { fontSize: 26, fontWeight: '900', color: Brand.textDark },
  ringCaption: { fontSize: 10, color: Brand.textFaint, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  ringTextCol: { flex: 1, minWidth: 160 },
  message: { fontSize: 17, fontWeight: '800', color: Brand.textDark, lineHeight: 22, marginBottom: 8 },
  detail: { fontSize: 13, color: Brand.textMuted, lineHeight: 19 },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: `${Brand.secondary}18`,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  activePillText: { fontSize: 11, fontWeight: '700', color: Brand.secondary },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Brand.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 16,
  },

  speciesSection: { flexGrow: 1, flexBasis: 200, minWidth: 190, padding: 22 },
  speciesTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  speciesLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speciesIconSquare: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speciesLabel: { fontSize: 13, fontWeight: '700', color: Brand.textDark },
  speciesValue: { fontSize: 16, fontWeight: '900', color: Brand.textDark },
  miniBarTrack: { height: 5, borderRadius: 3, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  miniBarFill: { height: '100%', backgroundColor: Brand.primary, borderRadius: 3 },
  speciesFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(46,42,38,0.08)',
    marginTop: 16,
    paddingTop: 14,
  },
  speciesFooterLabel: { fontSize: 12, color: Brand.textMuted },
  speciesFooterValue: { fontSize: 13, fontWeight: '800', color: Brand.textDark },

  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  rowWrapStacked: { flexDirection: 'column' },
  card: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(46,42,38,0.08)',
    padding: 24,
    ...CARD_SHADOW,
  },
  statusCard: { flexGrow: 2, flexBasis: 320, minWidth: 280 },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 },
  statusTotal: { fontSize: 11, color: Brand.textFaint, fontWeight: '600' },
  stackedBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: '#FFFFFF', marginBottom: 16, gap: 2 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendGridItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  legendGridLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '600', color: Brand.textDark },
  legendCount: { fontSize: 13, fontWeight: '800', color: Brand.textDark },

  condCard: { flexGrow: 1, flexBasis: 200, minWidth: 190 },
  condItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  condLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  condLabel: { fontSize: 13, fontWeight: '700' },
  condValue: { fontSize: 16, fontWeight: '900' },
});