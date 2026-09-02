export type NavigationMode = "driving" | "cycling" | "walking";

export type NavigationStatus = "complete" | "unavailable";

export type NavigationErrorCode =
  | "assignment_not_confirmed"
  | "report_not_navigable"
  | "navigation_access_revoked"
  | "navigation_not_found"
  | "invalid_origin"
  | "stale_origin"
  | "low_accuracy_origin"
  | "mode_unavailable"
  | "provider_timeout"
  | "provider_error"
  | "no_route"
  | "recalculation_rate_limited";

export interface NavigationOriginRequest {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  captured_at: string;
}

export interface NavigationRouteRequest {
  origin: NavigationOriginRequest;
  mode: NavigationMode;
  known_destination_revision?: string;
}

export interface NavigationOrigin {
  source: "device_gps" | "registered_origin";
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  captured_at: string | null;
}

export interface NavigationDestination {
  source: "validated_sighting" | "initial_report";
  latitude: number;
  longitude: number;
  confirmed_at: string | null;
  revision: string;
}

export interface NavigationGeometry {
  type: "LineString";
  coordinates: [longitude: number, latitude: number][];
}

export interface NavigationStep {
  type: string;
  modifier: string | null;
  street_name: string | null;
  distance_meters: number;
  duration_seconds: number;
  location: [longitude: number, latitude: number];
}

export interface NavigationRouteData {
  duration_seconds: number;
  distance_meters: number;
  geometry: NavigationGeometry;
  steps: NavigationStep[];
}

interface NavigationRouteResponseBase {
  contract_version: 1;
  report_id: string;
  mode: NavigationMode;
  available_modes: NavigationMode[];
  origin: NavigationOrigin;
  destination: NavigationDestination;
  calculated_at: string;
  source: "osrm";
  warnings: string[];
}

export interface NavigationRouteComplete extends NavigationRouteResponseBase {
  status: "complete";
  route: NavigationRouteData;
  expires_at: string;
  error_code: null;
  retryable: null;
}

export interface NavigationRouteUnavailable extends NavigationRouteResponseBase {
  status: "unavailable";
  route: null;
  expires_at: null;
  error_code: NavigationErrorCode;
  retryable: boolean;
}

export type NavigationRouteResponse =
  NavigationRouteComplete | NavigationRouteUnavailable;

export interface NavigationCapabilities {
  contract_version: 1;
  navigation_enabled: boolean;
  available_modes: NavigationMode[];
  destination_revision: string;
  foreground_tracking: true;
  background_tracking: false;
  voice_guidance: false;
  live_traffic: false;
}
