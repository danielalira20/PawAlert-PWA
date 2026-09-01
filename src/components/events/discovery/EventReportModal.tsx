import { Ionicons } from "@expo/vector-icons";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { AppModal } from "../../AppModal";
import { EventTheme } from "../../../constants/eventTheme";
import {
  createEventIdempotencyKey,
  normalizeEventApiError,
  reportEvent,
} from "../../../services/eventService";
import type { EventReportReason } from "../../../types/event";
import { EVENT_REPORT_REASON_LABELS } from "../../../utils/eventFormatters";

const REASONS = Object.entries(EVENT_REPORT_REASON_LABELS) as Array<
  [EventReportReason, string]
>;

interface EventReportModalProps {
  eventId: string;
  token: string;
  visible: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess: () => void;
}

export function EventReportModal({
  eventId,
  token,
  visible,
  onClose,
  onError,
  onSuccess,
}: EventReportModalProps) {
  const [reason, setReason] = useState<EventReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const normalizedDescription = description.trim();
  const canSubmit =
    Boolean(reason) && normalizedDescription.length >= 10 && !isSubmitting;
  const remainingHint = useMemo(
    () => Math.max(0, 10 - normalizedDescription.length),
    [normalizedDescription.length],
  );

  const reset = () => {
    setReason(null);
    setDescription("");
    setIsSubmitting(false);
    idempotencyKeyRef.current = null;
  };

  const close = () => {
    if (isSubmitting) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (!reason || normalizedDescription.length < 10 || isSubmitting) return;
    setIsSubmitting(true);
    const idempotencyKey =
      idempotencyKeyRef.current ?? createEventIdempotencyKey("report", eventId);
    idempotencyKeyRef.current = idempotencyKey;

    try {
      await reportEvent(token, eventId, {
        motivo: reason,
        descripcion: normalizedDescription,
        idempotency_key: idempotencyKey,
      });
      reset();
      onClose();
      onSuccess();
    } catch (error) {
      onError(normalizeEventApiError(error).message);
      setIsSubmitting(false);
    }
  };

  return (
    <AppModal fitContent maxWidth={520} onClose={close} visible={visible}>
      <View style={styles.content}>
        <View style={styles.icon}>
          <Ionicons
            name="flag-outline"
            size={27}
            color={EventTheme.colors.primary}
          />
        </View>
        <Text style={styles.title}>Reportar este evento</Text>
        <Text style={styles.subtitle}>
          Selecciona el motivo que mejor describe el problema. El equipo de
          PawAlert revisará la información.
        </Text>

        <Text style={styles.label}>Motivo</Text>
        <View style={styles.reasons}>
          {REASONS.map(([value, label]) => {
            const selected = reason === value;
            return (
              <TouchableOpacity
                key={value}
                onPress={() => setReason(value)}
                style={[styles.reason, selected && styles.reasonSelected]}
              >
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={17}
                  color={
                    selected
                      ? EventTheme.colors.primary
                      : EventTheme.colors.textMuted
                  }
                />
                <Text
                  style={[
                    styles.reasonText,
                    selected && styles.reasonTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>¿Qué ocurrió?</Text>
        <TextInput
          accessibilityLabel="Descripción del reporte"
          editable={!isSubmitting}
          maxLength={2000}
          multiline
          onChangeText={setDescription}
          placeholder="Describe brevemente la información que debe revisarse"
          placeholderTextColor={EventTheme.colors.textFaint}
          style={styles.input}
          textAlignVertical="top"
          value={description}
        />
        <Text style={styles.hint}>
          {remainingHint > 0
            ? `Escribe ${remainingHint} caracteres más.`
            : "La descripción está lista para enviarse."}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            disabled={isSubmitting}
            onPress={close}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!canSubmit}
            onPress={() => void submit()}
            style={[styles.submitButton, !canSubmit && styles.disabled]}
          >
            {isSubmitting ? (
              <ActivityIndicator
                color={EventTheme.colors.surface}
                size="small"
              />
            ) : (
              <Ionicons
                name="send-outline"
                size={17}
                color={EventTheme.colors.surface}
              />
            )}
            <Text style={styles.submitText}>
              {isSubmitting ? "Enviando…" : "Enviar reporte"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surface,
    padding: 24,
  },
  icon: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 24,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  title: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 20,
    marginTop: 11,
    textAlign: "center",
  },
  subtitle: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 5,
    maxWidth: 410,
    textAlign: "center",
  },
  label: {
    alignSelf: "flex-start",
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
    marginBottom: 7,
    marginTop: 17,
  },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 7, width: "100%" },
  reason: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.chip,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 11,
  },
  reasonSelected: {
    backgroundColor: "#FFF0E2",
    borderColor: EventTheme.colors.primary,
  },
  reasonText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 10,
  },
  reasonTextSelected: { color: EventTheme.colors.primaryDark },
  input: {
    backgroundColor: EventTheme.colors.background,
    borderColor: EventTheme.colors.border,
    borderRadius: 15,
    borderWidth: 1,
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    minHeight: 90,
    padding: 12,
    width: "100%",
  },
  hint: {
    alignSelf: "flex-start",
    color: EventTheme.colors.textFaint,
    fontFamily: EventTheme.typography.regular,
    fontSize: 9,
    marginTop: 5,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 19,
    width: "100%",
  },
  cancelButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 17,
  },
  cancelText: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 18,
  },
  submitText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  disabled: { opacity: 0.48 },
});
