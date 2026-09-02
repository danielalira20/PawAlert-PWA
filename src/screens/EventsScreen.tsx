import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PublicEventDetailModal } from '../components/events/discovery/PublicEventDetailModal';
import type { PublicEventFilterState } from '../components/events/discovery/PublicEventFilters';
import { PublicEventsPanel } from '../components/events/discovery/PublicEventsPanel';
import { INITIAL_PUBLIC_EVENT_FILTERS } from '../components/events/discovery/eventDiscoveryFilters';
import { Toast, useToast } from '../components/Toast';
import { EventTheme } from '../constants/eventTheme';
import type { EventMapItem, EventPublicDetail, EventPublicSummary } from '../types/event';
import { normalizeEventDeepLinkId } from '../utils/eventDeepLink';
import { abrirUbicacionEnMaps } from '../utils/eventMapsLink';

const CompactEventsMap = lazy(() => import('../components/events/discovery/CompactEventsMap'));
const EVENT_HERO_IMAGE = require('../assets/images/paw_eventos.png');

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 760;
  const params = useLocalSearchParams<{ event_id?: string | string[] }>();
  const deepLinkedEventId = normalizeEventDeepLinkId(params.event_id);
  const [filters, setFilters] = useState<PublicEventFilterState>(INITIAL_PUBLIC_EVENT_FILTERS);
  const [detailEventId, setDetailEventId] = useState<string | null>(null);
  const entrance = useRef(new Animated.Value(0)).current;
  const { toast, translateY, showToast } = useToast();

  useEffect(() => {
    Animated.timing(entrance, {
      duration: 320,
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [entrance]);

  useEffect(() => {
    if (deepLinkedEventId) setDetailEventId(deepLinkedEventId);
  }, [deepLinkedEventId]);

  const closeEventDetail = () => {
    setDetailEventId(null);
    if (deepLinkedEventId) router.setParams({ event_id: undefined });
  };

  const openEventLocation = (event: EventPublicSummary | EventPublicDetail) => {
    const exactLocation = 'latitud' in event && 'longitud' in event;
    abrirUbicacionEnMaps({
      latitud: exactLocation ? event.latitud : undefined,
      longitud: exactLocation ? event.longitud : undefined,
      direccion: `${event.municipio}, ${event.estado_ubicacion}, México`,
    });
  };

  const openMapEvent = (event: EventMapItem) => setDetailEventId(event.id);

  const hero = (
    <Animated.View
      style={[
        styles.heroSection,
        {
          opacity: entrance,
          transform: [{
            translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
          }],
        },
      ]}
    >
      <View pointerEvents="none" style={styles.decorCircleTop} />
      <View pointerEvents="none" style={styles.decorCircleBottom} />
      <View pointerEvents="none" style={styles.decorGlow} />

      <View style={[styles.hero, isCompact && styles.heroCompact]}>
        <View style={[styles.heroCopy, isCompact && styles.heroCopyCompact]}>
          <View style={styles.eyebrowRow}>
            <Ionicons name="calendar-outline" size={14} color="#FFFFFF" />
            <Text style={styles.eyebrow}>AGENDA COMUNITARIA</Text>
          </View>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>
            Encuentra eventos que dejan huella
          </Text>
          <Text style={styles.subtitle}>
            Explora jornadas, ferias y actividades organizadas por asociaciones verificadas en tu ciudad.
          </Text>
          <View style={styles.trustRow}>
            <View style={styles.trustItem}>
              <Ionicons name="checkmark" size={18} color="#63E6D7" />
              <Text style={styles.trustText}>Organizadores verificados</Text>
            </View>
            <View style={styles.trustItem}>
              <Ionicons name="heart-outline" size={17} color="#FFD06A" />
              <Text style={styles.trustText}>Guarda tus favoritos</Text>
            </View>
          </View>
        </View>

        {!isCompact && (
          <View style={styles.heroArtwork}>
            <View pointerEvents="none" style={styles.artworkHalo} />
            <Image
              accessibilityLabel="Ilustración de eventos PawAlert"
              resizeMode="contain"
              source={EVENT_HERO_IMAGE}
              style={styles.heroImage}
            />
          </View>
        )}
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.screen}>
      <Toast toast={toast} translateY={translateY} />
      <PublicEventsPanel
        asideContent={
          <View accessibilityLabel="Mapa de eventos disponibles" style={styles.mapCard}>
            <View style={styles.mapCardHeader}>
              <View>
                <Text style={styles.mapTitle}>Eventos en el mapa</Text>
                <Text style={styles.mapSubtitle}>Toca un marcador para ver el evento</Text>
              </View>
              <View style={styles.mapBadge}>
                <Ionicons name="location" size={14} color={EventTheme.colors.primary} />
              </View>
            </View>
            <View style={styles.mapViewport}>
              <Suspense fallback={<View style={styles.mapLoading}><ActivityIndicator color={EventTheme.colors.primary} /></View>}>
                <CompactEventsMap onSelectEvent={openMapEvent} />
              </Suspense>
            </View>
          </View>
        }
        filters={filters}
        headerContent={
          <View style={{ paddingTop: Platform.OS === 'web' ? 0 : Math.max(insets.top, 8) }}>
            {hero}
          </View>
        }
        onFiltersChange={setFilters}
        onLocate={openEventLocation}
        onOpenDetail={setDetailEventId}
      />
      <PublicEventDetailModal
        eventId={detailEventId}
        onClose={closeEventDetail}
        onError={(message) =>
          showToast({
            type: 'error',
            title: 'No pudimos actualizar el evento',
            message,
          })
        }
        onLocate={openEventLocation}
        onSavedChange={(saved) =>
          showToast({
            type: 'success',
            title: saved ? 'Evento guardado' : 'Evento eliminado',
            message: saved
              ? 'Lo encontrarás en tu perfil. Guardar no reserva un lugar.'
              : 'Tu agenda quedó actualizada.',
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: EventTheme.colors.background,
    flex: 1,
  },
  heroSection: {
    backgroundColor: EventTheme.colors.primary,
    overflow: 'hidden',
    paddingBottom: 30,
    position: 'relative',
    width: '100%',
  },
  hero: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 22,
    maxWidth: 1120,
    paddingHorizontal: 22,
    paddingBottom: 28,
    paddingTop: 34,
    width: '100%',
  },
  heroCompact: { flexDirection: 'column', gap: 0, paddingBottom: 24, paddingHorizontal: 18, paddingTop: 20 },
  heroCopy: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 8, zIndex: 2 },
  heroCopyCompact: { width: '100%' },
  eyebrowRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 7,
    marginBottom: 18,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  eyebrow: {
    color: '#FFFFFF',
    fontFamily: EventTheme.typography.bold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 43,
    lineHeight: 51,
    maxWidth: 520,
  },
  titleCompact: { fontSize: 28, lineHeight: 34 },
  subtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: EventTheme.typography.regular,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 14,
    maxWidth: 500,
  },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 24 },
  trustItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  trustText: { color: '#FFFFFF', fontFamily: EventTheme.typography.medium, fontSize: 11 },
  mapCard: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 22,
    borderWidth: 1,
    flexGrow: 0,
    flexShrink: 0,
    height: 300,
    maxHeight: 300,
    minHeight: 340,
    overflow: 'hidden',
    width: '100%',
    ...Platform.select({
      web: { boxShadow: '0 18px 38px rgba(5, 78, 72, 0.22)' } as any,
      default: { elevation: 5 },
    }),
  },
  mapCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  mapTitle: { color: EventTheme.colors.text, fontFamily: EventTheme.typography.bold, fontSize: 13 },
  mapSubtitle: { color: EventTheme.colors.textMuted, fontFamily: EventTheme.typography.regular, fontSize: 9, marginTop: 1 },
  mapBadge: { alignItems: 'center', backgroundColor: '#FFF0E2', borderRadius: 14, height: 32, justifyContent: 'center', width: 32 },
  mapViewport: { flex: 1, minHeight: 215, overflow: 'hidden', width: '100%' },
  mapLoading: { alignItems: 'center', backgroundColor: EventTheme.colors.surfaceWarm, flex: 1, justifyContent: 'center' },
  decorCircleTop: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 110,
    height: 220,
    left: -65,
    position: 'absolute',
    top: -105,
    width: 220,
  },
  decorCircleBottom: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 60,
    bottom: -48,
    height: 120,
    left: '34%',
    position: 'absolute',
    width: 120,
  },
  decorGlow: {
    backgroundColor: 'rgba(255,197,91,0.18)',
    borderRadius: 170,
    height: 340,
    position: 'absolute',
    right: -120,
    top: -120,
    width: 340,
  },
  heroArtwork: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 300,
    position: 'relative',
    width: '44%',
  },
  artworkHalo: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 180,
    height: 310,
    position: 'absolute',
    width: 310,
  },
  heroImage: { height: '112%', maxHeight: 370, width: '112%', zIndex: 1 },
});
