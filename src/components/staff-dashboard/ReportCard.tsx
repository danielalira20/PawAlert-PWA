import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Brand, normalizeCondicion } from '../../constants/theme';
import { ConditionBadge } from './ConditionBadge';
import { AnimalCarousel } from '../common/AnimalCarousel';
import type { ReporteStaff } from '../../types/reportestaff';
import { getAnimales, animalMasGrave, totalAnimales } from '../../types/reporte';

const TRAY_WIDTH = 92;
const SWIPE_OPEN_THRESHOLD = -44;

type QuickActionType = 'llegada_zona' | 'encontre' | 'resguardo' | 'refugio' | 'detalle';

interface QuickActionConfig {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  type: QuickActionType;
}

// La "acción rápida" del swipe abre el MISMO modal que ya tenías dentro del
// detalle (no lo salta) — solo evita el paso extra de tocar la card y luego
// buscar el botón. Para externos, el primer gesto en campo es validar la
// llegada; solo después se habilita "Encontré al animal".
function getQuickAction(
  reporte: ReporteStaff,
  esHogarTemporal = false,
  requiereLlegadaZona = esHogarTemporal,
): QuickActionConfig {
  switch (reporte.estado_reporte) {
    case 'en_camino':
      if (requiereLlegadaZona && !reporte.llegada_zona_registrada) {
        return {
          label: 'Llegué a la zona',
          icon: 'location-outline',
          color: Brand.secondary,
          type: 'llegada_zona',
        };
      }
      return {
        label: 'Encontré al animal',
        icon: 'paw-outline',
        color: Brand.primary,
        type: 'encontre',
      };
    case 'en_atencion':
      if (esHogarTemporal && !reporte.animal_bajo_resguardo_registrado) {
        return {
          label: 'Bajo resguardo',
          icon: 'shield-checkmark-outline',
          color: Brand.secondary,
          type: 'resguardo',
        };
      }
      return {
        label: esHogarTemporal ? 'Llegué a mi hogar' : 'Llegué al refugio',
        icon: 'home-outline',
        color: '#8E44AD',
        type: 'refugio',
      };
    case 'cerrado':
      return { label: 'Cerrado', icon: 'checkmark-done-outline', color: '#9B8B7E', type: 'detalle' };
    default:
      return { label: 'Ver detalle', icon: 'eye-outline', color: Brand.secondary, type: 'detalle' };
  }
}

interface Props {
  reporte: ReporteStaff;
  index?: number;
  onOpenDetail: (reporte: ReporteStaff) => void;
  onQuickLlegadaZona: (reporte: ReporteStaff) => void;
  onQuickResguardo: (reporte: ReporteStaff) => void;
  onQuickEncontre: (reporte: ReporteStaff) => void;
  onQuickRefugio: (reporte: ReporteStaff) => void;
  // Permiso explícito: otros roles pueden consultar la tarjeta sin recibir
  // acciones rápidas de campo.
  puedeRegistrarHitos?: boolean;
  esHogarTemporal?: boolean;
  requiereLlegadaZona?: boolean;
}

