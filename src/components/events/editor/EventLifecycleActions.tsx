import { Ionicons } from "@expo/vector-icons";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { AppModal } from "../../AppModal";
import {
  EVENT_CANCEL_REASONS,
  EVENT_CUSTOM_REASON,
  EVENT_PAUSE_REASONS,
} from "../../../constants/eventLifecycle";
import { EventTheme } from "../../../constants/eventTheme";
import { useAuth } from "../../../context/AuthContext";
import {
  cancelAssociationEvent,
  createEventIdempotencyKey,
  normalizeEventApiError,
  pauseAssociationEvent,
  publishAssociationEvent,
} from "../../../services/eventService";
import type { EventOperationResponse, EventState } from "../../../types/event";
import {
  acquireEventActionLock,
  getEventLifecycleActions,
  type EventLifecycleAction,
} from "../../../utils/eventLifecycle";
import { EventOptionChips, EventTextField } from "./EventFormControls";

interface Props {
  eventId?: string;
  state: EventState;
  disabled?: boolean;
  publishReady?: boolean;
  variant?: "editor" | "card";
  onPreparePublish?: () => Promise<string | null>;
  onSuccess: (
    response: EventOperationResponse,
    action: EventLifecycleAction,
  ) => void | Promise<void>;
  onError: (message: string) => void;
}

const ACTION_COPY: Record<
  EventLifecycleAction,
  { title: string; description: string; confirm: string }
> = {
  publish: {
    title: "Publicar evento",
    description:
      "La información quedará visible para la comunidad. Los eventos guardados recibirán avisos cuando corresponda.",
    confirm: "Publicar ahora",
  },
  pause: {
    title: "Pausar evento",
    description:
      "El evento dejará de aparecer en la agenda pública hasta que la asociación lo reanude. El motivo será de uso interno.",
    confirm: "Pausar evento",
  },
  cancel: {
    title: "Cancelar evento",
    description:
      "Esta acción es definitiva. El motivo será público y se notificará a las personas que guardaron el evento.",
    confirm: "Cancelar definitivamente",
  },
};

