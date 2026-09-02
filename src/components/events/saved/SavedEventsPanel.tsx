import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import { useSavedEvents } from "../../../context/events/SavedEventsContext";
import { Toast, useToast } from "../../Toast";
import { PublicEventDetailModal } from "../discovery/PublicEventDetailModal";
import { SavedEventCard } from "./SavedEventCard";

export function shouldUseSavedEventsGrid(width: number, count: number) {
  return width >= 780 && count > 1;
}

function LoadingState({ wide }: { wide: boolean }) {
  return (
    <View accessibilityLabel="Cargando eventos guardados" style={styles.cards}>
      {[0, 1].map((item) => (
        <View
          key={item}
          style={[
            styles.skeletonCard,
            wide ? styles.skeletonWide : styles.skeletonNarrow,
          ]}
        >
          <View style={styles.skeletonImage} />
          <View style={styles.skeletonBody}>
            <View style={[styles.skeletonLine, { width: "38%" }]} />
            <View style={[styles.skeletonLine, styles.skeletonTitle]} />
            <View style={[styles.skeletonLine, { width: "84%" }]} />
            <View style={[styles.skeletonLine, { width: "68%" }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function SavedEventsPanel({ onClose }: { onClose: () => void }) {
  const [detailEventId, setDetailEventId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const { savedEvents, isLoading, isRefreshing, error, refresh } =
    useSavedEvents();
  const { toast, translateY, showToast } = useToast();
  const useGrid = shouldUseSavedEventsGrid(width, savedEvents.length);

  return (
    <View style={styles.panel}>
      <Toast toast={toast} translateY={translateY} />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>TU AGENDA</Text>
          <Text style={styles.title}>Eventos guardados</Text>
          <Text style={styles.subtitle}>
            Revisa las actividades que quieres seguir desde un solo lugar.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Cerrar eventos guardados"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={23} color={EventTheme.colors.surface} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.notice}>
          <View style={styles.noticeIcon}>
            <Ionicons
              name="notifications-outline"
              size={21}
              color={EventTheme.colors.primary}
            />
          </View>
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>Seguimiento, no reservación</Text>
            <Text style={styles.noticeText}>
              Guardar te permite recibir avisos del evento. No aparta cupo ni
              sustituye el registro solicitado por la asociación.
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Actualizar eventos guardados"
            accessibilityRole="button"
            disabled={isRefreshing}
            onPress={() => void refresh()}
            style={styles.refreshButton}
          >
            {isRefreshing ? (
              <ActivityIndicator
                color={EventTheme.colors.primary}
                size="small"
              />
            ) : (
              <Ionicons
                name="refresh-outline"
                size={20}
                color={EventTheme.colors.primary}
              />
            )}
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <LoadingState wide={width >= 780} />
        ) : error ? (
          <View style={styles.messageState}>
            <View style={styles.messageIconDanger}>
              <Ionicons
                name="cloud-offline-outline"
                size={29}
                color={EventTheme.colors.danger}
              />
            </View>
            <Text style={styles.messageTitle}>No pudimos cargar tu agenda</Text>
            <Text style={styles.messageText}>{error}</Text>
            <TouchableOpacity
              onPress={() => void refresh()}
              style={styles.retryButton}
            >
              <Ionicons
                name="refresh-outline"
                size={17}
                color={EventTheme.colors.surface}
              />
              <Text style={styles.retryText}>Intentar nuevamente</Text>
            </TouchableOpacity>
          </View>
        ) : savedEvents.length === 0 ? (
          <View style={styles.messageState}>
            <View style={styles.messageIconEmpty}>
              <Ionicons
                name="bookmark-outline"
                size={31}
                color={EventTheme.colors.primary}
              />
            </View>
            <Text style={styles.messageTitle}>Aún no guardas eventos</Text>
            <Text style={styles.messageText}>
              Cuando guardes una actividad desde la agenda pública, aparecerá
              aquí para que puedas consultarla fácilmente.
            </Text>
          </View>
        ) : (
          <View style={styles.cards}>
            {savedEvents.map((savedEvent) => (
              <SavedEventCard
                key={savedEvent.id}
                onError={(message) =>
                  showToast({
                    type: "error",
                    title: "No pudimos actualizar el evento",
                    message,
                  })
                }
                onOpenDetail={setDetailEventId}
                onRemoved={() =>
                  showToast({
                    type: "success",
                    title: "Evento eliminado de guardados",
                    message: "Tu agenda quedó actualizada.",
                  })
                }
                savedEvent={savedEvent}
                wide={useGrid}
              />
            ))}
          </View>
        )}
      </ScrollView>
      <PublicEventDetailModal
        eventId={detailEventId}
        onClose={() => setDetailEventId(null)}
        onError={(message) =>
          showToast({
            type: "error",
            title: "No pudimos actualizar el evento",
            message,
          })
        }
        onSavedChange={(saved) => {
          if (!saved) setDetailEventId(null);
          showToast({
            type: "success",
            title: saved ? "Evento guardado" : "Evento eliminado de guardados",
            message: "Tu agenda quedó actualizada.",
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: EventTheme.colors.background,
    flex: 1,
    width: "100%",
  },
  header: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.secondary,
    flexDirection: "row",
    minHeight: 132,
    paddingBottom: 19,
    paddingHorizontal: EventTheme.spacing.lg,
    paddingTop: 18,
  },
  headerCopy: { flex: 1, paddingRight: EventTheme.spacing.md },
  eyebrow: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: EventTheme.typography.bold,
    fontSize: 10,
    letterSpacing: 1,
  },
  title: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 25,
    lineHeight: 31,
    marginTop: 2,
  },
  subtitle: {
    color: "rgba(255,255,255,0.88)",
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 22,
    height: EventTheme.layout.minimumTouchTarget,
    justifyContent: "center",
    width: EventTheme.layout.minimumTouchTarget,
  },
  scrollContent: {
    flexGrow: 1,
    padding: EventTheme.spacing.lg,
  },
  notice: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: EventTheme.spacing.lg,
    maxWidth: 796,
    padding: 13,
    width: "100%",
  },
  noticeIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 17,
    height: 42,
    justifyContent: "center",
    marginRight: 11,
    width: 42,
  },
  noticeCopy: { flex: 1 },
  noticeTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  noticeText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 2,
  },
  refreshButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surface,
    borderRadius: 16,
    height: EventTheme.layout.minimumTouchTarget,
    justifyContent: "center",
    marginLeft: EventTheme.spacing.sm,
    width: EventTheme.layout.minimumTouchTarget,
  },
  cards: {
    alignItems: "flex-start",
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: EventTheme.spacing.md,
    justifyContent: "center",
    maxWidth: 796,
    width: "100%",
  },
  messageState: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    maxWidth: 520,
    paddingHorizontal: EventTheme.spacing.lg,
    paddingVertical: 42,
    width: "100%",
  },
  messageIconEmpty: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 24,
    height: 58,
    justifyContent: "center",
    marginBottom: 13,
    width: 58,
  },
  messageIconDanger: {
    alignItems: "center",
    backgroundColor: "#FCE8E4",
    borderRadius: 24,
    height: 58,
    justifyContent: "center",
    marginBottom: 13,
    width: 58,
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
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
    maxWidth: 390,
    textAlign: "center",
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    flexDirection: "row",
    gap: 7,
    marginTop: EventTheme.spacing.md,
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 18,
  },
  retryText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  skeletonCard: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  skeletonWide: {
    flexBasis: 350,
    flexGrow: 0,
    maxWidth: 390,
    width: 350,
  },
  skeletonNarrow: {
    alignSelf: "center",
    maxWidth: 420,
    width: "100%",
  },
  skeletonImage: { backgroundColor: "#EFE7DE", height: 154 },
  skeletonBody: {
    gap: 11,
    padding: EventTheme.spacing.md,
  },
  skeletonLine: {
    backgroundColor: "#EFE7DE",
    borderRadius: 8,
    height: 11,
  },
  skeletonTitle: { height: 18, width: "72%" },
});
