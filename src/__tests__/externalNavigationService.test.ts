import {
  buildExternalNavigationUrl,
  resolveExternalNavigationDestination,
} from "../services/externalNavigationService";

describe("externalNavigationService", () => {
  it("uses the authoritative destination persisted with the OSRM route", () => {
    const destination = resolveExternalNavigationDestination({
      latitud: 19.06,
      longitud: -98.22,
      ruta: {
        status: "complete",
        duration_seconds: 420,
        distance_meters: 3100,
        geometry: null,
        error_code: null,
        calculated_at: "2026-08-20T12:00:00Z",
        destination: { latitude: 19.08, longitude: -98.24 },
      },
    });

    expect(destination).toEqual({ latitude: 19.08, longitude: -98.24 });
  });

  it("falls back to the original report coordinates for legacy responses", () => {
    const destination = resolveExternalNavigationDestination({
      latitud: 19.06,
      longitud: -98.22,
      ruta: null,
    });

    expect(destination).toEqual({ latitude: 19.06, longitude: -98.22 });
  });

  it("does not expose a link without valid coordinates", () => {
    expect(
      resolveExternalNavigationDestination({
        latitud: Number.NaN,
        longitud: -98.22,
        ruta: null,
      }),
    ).toBeNull();
  });

  it("builds Google Maps and Waze directions to the same destination", () => {
    const destination = { latitude: 19.08, longitude: -98.24 };

    expect(buildExternalNavigationUrl("google", destination)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=19.08,-98.24",
    );
    expect(buildExternalNavigationUrl("waze", destination)).toBe(
      "https://www.waze.com/ul?ll=19.08,-98.24&navigate=yes",
    );
  });
});
