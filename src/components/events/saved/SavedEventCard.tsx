import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import type { EventSavedView } from "../../../types/event";
import {
  EVENT_CAPACITY_META,
  formatEventCost,
  formatEventSchedule,
  isEventImageUrlExpired,
} from "../../../utils/eventFormatters";
import { EventTypeChip } from "../shared/EventTypeChip";
import { SavedEventButton } from "./SavedEventButton";

interface SavedEventCardProps {
  savedEvent: EventSavedView;
  wide: boolean;
  onError: (message: string) => void;
  onOpenDetail: (eventId: string) => void;
  onRemoved: () => void;
}

export function SavedEventCard({
  savedEvent,
  wide,
  onError,
  onOpenDetail,
  onRemoved,
}: SavedEventCardProps) {
  const event = savedEvent.evento;
  const imageAvailable =
    Boolean(event.imagen_url) &&
    !isEventImageUrlExpired(event.imagen_url_expira_at);
  const capacity = EVENT_CAPACITY_META[event.cupo_estado];

  return (
    <View style={[styles.card, wide ? styles.cardWide : styles.cardNarrow]}>
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
                size={27}
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
            size={16}
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
        <View style={styles.detailRow}>
          <Ionicons
            name="location-outline"
            size={16}
            color={EventTheme.colors.primary}
          />
          <Text numberOfLines={1} style={styles.detailText}>
            {event.municipio} · {event.estado_ubicacion}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons
            name="business-outline"
            size={16}
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
              size={14}
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
              size={14}
              color={capacity.color}
            />
            <Text style={[styles.metadataText, { color: capacity.color }]}>
              {capacity.label}
            </Text>
          </View>
        </View>

        <View style={styles.actionArea}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onOpenDetail(event.id)}
            style={styles.detailButton}
          >
            <Ionicons
              name="eye-outline"
              size={17}
              color={EventTheme.colors.primary}
            />
            <Text style={styles.detailButtonText}>Ver detalles</Text>
          </TouchableOpacity>
          <SavedEventButton
            event={event}
            fullWidth
            onError={onError}
            onSuccess={(saved) => {
              if (!saved) onRemoved();
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    elevation: 3,
    overflow: "hidden",
    shadowColor: "#4A3728",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
  },
  cardWide: {
    flexBasis: 350,
    flexGrow: 0,
    maxWidth: 390,
    width: 350,
  },
  cardNarrow: {
    alignSelf: "center",
    maxWidth: 420,
    width: "100%",
  },
  imageArea: {
    backgroundColor: EventTheme.colors.surfaceWarm,
    height: 154,
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
    borderRadius: 22,
    height: 52,
    justifyContent: "center",
    marginBottom: 7,
    width: 52,
  },
  placeholderText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 11,
  },
  body: {
    flex: 1,
    padding: EventTheme.spacing.md,
  },
  title: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 17,
    lineHeight: 22,
    marginBottom: 5,
    marginTop: 10,
    minHeight: 44,
  },
  description: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 14,
    minHeight: 34,
  },
  detailRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  detailText: {
    color: EventTheme.colors.text,
    flex: 1,
    fontFamily: EventTheme.typography.medium,
    fontSize: 11,
    lineHeight: 17,
  },
  metadata: {
    borderTopColor: EventTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
    paddingTop: 11,
  },
  metadataItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  metadataText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 10,
  },
  actionArea: { gap: 8, marginTop: 14 },
  detailButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    width: "100%",
  },
  detailButtonText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
});
