import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import MapView, { Marker } from 'react-native-maps';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { EventTheme } from '../../../constants/eventTheme';
import { usePublicEventMap } from '../../../hooks/events/usePublicEventMap';
import { EVENT_TYPE_META, formatEventSchedule } from '../../../utils/eventFormatters';
import type { EventMapItem } from '../../../types/event';
import type { CompactEventsMapProps } from './CompactEventsMap.types';

export default function CompactEventsMap({ filters, onSelectEvent }: CompactEventsMapProps) {
  const { events, error, isLoading, refresh } = usePublicEventMap(true, filters);
  const mapRef = useRef<MapView | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventMapItem | null>(null);

  useEffect(() => {
    if (events.length === 0) return;
    mapRef.current?.fitToCoordinates(
      events.map((event) => ({ latitude: event.latitud, longitude: event.longitud })),
      { animated: false, edgePadding: { top: 36, right: 36, bottom: 36, left: 36 } },
    );
    if (selectedEvent && !events.some((event) => event.id === selectedEvent.id)) {
      setSelectedEvent(null);
    }
  }, [events, selectedEvent]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        initialRegion={{
          latitude: 19.0414,
          longitude: -98.2063,
          latitudeDelta: 0.16,
          longitudeDelta: 0.16,
        }}
        pitchEnabled={false}
        rotateEnabled={false}
        scrollEnabled={false}
        style={StyleSheet.absoluteFillObject}
        toolbarEnabled={false}
        zoomControlEnabled={false}
      >
        {events.map((event) => {
          const meta = EVENT_TYPE_META[event.tipo];
          return (
            <Marker
              coordinate={{ latitude: event.latitud, longitude: event.longitud }}
              key={event.id}
              onPress={() => setSelectedEvent(event)}
              pinColor={meta.color}
            />
          );
        })}
      </MapView>

      {selectedEvent && !isLoading && !error && (
        <View style={styles.previewCard}>
          <View style={styles.previewCopy}>
            <Text numberOfLines={1} style={styles.popupTitle}>{selectedEvent.titulo}</Text>
            <Text numberOfLines={1} style={styles.popupText}>
              {formatEventSchedule(selectedEvent.inicia_at, selectedEvent.termina_at, selectedEvent.zona_horaria)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => onSelectEvent(selectedEvent)} style={styles.detailButton}>
            <Text style={styles.detailButtonText}>Ver detalles</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading && (
        <View style={styles.overlay}>
          <ActivityIndicator color={EventTheme.colors.primary} />
        </View>
      )}
      {!!error && !isLoading && (
        <View style={styles.overlay}>
          <Ionicons name="map-outline" size={24} color={EventTheme.colors.primary} />
          <Text style={styles.errorText}>No pudimos cargar el mapa</Text>
          <TouchableOpacity onPress={() => void refresh()} style={styles.retryButton}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}
      {!error && !isLoading && events.length === 0 && (
        <View style={styles.overlay}>
          <Ionicons name="calendar-clear-outline" size={24} color={EventTheme.colors.primary} />
          <Text style={styles.errorText}>No hay eventos con ubicación para mostrar</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(250,247,242,0.94)',
    bottom: 0,
    gap: 7,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  popupTitle: { color: EventTheme.colors.text, fontFamily: EventTheme.typography.bold, fontSize: 12 },
  popupText: { color: EventTheme.colors.textMuted, fontFamily: EventTheme.typography.regular, fontSize: 9, marginTop: 4 },
  previewCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderColor: EventTheme.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    bottom: 10,
    flexDirection: 'row',
    gap: 10,
    left: 10,
    padding: 10,
    position: 'absolute',
    right: 10,
  },
  previewCopy: { flex: 1 },
  detailButton: { backgroundColor: EventTheme.colors.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  detailButtonText: { color: '#FFF', fontFamily: EventTheme.typography.bold, fontSize: 9 },
  errorText: { color: EventTheme.colors.textMuted, fontFamily: EventTheme.typography.medium, fontSize: 10 },
  retryButton: { backgroundColor: EventTheme.colors.primary, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 7 },
  retryText: { color: '#FFF', fontFamily: EventTheme.typography.bold, fontSize: 9 },
});
