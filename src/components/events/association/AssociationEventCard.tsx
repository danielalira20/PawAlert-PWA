import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import type { EventAssociationView } from "../../../types/event";
import {
  formatEventCost,
  formatEventSchedule,
  isEventImageUrlExpired,
} from "../../../utils/eventFormatters";
import { EventStatusChip } from "../shared/EventStatusChip";
import { EventTypeChip } from "../shared/EventTypeChip";

interface AssociationEventCardProps {
  event: EventAssociationView;
  wide?: boolean;
}

function displaySchedule(event: EventAssociationView) {
  if (!event.inicia_at || !event.termina_at || !event.zona_horaria) {
    return "Fecha y horario por confirmar";
  }
  return formatEventSchedule(
    event.inicia_at,
    event.termina_at,
    event.zona_horaria,
  );
}

function displayLocation(event: EventAssociationView) {
  const location = [
    event.lugar_nombre,
    event.municipio,
    event.estado_ubicacion,
  ].filter(Boolean);
  return location.length ? location.join(" · ") : "Ubicación por confirmar";
}

export function AssociationEventCard({
  event,
  wide = false,
}: AssociationEventCardProps) {
  const hasUsableImage = Boolean(
    event.imagen_url && !isEventImageUrlExpired(event.imagen_url_expira_at),
  );

  return (
    <View style={[styles.card, wide ? styles.cardWide : styles.cardNarrow]}>
      <View style={styles.imageArea}>
        {hasUsableImage ? (
          <Image
            accessibilityLabel={
              event.imagen_texto_alternativo ||
              `Imagen de ${event.titulo || "evento"}`
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
                size={30}
                color={EventTheme.colors.primary}
              />
            </View>
            <Text style={styles.placeholderText}>
              {event.imagen_url
                ? "Imagen por actualizar"
                : "Agrega una imagen al evento"}
            </Text>
          </View>
        )}
        <View style={styles.statusPosition}>
          <EventStatusChip state={event.estado} />
        </View>
      </View>

      <View style={styles.body}>
        <EventTypeChip
          type={event.tipo}
          customCategory={event.categoria_otro}
        />
        <Text numberOfLines={2} style={styles.title}>
          {event.titulo?.trim() || "Evento sin título"}
        </Text>

        <View style={styles.detailRow}>
          <Ionicons
            name="calendar-outline"
            size={16}
            color={EventTheme.colors.primary}
          />
          <Text style={styles.detailText}>{displaySchedule(event)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons
            name="location-outline"
            size={16}
            color={EventTheme.colors.primary}
          />
          <Text numberOfLines={2} style={styles.detailText}>
            {displayLocation(event)}
          </Text>
        </View>

        <View style={styles.metadata}>
          <View style={styles.metadataItem}>
            <Ionicons
              name="wallet-outline"
              size={15}
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
              name="people-outline"
              size={15}
              color={EventTheme.colors.textMuted}
            />
            <Text style={styles.metadataText}>
              {event.cupo_total == null
                ? "Sin cupo definido"
                : `${event.cupo_total} lugares`}
            </Text>
          </View>
        </View>

        {event.estado === "suspendido_admin" && (
          <View style={styles.suspensionNotice}>
            <Ionicons
              name="shield-outline"
              size={18}
              color={EventTheme.colors.danger}
            />
            <View style={styles.suspensionCopy}>
              <Text style={styles.suspensionTitle}>
                Revisión administrativa
              </Text>
              <Text style={styles.suspensionText}>
                {event.motivo_suspension ||
                  "Consulta con administración antes de volver a publicar."}
              </Text>
            </View>
          </View>
        )}

        <Text style={styles.updatedText}>
          Actualizado{" "}
          {new Intl.DateTimeFormat("es-MX", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }).format(new Date(event.actualizada_at))}
        </Text>
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
    flexBasis: "47%",
    flexGrow: 1,
    maxWidth: 440,
    minWidth: 300,
  },
  cardNarrow: {
    flexBasis: "100%",
    width: "100%",
  },
  imageArea: {
    backgroundColor: EventTheme.colors.surfaceWarm,
    height: 172,
    position: "relative",
  },
  image: {
    height: "100%",
    width: "100%",
  },
  imagePlaceholder: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    padding: EventTheme.spacing.md,
  },
  placeholderIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 22,
    height: 52,
    justifyContent: "center",
    marginBottom: EventTheme.spacing.sm,
    width: 52,
  },
  placeholderText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 12,
  },
  statusPosition: {
    position: "absolute",
    right: 12,
    top: 12,
  },
  body: {
    padding: EventTheme.spacing.md,
  },
  title: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 14,
    marginTop: 10,
  },
  detailRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    marginBottom: 9,
  },
  detailText: {
    color: EventTheme.colors.text,
    flex: 1,
    fontFamily: EventTheme.typography.medium,
    fontSize: 12,
    lineHeight: 18,
  },
  metadata: {
    borderTopColor: EventTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 5,
    paddingTop: 12,
  },
  metadataItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  metadataText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 11,
  },
  suspensionNotice: {
    alignItems: "flex-start",
    backgroundColor: "#FFF3F0",
    borderColor: "#F5C8C0",
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
    padding: 12,
  },
  suspensionCopy: {
    flex: 1,
  },
  suspensionTitle: {
    color: EventTheme.colors.danger,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  suspensionText: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 2,
  },
  updatedText: {
    color: EventTheme.colors.textFaint,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    marginTop: 12,
  },
});