export function EventLifecycleActions({
  eventId,
  state,
  disabled = false,
  publishReady = true,
  variant = "editor",
  onPreparePublish,
  onSuccess,
  onError,
}: Props) {
  const { token } = useAuth();
  const [action, setAction] = useState<EventLifecycleAction | null>(null);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actionKeyRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const actions = useMemo(() => getEventLifecycleActions(state), [state]);
  const resolvedReason =
    reason === EVENT_CUSTOM_REASON ? customReason.trim() : reason.trim();
  const needsReason = action === "pause" || action === "cancel";

  const closeModal = () => {
    if (submittingRef.current) return;
    setAction(null);
    setReason("");
    setCustomReason("");
    actionKeyRef.current = null;
  };

  const openAction = (nextAction: EventLifecycleAction) => {
    setAction(nextAction);
    setReason("");
    setCustomReason("");
    actionKeyRef.current = null;
  };

  const executeAction = async () => {
    if (!action || (needsReason && !resolvedReason)) return;
    if (!token) {
      onError("Tu sesión expiró. Inicia sesión nuevamente.");
      return;
    }
    if (!acquireEventActionLock(submittingRef)) return;
    setIsSubmitting(true);
    try {
      let resolvedEventId = eventId;
      if (action === "publish" && onPreparePublish) {
        resolvedEventId = (await onPreparePublish()) || undefined;
      }
      if (!resolvedEventId) return;
      actionKeyRef.current ||= createEventIdempotencyKey(
        action,
        resolvedEventId,
      );
      const response =
        action === "publish"
          ? await publishAssociationEvent(token, resolvedEventId, {
              idempotency_key: actionKeyRef.current,
            })
          : action === "pause"
            ? await pauseAssociationEvent(token, resolvedEventId, {
                motivo: resolvedReason,
                idempotency_key: actionKeyRef.current,
              })
            : await cancelAssociationEvent(token, resolvedEventId, {
                motivo_publico: resolvedReason,
                idempotency_key: actionKeyRef.current,
              });
      actionKeyRef.current = null;
      setAction(null);
      setReason("");
      setCustomReason("");
      await onSuccess(response, action);
    } catch (error) {
      onError(normalizeEventApiError(error).message);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!actions.length) return null;

  return (
    <>
      <View
        style={[
          styles.actions,
          variant === "card" ? styles.cardActions : styles.editorActions,
        ]}
      >
        {actions.map((availableAction) => {
          const isPublish = availableAction === "publish";
          const isCancel = availableAction === "cancel";
          const isCard = variant === "card";
          const actionDisabled =
            disabled || (isPublish && !publishReady) || isSubmitting;
          const baseLabel =
            availableAction === "publish"
              ? state === "pausado"
                ? "Reanudar"
                : "Publicar"
              : availableAction === "pause"
                ? "Pausar"
                : "Cancelar";
          const label = isCard ? baseLabel : `${baseLabel} evento`;
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: actionDisabled }}
              disabled={actionDisabled}
              key={availableAction}
              onPress={() => openAction(availableAction)}
              style={[
                styles.actionButton,
                isCard && styles.cardActionButton,
                isPublish && styles.publishButton,
                !isPublish && styles.outlineButton,
                isCancel && styles.cancelButton,
                actionDisabled && styles.disabled,
              ]}
            >
              <Ionicons
                name={
                  isPublish
                    ? "megaphone-outline"
                    : availableAction === "pause"
                      ? "pause-circle-outline"
                      : "close-circle-outline"
                }
                size={17}
                color={
                  isPublish
                    ? EventTheme.colors.surface
                    : isCancel
                      ? EventTheme.colors.danger
                      : EventTheme.colors.secondary
                }
              />
              <Text
                style={[
                  styles.actionLabel,
                  isPublish && styles.publishLabel,
                  isCancel && styles.cancelLabel,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <AppModal
        dismissable={!isSubmitting}
        fitContent
        maxWidth={560}
        onClose={closeModal}
        visible={action != null}
      >
        <ScrollView
          contentContainerStyle={styles.modal}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.modalScroll}
        >
          <View
            style={[
              styles.modalIcon,
              action === "cancel" && styles.modalIconDanger,
            ]}
          >
            <Ionicons
              name={
                action === "publish"
                  ? "megaphone-outline"
                  : action === "pause"
                    ? "pause-circle-outline"
                    : "close-circle-outline"
              }
              size={29}
              color={
                action === "cancel"
                  ? EventTheme.colors.danger
                  : EventTheme.colors.primary
              }
            />
          </View>
          <Text style={styles.modalTitle}>
            {action ? ACTION_COPY[action].title : ""}
          </Text>
          <Text style={styles.modalDescription}>
            {action ? ACTION_COPY[action].description : ""}
          </Text>

          {needsReason && (
            <View style={styles.reasonArea}>
              <Text style={styles.reasonLabel}>
                {action === "pause"
                  ? "¿Por qué se pausará?"
                  : "Motivo público de cancelación"}
              </Text>
              <EventOptionChips
                multiple={false}
                onToggle={(selected) => {
                  setReason(selected);
                  actionKeyRef.current = null;
                }}
                options={
                  action === "pause"
                    ? EVENT_PAUSE_REASONS
                    : EVENT_CANCEL_REASONS
                }
                selected={reason ? [reason] : []}
              />
              {reason === EVENT_CUSTOM_REASON && (
                <EventTextField
                  label="Describe el motivo"
                  maxLength={1000}
                  multiline
                  onChangeText={(value) => {
                    setCustomReason(value);
                    actionKeyRef.current = null;
                  }}
                  placeholder="Escribe un motivo breve y claro"
                  required
                  value={customReason}
                />
              )}
            </View>
          )}

          <View style={styles.modalActions}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={closeModal}
              style={styles.backButton}
            >
              <Text style={styles.backLabel}>Volver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{
                disabled: isSubmitting || (needsReason && !resolvedReason),
              }}
              disabled={isSubmitting || (needsReason && !resolvedReason)}
              onPress={() => void executeAction()}
              style={[
                styles.confirmButton,
                action === "cancel" && styles.confirmDanger,
                (isSubmitting || (needsReason && !resolvedReason)) &&
                  styles.disabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={EventTheme.colors.surface} />
              ) : (
                <Text style={styles.confirmLabel}>
                  {action ? ACTION_COPY[action].confirm : "Continuar"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  cardActions: { flexWrap: "nowrap", marginTop: 9 },
  editorActions: { marginTop: 4 },
  actionButton: {
    alignItems: "center",
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 14,
  },
  cardActionButton: { flex: 1, paddingHorizontal: 8 },
  publishButton: { backgroundColor: EventTheme.colors.primary },
  outlineButton: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.secondary,
    borderWidth: 1,
  },
  cancelButton: { borderColor: EventTheme.colors.danger },
  actionLabel: {
    color: EventTheme.colors.secondary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  publishLabel: { color: EventTheme.colors.surface },
  cancelLabel: { color: EventTheme.colors.danger },
  disabled: { opacity: 0.42 },
  modalScroll: { flexGrow: 0 },
  modal: { backgroundColor: EventTheme.colors.surface, padding: 27 },
  modalIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 26,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  modalIconDanger: { backgroundColor: "#FFF3F0" },
  modalTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 20,
    marginTop: 14,
  },
  modalDescription: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
  },
  reasonArea: { gap: 13, marginTop: 22 },
  reasonLabel: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 13,
  },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 24,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 18,
  },
  backLabel: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  confirmButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 150,
    paddingHorizontal: 18,
  },
  confirmDanger: { backgroundColor: EventTheme.colors.danger },
  confirmLabel: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
});
