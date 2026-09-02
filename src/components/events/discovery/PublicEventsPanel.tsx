import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import { usePublicEvents } from "../../../hooks/events/usePublicEvents";
import type { EventPublicSummary } from "../../../types/event";
import { Toast, useToast } from "../../Toast";
import { PublicEventCard } from "./PublicEventCard";
import { PublicEventDetailModal } from "./PublicEventDetailModal";
import {
  PublicEventFilters,
  type PublicEventFilterState,
} from "./PublicEventFilters";
import {
  buildPublicEventQuery,
  INITIAL_PUBLIC_EVENT_FILTERS,
} from "./eventDiscoveryFilters";

export { buildPublicEventQuery } from "./eventDiscoveryFilters";

interface PublicEventsPanelProps {
  asideContent?: ReactNode;
  filters?: PublicEventFilterState;
  onFiltersChange?: (filters: PublicEventFilterState) => void;
  onLocate?: (event: EventPublicSummary) => void;
  onOpenDetail?: (eventId: string) => void;
  topInset?: number;
  headerContent?: ReactNode;
}

function LoadingCards({ grid = false }: { grid?: boolean }) {
  return (
    <View
      accessibilityLabel="Cargando eventos públicos"
      style={[styles.cards, grid && styles.cardsGrid]}
    >
      {[0, 1, 2].map((item) => (
        <View key={item} style={[styles.skeleton, grid && styles.skeletonGrid]}>
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
  asideContent,
  filters: controlledFilters,
  onFiltersChange,
  onLocate,
  onOpenDetail,
  topInset = 0,
  headerContent,
}: PublicEventsPanelProps) {
  const [internalFilters, setInternalFilters] = useState(
    INITIAL_PUBLIC_EVENT_FILTERS,
  );
  const [detailEventId, setDetailEventId] = useState<string | null>(null);
  const [showCompactFilters, setShowCompactFilters] = useState(false);
  const [eventPage, setEventPage] = useState(0);
  const { width } = useWindowDimensions();
  const compactFilters = width < 640;
  const twoColumnLayout = Boolean(asideContent) && width >= 980;
  const showInlineAside = Boolean(asideContent) && width >= 760 && !twoColumnLayout;
  const gridLayout = width >= 768;
  const pageSize = compactFilters ? 1 : 2;
  const filters = controlledFilters ?? internalFilters;
  const setFilters = onFiltersChange ?? setInternalFilters;
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
  const activeFilterCount = Object.values(filters).filter(
    (filter) => filter !== "todos",
  ).length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const visibleEvents = events.slice(eventPage * pageSize, (eventPage + 1) * pageSize);

  useEffect(() => {
    setEventPage(0);
  }, [query, pageSize]);

  const goToNextPage = async () => {
    const nextPage = eventPage + 1;
    if (nextPage >= pageCount) return;
    if (nextPage * pageSize >= events.length && hasMore) await loadMore();
    setEventPage(nextPage);
  };

  return (
    <View style={[styles.panel, topInset > 0 && { paddingTop: topInset }]}>
      <Toast toast={toast} translateY={translateY} />

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
        {headerContent}
        {showInlineAside && (
          <View style={styles.mobileAside}>{asideContent}</View>
        )}
        <View style={[styles.discoveryLayout, twoColumnLayout && styles.discoveryLayoutWide]}>
          <View style={styles.resultsColumn}>
        {compactFilters ? (
          <View style={styles.compactFilterSection}>
            <TouchableOpacity
              accessibilityLabel={`${showCompactFilters ? "Ocultar" : "Mostrar"} filtros de eventos${activeFilterCount > 0 ? `, ${activeFilterCount} activos` : ""}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: showCompactFilters }}
              onPress={() => setShowCompactFilters((visible) => !visible)}
              style={styles.compactFilterButton}
            >
              <View style={styles.compactFilterLabel}>
                <Ionicons name="options-outline" size={18} color={EventTheme.colors.primary} />
                <Text style={styles.compactFilterText}>Filtros</Text>
                {activeFilterCount > 0 && (
                  <View style={styles.filterCountBadge}>
                    <Text style={styles.filterCountText}>{activeFilterCount}</Text>
                  </View>
                )}
              </View>
              <Ionicons
                name={showCompactFilters ? "chevron-up" : "chevron-down"}
                size={18}
                color={EventTheme.colors.textMuted}
              />
            </TouchableOpacity>
            {showCompactFilters && (
              <PublicEventFilters embedded value={filters} onChange={setFilters} />
            )}
          </View>
        ) : (
          <PublicEventFilters value={filters} onChange={setFilters} />
        )}

        <View style={styles.resultsHeader}>
          <View>
            <Text style={styles.resultsEyebrow}>AGENDA</Text>
            <Text style={styles.resultsTitle}>Próximos eventos</Text>
          </View>
          {!isLoading && !error && (
            <View style={styles.resultsCountBadge}>
              <Text style={styles.resultsCountText}>
                {total} {total === 1 ? "evento" : "eventos"}
              </Text>
            </View>
          )}
        </View>

        {isLoading ? (
          <LoadingCards grid={gridLayout} />
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
              accessibilityLabel="Reintentar carga de eventos"
              accessibilityRole="button"
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
          <View style={[styles.cards, gridLayout && styles.cardsGrid]}>
            {visibleEvents.map((event) => (
              <PublicEventCard
                event={event}
                key={event.id}
                layout={gridLayout ? "grid" : "list"}
                onError={(message) =>
                  showToast({
                    type: "error",
                    title: "No pudimos guardar el evento",
                    message,
                  })
                }
                onOpenDetail={(selectedEvent) => {
                  if (onOpenDetail) onOpenDetail(selectedEvent.id);
                  else setDetailEventId(selectedEvent.id);
                }}
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
            {pageCount > 1 && (
              <View style={styles.pagination}>
                <TouchableOpacity
                  accessibilityLabel="Ver eventos anteriores"
                  accessibilityRole="button"
                  disabled={eventPage === 0 || isLoadingMore}
                  onPress={() => setEventPage((page) => Math.max(0, page - 1))}
                  style={[styles.pageButton, eventPage === 0 && styles.pageButtonDisabled]}
                >
                  <Ionicons name="chevron-back" size={18} color={EventTheme.colors.primary} />
                </TouchableOpacity>
                <Text style={styles.pageText}>{eventPage + 1} de {pageCount}</Text>
                <TouchableOpacity
                  accessibilityLabel="Ver más eventos"
                  accessibilityRole="button"
                  disabled={eventPage >= pageCount - 1 || isLoadingMore}
                  onPress={() => void goToNextPage()}
                  style={[styles.pageButton, eventPage >= pageCount - 1 && styles.pageButtonDisabled]}
                >
                  {isLoadingMore
                    ? <ActivityIndicator color={EventTheme.colors.primary} size="small" />
                    : <Ionicons name="chevron-forward" size={18} color={EventTheme.colors.primary} />}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
          </View>
          {asideContent && twoColumnLayout && (
            <View style={styles.asideColumn}>{asideContent}</View>
          )}
        </View>
      </ScrollView>
      {!onOpenDetail && (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  discoveryLayout: {
    alignSelf: "center",
    width: "100%",
  },
  discoveryLayoutWide: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 22,
    maxWidth: 1360,
    paddingHorizontal: 22,
    paddingTop: 24,
  },
  resultsColumn: { flex: 1, minWidth: 0 },
  asideColumn: {
    flexShrink: 0,
    width: 430,
  },
  mobileAside: {
    alignSelf: "center",
    marginTop: 18,
    maxWidth: 720,
    paddingHorizontal: 14,
    width: "100%",
  },
  panel: {
    backgroundColor: EventTheme.colors.background,
    flex: 1,
    width: "100%",
  },
  scrollContent: { flexGrow: 1, paddingBottom: 104 },
  cards: {
    alignItems: "center",
    alignSelf: "center",
    gap: 10,
    maxWidth: 440,
    width: "100%",
    marginTop: 12,
    paddingHorizontal: 10,
  },
  cardsGrid: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "center",
    maxWidth: 1120,
  },
  pagination: {
    alignItems: "center",
    flexBasis: "100%",
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    marginTop: 4,
  },
  pageButton: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  pageButtonDisabled: { opacity: 0.35 },
  pageText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 10,
    minWidth: 48,
    textAlign: "center",
  },
  compactFilterSection: {
    backgroundColor: EventTheme.colors.surface,
    borderBottomColor: EventTheme.colors.border,
    borderBottomWidth: 1,
  },
  compactFilterButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  compactFilterLabel: { alignItems: "center", flexDirection: "row", gap: 7 },
  compactFilterText: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 12,
  },
  filterCountBadge: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.primary,
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 5,
  },
  filterCountText: { color: "#FFF", fontFamily: EventTheme.typography.bold, fontSize: 9 },
  resultsHeader: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    maxWidth: 1120,
    paddingHorizontal: 14,
    paddingTop: 20,
    width: "100%",
  },
  resultsEyebrow: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 8,
    letterSpacing: 0.7,
  },
  resultsTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 20,
    lineHeight: 26,
  },
  resultsCountBadge: {
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  resultsCountText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 9,
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
  moreButtonGrid: { flexBasis: "100%", maxWidth: 350 },
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
  skeletonGrid: { flexBasis: 300, flexGrow: 1, maxWidth: 350 },
  skeletonImage: { backgroundColor: "#EFE7DE", height: 142 },
  skeletonBody: { gap: 10, padding: 14 },
  skeletonLine: {
    backgroundColor: "#EFE7DE",
    borderRadius: 7,
    height: 10,
  },
  skeletonTitle: { height: 17, width: "72%" },
});
