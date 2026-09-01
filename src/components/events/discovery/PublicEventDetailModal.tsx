import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { AppModal } from "../../AppModal";
import { EventTheme } from "../../../constants/eventTheme";
import { useAuth } from "../../../context/AuthContext";
import { usePublicEventDetail } from "../../../hooks/events/usePublicEventDetail";
import type { EventPublicDetail } from "../../../types/event";
import {
  EVENT_ACCESS_LABELS,
  EVENT_CAPACITY_META,
  formatEventCost,
  formatEventSchedule,
  isEventImageUrlExpired,
} from "../../../utils/eventFormatters";
import { buildEventDeepLinkUrl } from "../../../utils/eventDeepLink";
import { SavedEventButton } from "../saved/SavedEventButton";
import { EventTypeChip } from "../shared/EventTypeChip";
import { EventReportModal } from "./EventReportModal";

interface PublicEventDetailModalProps {
  eventId: string | null;
  onClose: () => void;
  onError: (message: string) => void;
  onLocate?: (event: EventPublicDetail) => void;
  onSavedChange?: (saved: boolean) => void;
}

interface DetailSectionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: ReactNode;
}

function DetailSection({ icon, title, children }: DetailSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={17} color={EventTheme.colors.secondary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function DetailLine({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value?.trim()) return null;
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function DetailList({ values }: { values: string[] }) {
  return (
    <View style={styles.list}>
      {values.map((value) => (
        <View key={value} style={styles.listItem}>
          <Ionicons
            name="checkmark-circle"
            size={15}
            color={EventTheme.colors.secondary}
          />
          <Text style={styles.listText}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export function PublicEventDetailModal({
  eventId,
  onClose,
  onError,
  onLocate,
  onSavedChange,
}: PublicEventDetailModalProps) {
  const { height, width } = useWindowDimensions();
  const { token } = useAuth();
  const [reportVisible, setReportVisible] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);
  const compact = width < 640;
  const { event, isLoading, error, retry } = usePublicEventDetail(eventId);
  const imageAvailable =
    Boolean(event?.imagen_url) &&
    !isEventImageUrlExpired(event?.imagen_url_expira_at);

  useEffect(() => {
    setImageExpanded(false);
  }, [eventId]);

  const openUrl = async (url: string) => {
    try {
      if (!(await Linking.canOpenURL(url))) throw new Error();
      await Linking.openURL(url);
    } catch {
      onError("No pudimos abrir este enlace en el dispositivo.");
    }
  };

  const shareEvent = async (detail: EventPublicDetail) => {
    const message = `${detail.titulo}\n${formatEventSchedule(detail.inicia_at, detail.termina_at, detail.zona_horaria)}\n${detail.lugar_nombre}, ${detail.direccion_publica}\nOrganiza: ${detail.asociacion.nombre}`;
    const url = buildEventDeepLinkUrl(
      detail.id,
      typeof window !== "undefined" && window.location
        ? window.location.origin
        : undefined,
    );
    try {
      await Share.share({
        title: detail.titulo,
        message,
        url,
      });
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") {
        return;
      }
      try {
        await Clipboard.setStringAsync(
          [message, url].filter(Boolean).join("\n"),
        );
        Alert.alert(
          "Información copiada",
          "Puedes pegarla en el mensaje o aplicación que prefieras.",
        );
      } catch {
        onError("No pudimos compartir ni copiar la información del evento.");
      }
    }
  };

  const contactUrl = event?.contacto_institucional_telefono
    ? `tel:${event.contacto_institucional_telefono}`
    : event?.contacto_institucional_email
      ? `mailto:${event.contacto_institucional_email}`
      : null;

  return (
    <AppModal
      fitContent
      maxWidth={imageExpanded ? 1080 : 680}
      onClose={imageExpanded ? () => setImageExpanded(false) : onClose}
      showCloseButton={false}
      visible={Boolean(eventId)}
    >
      {imageExpanded && event && imageAvailable ? (
        <View
          accessibilityLabel="Vista ampliada de la imagen del evento"
          style={[
            styles.imagePreview,
            {
              height: Math.max(
                360,
                Math.min(820, height - (width >= 900 ? 96 : 100)),
              ),
            },
          ]}
        >
          <TouchableOpacity
            accessibilityLabel="Volver al detalle del evento"
            accessibilityRole="button"
            onPress={() => setImageExpanded(false)}
            style={styles.imagePreviewClose}
          >
            <Ionicons
              name="close"
              size={24}
              color={EventTheme.colors.surface}
            />
          </TouchableOpacity>
          <Image
            accessibilityLabel={
              event.imagen_texto_alternativo || `Imagen de ${event.titulo}`
            }
            resizeMode="contain"
            source={{ uri: event.imagen_url! }}
            style={styles.imagePreviewImage}
          />
          <View style={styles.imagePreviewCaption}>
            <Ionicons name="expand-outline" size={16} color="#FFFFFF" />
            <Text numberOfLines={2} style={styles.imagePreviewText}>
              {event.imagen_texto_alternativo || event.titulo}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.modal, compact && styles.modalCompact]}>
          <View style={styles.headerBar}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>AGENDA COMUNITARIA</Text>
              <Text style={styles.headerTitle}>Detalle del evento</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Cerrar detalle del evento"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons
                name="close"
                size={22}
                color={EventTheme.colors.surface}
              />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View
              accessibilityLabel="Cargando detalle del evento"
              style={styles.state}
            >
              <ActivityIndicator
                color={EventTheme.colors.primary}
                size="large"
              />
              <Text style={styles.stateTitle}>Consultando el evento…</Text>
              <Text style={styles.stateText}>
                Estamos reuniendo la información publicada.
              </Text>
            </View>
          ) : error || !event ? (
            <View style={styles.state}>
              <View style={styles.errorIcon}>
                <Ionicons
                  name="calendar-clear-outline"
                  size={29}
                  color={EventTheme.colors.danger}
                />
              </View>
              <Text style={styles.stateTitle}>
                El evento no está disponible
              </Text>
              <Text style={styles.stateText}>
                {error || "No encontramos la información pública."}
              </Text>
              <View style={styles.stateActions}>
                <TouchableOpacity
                  accessibilityLabel="Cerrar detalle sin reintentar"
                  accessibilityRole="button"
                  onPress={onClose}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Cerrar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel="Reintentar carga del evento"
                  accessibilityRole="button"
                  onPress={() => void retry()}
                  style={styles.primaryButton}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={17}
                    color={EventTheme.colors.surface}
                  />
                  <Text style={styles.primaryButtonText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Fragment>
              <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                style={styles.scroll}
              >
                {imageAvailable ? (
                  <TouchableOpacity
                    accessibilityLabel="Ampliar imagen del evento"
                    accessibilityRole="button"
                    activeOpacity={0.88}
                    onPress={() => setImageExpanded(true)}
                    style={[styles.hero, compact && styles.heroCompact]}
                  >
                    <Image
                      accessibilityLabel={
                        event.imagen_texto_alternativo ||
                        `Imagen de ${event.titulo}`
                      }
                      resizeMode="cover"
                      source={{ uri: event.imagen_url! }}
                      style={styles.heroImage}
                    />
                    <View pointerEvents="none" style={styles.expandBadge}>
                      <Ionicons
                        name="expand-outline"
                        size={17}
                        color="#FFFFFF"
                      />
                      <Text style={styles.expandBadgeText}>Ampliar</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.hero, compact && styles.heroCompact]}>
                    <View style={styles.heroPlaceholder}>
                      <Ionicons
                        name="calendar-outline"
                        size={36}
                        color={EventTheme.colors.primary}
                      />
                      <Text style={styles.heroPlaceholderText}>
                        Evento comunitario
                      </Text>
                    </View>
                  </View>
                )}

                <View
                  style={[styles.content, compact && styles.contentCompact]}
                >
                  {event.estado === "cancelado" && (
                    <View style={styles.cancelledBanner}>
                      <Ionicons
                        name="alert-circle-outline"
                        size={20}
                        color={EventTheme.colors.danger}
                      />
                      <View style={styles.bannerCopy}>
                        <Text style={styles.cancelledTitle}>
                          Evento cancelado
                        </Text>
                        <Text style={styles.cancelledText}>
                          {event.motivo_cancelacion_publico ||
                            "La asociación canceló esta actividad."}
                        </Text>
                      </View>
                    </View>
                  )}

                  <EventTypeChip
                    type={event.tipo}
                    customCategory={event.categoria_otro}
                  />
                  <Text style={styles.title}>{event.titulo}</Text>
                  <Text style={styles.association}>
                    {event.asociacion.nombre}
                  </Text>
                  <Text style={styles.description}>{event.descripcion}</Text>

                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryItem}>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color={EventTheme.colors.primary}
                      />
                      <Text style={styles.summaryText}>
                        {formatEventSchedule(
                          event.inicia_at,
                          event.termina_at,
                          event.zona_horaria,
                        )}
                      </Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Ionicons
                        name="location-outline"
                        size={18}
                        color={EventTheme.colors.primary}
                      />
                      <Text style={styles.summaryText}>
                        {event.lugar_nombre}\n{event.direccion_publica},{" "}
                        {event.municipio}, {event.estado_ubicacion}
                      </Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Ionicons
                        name="wallet-outline"
                        size={18}
                        color={EventTheme.colors.primary}
                      />
                      <Text style={styles.summaryText}>
                        {formatEventCost(
                          event.es_gratuito,
                          event.costo_centavos,
                          event.moneda,
                        )}
                        {event.detalle_costos
                          ? ` · ${event.detalle_costos}`
                          : ""}
                      </Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Ionicons
                        name={
                          EVENT_CAPACITY_META[event.cupo_estado]
                            .icon as keyof typeof Ionicons.glyphMap
                        }
                        size={18}
                        color={EVENT_CAPACITY_META[event.cupo_estado].color}
                      />
                      <Text style={styles.summaryText}>
                        {EVENT_CAPACITY_META[event.cupo_estado].label}
                        {event.cupo_total
                          ? ` · ${event.cupo_total} lugares`
                          : ""}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.quickActions}>
                    {event.modalidad_acceso === "registro_externo" &&
                      event.enlace_registro_externo && (
                        <TouchableOpacity
                          onPress={() =>
                            void openUrl(event.enlace_registro_externo!)
                          }
                          style={styles.quickActionPrimary}
                        >
                          <Ionicons
                            name="open-outline"
                            size={17}
                            color={EventTheme.colors.surface}
                          />
                          <Text style={styles.quickActionPrimaryText}>
                            Ir al registro oficial
                          </Text>
                        </TouchableOpacity>
                      )}
                    {event.modalidad_acceso === "contacto_institucional" &&
                      contactUrl && (
                        <TouchableOpacity
                          onPress={() => void openUrl(contactUrl)}
                          style={styles.quickActionPrimary}
                        >
                          <Ionicons
                            name="chatbubble-outline"
                            size={17}
                            color={EventTheme.colors.surface}
                          />
                          <Text style={styles.quickActionPrimaryText}>
                            Contactar asociación
                          </Text>
                        </TouchableOpacity>
                      )}
                    <TouchableOpacity
                      accessibilityLabel={`Compartir ${event.titulo}`}
                      accessibilityRole="button"
                      onPress={() => void shareEvent(event)}
                      style={styles.quickActionSecondary}
                    >
                      <Ionicons
                        name="share-social-outline"
                        size={17}
                        color={EventTheme.colors.primary}
                      />
                      <Text style={styles.quickActionSecondaryText}>
                        Compartir
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityLabel={`Reportar ${event.titulo}`}
                      accessibilityRole="button"
                      onPress={() => {
                        if (!token) {
                          onError(
                            "Inicia sesión para reportar información de este evento.",
                          );
                          return;
                        }
                        setReportVisible(true);
                      }}
                      style={styles.quickActionGhost}
                    >
                      <Ionicons
                        name="flag-outline"
                        size={16}
                        color={EventTheme.colors.textMuted}
                      />
                      <Text style={styles.quickActionGhostText}>Reportar</Text>
                    </TouchableOpacity>
                  </View>

                  <View
                    style={[
                      styles.sectionGrid,
                      compact && styles.sectionGridCompact,
                    ]}
                  >
                    <DetailSection
                      icon="people-outline"
                      title="¿Para quién es?"
                    >
                      <DetailLine
                        label="Público"
                        value={event.publico_objetivo}
                      />
                      <DetailLine
                        label="Especies"
                        value={event.especies_objetivo.join(", ")}
                      />
                    </DetailSection>

                    <DetailSection icon="enter-outline" title="Acceso">
                      <DetailLine
                        label="Modalidad"
                        value={EVENT_ACCESS_LABELS[event.modalidad_acceso]}
                      />
                      <DetailLine
                        label="Indicaciones"
                        value={event.instrucciones_contacto}
                      />
                    </DetailSection>

                    <DetailSection
                      icon="clipboard-outline"
                      title="Antes de asistir"
                    >
                      <DetailLine
                        label="Requisitos"
                        value={event.requisitos_asistencia}
                      />
                      {event.documentos_requeridos.length > 0 && (
                        <DetailList values={event.documentos_requeridos} />
                      )}
                    </DetailSection>

                    {(event.servicios_detalle ||
                      event.condiciones_excluidas.length > 0) && (
                      <DetailSection
                        icon="heart-outline"
                        title="Servicios y condiciones"
                      >
                        <DetailLine
                          label="Servicios"
                          value={event.servicios_detalle}
                        />
                        {event.condiciones_excluidas.length > 0 && (
                          <DetailLine
                            label="No aplica para"
                            value={event.condiciones_excluidas.join(", ")}
                          />
                        )}
                      </DetailSection>
                    )}

                    {(event.accesibilidad || event.transporte) && (
                      <DetailSection
                        icon="accessibility-outline"
                        title="Cómo llegar"
                      >
                        <DetailLine
                          label="Accesibilidad"
                          value={event.accesibilidad}
                        />
                        <DetailLine
                          label="Transporte"
                          value={event.transporte}
                        />
                      </DetailSection>
                    )}

                    <DetailSection
                      icon="business-outline"
                      title="Contacto institucional"
                    >
                      <DetailLine
                        label="Responsable"
                        value={event.contacto_institucional_nombre}
                      />
                      <DetailLine
                        label="Teléfono"
                        value={event.contacto_institucional_telefono}
                      />
                      <DetailLine
                        label="Correo"
                        value={event.contacto_institucional_email}
                      />
                    </DetailSection>

                    {(event.responsable_profesional ||
                      event.institucion_profesional) && (
                      <DetailSection
                        icon="medical-outline"
                        title="Responsable profesional"
                      >
                        <DetailLine
                          label="Nombre"
                          value={event.responsable_profesional}
                        />
                        <DetailLine
                          label="Institución"
                          value={event.institucion_profesional}
                        />
                        <DetailLine
                          label="Cédula"
                          value={event.cedula_profesional}
                        />
                      </DetailSection>
                    )}
                  </View>
                </View>
              </ScrollView>

              <View style={[styles.footer, compact && styles.footerCompact]}>
                <SavedEventButton
                  event={event}
                  fullWidth={!onLocate}
                  onError={onError}
                  onSuccess={onSavedChange}
                />
                {onLocate && (
                  <TouchableOpacity
                    accessibilityLabel={`Ver ${event.titulo} en el mapa`}
                    accessibilityRole="button"
                    onPress={() => {
                      onClose();
                      onLocate(event);
                    }}
                    style={styles.locateButton}
                  >
                    <Ionicons
                      name="map-outline"
                      size={18}
                      color={EventTheme.colors.primary}
                    />
                    <Text style={styles.locateButtonText}>Ver en mapa</Text>
                  </TouchableOpacity>
                )}
              </View>
              {token && (
                <EventReportModal
                  eventId={event.id}
                  onClose={() => setReportVisible(false)}
                  onError={onError}
                  onSuccess={() =>
                    Alert.alert(
                      "Reporte enviado",
                      "Gracias. El equipo de PawAlert revisará este evento.",
                    )
                  }
                  token={token}
                  visible={reportVisible}
                />
              )}
            </Fragment>
          )}
        </View>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: EventTheme.colors.background,
    flexShrink: 1,
    maxHeight: 760,
    minHeight: 360,
    width: "100%",
  },
  modalCompact: { maxHeight: "100%" },
  headerBar: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.secondary,
    flexDirection: "row",
    minHeight: 76,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  headerCopy: { flex: 1, paddingRight: 14 },
  eyebrow: {
    color: "rgba(255,255,255,0.76)",
    fontFamily: EventTheme.typography.bold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  headerTitle: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 20,
    marginTop: 1,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  state: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 300,
    padding: 28,
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: "#FCE8E4",
    borderRadius: 26,
    height: 60,
    justifyContent: "center",
    marginBottom: 14,
    width: 60,
  },
  stateTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 17,
    marginTop: 12,
    textAlign: "center",
  },
  stateText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 5,
    maxWidth: 360,
    textAlign: "center",
  },
  stateActions: { flexDirection: "row", gap: 9, marginTop: 20 },
  scroll: { flexShrink: 1, minHeight: 0 },
  scrollContent: { paddingBottom: 8 },
  hero: { backgroundColor: EventTheme.colors.surfaceWarm, height: 210 },
  heroCompact: { height: 170 },
  heroImage: { height: "100%", width: "100%" },
  expandBadge: {
    alignItems: "center",
    backgroundColor: "rgba(32,26,21,0.72)",
    borderRadius: 16,
    bottom: 12,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: "absolute",
    right: 12,
  },
  expandBadgeText: {
    color: "#FFFFFF",
    fontFamily: EventTheme.typography.bold,
    fontSize: 10,
  },
  imagePreview: {
    alignItems: "center",
    backgroundColor: "#171310",
    justifyContent: "center",
    maxHeight: "100%",
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  imagePreviewImage: {
    alignSelf: "stretch",
    flex: 1,
    marginHorizontal: 18,
    marginVertical: 46,
  },
  imagePreviewClose: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    position: "absolute",
    right: 16,
    top: 16,
    width: 44,
    zIndex: 2,
  },
  imagePreviewCaption: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.58)",
    bottom: 0,
    flexDirection: "row",
    gap: 7,
    left: 0,
    paddingHorizontal: 16,
    paddingVertical: 11,
    position: "absolute",
    right: 0,
  },
  imagePreviewText: {
    color: "#FFFFFF",
    flex: 1,
    fontFamily: EventTheme.typography.medium,
    fontSize: 11,
    lineHeight: 17,
  },
  heroPlaceholder: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
  },
  heroPlaceholderText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 11,
    marginTop: 7,
  },
  content: { padding: 22 },
  contentCompact: { padding: 16 },
  cancelledBanner: {
    backgroundColor: "#FCE8E4",
    borderColor: "#F2C4BC",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
    padding: 12,
  },
  bannerCopy: { flex: 1 },
  cancelledTitle: {
    color: EventTheme.colors.danger,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  cancelledText: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 2,
  },
  title: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 23,
    lineHeight: 29,
    marginTop: 11,
  },
  association: {
    color: EventTheme.colors.secondary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
    marginTop: 4,
  },
  description: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 10,
  },
  summaryGrid: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    marginTop: 17,
    padding: 14,
  },
  summaryItem: { alignItems: "flex-start", flexDirection: "row", gap: 9 },
  summaryText: {
    color: EventTheme.colors.text,
    flex: 1,
    fontFamily: EventTheme.typography.medium,
    fontSize: 10,
    lineHeight: 17,
  },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  quickActionPrimary: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 14,
  },
  quickActionPrimaryText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 10,
  },
  quickActionSecondary: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 14,
  },
  quickActionSecondaryText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 10,
  },
  quickActionGhost: {
    alignItems: "center",
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 10,
  },
  quickActionGhostText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 10,
  },
  sectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  sectionGridCompact: { flexDirection: "column" },
  section: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 250,
    padding: 14,
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 9,
  },
  sectionIcon: {
    alignItems: "center",
    backgroundColor: "#E3F4F2",
    borderRadius: 14,
    height: 31,
    justifyContent: "center",
    width: 31,
  },
  sectionTitle: {
    color: EventTheme.colors.text,
    flex: 1,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  detailLine: { marginBottom: 8 },
  detailLabel: {
    color: EventTheme.colors.textFaint,
    fontFamily: EventTheme.typography.bold,
    fontSize: 8,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  detailValue: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 2,
  },
  list: { gap: 5 },
  listItem: { alignItems: "flex-start", flexDirection: "row", gap: 6 },
  listText: {
    color: EventTheme.colors.text,
    flex: 1,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    lineHeight: 16,
  },
  footer: {
    backgroundColor: EventTheme.colors.surface,
    borderTopColor: EventTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 9,
    justifyContent: "flex-end",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  footerCompact: { flexWrap: "wrap" },
  locateButton: {
    alignItems: "center",
    borderColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    flexGrow: 1,
    gap: 7,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 17,
  },
  locateButtonText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 17,
  },
  primaryButtonText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 17,
  },
  secondaryButtonText: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
});
