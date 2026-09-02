import { navigationDistanceToRouteMeters } from "../utils/navigationGeometry";
import type { NavigationGeometry } from "../types/navigation";

const geometry: NavigationGeometry = {
  type: "LineString",
  coordinates: [
    [-98.2, 19.04],
    [-98.19, 19.04],
  ],
};

describe("navigationGeometry", () => {
  it("mide la distancia mínima a un segmento y no solo a sus extremos", () => {
    const distance = navigationDistanceToRouteMeters(
      { latitude: 19.041, longitude: -98.195 },
      geometry,
    );

    expect(distance).toBeCloseTo(111, 0);
  });

  it("devuelve cero para un punto situado sobre la ruta", () => {
    expect(
      navigationDistanceToRouteMeters(
        { latitude: 19.04, longitude: -98.195 },
        geometry,
      ),
    ).toBeCloseTo(0, 5);
  });

  it("tolera geometrías sin coordenadas utilizables", () => {
    expect(
      navigationDistanceToRouteMeters(
        { latitude: 19.04, longitude: -98.195 },
        { type: "LineString", coordinates: [] },
      ),
    ).toBeNull();
  });
});
