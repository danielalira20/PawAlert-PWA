import type { NavigationGeometry, NavigationOrigin } from "../types/navigation";

const EARTH_RADIUS_METERS = 6_371_000;

interface LocalPoint {
  x: number;
  y: number;
}

export function navigationDistanceBetweenMeters(
  origin: Pick<NavigationOrigin, "latitude" | "longitude">,
  destination: Pick<NavigationOrigin, "latitude" | "longitude">,
): number {
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function projectRelativeTo(
  coordinate: NavigationGeometry["coordinates"][number],
  origin: Pick<NavigationOrigin, "latitude" | "longitude">,
): LocalPoint {
  const latitude = coordinate[1];
  const longitude = coordinate[0];
  const averageLatitude = toRadians((latitude + origin.latitude) / 2);
  return {
    x:
      EARTH_RADIUS_METERS *
      toRadians(longitude - origin.longitude) *
      Math.cos(averageLatitude),
    y: EARTH_RADIUS_METERS * toRadians(latitude - origin.latitude),
  };
}

function distanceToSegmentMeters(start: LocalPoint, end: LocalPoint): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return Math.hypot(start.x, start.y);

  const projection = Math.min(
    1,
    Math.max(0, -(start.x * deltaX + start.y * deltaY) / lengthSquared),
  );
  return Math.hypot(
    start.x + projection * deltaX,
    start.y + projection * deltaY,
  );
}

export function navigationDistanceToRouteMeters(
  origin: Pick<NavigationOrigin, "latitude" | "longitude">,
  geometry: NavigationGeometry,
): number | null {
  const validCoordinates = geometry.coordinates.filter(
    ([longitude, latitude]) =>
      Number.isFinite(longitude) && Number.isFinite(latitude),
  );
  if (validCoordinates.length === 0) return null;

  const projected = validCoordinates.map((coordinate) =>
    projectRelativeTo(coordinate, origin),
  );
  if (projected.length === 1) {
    return Math.hypot(projected[0].x, projected[0].y);
  }

  let shortestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < projected.length - 1; index += 1) {
    shortestDistance = Math.min(
      shortestDistance,
      distanceToSegmentMeters(projected[index], projected[index + 1]),
    );
  }
  return Number.isFinite(shortestDistance) ? shortestDistance : null;
}
