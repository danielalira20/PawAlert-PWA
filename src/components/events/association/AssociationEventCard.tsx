import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import type {
  EventAssociationView,
  EventOperationResponse,
} from "../../../types/event";
import type { EventLifecycleAction } from "../../../utils/eventLifecycle";
import {
  formatEventCost,
  formatEventSchedule,
  isEventImageUrlExpired,
} from "../../../utils/eventFormatters";
import {
  abrirUbicacionEnMaps,
  tieneUbicacionMapeable,
} from "../../../utils/eventMapsLink";
import { ImageLightbox } from "../../common/ImageLightbox";
import { EventStatusChip } from "../shared/EventStatusChip";
import { EventTypeChip } from "../shared/EventTypeChip";
import { EventLifecycleActions } from "../editor/EventLifecycleActions";

interface AssociationEventCardProps {
  event: EventAssociationView;
  onManage?: (eventId: string) => void;
  onLifecycleError?: (message: string) => void;
  onLifecycleSuccess?: (
    response: EventOperationResponse,
    action: EventLifecycleAction,
  ) => void | Promise<void>;
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
  onManage,
  onLifecycleError,
  onLifecycleSuccess,
}: AssociationEventCardProps) {
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const hasUsableImage = Boolean(
    event.imagen_url && !isEventImageUrlExpired(event.imagen_url_expira_at),
  );

  return (
    <>
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={hasUsableImage ? 0.9 : 1}
          disabled={!hasUsableImage}
          onPress={() => setLightboxVisible(true)}
          style={styles.imageArea}
        >
          {hasUsableImage ? (
            <Image
              accessibilityLabel={
                event.imagen_texto_alternativo ||
                `Imagen de ${event.titulo || "evento"}`
              }
              resizeMode="contain"
              source={{ uri: event.imagen_url! }}
              style={styles.image}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <View style={styles.placeholderIcon}>
                <Ionicons
                  name="calendar-outline"
                  size={22}
                  color={EventTheme.colors.primary}
                />
              </View>
              <Text style={styles.placeholderText}>
                {event.imagen_url
                  ? "Imagen por actualizar"
                  : "Agrega una imagen"}
              </Text>
            </View>
          )}
          <View style={styles.statusPosition}>
            <EventStatusChip state={event.estado} />
          </View>
          {hasUsableImage && (
            <View style={styles.expandHint}>
              <Ionicons name="expand-outline" size={12} color="#FFFFFF" />
            </View>
          )}
        </TouchableOpacity>

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
              size={13}
              color={EventTheme.colors.primary}
            />
            <Text numberOfLines={2} style={styles.detailText}>
              {displaySchedule(event)}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="link"
            accessibilityLabel={`Ver ${displayLocation(event)} en Maps`}
            activeOpacity={0.6}
            disabled={
              !tieneUbicacionMapeable({
                latitud: event.latitud,
                longitud: event.longitud,
                direccion: displayLocation(event),
              })
            }
            onPress={() =>
              abrirUbicacionEnMaps({
                latitud: event.latitud,
                longitud: event.longitud,
                direccion: displayLocation(event),
              })
            }
            style={styles.detailRow}
          >
            <Ionicons
              name="location-outline"
              size={13}
              color={EventTheme.colors.primary}
            />
            <Text numberOfLines={2} style={styles.detailText}>
              {displayLocation(event)}
            </Text>
          </TouchableOpacity>

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
                name="people-outline"
                size={13}
                color={EventTheme.colors.textMuted}
              />
              <Text style={styles.metadataText}>
                {event.cupo_total == null
                  ? "Sin cupo"
                  : `${event.cupo_total} lugares`}
              </Text>
            </View>
          </View>

          {event.estado === "suspendido_admin" && (
            <View style={styles.suspensionNotice}>
              <Ionicons
                name="shield-outline"
                size={15}
                color={EventTheme.colors.danger}
              />
              <View style={styles.suspensionCopy}>
                <Text style={styles.suspensionTitle}>
                  Revisión administrativa
                </Text>
                <Text numberOfLines={3} style={styles.suspensionText}>
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
          {!!onManage &&
            ["borrador", "publicado", "pausado"].includes(event.estado) && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => onManage(event.id)}
                style={styles.manageButton}
              >
                <Ionicons
                  name="create-outline"
                  size={15}
                  color={EventTheme.colors.surface}
                />
                <Text style={styles.manageButtonText}>
                  {event.estado === "borrador"
                    ? "Continuar borrador"
                    : "Editar evento"}
                </Text>
              </TouchableOpacity>
            )}
          {!!onLifecycleError && !!onLifecycleSuccess && (
            <EventLifecycleActions
              eventId={event.id}
              onError={onLifecycleError}
              onSuccess={onLifecycleSuccess}
              state={event.estado}
              variant="card"
            />
          )}
        </View>
      </View>

      {hasUsableImage && (
        <ImageLightbox
          visible={lightboxVisible}
          fotos={[event.imagen_url!]}
          onClose={() => setLightboxVisible(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    elevation: 3,
    flexBasis: 250,
    flexGrow: 1,
    maxWidth: 300,
    overflow: "hidden",
    shadowColor: "#4A3728",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
  },
  imageArea: {
    backgroundColor: "#2E2A26",
    height: 150,
    position: "relative",
  },
  image: {
    height: "100%",
    width: "100%",
  },
  imagePlaceholder: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    height: "100%",
    justifyContent: "center",
    padding: EventTheme.spacing.sm,
  },
  placeholderIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 18,
    height: 40,
    justifyContent: "center",
    marginBottom: 6,
    width: 40,
  },
  placeholderText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 11,
  },
  statusPosition: {
    position: "absolute",
    right: 10,
    top: 10,
  },
  expandHint: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    bottom: 10,
    height: 24,
    justifyContent: "center",
    left: 10,
    position: "absolute",
    width: 24,
  },
  body: {
    padding: 12,
  },
  title: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 9,
    marginTop: 8,
  },
  detailRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
  },
  detailText: {
    color: EventTheme.colors.text,
    flex: 1,
    fontFamily: EventTheme.typography.medium,
    fontSize: 11,
    lineHeight: 16,
  },
  metadata: {
    borderTopColor: EventTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
    paddingTop: 10,
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
  suspensionNotice: {
    alignItems: "flex-start",
    backgroundColor: "#FFF3F0",
    borderColor: "#F5C8C0",
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    padding: 10,
  },
  suspensionCopy: {
    flex: 1,
  },
  suspensionTitle: {
    color: EventTheme.colors.danger,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  suspensionText: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  updatedText: {
    color: EventTheme.colors.textFaint,
    fontFamily: EventTheme.typography.regular,
    fontSize: 9,
    marginTop: 10,
  },
  manageButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 40,
  },
  manageButtonText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
});
