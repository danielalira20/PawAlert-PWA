const DEFAULT_PUBLIC_APP_ORIGIN = "https://paw-alert-pwa.vercel.app";

export function normalizeEventDeepLinkId(
  value: string | string[] | undefined,
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  return normalized || null;
}

export function buildEventDeepLinkPath(eventId: string): string {
  return `/map?event_id=${encodeURIComponent(eventId.trim())}`;
}

export function buildEventDeepLinkUrl(
  eventId: string,
  origin?: string | null,
): string {
  const configuredOrigin = process.env.EXPO_PUBLIC_APP_URL?.trim();
  const base = (
    origin ||
    configuredOrigin ||
    DEFAULT_PUBLIC_APP_ORIGIN
  ).replace(/\/$/, "");
  return `${base}${buildEventDeepLinkPath(eventId)}`;
}
