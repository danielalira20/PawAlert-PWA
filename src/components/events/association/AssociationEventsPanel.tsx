import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import { useAssociationEvents } from "../../../hooks/events/useAssociationEvents";
import {
  buildAssociationEventCounts,
  type AssociationEventFilter,
} from "../../../utils/associationEventFilters";
import { AssociationEventCard } from "./AssociationEventCard";
import { AssociationEventFilters } from "./AssociationEventFilters";

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: `${tone}1A` }]}>
        <Ionicons name={icon} size={20} color={tone} />
      </View>
      <View>
        <Text style={styles.summaryValue}>{value}</Text>
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
    </View>
  );
}

function LoadingState({ wide }: { wide: boolean }) {
  return (
    <View accessibilityLabel="Cargando eventos" style={styles.cards}>
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
            <View style={[styles.skeletonLine, { width: "36%" }]} />
            <View style={[styles.skeletonLine, styles.skeletonTitle]} />
            <View style={[styles.skeletonLine, { width: "82%" }]} />
            <View style={[styles.skeletonLine, { width: "68%" }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function AssociationEventsPanel() {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const { events, isLoading, isRefreshing, error, refresh } =
    useAssociationEvents();
  const [filter, setFilter] = useState<AssociationEventFilter>("todos");
  const counts = useMemo(() => buildAssociationEventCounts(events), [events]);
  const visibleEvents = useMemo(
    () =>
      filter === "todos"
        ? events
        : events.filter((event) => event.estado === filter),
    [events, filter],
  );

  return (
    <View style={styles.panel}>
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <Ionicons
            name="calendar-outline"
            size={25}
            color={EventTheme.colors.primary}
          />
        </View>
        <View style={styles.introCopy}>
          <Text style={styles.introTitle}>Agenda comunitaria</Text>
          <Text style={styles.introText}>
            Consulta el estado de vacunaciones, ferias y actividades publicadas
            por tu asociación.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Actualizar eventos"
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
              size={21}
              color={EventTheme.colors.primary}
            />
          )}
        </TouchableOpacity>
      </View>

      {!isLoading && !error && (
        <>
          <View style={styles.summaryGrid}>
            <SummaryCard
              icon="albums-outline"
              label="Total"
              value={counts.todos}
              tone={EventTheme.colors.primary}
            />
            <SummaryCard
              icon="checkmark-circle-outline"
              label="Publicados"
              value={counts.publicado}
              tone={EventTheme.colors.secondary}
            />
            <SummaryCard
              icon="document-text-outline"
              label="Borradores"
              value={counts.borrador}
              tone={EventTheme.colors.textMuted}
            />
            <SummaryCard
              icon="flag-outline"
              label="Finalizados"
              value={counts.finalizado}
              tone="#5D6B78"
            />
          </View>
          <AssociationEventFilters
            selected={filter}
            counts={counts}
            onSelect={setFilter}
          />
        </>
      )}

      {isLoading ? (
        <LoadingState wide={wide} />
      ) : error ? (
        <View style={styles.messageState}>
          <View style={styles.messageIconDanger}>
            <Ionicons
              name="cloud-offline-outline"
              size={29}
              color={EventTheme.colors.danger}
            />
          </View>
          <Text style={styles.messageTitle}>No pudimos cargar tus eventos</Text>
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
            <Text style={styles.retryLabel}>Intentar nuevamente</Text>
          </TouchableOpacity>
        </View>
      ) : visibleEvents.length === 0 ? (
        <View style={styles.messageState}>
          <View style={styles.messageIconEmpty}>
            <Ionicons
              name="calendar-clear-outline"
              size={31}
              color={EventTheme.colors.primary}
            />
          </View>
          <Text style={styles.messageTitle}>
            {events.length === 0
              ? "Aún no hay eventos"
              : "No hay eventos con este estado"}
          </Text>
          <Text style={styles.messageText}>
            {events.length === 0
              ? "Cuando tu asociación cree su primer evento, aparecerá en este espacio."
              : "Selecciona otro filtro para revisar el resto de tu agenda."}
          </Text>
        </View>
      ) : (
        <View style={styles.cards}>
          {visibleEvents.map((event) => (
            <AssociationEventCard event={event} key={event.id} wide={wide} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
  },
  intro: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: EventTheme.spacing.md,
    padding: EventTheme.spacing.md,
  },
  introIcon: {
    alignItems: "center",
    backgroundColor: "#FFF0E2",
    borderRadius: 18,
    height: 44,
    justifyContent: "center",
    marginRight: 12,
    width: 44,
  },
  introCopy: {
    flex: 1,
  },
  introTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 15,
  },
  introText: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 17,
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
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: EventTheme.spacing.sm,
    marginBottom: EventTheme.spacing.md,
  },
  summaryCard: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexBasis: 140,
    flexDirection: "row",
    flexGrow: 1,
    gap: 9,
    minHeight: 66,
    padding: 10,
  },
  summaryIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  summaryValue: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 18,
    lineHeight: 21,
  },
  summaryLabel: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 10,
  },
  cards: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: EventTheme.spacing.md,
  },
  messageState: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    paddingHorizontal: EventTheme.spacing.lg,
    paddingVertical: 42,
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
    maxWidth: 420,
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
  retryLabel: {
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
    flexBasis: "47%",
    flexGrow: 1,
    maxWidth: 440,
    minWidth: 300,
  },
  skeletonNarrow: {
    flexBasis: "100%",
    width: "100%",
  },
  skeletonImage: {
    backgroundColor: "#EFE7DE",
    height: 172,
  },
  skeletonBody: {
    gap: 11,
    padding: EventTheme.spacing.md,
  },
  skeletonLine: {
    backgroundColor: "#EFE7DE",
    borderRadius: 8,
    height: 11,
  },
  skeletonTitle: {
    height: 19,
    width: "70%",
  },
});
