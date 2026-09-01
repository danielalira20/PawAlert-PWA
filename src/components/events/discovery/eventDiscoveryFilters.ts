import type { EventMapFilters, EventPublicFilters } from "../../../types/event";
import type { PublicEventFilterState } from "./PublicEventFilters";

export interface EventMapBounds {
  latitudeMin: number;
  latitudeMax: number;
  longitudeMin: number;
  longitudeMax: number;
}

export const INITIAL_PUBLIC_EVENT_FILTERS: PublicEventFilterState = {
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

export function buildEventMapQuery(
  filters: PublicEventFilterState,
  bounds: EventMapBounds | null = null,
  now = new Date(),
): Omit<EventMapFilters, "limite"> {
  const publicQuery = buildPublicEventQuery(filters, now);
  const mapQuery: Omit<EventMapFilters, "limite"> = {};
  if (publicQuery.tipo) mapQuery.tipo = publicQuery.tipo;
  if (publicQuery.municipio) mapQuery.municipio = publicQuery.municipio;
  if (publicQuery.especie) mapQuery.especie = publicQuery.especie;
  if (publicQuery.gratuito !== undefined) {
    mapQuery.gratuito = publicQuery.gratuito;
  }
  if (publicQuery.desde) mapQuery.desde = publicQuery.desde;
  if (publicQuery.hasta) mapQuery.hasta = publicQuery.hasta;
  if (bounds) {
    mapQuery.latitud_min = bounds.latitudeMin;
    mapQuery.latitud_max = bounds.latitudeMax;
    mapQuery.longitud_min = bounds.longitudeMin;
    mapQuery.longitud_max = bounds.longitudeMax;
  }
  return mapQuery;
}
