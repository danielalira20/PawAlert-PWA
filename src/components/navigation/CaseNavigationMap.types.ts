import type {
  NavigationDestination,
  NavigationGeometry,
  NavigationOrigin,
} from "../../types/navigation";

export interface CaseNavigationMapProps {
  origin: NavigationOrigin;
  destination: NavigationDestination;
  geometry: NavigationGeometry;
  lineStyle?: "route" | "fallback";
  height?: number;
  fitRequestId?: number;
}

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}
