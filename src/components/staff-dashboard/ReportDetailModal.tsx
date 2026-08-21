import React from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand, normalizeCondicion } from '../../constants/theme';
import { ConditionBadge } from './ConditionBadge';
import { AnimalCarousel } from '../common/AnimalCarousel';
import type { ReporteStaff } from '../../types/reportestaff';
import { getAnimales, animalMasGrave, totalAnimales } from '../../types/reporte';

const DESKTOP_BREAKPOINT = 900;

interface Props {
  visible: boolean;
  reporte: ReporteStaff | null;
  onClose: () => void;
  onEncontre: () => void;
  onLlegadaZona: () => void;
  onNoLocalizado: () => void;
  onBajoResguardo: () => void;
  onRefugio: () => void;
  onVeterinaria: () => void;
  // Se conserva como permiso explícito para no exponer acciones de campo a
  // otros roles que también pueden consultar el detalle.
  puedeRegistrarHitos?: boolean;
  esHogarTemporal?: boolean;
  esVoluntarioInterno?: boolean;
}

export function ReportDetailModal({
  visible,
  reporte,
  onClose,
  onEncontre,
  onLlegadaZona,
  onNoLocalizado,
  onBajoResguardo,
  onRefugio,
  onVeterinaria,
  puedeRegistrarHitos = true,
  esHogarTemporal = false,
  esVoluntarioInterno = false,
}: Props) {
  const animales = reporte ? getAnimales(reporte) : [];
  const grave = animalMasGrave(animales);
  const totalCaso = totalAnimales(animales);
  const condicion = reporte ? normalizeCondicion(grave?.condicion) : null;
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const tieneCoordenadas =
    typeof reporte?.latitud === 'number' &&
    Number.isFinite(reporte.latitud) &&
    typeof reporte?.longitud === 'number' &&
    Number.isFinite(reporte.longitud);
  const tieneRuta =
    reporte?.ruta?.status === 'complete' &&
    typeof reporte.ruta.duration_seconds === 'number' &&
    typeof reporte.ruta.distance_meters === 'number';

  const abrirNavegacion = async (proveedor: 'google' | 'waze') => {
    if (!tieneCoordenadas || !reporte) return;
    const destino = `${reporte.latitud},${reporte.longitud}`;
    const url =
      proveedor === 'google'
        ? `https://www.google.com/maps/dir/?api=1&destination=${destino}`
        : `https://www.waze.com/ul?ll=${destino}&navigate=yes`;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('No pudimos abrir el mapa', 'Intenta nuevamente o usa otra aplicación de navegación.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={[styles.overlay, isDesktop && styles.overlayDesktop]}>
        <View style={[styles.sheet, isDesktop && styles.sheetDesktop]}>
          <View style={styles.header}>
            <Text style={styles.title}>Detalles del caso</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={Brand.textFaint} />
            </TouchableOpacity>
          </View>

          {reporte && (
            <ScrollView showsVerticalScrollIndicator={false}>
              {reporte.foto_url ? (
                <Image source={{ uri: reporte.foto_url }} style={styles.photo} resizeMode="contain" />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Ionicons name="paw-outline" size={48} color="#B0A098" />
                </View>
              )}

              {condicion && (
                <View style={styles.badgeRow}>
                  <ConditionBadge condicion={condicion} />
                  {totalCaso > 1 && (
                    <View style={styles.countPill}>
                      <Ionicons name="paw" size={11} color={Brand.textDark} />
                      <Text style={styles.countPillText}>{totalCaso} animales en este caso</Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.card}>
                <Text style={styles.cardLabel}>
                  {totalCaso > 1 ? 'Animales de este caso' : 'Información del animal'}
                </Text>
                <AnimalCarousel key={reporte.id} animales={animales} />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardLabel}>Ubicación</Text>
                <Text style={styles.calle}>{reporte.calle || 'Calle desconocida'}</Text>
                <Text style={styles.colonia}>
                  {[reporte.colonia, reporte.municipio].filter(Boolean).join(', ') || 'Ubicación no disponible'}
                </Text>
                {tieneRuta ? (
                  <View style={styles.routeSummary}>
                    <Ionicons name="time-outline" size={18} color={Brand.secondary} />
                    <View style={styles.routeSummaryCopy}>
                      <Text style={styles.routeSummaryTitle}>
                        {Math.max(1, Math.round(reporte.ruta!.duration_seconds! / 60))} min ·{' '}
                        {(reporte.ruta!.distance_meters! / 1000).toFixed(1)} km
                      </Text>
                      <Text style={styles.routeSummaryText}>Ruta calculada desde tu ubicación registrada</Text>
                    </View>
                  </View>
                ) : typeof reporte.distancia_linea_recta_km === 'number' ? (
                  <View style={styles.routeSummary}>
                    <Ionicons name="resize-outline" size={18} color={Brand.textMuted} />
                    <View style={styles.routeSummaryCopy}>
                      <Text style={styles.routeSummaryTitle}>
                        Aproximadamente {reporte.distancia_linea_recta_km.toFixed(1)} km
                      </Text>
                      <Text style={styles.routeSummaryText}>
                        Distancia en línea recta; la aplicación de navegación mostrará la ruta real.
                      </Text>
                    </View>
                  </View>
                ) : null}
                {tieneCoordenadas && (
                  <View style={styles.navigationActions}>
                    <TouchableOpacity
                      accessibilityLabel="Abrir ruta en Google Maps"
                      onPress={() => void abrirNavegacion('google')}
                      style={styles.mapaButton}
                    >
                      <Ionicons name="map-outline" size={17} color={Brand.secondary} />
                      <Text style={styles.mapaButtonText}>Google Maps</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityLabel="Abrir ruta en Waze"
                      onPress={() => void abrirNavegacion('waze')}
                      style={styles.mapaButton}
                    >
                      <Ionicons name="navigate-outline" size={17} color={Brand.secondary} />
                      <Text style={styles.mapaButtonText}>Waze</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {puedeRegistrarHitos &&
                esHogarTemporal &&
                reporte.estado_reporte === 'en_camino' &&
                !reporte.llegada_zona_registrada && (
                  <View style={styles.fieldProgressCard}>
                    <View style={styles.fieldProgressIcon}>
                      <Ionicons name="navigate" size={18} color={Brand.secondary} />
                    </View>
                    <View style={styles.fieldProgressCopy}>
                      <Text style={styles.fieldProgressTitle}>Primero valida tu llegada</Text>
                      <Text style={styles.fieldProgressText}>
                        Al estar cerca del punto podrás registrar el resultado de la búsqueda.
                      </Text>
                    </View>
                  </View>
                )}

              {puedeRegistrarHitos &&
                esHogarTemporal &&
                reporte.estado_reporte === 'en_camino' &&
                !reporte.llegada_zona_registrada && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: Brand.secondary }]}
                    onPress={onLlegadaZona}
                  >
                    <Ionicons name="location-outline" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Llegué a la zona</Text>
                  </TouchableOpacity>
                )}

              {puedeRegistrarHitos &&
                reporte.estado_reporte === 'en_camino' &&
                (!esHogarTemporal || reporte.llegada_zona_registrada) && (
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: Brand.primary }]} onPress={onEncontre}>
                  <Ionicons name="paw-outline" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Encontré al animal</Text>
                </TouchableOpacity>
              )}

              {puedeRegistrarHitos &&
                reporte.estado_reporte === 'en_camino' &&
                (esVoluntarioInterno ||
                  (esHogarTemporal && reporte.llegada_zona_registrada)) && (
                  <TouchableOpacity style={styles.secondaryActionButton} onPress={onNoLocalizado}>
                    <Ionicons name="search-outline" size={18} color="#9A6700" />
                    <Text style={styles.secondaryActionText}>No lo localicé</Text>
                  </TouchableOpacity>
                )}

              {(esVoluntarioInterno || esHogarTemporal) &&
                reporte.animal_no_localizado_registrado && (
                  <View style={styles.searchUpdate}>
                    <Ionicons name="time-outline" size={16} color="#9A6700" />
                    <Text style={styles.searchUpdateText}>
                      Ya enviaste una búsqueda sin resultado. El caso permanece activo.
                    </Text>
                  </View>
                )}

              {puedeRegistrarHitos &&
                reporte.estado_reporte === 'en_atencion' &&
                reporte.tiene_sugerencia_aceptada &&
                !reporte.tiene_llegada_veterinaria_registrada && (
                  <TouchableOpacity style={[styles.actionButton, { backgroundColor: Brand.secondary }]} onPress={onVeterinaria}>
                    <Ionicons name="medkit-outline" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Registrar llegada a veterinaria</Text>
                  </TouchableOpacity>
                )}

              {puedeRegistrarHitos &&
                esHogarTemporal &&
                reporte.estado_reporte === 'en_atencion' &&
                !reporte.animal_bajo_resguardo_registrado && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: Brand.secondary }]}
                    onPress={onBajoResguardo}
                  >
                    <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Animal bajo resguardo</Text>
                  </TouchableOpacity>
                )}

              {puedeRegistrarHitos &&
                reporte.estado_reporte === 'en_atencion' &&
                (!esHogarTemporal || reporte.animal_bajo_resguardo_registrado) && (
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#8E44AD' }]} onPress={onRefugio}>
                  <Ionicons name="home-outline" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>
                    {esHogarTemporal ? 'Llegué a mi hogar temporal' : 'Llegué al refugio'}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(46,42,38,0.55)', justifyContent: 'flex-end' },
  overlayDesktop: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    backgroundColor: Brand.backgroundWarm,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 18,
    paddingHorizontal: 18,
    maxHeight: '90%',
  },
  sheetDesktop: {
    borderRadius: 26,
    width: '100%',
    maxWidth: 460,
    maxHeight: '80%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: Brand.textDark },
  photo: { width: '100%', height: 240, borderRadius: 18, marginBottom: 12 },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E2D0B8' },
  badgeRow: { marginBottom: 12, alignItems: 'flex-start', flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: `${Brand.secondary}22`,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  countPillText: { fontSize: 11, fontWeight: '700', color: Brand.textDark },
  card: { backgroundColor: Brand.cardWarm, borderRadius: 16, padding: 14, marginBottom: 12 },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Brand.textFaint,
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 0.4,
  },
  cardLabelSmall: { fontSize: 11, fontWeight: '700', color: Brand.textFaint, marginBottom: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  infoLabel: { color: Brand.textMuted, fontSize: 13 },
  infoValue: { color: Brand.textDark, fontWeight: '700', fontSize: 13 },
  descripcionBlock: { marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E4D3B8' },
  descripcionText: { color: Brand.textDark, fontSize: 13, lineHeight: 19 },
  calle: { color: Brand.textDark, fontWeight: '700', fontSize: 14, marginBottom: 3 },
  colonia: { color: Brand.textMuted, fontSize: 12, marginBottom: 12 },
  routeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E4D3B8',
  },
  routeSummaryCopy: { flex: 1 },
  routeSummaryTitle: { color: Brand.textDark, fontWeight: '800', fontSize: 13 },
  routeSummaryText: { color: Brand.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  navigationActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  mapaButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: `${Brand.secondary}1A`,
    borderWidth: 1,
    borderColor: `${Brand.secondary}55`,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapaButtonText: { color: Brand.secondary, fontWeight: '700', fontSize: 13 },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  actionButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  fieldProgressCard: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 15,
    padding: 12,
    backgroundColor: `${Brand.secondary}12`,
    borderWidth: 1,
    borderColor: `${Brand.secondary}3D`,
    marginBottom: 10,
  },
  fieldProgressIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldProgressCopy: { flex: 1 },
  fieldProgressTitle: { color: Brand.textDark, fontSize: 12, fontWeight: '800' },
  fieldProgressText: { color: Brand.textMuted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  secondaryActionButton: {
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: -10,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: `${Brand.accent}88`,
    backgroundColor: `${Brand.accent}0F`,
  },
  secondaryActionText: { color: '#9A6700', fontWeight: '800', fontSize: 14 },
  searchUpdate: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 11,
    borderRadius: 13,
    backgroundColor: `${Brand.accent}12`,
    marginBottom: 18,
  },
  searchUpdateText: { color: Brand.textMuted, fontSize: 10, lineHeight: 15, flex: 1 },
});