export function ReportCard({
  reporte,
  index = 0,
  onOpenDetail,
  onQuickLlegadaZona,
  onQuickResguardo,
  onQuickEncontre,
  onQuickRefugio,
  puedeRegistrarHitos = true,
  esHogarTemporal = false,
  requiereLlegadaZona = esHogarTemporal,
}: Props) {
  const translateX = useSharedValue(0);
  const action = useMemo(
    () => getQuickAction(reporte, esHogarTemporal, requiereLlegadaZona),
    [esHogarTemporal, reporte, requiereLlegadaZona],
  );
  const animales = useMemo(() => getAnimales(reporte), [reporte]);
  const grave = animalMasGrave(animales);
  const totalCaso = totalAnimales(animales);
  const condicion = normalizeCondicion(grave?.condicion);
  const esCerrado = reporte.estado_reporte === 'cerrado';

  const ubicacion =
    [reporte.calle, reporte.colonia, reporte.municipio].filter(Boolean).join(', ') ||
    'Ubicación no disponible';
  const tiempo = formatDistanceToNow(new Date(reporte.created_at), { addSuffix: false, locale: es });

  const handleQuickAction = () => {
    translateX.value = withSpring(0, { damping: 30, stiffness: 400 });
    if (action.type === 'llegada_zona') onQuickLlegadaZona(reporte);
    else if (action.type === 'resguardo') onQuickResguardo(reporte);
    else if (action.type === 'encontre') onQuickEncontre(reporte);
    else if (action.type === 'refugio') onQuickRefugio(reporte);
    else onOpenDetail(reporte);
  };

  // No permitimos swipe en casos cerrados ni cuando el rol no puede
  // registrar hitos.
  const swipeHabilitado = !esCerrado && puedeRegistrarHitos;

  const pan = Gesture.Pan()
    .enabled(swipeHabilitado)
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      translateX.value = Math.max(-TRAY_WIDTH, Math.min(0, e.translationX));
    })
    .onEnd(() => {
      translateX.value =
        translateX.value < SWIPE_OPEN_THRESHOLD
          ? withSpring(-TRAY_WIDTH, { damping: 30, stiffness: 400 })
          : withSpring(0, { damping: 30, stiffness: 400 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const trayStyle = useAnimatedStyle(() => {
    const progress = Math.min(-translateX.value / TRAY_WIDTH, 1);
    return {
      opacity: progress,
      transform: [{ scale: 0.88 + progress * 0.12 }],
    };
  });

  return (
    <Animated.View entering={FadeInUp.delay(index * 70).duration(360)} style={styles.wrapper}>
      {swipeHabilitado && (
        <Animated.View style={[styles.tray, { backgroundColor: action.color }, trayStyle]}>
          <Pressable onPress={handleQuickAction} style={styles.trayPressable} hitSlop={8}>
            <Ionicons name={action.icon} size={22} color="#fff" />
            <Text style={styles.trayLabel} numberOfLines={2}>
              {action.label}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Pressable onPress={() => onOpenDetail(reporte)}>
            <View style={styles.photoWrap}>
              {reporte.foto_url ? (
                <Image source={{ uri: reporte.foto_url }} style={styles.photo} resizeMode="contain" />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Ionicons name="paw-outline" size={32} color="#B0A098" />
                </View>
              )}

              {condicion && (
                <View style={styles.badgeSlot}>
                  <ConditionBadge condicion={condicion} />
                </View>
              )}

              {totalCaso > 1 && (
                <View style={styles.countBadge}>
                  <Ionicons name="paw" size={10} color="#fff" />
                  <Text style={styles.countBadgeText}>{totalCaso}</Text>
                </View>
              )}

              {reporte.estado_reporte === 'en_camino' && (
                <View style={styles.ribbon}>
                  <Ionicons
                    name={reporte.llegada_zona_registrada ? 'location-outline' : 'car-outline'}
                    size={12}
                    color="#fff"
                  />
                  <Text style={styles.ribbonText}>
                    {reporte.llegada_zona_registrada ? 'En zona del reporte' : 'Rescatista en camino'}
                  </Text>
                </View>
              )}

              {esCerrado && (
                <View style={styles.closedOverlay}>
                  <Text style={styles.closedText}>CERRADO</Text>
                </View>
              )}
            </View>

            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>
                {grave?.tipo_animal || 'Animal'}{totalCaso > 1 ? ` · ${totalCaso} animales` : ''}
              </Text>
              {!!grave?.descripcion && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {grave.descripcion}
                </Text>
              )}

              {animales.length > 1 && (
                <View style={styles.carouselSlot}>
                  <AnimalCarousel animales={animales} compact />
                </View>
              )}

              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={12} color={Brand.primary} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {ubicacion}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={12} color={Brand.textFaint} />
                <Text style={styles.metaTextFaint}>hace {tiempo}</Text>
              </View>

              {swipeHabilitado && <Text style={styles.swipeHint}>← desliza para acción rápida</Text>}
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative', borderRadius: 22, marginBottom: 16 },
  tray: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: TRAY_WIDTH,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
  },
  trayPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  trayLabel: { fontSize: 10, fontWeight: '800', color: '#fff', textAlign: 'center', lineHeight: 13 },
  card: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  photoWrap: { height: 168, backgroundColor: '#D4B896', position: 'relative' },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  badgeSlot: { position: 'absolute', top: 10, right: 10 },
  countBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(46,42,38,0.72)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  ribbon: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(102,188,180,0.88)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ribbonText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(46,42,38,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedText: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 1.5 },
  body: { padding: 14, gap: 6 },
  carouselSlot: { marginTop: 2 },
  title: { fontSize: 17, fontWeight: '800', color: Brand.textDark },
  subtitle: { fontSize: 13, color: Brand.textMuted, fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: Brand.textMuted, flexShrink: 1 },
  metaTextFaint: { fontSize: 12, color: Brand.textFaint },
  swipeHint: { fontSize: 11, color: '#B0A098', fontWeight: '600', textAlign: 'right', marginTop: 2 },
});
