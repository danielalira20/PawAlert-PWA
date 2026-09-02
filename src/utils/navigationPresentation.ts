import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function formatNavigationDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function formatNavigationDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatNavigationAge(value: string | null): string {
  if (!value) return "sin hora disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sin hora disponible";
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
}
