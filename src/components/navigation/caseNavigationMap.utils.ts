import type { NavigationGeometry } from "../../types/navigation";
import type { MapCoordinate } from "./CaseNavigationMap.types";

const DEFAULT_LATITUDE = 19.0414;
const DEFAULT_LONGITUDE = -98.2063;
const MIN_DELTA = 0.008;

export interface NavigationMapRegion extends MapCoordinate {
  latitudeDelta: number;
  longitudeDelta: number;
}

export function isValidMapCoordinate(coordinate: MapCoordinate): boolean {
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  );
}

export function geoJsonLineStringToMapCoordinates(
  geometry: NavigationGeometry,
): MapCoordinate[] {
  const coordinates = geometry.coordinates.map(([longitude, latitude]) => ({
    latitude,
    longitude,
  }));

  return coordinates.every(isValidMapCoordinate) ? coordinates : [];
}

export function navigationMapBounds(
  origin: MapCoordinate,
  destination: MapCoordinate,
  route: MapCoordinate[],
): MapCoordinate[] {
  const coordinates = [origin, ...route, destination].filter(
    isValidMapCoordinate,
  );
  const uniqueCoordinates = new Map<string, MapCoordinate>();
  coordinates.forEach((coordinate) => {
    uniqueCoordinates.set(
      `${coordinate.latitude}:${coordinate.longitude}`,
      coordinate,
    );
  });
  return Array.from(uniqueCoordinates.values());
}

export function regionForNavigationPoints(
  coordinates: MapCoordinate[],
): NavigationMapRegion {
  if (coordinates.length === 0) {
    return {
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }

  const latitudes = coordinates.map(({ latitude }) => latitude);
  const longitudes = coordinates.map(({ longitude }) => longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.45, MIN_DELTA),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.45, MIN_DELTA),
  };
}
