import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import { usePublicEvents } from "../../../hooks/events/usePublicEvents";
import type {
  EventPublicFilters,
  EventPublicSummary,
} from "../../../types/event";
import { Toast, useToast } from "../../Toast";
import { PublicEventCard } from "./PublicEventCard";
import {
  PublicEventFilters,
  type PublicEventFilterState,
} from "./PublicEventFilters";

const INITIAL_FILTERS: PublicEventFilterState = {
  type: "todos",
  cost: "todos",
  date: "todos",
  species: "todos",
  municipality: "todos",
};

export function buildPublicEventQuery(
  filters: PublicEventFilterState,
  now = new Date(),
): Omit<EventPublicFilters, "pagina" | "limite"> {
  const query: Omit<EventPublicFilters, "pagina" | "limite"> = {};
  if (filters.type !== "todos") query.tipo = filters.type;
  if (filters.cost !== "todos") query.gratuito = filters.cost === "gratuito";
  if (filters.species !== "todos") query.especie = filters.species;
  if (filters.municipality !== "todos") {
    query.municipio = filters.municipality;
  }
  if (filters.date !== "todos") {
    const until = new Date(now);
    until.setDate(until.getDate() + (filters.date === "7_dias" ? 7 : 30));
    query.desde = now.toISOString();
    query.hasta = until.toISOString();
  }
  return query;
}

interface PublicEventsPanelProps {
  onLocate?: (event: EventPublicSummary) => void;
  topInset?: number;
}

function LoadingCards() {
  return (
    <View accessibilityLabel="Cargando eventos públicos" style={styles.cards}>
      {[0, 1].map((item) => (
        <View key={item} style={styles.skeleton}>
          <View style={styles.skeletonImage} />
          <View style={styles.skeletonBody}>
            <View style={[styles.skeletonLine, { width: "38%" }]} />
            <View style={[styles.skeletonLine, styles.skeletonTitle]} />
            <View style={[styles.skeletonLine, { width: "84%" }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function PublicEventsPanel({
  onLocate,
  topInset = 0,
}: PublicEventsPanelProps) {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const query = useMemo(() => buildPublicEventQuery(filters), [filters]);
  const {
    events,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    refresh,
    loadMore,
  } = usePublicEvents(query);
  const { toast, translateY, showToast } = useToast();

  return (
    <View style={[styles.panel, topInset > 0 && { paddingTop: topInset }]}>
      <Toast toast={toast} translateY={translateY} />
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <Ionicons
            name="calendar-outline"
            size={21}
            color={EventTheme.colors.primary}
          />
        </View>
        <View style={styles.introCopy}>
          <Text style={styles.introTitle}>Eventos comunitarios</Text>
          <Text style={styles.introText}>
            {isLoading
              ? "Consultando la agenda pública…"
              : `${total} ${total === 1 ? "actividad disponible" : "actividades disponibles"}`}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Actualizar eventos públicos"
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
              size={19}
              color={EventTheme.colors.primary}
            />
          )}
        </TouchableOpacity>
      </View>

      <PublicEventFilters value={filters} onChange={setFilters} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[EventTheme.colors.primary]}
            onRefresh={() => void refresh()}
            refreshing={isRefreshing}
            tintColor={EventTheme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <LoadingCards />
        ) : error ? (
          <View style={styles.messageState}>
            <View style={styles.messageIconDanger}>
              <Ionicons
                name="cloud-offline-outline"
                size={27}
                color={EventTheme.colors.danger}
              />
            </View>
            <Text style={styles.messageTitle}>
              No pudimos cargar los eventos
            </Text>
            <Text style={styles.messageText}>{error}</Text>
            <TouchableOpacity
              onPress={() => void refresh()}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Intentar nuevamente</Text>
            </TouchableOpacity>
          </View>
        ) : events.length === 0 ? (
          <View style={styles.messageState}>
            <View style={styles.messageIconEmpty}>
              <Ionicons
                name="calendar-clear-outline"
                size={28}
                color={EventTheme.colors.primary}
              />
            </View>
            <Text style={styles.messageTitle}>No encontramos eventos</Text>
            <Text style={styles.messageText}>
              Prueba otra combinación de categoría, fecha o preferencias.
            </Text>
          </View>
        ) : (
          <View style={styles.cards}>
            {events.map((event) => (
              <PublicEventCard
                event={event}
                key={event.id}
                onError={(message) =>
                  showToast({
                    type: "error",
                    title: "No pudimos guardar el evento",
                    message,
                  })
                }
                onLocate={onLocate}
                onSavedChange={(saved) =>
                  showToast({
                    type: "success",
                    title: saved ? "Evento guardado" : "Evento eliminado",
                    message: saved
                      ? "Lo encontrarás en tu perfil. Guardar no reserva un lugar."
                      : "Tu agenda quedó actualizada.",
                  })
                }
              />
            ))}
            {hasMore && (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={isLoadingMore}
                onPress={() => void loadMore()}
                style={styles.moreButton}
              >
                {isLoadingMore ? (
                  <ActivityIndicator
                    color={EventTheme.colors.primary}
                    size="small"
                  />
                ) : (
                  <Ionicons
                    name="chevron-down-outline"
                    size={17}
                    color={EventTheme.colors.primary}
                  />
                )}
                <Text style={styles.moreText}>
                  {isLoadingMore ? "Cargando…" : "Mostrar más eventos"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: EventTheme.colors.background,
    flex: 1,
    width: "100%",
  },
  intro: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderBottomColor: EventTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    padding: 12,
  },
  introIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 17,
    height: 40,
    justifyContent: "center",
    marginRight: 10,
    width: 40,
  },
  introCopy: { flex: 1 },
  introTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 13,
  },
  introText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 1,
  },
  refreshButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surface,
    borderRadius: 15,
    height: EventTheme.layout.minimumTouchTarget,
    justifyContent: "center",
    marginLeft: 7,
    width: EventTheme.layout.minimumTouchTarget,
  },
  scrollContent: { flexGrow: 1, padding: 10, paddingBottom: 104 },
  cards: {
    alignItems: "center",
    alignSelf: "center",
    gap: 10,
    maxWidth: 440,
    width: "100%",
  },
  messageState: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    maxWidth: 420,
    paddingHorizontal: 22,
    paddingVertical: 34,
    width: "100%",
  },
  messageIconEmpty: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 22,
    height: 52,
    justifyContent: "center",
    marginBottom: 11,
    width: 52,
  },
  messageIconDanger: {
    alignItems: "center",
    backgroundColor: "#FCE8E4",
    borderRadius: 22,
    height: 52,
    justifyContent: "center",
    marginBottom: 11,
    width: 52,
  },
  messageTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 14,
    textAlign: "center",
  },
  messageText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 4,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    marginTop: 14,
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 17,
    justifyContent: "center",
  },
  retryText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  moreButton: {
    alignItems: "center",
    alignSelf: "center",
    borderColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 18,
  },
  moreText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 11,
  },
  skeleton: {
    alignSelf: "center",
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    maxWidth: 420,
    overflow: "hidden",
    width: "100%",
  },
  skeletonImage: { backgroundColor: "#EFE7DE", height: 142 },
  skeletonBody: { gap: 10, padding: 14 },
  skeletonLine: {
    backgroundColor: "#EFE7DE",
    borderRadius: 7,
    height: 10,
  },
  skeletonTitle: { height: 17, width: "72%" },
});
