import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { EventTheme } from '../../../constants/eventTheme';
import { CARTO_LIGHT_TILE_URL } from '../../../constants/mapTiles';
import { usePublicEventMap } from '../../../hooks/events/usePublicEventMap';
import { EVENT_TYPE_META, formatEventSchedule } from '../../../utils/eventFormatters';
import type { EventMapItem } from '../../../types/event';
import type { CompactEventsMapProps } from './CompactEventsMap.types';

function createEventPin(event: EventMapItem, selected = false) {
  const meta = EVENT_TYPE_META[event.tipo];
  const size = selected ? 46 : 38;
  return L.divIcon({
    className: 'pawalert-event-marker',
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform-origin:bottom center;transform:scale(${selected ? 1.08 : 1})">
      <div style="width:${size}px;height:${size}px;border-radius:50%;border:3px solid ${meta.color};background:${meta.backgroundColor};box-shadow:0 4px 14px ${meta.color}70;display:flex;align-items:center;justify-content:center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          <path fill="${meta.color}" d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.89-2-2-2Zm0 16H5V9h14v11ZM7 11h5v5H7v-5Z"/>
        </svg>
      </div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid ${meta.color};margin-top:-1px"></div>
    </div>`,
    iconAnchor: [(size + 8) / 2, size + 9],
    iconSize: [size + 8, size + 9],
  });
}

function FitEventBounds({ events }: { events: EventMapItem[] }) {
  const map = useMap();

  useEffect(() => {
    if (events.length === 0) return;
    if (events.length === 1) {
      map.setView([events[0].latitud, events[0].longitud], 13, { animate: false });
      return;
    }
    map.fitBounds(
      L.latLngBounds(events.map((event) => [event.latitud, event.longitud])),
      { animate: false, padding: [28, 28], maxZoom: 13 },
    );
  }, [events, map]);

  return null;
}

function KeepMapSized() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const updateSize = () => map.invalidateSize({ animate: false });
    const frame = requestAnimationFrame(updateSize);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    observer?.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [map]);

  return null;
}

export default function CompactEventsMap({ onSelectEvent }: CompactEventsMapProps) {
  const { events, error, isLoading, refresh } = usePublicEventMap(true);
  const [selectedEvent, setSelectedEvent] = useState<EventMapItem | null>(null);

  useEffect(() => {
    if (selectedEvent && !events.some((event) => event.id === selectedEvent.id)) {
      setSelectedEvent(null);
    }
  }, [events, selectedEvent]);

  return (
    <View style={styles.container}>
      <MapContainer
        attributionControl={false}
        center={[19.0414, -98.2063]}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        zoom={11}
        zoomControl={false}
      >
        <KeepMapSized />
        <TileLayer
          attribution="&copy; OpenStreetMap &copy; CARTO"
          url={CARTO_LIGHT_TILE_URL}
        />
        <FitEventBounds events={events} />
        {events.map((event) => {
          return (
            <Marker
              icon={createEventPin(event, selectedEvent?.id === event.id)}
              eventHandlers={{ click: () => setSelectedEvent(event) }}
              key={event.id}
              position={[event.latitud, event.longitud]}
            />
          );
        })}
      </MapContainer>

      {selectedEvent && !isLoading && !error && (
        <View style={styles.previewCard}>
          <View style={styles.previewCopy}>
            <Text numberOfLines={1} style={styles.popupTitle}>{selectedEvent.titulo}</Text>
            <Text numberOfLines={1} style={styles.popupText}>
              {formatEventSchedule(selectedEvent.inicia_at, selectedEvent.termina_at, selectedEvent.zona_horaria)}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel={`Ver detalles de ${selectedEvent.titulo}`}
            accessibilityRole="button"
            onPress={() => onSelectEvent(selectedEvent)}
            style={styles.detailButton}
          >
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
          <TouchableOpacity
            accessibilityLabel="Reintentar carga del mapa de eventos"
            accessibilityRole="button"
            onPress={() => void refresh()}
            style={styles.retryButton}
          >
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
  container: { flex: 1, height: '100%', position: 'relative', width: '100%' },
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
