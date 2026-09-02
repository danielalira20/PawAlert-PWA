import { Ionicons } from "@expo/vector-icons";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import {
  ACTIVE_EVENT_REPORT_STATES,
  EVENT_ADMIN_RESTORE_OPTIONS,
  EVENT_ADMIN_SUSPEND_OPTIONS,
  EVENT_MODERATION_REASON_OPTIONS,
  EVENT_MODERATION_STATE_OPTIONS,
} from "../../../constants/eventModeration";
import { EventTheme } from "../../../constants/eventTheme";
import { useAuth } from "../../../context/AuthContext";
import { useAdminEventIncidents } from "../../../hooks/events/useAdminEventIncidents";
import {
  createEventIdempotencyKey,
  restoreEventAsAdmin,
  suspendEventAsAdmin,
} from "../../../services/eventService";
import type {
  EventAdminIncident,
  EventReportReason,
  EventReportState,
} from "../../../types/event";
import {
  EVENT_REPORT_REASON_LABELS,
  EVENT_REPORT_STATE_LABELS,
} from "../../../utils/eventFormatters";
import { acquireEventActionLock } from "../../../utils/eventLifecycle";
import { EventOptionChips } from "../editor/EventFormControls";
import { EventStatusChip } from "../shared/EventStatusChip";
import { EventTypeChip } from "../shared/EventTypeChip";

const ALL = "todos" as const;
type StateFilter = EventReportState | typeof ALL;
type ReasonFilter = EventReportReason | typeof ALL;
type AdminDecision = "suspend" | "restore";

export function shouldUseEventModerationGrid(width: number, itemCount: number) {
  return width >= 760 && itemCount > 1;
}

interface Props {
  onModerationChange?: () => void;
  showToast: (toast: {
    type: "success" | "error" | "warning" | "info";
    title: string;
    message: string;
  }) => void;
}

const REPORT_STATE_TONES: Record<
  EventReportState,
  { background: string; color: string }
> = {
  pendiente: { background: "#FFF4D8", color: "#8C6818" },
  en_revision: { background: "#EAF4FF", color: "#2E6FA8" },
  requiere_informacion: { background: "#F1EAF8", color: "#7A5AA6" },
  resuelto: { background: "#E3F4F2", color: "#347D78" },
  descartado: { background: "#EFE9E2", color: EventTheme.colors.textMuted },
};

function formatIncidentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReportStateChip({ state }: { state: EventReportState }) {
  const tone = REPORT_STATE_TONES[state];
  return (
    <View
      style={[styles.reportStateChip, { backgroundColor: tone.background }]}
    >
      <Text style={[styles.reportStateText, { color: tone.color }]}>
        {EVENT_REPORT_STATE_LABELS[state]}
      </Text>
    </View>
  );
}

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function IncidentCard({
  incident,
  wide,
  onPress,
}: {
  incident: EventAdminIncident;
  wide: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, wide ? styles.cardWide : styles.cardFull]}
    >
      <View style={styles.cardTopRow}>
        <ReportStateChip state={incident.estado} />
        <EventStatusChip state={incident.evento.estado} />
      </View>
      <View style={styles.cardTypeRow}>
        <EventTypeChip type={incident.evento.tipo} />
        <Text numberOfLines={1} style={styles.associationName}>
          {incident.evento.asociacion.nombre}
        </Text>
      </View>
      <Text numberOfLines={2} style={styles.cardTitle}>
        {incident.evento.titulo}
      </Text>
      <View style={styles.reasonRow}>
        <Ionicons
          name="warning-outline"
          size={16}
          color={EventTheme.colors.primary}
        />
        <Text style={styles.reasonText}>
          {EVENT_REPORT_REASON_LABELS[incident.motivo]}
        </Text>
      </View>
      <Text numberOfLines={3} style={styles.cardDescription}>
        {incident.descripcion}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.dateText}>
          {formatIncidentDate(incident.creado_at)}
        </Text>
        <View style={styles.reviewLink}>
          <Text style={styles.reviewLinkText}>Revisar incidente</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={EventTheme.colors.primary}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function EventModerationPanel({ onModerationChange, showToast }: Props) {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [stateFilter, setStateFilter] = useState<StateFilter>("pendiente");
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>(ALL);
  const [pageNumber, setPageNumber] = useState(1);
  const [selected, setSelected] = useState<EventAdminIncident | null>(null);
  const [decision, setDecision] = useState<AdminDecision | null>(null);
  const [decisionValue, setDecisionValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const actionKeyRef = useRef<string | null>(null);

  const filters = useMemo(
    () => ({
      estado: stateFilter === ALL ? undefined : stateFilter,
      motivo: reasonFilter === ALL ? undefined : reasonFilter,
      pagina: pageNumber,
      limite: 8,
    }),
    [pageNumber, reasonFilter, stateFilter],
  );
  const { page, isLoading, isRefreshing, error, refresh } =
    useAdminEventIncidents(filters);
  const useGrid = shouldUseEventModerationGrid(width, page.items.length);

  const chooseDecision = (nextDecision: AdminDecision) => {
    setDecision(nextDecision);
    setDecisionValue("");
    actionKeyRef.current = null;
  };

  const closeDecision = () => {
    if (submittingRef.current) return;
    setDecision(null);
    setDecisionValue("");
    actionKeyRef.current = null;
  };

  const closeDetail = () => {
    if (submittingRef.current) return;
    closeDecision();
    setSelected(null);
  };

  const executeDecision = async () => {
    if (!selected || !decision || !decisionValue || !token) return;
    if (!acquireEventActionLock(submittingRef)) return;
    setIsSubmitting(true);
    try {
      actionKeyRef.current ||= createEventIdempotencyKey(
        decision,
        selected.evento.id,
      );
      const response =
        decision === "suspend"
          ? await suspendEventAsAdmin(token, selected.evento.id, {
              motivo: decisionValue,
              idempotency_key: actionKeyRef.current,
            })
          : await restoreEventAsAdmin(token, selected.evento.id, {
              resolucion: decisionValue,
              idempotency_key: actionKeyRef.current,
            });
      showToast({
        type: "success",
        title:
          decision === "suspend" ? "Evento suspendido" : "Evento restaurado",
        message:
          decision === "suspend"
            ? "El evento salió de la agenda pública y sus incidentes quedaron en revisión."
            : "El evento quedó pausado. La asociación deberá revisarlo y publicarlo nuevamente.",
      });
      actionKeyRef.current = null;
      setSelected(null);
      setDecision(null);
      setDecisionValue("");
      await refresh();
      onModerationChange?.();
      return response;
    } catch (actionError) {
      showToast({
        type: "error",
        title: "No pudimos aplicar la decisión",
        message:
          actionError instanceof Error
            ? actionError.message
            : "Intenta nuevamente sin cerrar esta revisión.",
      });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (selected) {
    const activeIncident = ACTIVE_EVENT_REPORT_STATES.includes(selected.estado);
    const canSuspend =
      activeIncident &&
      (selected.evento.estado === "publicado" ||
        selected.evento.estado === "pausado");
    const canRestore =
      activeIncident && selected.evento.estado === "suspendido_admin";
    const decisionOptions =
      decision === "suspend"
        ? EVENT_ADMIN_SUSPEND_OPTIONS
        : EVENT_ADMIN_RESTORE_OPTIONS;

    return (
      <ScrollView
        contentContainerStyle={styles.detailContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={closeDetail}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={18}
            color={EventTheme.colors.primary}
          />
          <Text style={styles.backText}>Volver a incidentes</Text>
        </TouchableOpacity>

        <View style={styles.detailCard}>
          <View
            style={[styles.detailHeader, compact && styles.detailHeaderCompact]}
          >
            <View style={styles.detailHeaderCopy}>
              <Text style={styles.eyebrow}>Moderación de eventos</Text>
              <Text style={styles.detailTitle}>{selected.evento.titulo}</Text>
              <Text style={styles.detailAssociation}>
                {selected.evento.asociacion.nombre}
              </Text>
            </View>
            <View style={styles.detailChips}>
              <EventTypeChip type={selected.evento.tipo} />
              <EventStatusChip state={selected.evento.estado} />
            </View>
          </View>

          <View style={styles.privacyNotice}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={EventTheme.colors.secondary}
            />
            <Text style={styles.privacyText}>
              La identidad de quien reportó el evento permanece protegida.
              Decide únicamente con la información del incidente y del evento.
            </Text>
          </View>

          <View style={styles.detailGrid}>
            <View style={styles.detailSection}>
              <Text style={styles.sectionLabel}>Motivo reportado</Text>
              <View style={styles.detailValueRow}>
                <ReportStateChip state={selected.estado} />
                <Text style={styles.detailValueStrong}>
                  {EVENT_REPORT_REASON_LABELS[selected.motivo]}
                </Text>
              </View>
              <Text style={styles.reportDescription}>
                {selected.descripcion}
              </Text>
            </View>
            <View style={styles.detailSection}>
              <Text style={styles.sectionLabel}>Seguimiento</Text>
              <Text style={styles.detailMeta}>
                Recibido: {formatIncidentDate(selected.creado_at)}
              </Text>
              <Text style={styles.detailMeta}>
                Última actualización:{" "}
                {formatIncidentDate(selected.actualizada_at)}
              </Text>
              {!!selected.resolucion && (
                <Text style={styles.resolutionText}>{selected.resolucion}</Text>
              )}
            </View>
          </View>

          {!decision ? (
            <View style={styles.decisionBar}>
              <View style={styles.decisionCopy}>
                <Text style={styles.decisionTitle}>
                  Decisión administrativa
                </Text>
                <Text style={styles.decisionHint}>
                  {canRestore
                    ? "Restaurar resuelve los incidentes y devuelve el evento como pausado."
                    : canSuspend
                      ? "Suspender oculta el evento mientras la administración revisa el caso."
                      : "El estado actual no admite una transición administrativa."}
                </Text>
              </View>
              {canSuspend && (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => chooseDecision("suspend")}
                  style={styles.dangerButton}
                >
                  <Ionicons name="shield-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Suspender evento</Text>
                </TouchableOpacity>
              )}
              {canRestore && (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => chooseDecision("restore")}
                  style={styles.restoreButton}
                >
                  <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>
                    Restaurar como pausado
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>
                {decision === "suspend"
                  ? "Motivo de la suspensión"
                  : "Resolución administrativa"}
              </Text>
              <Text style={styles.confirmText}>
                Selecciona la opción que mejor documenta esta decisión.
              </Text>
              <EventOptionChips
                multiple={false}
                onToggle={(value) => {
                  setDecisionValue(value);
                  actionKeyRef.current = null;
                }}
                options={decisionOptions}
                selected={decisionValue ? [decisionValue] : []}
              />
              <View
                style={[
                  styles.confirmActions,
                  compact && styles.confirmActionsCompact,
                ]}
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={closeDecision}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Volver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: isSubmitting || !decisionValue,
                  }}
                  disabled={isSubmitting || !decisionValue}
                  onPress={() => void executeDecision()}
                  style={[
                    decision === "suspend"
                      ? styles.dangerButton
                      : styles.restoreButton,
                    styles.confirmButton,
                    (isSubmitting || !decisionValue) && styles.disabled,
                  ]}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={EventTheme.colors.surface} />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {decision === "suspend"
                        ? "Confirmar suspensión"
                        : "Confirmar restauración"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.headerIcon}>
          <Ionicons
            name="calendar-outline"
            size={24}
            color={EventTheme.colors.primary}
          />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Incidentes de eventos</Text>
          <Text style={styles.subtitle}>
            Revisa denuncias sin revelar a quien las envió. Suspender y
            restaurar siempre deja historial administrativo.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Actualizar incidentes de eventos"
          accessibilityRole="button"
          disabled={isRefreshing}
          onPress={() => void refresh()}
          style={styles.refreshButton}
        >
          {isRefreshing ? (
            <ActivityIndicator color={EventTheme.colors.primary} size="small" />
          ) : (
            <Ionicons
              name="refresh-outline"
              size={20}
              color={EventTheme.colors.primary}
            />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.filtersCard}>
        <Text style={styles.filterLabel}>Estado de la denuncia</Text>
        <View style={styles.filterRow}>
          <FilterChip
            active={stateFilter === ALL}
            label="Todas"
            onPress={() => {
              setStateFilter(ALL);
              setPageNumber(1);
            }}
          />
          {EVENT_MODERATION_STATE_OPTIONS.map((option) => (
            <FilterChip
              active={stateFilter === option.value}
              key={option.value}
              label={option.label}
              onPress={() => {
                setStateFilter(option.value);
                setPageNumber(1);
              }}
            />
          ))}
        </View>
        <Text style={styles.filterLabel}>Motivo</Text>
        <View style={styles.filterRow}>
          <FilterChip
            active={reasonFilter === ALL}
            label="Todos"
            onPress={() => {
              setReasonFilter(ALL);
              setPageNumber(1);
            }}
          />
          {EVENT_MODERATION_REASON_OPTIONS.map((option) => (
            <FilterChip
              active={reasonFilter === option.value}
              key={option.value}
              label={option.label}
              onPress={() => {
                setReasonFilter(option.value);
                setPageNumber(1);
              }}
            />
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.messageCard}>
          <ActivityIndicator size="large" color={EventTheme.colors.primary} />
          <Text style={styles.messageText}>
            Cargando incidentes de eventos…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.messageCard}>
          <Ionicons
            name="cloud-offline-outline"
            size={38}
            color={EventTheme.colors.danger}
          />
          <Text style={styles.messageTitle}>No pudimos cargar la bandeja</Text>
          <Text style={styles.messageText}>{error}</Text>
          <TouchableOpacity
            onPress={() => void refresh()}
            style={styles.retryButton}
          >
            <Text style={styles.primaryButtonText}>Intentar nuevamente</Text>
          </TouchableOpacity>
        </View>
      ) : page.items.length === 0 ? (
        <View style={styles.messageCard}>
          <Ionicons
            name="checkmark-circle-outline"
            size={44}
            color={EventTheme.colors.secondary}
          />
          <Text style={styles.messageTitle}>Sin incidentes en este filtro</Text>
          <Text style={styles.messageText}>
            Cambia el estado o el motivo para consultar el historial restante.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsText}>
              {page.total} {page.total === 1 ? "incidente" : "incidentes"}
            </Text>
            <Text style={styles.resultsText}>Página {page.pagina}</Text>
          </View>
          <View style={styles.cards}>
            {page.items.map((incident) => (
              <IncidentCard
                incident={incident}
                key={incident.id}
                onPress={() => setSelected(incident)}
                wide={useGrid}
              />
            ))}
          </View>
          <View style={styles.pagination}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={pageNumber <= 1}
              onPress={() =>
                setPageNumber((current) => Math.max(1, current - 1))
              }
              style={[styles.pageButton, pageNumber <= 1 && styles.disabled]}
            >
              <Ionicons
                name="chevron-back"
                size={17}
                color={EventTheme.colors.text}
              />
              <Text style={styles.pageButtonText}>Anterior</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={!page.tiene_mas}
              onPress={() => setPageNumber((current) => current + 1)}
              style={[styles.pageButton, !page.tiene_mas && styles.disabled]}
            >
              <Text style={styles.pageButtonText}>Siguiente</Text>
              <Ionicons
                name="chevron-forward"
                size={17}
                color={EventTheme.colors.text}
              />
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  listContent: {
    alignSelf: "center",
    gap: EventTheme.spacing.md,
    maxWidth: EventTheme.layout.maxContentWidth,
    padding: EventTheme.spacing.lg,
    paddingBottom: 80,
    width: "100%",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13,
  },
  headerCompact: { alignItems: "flex-start" },
  headerIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 18,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  headerCopy: { flex: 1 },
  title: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 21,
  },
  subtitle: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 2,
  },
  refreshButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderRadius: 16,
    height: EventTheme.layout.minimumTouchTarget,
    justifyContent: "center",
    width: EventTheme.layout.minimumTouchTarget,
  },
  filtersCard: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    gap: 9,
    padding: EventTheme.spacing.md,
  },
  filterLabel: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
    marginTop: 2,
  },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  filterChip: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.chip,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 12,
  },
  filterChipActive: {
    backgroundColor: EventTheme.colors.primary,
    borderColor: EventTheme.colors.primary,
  },
  filterText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 10,
  },
  filterTextActive: { color: EventTheme.colors.surface },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resultsText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 10,
  },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: EventTheme.spacing.md },
  card: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    padding: EventTheme.spacing.md,
  },
  cardWide: { flexBasis: "47%", flexGrow: 1, minWidth: 300 },
  cardFull: { width: "100%" },
  cardTopRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    justifyContent: "space-between",
  },
  cardTypeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 13,
  },
  associationName: {
    color: EventTheme.colors.textMuted,
    flex: 1,
    fontFamily: EventTheme.typography.medium,
    fontSize: 10,
    textAlign: "right",
  },
  cardTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 12,
  },
  reasonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },
  reasonText: {
    color: EventTheme.colors.primaryDark,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 11,
  },
  cardDescription: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 7,
  },
  cardFooter: {
    alignItems: "center",
    borderTopColor: EventTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
  },
  dateText: {
    color: EventTheme.colors.textFaint,
    fontFamily: EventTheme.typography.regular,
    fontSize: 9,
  },
  reviewLink: { alignItems: "center", flexDirection: "row", gap: 3 },
  reviewLinkText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 10,
  },
  reportStateChip: {
    alignSelf: "flex-start",
    borderRadius: EventTheme.radii.chip,
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reportStateText: { fontFamily: EventTheme.typography.semiBold, fontSize: 10 },
  messageCard: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 38,
  },
  messageTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 16,
    textAlign: "center",
  },
  messageText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    marginTop: 6,
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  pagination: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  pageButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 15,
  },
  pageButtonText: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  disabled: { opacity: 0.42 },
  detailContent: {
    alignSelf: "center",
    gap: EventTheme.spacing.md,
    maxWidth: EventTheme.layout.maxContentWidth,
    padding: EventTheme.spacing.lg,
    paddingBottom: 80,
    width: "100%",
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    minHeight: EventTheme.layout.minimumTouchTarget,
  },
  backText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  detailCard: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    gap: EventTheme.spacing.md,
    padding: EventTheme.spacing.lg,
  },
  detailHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: EventTheme.spacing.md,
    justifyContent: "space-between",
  },
  detailHeaderCompact: { flexDirection: "column" },
  detailHeaderCopy: { flex: 1 },
  eyebrow: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 10,
    textTransform: "uppercase",
  },
  detailTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 22,
    lineHeight: 29,
    marginTop: 4,
  },
  detailAssociation: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 12,
    marginTop: 3,
  },
  detailChips: { alignItems: "flex-end", gap: 7 },
  privacyNotice: {
    alignItems: "flex-start",
    backgroundColor: "#EAF7F6",
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 9,
    padding: 13,
  },
  privacyText: {
    color: EventTheme.colors.text,
    flex: 1,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 17,
  },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  detailSection: {
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderRadius: EventTheme.radii.control,
    flexBasis: 300,
    flexGrow: 1,
    gap: 8,
    padding: 15,
  },
  sectionLabel: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.bold,
    fontSize: 10,
    textTransform: "uppercase",
  },
  detailValueRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailValueStrong: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  reportDescription: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.regular,
    fontSize: 12,
    lineHeight: 19,
  },
  detailMeta: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 17,
  },
  resolutionText: {
    color: EventTheme.colors.secondary,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 11,
    lineHeight: 17,
  },
  decisionBar: {
    alignItems: "center",
    backgroundColor: "#FFF5EA",
    borderColor: "#F4D7BA",
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 15,
  },
  decisionCopy: { flexBasis: 300, flexGrow: 1 },
  decisionTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 13,
  },
  decisionHint: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 2,
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.danger,
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 17,
  },
  restoreButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.secondary,
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 17,
  },
  primaryButtonText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  confirmCard: {
    backgroundColor: EventTheme.colors.background,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    gap: 11,
    padding: EventTheme.spacing.md,
  },
  confirmTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 15,
  },
  confirmText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 5,
  },
  confirmActionsCompact: { flexDirection: "column" },
  confirmButton: { minWidth: 180 },
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
