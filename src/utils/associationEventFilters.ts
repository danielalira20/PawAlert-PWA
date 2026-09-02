import type { EventAssociationView, EventState } from "../types/event";

export type AssociationEventFilter = "todos" | EventState;

export const ASSOCIATION_EVENT_STATES: EventState[] = [
  "borrador",
  "publicado",
  "pausado",
  "cancelado",
  "finalizado",
  "archivado",
  "suspendido_admin",
];

export function buildAssociationEventCounts(events: EventAssociationView[]) {
  const counts = Object.fromEntries(
    ["todos", ...ASSOCIATION_EVENT_STATES].map((state) => [state, 0]),
  ) as Record<AssociationEventFilter, number>;
  counts.todos = events.length;
  events.forEach((event) => {
    counts[event.estado] += 1;
  });
  return counts;
}
