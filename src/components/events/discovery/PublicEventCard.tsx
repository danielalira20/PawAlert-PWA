import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import type { EventPublicSummary } from "../../../types/event";
import {
  EVENT_CAPACITY_META,
  formatEventCost,
  formatEventSchedule,
  isEventImageUrlExpired,
} from "../../../utils/eventFormatters";
import { abrirUbicacionEnMaps } from "../../../utils/eventMapsLink";
import { EventTypeChip } from "../shared/EventTypeChip";
import { SavedEventButton } from "../saved/SavedEventButton";

interface PublicEventCardProps {
  event: EventPublicSummary;
  onError: (message: string) => void;
  onOpenDetail?: (event: EventPublicSummary) => void;
  onLocate?: (event: EventPublicSummary) => void;
  onSavedChange?: (saved: boolean) => void;
}

export function PublicEventCard({
  event,
  onError,
  onOpenDetail,
  onLocate,
  onSavedChange,
}: PublicEventCardProps) {
  const imageAvailable =
    Boolean(event.imagen_url) &&
    !isEventImageUrlExpired(event.imagen_url_expira_at);
  const capacity = EVENT_CAPACITY_META[event.cupo_estado];

  return (
    <View style={styles.card}>
      <View style={styles.imageArea}>
        {imageAvailable ? (
          <Image
            accessibilityLabel={
              event.imagen_texto_alternativo || `Imagen de ${event.titulo}`
            }
            resizeMode="cover"
            source={{ uri: event.imagen_url! }}
            style={styles.image}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <View style={styles.placeholderIcon}>
              <Ionicons
                name="calendar-outline"
                size={25}
                color={EventTheme.colors.primary}
              />
            </View>
            <Text style={styles.placeholderText}>Evento comunitario</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <EventTypeChip
          customCategory={event.categoria_otro}
          type={event.tipo}
        />
        <Text numberOfLines={2} style={styles.title}>
          {event.titulo}
        </Text>
        <Text numberOfLines={2} style={styles.description}>
          {event.descripcion}
        </Text>

        <View style={styles.detailRow}>
          <Ionicons
            name="calendar-outline"
            size={15}
            color={EventTheme.colors.primary}
          />
          <Text numberOfLines={2} style={styles.detailText}>
            {formatEventSchedule(
              event.inicia_at,
              event.termina_at,
              event.zona_horaria,
            )}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel={`Ver ${event.municipio}, ${event.estado_ubicacion} en Maps`}
          activeOpacity={0.6}
          onPress={() =>
            abrirUbicacionEnMaps({
              direccion: `${event.municipio}, ${event.estado_ubicacion}, México`,
            })
          }
          style={styles.detailRow}
        >
          <Ionicons
            name="location-outline"
            size={15}
            color={EventTheme.colors.primary}
          />
          <Text numberOfLines={1} style={styles.detailText}>
            {event.municipio} · {event.estado_ubicacion}
          </Text>
        </TouchableOpacity>
        <View style={styles.detailRow}>
          <Ionicons
            name="business-outline"
            size={15}
            color={EventTheme.colors.secondary}
          />
          <Text numberOfLines={1} style={styles.detailText}>
            {event.asociacion.nombre}
          </Text>
        </View>

        <View style={styles.metadata}>
          <View style={styles.metadataItem}>
            <Ionicons
              name="wallet-outline"
              size={13}
              color={EventTheme.colors.textMuted}
            />
            <Text style={styles.metadataText}>
              {formatEventCost(
                event.es_gratuito,
                event.costo_centavos,
                event.moneda,
              )}
            </Text>
          </View>
          <View style={styles.metadataItem}>
            <Ionicons
              name={capacity.icon as keyof typeof Ionicons.glyphMap}
              size={13}
              color={capacity.color}
            />
            <Text style={[styles.metadataText, { color: capacity.color }]}>
              {capacity.label}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {onOpenDetail && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => onOpenDetail(event)}
              style={styles.detailButton}
            >
              <Ionicons
                name="eye-outline"
                size={17}
                color={EventTheme.colors.primary}
              />
              <Text style={styles.detailButtonText}>Ver detalles</Text>
            </TouchableOpacity>
          )}
          <SavedEventButton
            event={event}
            fullWidth={!onLocate && !onOpenDetail}
            onError={onError}
            onSuccess={onSavedChange}
          />
          {onLocate && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => onLocate(event)}
              style={styles.locateButton}
            >
              <Ionicons
                name="map-outline"
                size={17}
                color={EventTheme.colors.primary}
              />
              <Text style={styles.locateText}>Ver en mapa</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "center",
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    elevation: 3,
    maxWidth: 420,
    overflow: "hidden",
    shadowColor: "#4A3728",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    width: "100%",
  },
  imageArea: {
    backgroundColor: EventTheme.colors.surfaceWarm,
    height: 142,
  },
  image: { height: "100%", width: "100%" },
  imagePlaceholder: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
  },
  placeholderIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 21,
    height: 48,
    justifyContent: "center",
    marginBottom: 6,
    width: 48,
  },
  placeholderText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 10,
  },
  body: { padding: 14 },
  title: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 16,
    lineHeight: 21,
    marginBottom: 4,
    marginTop: 9,
  },
  description: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    lineHeight: 16,
    marginBottom: 12,
  },
  detailRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 7,
    marginBottom: 7,
  },
  detailText: {
    color: EventTheme.colors.text,
    flex: 1,
    fontFamily: EventTheme.typography.medium,
    fontSize: 10,
    lineHeight: 16,
  },
  metadata: {
    borderTopColor: EventTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 3,
    paddingTop: 10,
  },
  metadataItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  metadataText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 9,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 13,
  },
  locateButton: {
    alignItems: "center",
    borderColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    flexGrow: 1,
    gap: 6,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 12,
  },
  detailButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    flexGrow: 1,
    gap: 6,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 12,
    width: "100%",
  },
  detailButtonText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  locateText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
});
