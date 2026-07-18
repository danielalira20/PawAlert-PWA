import React from 'react';
import {
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
  onRefugio: () => void;
  // Mismo criterio que ReportCard: los hitos de campo (validan llegada
  // contra el refugio de la asociación) solo aplican a voluntario_interno
  // (y staff elevado) por ahora. Default true para no romper el
  // comportamiento existente donde no se pase este prop explícitamente.
  puedeRegistrarHitos?: boolean;
}

export function ReportDetailModal({
  visible,
  reporte,
  onClose,
  onEncontre,
  onRefugio,
  puedeRegistrarHitos = true,
}: Props) {
  const animales = reporte ? getAnimales(reporte) : [];
  const grave = animalMasGrave(animales);
  const totalCaso = totalAnimales(animales);
  const condicion = reporte ? normalizeCondicion(grave?.condicion) : null;
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const abrirMapa = () => {
    if (!reporte?.latitud || !reporte?.longitud) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${reporte.latitud},${reporte.longitud}`;
    Linking.openURL(url);
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
                <Image source={{ uri: reporte.foto_url }} style={styles.photo} resizeMode="cover" />
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
                <TouchableOpacity onPress={abrirMapa} style={styles.mapaButton}>
                  <Ionicons name="navigate-outline" size={16} color={Brand.secondary} />
                  <Text style={styles.mapaButtonText}>Cómo llegar</Text>
                </TouchableOpacity>
              </View>

              {puedeRegistrarHitos && reporte.estado_reporte === 'en_camino' && (
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: Brand.primary }]} onPress={onEncontre}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Encontré al animal</Text>
                </TouchableOpacity>
              )}

              {puedeRegistrarHitos && reporte.estado_reporte === 'en_atencion' && (
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#8E44AD' }]} onPress={onRefugio}>
                  <Ionicons name="home-outline" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Llegué al refugio</Text>
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
  mapaButton: {
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
});