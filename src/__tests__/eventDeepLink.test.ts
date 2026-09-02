import {
  buildEventDeepLinkPath,
  buildEventDeepLinkUrl,
  normalizeEventDeepLinkId,
} from "../utils/eventDeepLink";

describe("eventDeepLink", () => {
  it("construye una URL pública estable para un evento", () => {
    expect(buildEventDeepLinkPath("event 1")).toBe("/events?event_id=event%201");
    expect(
      buildEventDeepLinkUrl("event-1", "https://paw-alert-pwa.vercel.app/"),
    ).toBe("https://paw-alert-pwa.vercel.app/events?event_id=event-1");
  });

  it("normaliza parámetros simples o repetidos y descarta valores vacíos", () => {
    expect(normalizeEventDeepLinkId(" event-1 ")).toBe("event-1");
    expect(normalizeEventDeepLinkId(["event-2", "event-3"])).toBe("event-2");
    expect(normalizeEventDeepLinkId(" ")).toBeNull();
    expect(normalizeEventDeepLinkId(undefined)).toBeNull();
  });
});
