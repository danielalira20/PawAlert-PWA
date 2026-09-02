import type { ReporteStaff } from "../types/reportestaff";
import type { NavigationMode } from "../types/navigation";

export type ExternalNavigationProvider = "google" | "waze";

export interface ExternalNavigationDestination {
  latitude: number;
  longitude: number;
}

function finiteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function resolveExternalNavigationDestination(
  report: Pick<ReporteStaff, "latitud" | "longitud" | "ruta">,
): ExternalNavigationDestination | null {
  const routeDestination = report.ruta?.destination;
  if (
    finiteCoordinate(routeDestination?.latitude) &&
    finiteCoordinate(routeDestination.longitude)
  ) {
    return routeDestination;
  }

  if (finiteCoordinate(report.latitud) && finiteCoordinate(report.longitud)) {
    return {
      latitude: report.latitud,
      longitude: report.longitud,
    };
  }

  return null;
}

export function buildExternalNavigationUrl(
  provider: ExternalNavigationProvider,
  destination: ExternalNavigationDestination,
  mode: NavigationMode = "driving",
): string {
  const coordinates = `${destination.latitude},${destination.longitude}`;
  return provider === "google"
    ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates}&travelmode=${
        mode === "cycling" ? "bicycling" : mode
      }`
    : `https://www.waze.com/ul?ll=${coordinates}&navigate=yes`;
}
