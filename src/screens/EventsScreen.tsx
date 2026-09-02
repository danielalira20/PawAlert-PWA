import { Ionicons } from '@expo/vector-icons';
import { lazy, Suspense, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PublicEventDetailModal } from '../components/events/discovery/PublicEventDetailModal';
import type { PublicEventFilterState } from '../components/events/discovery/PublicEventFilters';
import { PublicEventsPanel } from '../components/events/discovery/PublicEventsPanel';
import { buildEventMapQuery, INITIAL_PUBLIC_EVENT_FILTERS } from '../components/events/discovery/eventDiscoveryFilters';
import { Toast, useToast } from '../components/Toast';
import { EventTheme } from '../constants/eventTheme';
import type { EventMapItem, EventPublicDetail, EventPublicSummary } from '../types/event';
import { abrirUbicacionEnMaps } from '../utils/eventMapsLink';

const CompactEventsMap = lazy(() => import('../components/events/discovery/CompactEventsMap'));

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 760;
  const [filters, setFilters] = useState<PublicEventFilterState>(INITIAL_PUBLIC_EVENT_FILTERS);
  const [detailEventId, setDetailEventId] = useState<string | null>(null);
  const mapQuery = useMemo(() => buildEventMapQuery(filters), [filters]);
  const { toast, translateY, showToast } = useToast();

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
    <View style={[styles.hero, isCompact && styles.heroCompact]}>
      <View style={[styles.heroCopy, isCompact && styles.heroCopyCompact]}>
        <View style={styles.eyebrowRow}>
          <Ionicons name="sparkles-outline" size={14} color={EventTheme.colors.primary} />
          <Text style={styles.eyebrow}>AGENDA COMUNITARIA</Text>
        </View>
        <Text style={[styles.title, isCompact && styles.titleCompact]}>
          Encuentra eventos que dejan huella
        </Text>
        <Text style={styles.subtitle}>
          Explora jornadas, ferias y actividades organizadas por asociaciones verificadas.
        </Text>
        <View style={styles.trustRow}>
          <View style={styles.trustItem}>
            <Ionicons name="shield-checkmark-outline" size={16} color={EventTheme.colors.secondary} />
            <Text style={styles.trustText}>Organizadores verificados</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name="bookmark-outline" size={16} color={EventTheme.colors.primary} />
            <Text style={styles.trustText}>Guarda tus favoritos</Text>
          </View>
        </View>
      </View>

      <View style={[styles.mapCard, isCompact && styles.mapCardCompact]}>
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
          <Suspense
            fallback={
              <View style={styles.mapLoading}>
                <ActivityIndicator color={EventTheme.colors.primary} />
              </View>
            }
          >
            <CompactEventsMap filters={mapQuery} onSelectEvent={openMapEvent} />
          </Suspense>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <Toast toast={toast} translateY={translateY} />
      <PublicEventsPanel
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
        onClose={() => setDetailEventId(null)}
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
  hero: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 22,
    maxWidth: 1120,
    paddingHorizontal: 22,
    paddingVertical: 24,
    width: '100%',
  },
  heroCompact: { flexDirection: 'column', gap: 16, paddingHorizontal: 14, paddingVertical: 16 },
  heroCopy: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 8 },
  heroCopyCompact: { width: '100%' },
  eyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginBottom: 8 },
  eyebrow: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  title: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 34,
    lineHeight: 40,
    maxWidth: 480,
  },
  titleCompact: { fontSize: 26, lineHeight: 32 },
  subtitle: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
    maxWidth: 500,
  },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  trustItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  trustText: { color: EventTheme.colors.textMuted, fontFamily: EventTheme.typography.medium, fontSize: 10 },
  mapCard: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    flexGrow: 0,
    flexShrink: 0,
    height: 300,
    maxHeight: 300,
    minHeight: 300,
    overflow: 'hidden',
    width: '52%',
    ...Platform.select({
      web: { boxShadow: '0 12px 28px rgba(74, 55, 40, 0.12)' } as any,
      default: { elevation: 5 },
    }),
  },
  mapCardCompact: { flex: undefined, height: 250, maxHeight: 250, minHeight: 250, width: '100%' },
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
  mapViewport: { flex: 1, minHeight: 215, overflow: 'hidden' },
  mapLoading: { alignItems: 'center', backgroundColor: EventTheme.colors.surfaceWarm, flex: 1, justifyContent: 'center' },
});
