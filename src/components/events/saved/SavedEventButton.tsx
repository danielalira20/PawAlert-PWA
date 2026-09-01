import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { AppModal } from "../../AppModal";
import { EventTheme } from "../../../constants/eventTheme";
import { useSavedEvents } from "../../../context/events/SavedEventsContext";
import type { EventPublicSummary } from "../../../types/event";

interface SavedEventButtonProps {
  event: EventPublicSummary;
  fullWidth?: boolean;
  onError?: (message: string) => void;
  onSuccess?: (saved: boolean) => void;
}

export function SavedEventButton({
  event,
  fullWidth = false,
  onError,
  onSuccess,
}: SavedEventButtonProps) {
  const { isSaved, pendingEventIds, setEventSaved } = useSavedEvents();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const saved = isSaved(event.id);
  const pending = pendingEventIds.has(event.id);

  const applyChange = async (shouldSave: boolean) => {
    try {
      const changed = await setEventSaved(event, shouldSave);
      if (changed) onSuccess?.(shouldSave);
      if (!shouldSave) setConfirmVisible(false);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : "No pudimos actualizar este evento.",
      );
    }
  };

  return (
    <>
      <TouchableOpacity
        accessibilityLabel={saved ? "Quitar de guardados" : "Guardar evento"}
        accessibilityRole="button"
        disabled={pending}
        onPress={() => {
          if (saved) setConfirmVisible(true);
          else void applyChange(true);
        }}
        style={[
          styles.button,
          saved ? styles.buttonSaved : styles.buttonUnsaved,
          fullWidth && styles.buttonFullWidth,
          pending && styles.buttonDisabled,
        ]}
      >
        {pending ? (
          <ActivityIndicator
            color={
              saved ? EventTheme.colors.primary : EventTheme.colors.surface
            }
            size="small"
          />
        ) : (
          <Ionicons
            name={saved ? "bookmark" : "bookmark-outline"}
            size={18}
            color={
              saved ? EventTheme.colors.primary : EventTheme.colors.surface
            }
          />
        )}
        <Text style={saved ? styles.buttonSavedText : styles.buttonUnsavedText}>
          {pending ? "Actualizando…" : saved ? "Guardado" : "Guardar evento"}
        </Text>
      </TouchableOpacity>

      <AppModal
        fitContent
        maxWidth={460}
        onClose={() => setConfirmVisible(false)}
        showCloseButton={false}
        visible={confirmVisible}
      >
        <View style={styles.confirmation}>
          <View style={styles.confirmationIcon}>
            <Ionicons
              name="bookmark-outline"
              size={28}
              color={EventTheme.colors.primary}
            />
          </View>
          <Text style={styles.confirmationTitle}>¿Quitar de guardados?</Text>
          <Text style={styles.confirmationText}>
            Dejarás de recibir el seguimiento asociado a este evento. Esta
            acción no afecta ningún registro externo.
          </Text>
          <View style={styles.confirmationActions}>
            <TouchableOpacity
              disabled={pending}
              onPress={() => setConfirmVisible(false)}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Conservar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={pending}
              onPress={() => void applyChange(false)}
              style={[styles.removeButton, pending && styles.buttonDisabled]}
            >
              {pending ? (
                <ActivityIndicator
                  color={EventTheme.colors.surface}
                  size="small"
                />
              ) : (
                <Ionicons
                  name="trash-outline"
                  size={17}
                  color={EventTheme.colors.surface}
                />
              )}
              <Text style={styles.removeButtonText}>Quitar evento</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 16,
  },
  buttonFullWidth: { width: "100%" },
  buttonSaved: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.primary,
  },
  buttonUnsaved: {
    backgroundColor: EventTheme.colors.primary,
    borderColor: EventTheme.colors.primary,
  },
  buttonDisabled: { opacity: 0.62 },
  buttonSavedText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  buttonUnsavedText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  confirmation: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surface,
    padding: EventTheme.spacing.lg,
  },
  confirmationIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 24,
    height: 58,
    justifyContent: "center",
    marginBottom: 13,
    width: 58,
  },
  confirmationTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 20,
    textAlign: "center",
  },
  confirmationText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
    maxWidth: 360,
    textAlign: "center",
  },
  confirmationActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: EventTheme.spacing.sm,
    justifyContent: "center",
    marginTop: EventTheme.spacing.lg,
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
  cancelButtonText: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  removeButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 17,
  },
  removeButtonText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
});
