import type { NavigationGeometry } from "../types/navigation";
import {
  geoJsonLineStringToMapCoordinates,
  navigationMapBounds,
  regionForNavigationPoints,
} from "../components/navigation/caseNavigationMap.utils";

describe("caseNavigationMap utilities", () => {
  it("converts GeoJSON longitude-latitude pairs for map components", () => {
    const geometry: NavigationGeometry = {
      type: "LineString",
      coordinates: [
        [-98.2, 19.04],
        [-98.21, 19.05],
      ],
    };

    expect(geoJsonLineStringToMapCoordinates(geometry)).toEqual([
      { latitude: 19.04, longitude: -98.2 },
      { latitude: 19.05, longitude: -98.21 },
    ]);
  });

  it("rejects the complete geometry when one coordinate is malformed", () => {
    const geometry = {
      type: "LineString",
      coordinates: [
        [-98.2, 19.04],
        [-181, 19.05],
      ],
    } as NavigationGeometry;

    expect(geoJsonLineStringToMapCoordinates(geometry)).toEqual([]);
  });

  it("includes origin, route, and destination once when fitting bounds", () => {
    const origin = { latitude: 19.04, longitude: -98.2 };
    const destination = { latitude: 19.06, longitude: -98.22 };

    expect(
      navigationMapBounds(origin, destination, [origin, destination]),
    ).toEqual([origin, destination]);
  });

  it("creates a stable region around every visible point", () => {
    const region = regionForNavigationPoints([
      { latitude: 19.04, longitude: -98.2 },
      { latitude: 19.06, longitude: -98.24 },
    ]);

    expect(region.latitude).toBeCloseTo(19.05);
    expect(region.longitude).toBeCloseTo(-98.22);
    expect(region.latitudeDelta).toBeCloseTo(0.029);
    expect(region.longitudeDelta).toBeCloseTo(0.058);
  });
});
