import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

import type { NavigationOrigin, NavigationStep } from "../types/navigation";
import { navigationDistanceBetweenMeters } from "./navigationGeometry";

export { navigationDistanceBetweenMeters } from "./navigationGeometry";
const MANEUVER_REACHED_RADIUS_METERS = 45;

export function navigationStepDistanceMeters(
  step: NavigationStep,
  origin: Pick<NavigationOrigin, "latitude" | "longitude">,
): number {
  return navigationDistanceBetweenMeters(origin, {
    longitude: step.location[0],
    latitude: step.location[1],
  });
}

export function advanceNavigationStepIndex(
  steps: NavigationStep[],
  origin: Pick<NavigationOrigin, "latitude" | "longitude">,
  currentIndex: number,
): number {
  if (steps.length === 0) return -1;

  let nextIndex = Math.min(Math.max(currentIndex, 0), steps.length - 1);
  for (let index = nextIndex; index < steps.length - 1; index += 1) {
    if (
      navigationStepDistanceMeters(steps[index], origin) >
      MANEUVER_REACHED_RADIUS_METERS
    ) {
      break;
    }
    nextIndex = index + 1;
  }
  return nextIndex;
}

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

const TURN_INSTRUCTIONS: Record<string, string> = {
  uturn: "Da vuelta en U",
  "sharp right": "Gira pronunciadamente a la derecha",
  right: "Gira a la derecha",
  "slight right": "Mantente ligeramente a la derecha",
  straight: "Continúa derecho",
  "slight left": "Mantente ligeramente a la izquierda",
  left: "Gira a la izquierda",
  "sharp left": "Gira pronunciadamente a la izquierda",
};

function appendStreet(instruction: string, streetName: string | null): string {
  const street = streetName?.trim();
  return street ? `${instruction} en ${street}` : instruction;
}

function directionInstruction(
  modifier: string | null,
  fallback: string,
): string {
  return (modifier && TURN_INSTRUCTIONS[modifier]) || fallback;
}

export function formatNavigationInstruction(
  step: NavigationStep,
  remainingMeters?: number,
): string {
  const modifier = step.modifier?.toLowerCase() ?? null;
  const type = step.type.toLowerCase();

  switch (type) {
    case "depart":
      return appendStreet("Inicia el recorrido", step.street_name);
    case "arrive":
      return remainingMeters !== undefined && remainingMeters >= 20
        ? "Continúa hasta el destino"
        : "Llegaste al destino";
    case "turn":
    case "end of road":
      return appendStreet(
        directionInstruction(modifier, "Continúa según la ruta"),
        step.street_name,
      );
    case "continue":
    case "new name":
      return appendStreet(
        directionInstruction(modifier, "Continúa por la vía"),
        step.street_name,
      );
    case "merge":
      return appendStreet(
        directionInstruction(modifier, "Incorpórate a la vía"),
        step.street_name,
      );
    case "on ramp":
      return appendStreet("Toma la incorporación", step.street_name);
    case "off ramp":
      return appendStreet("Toma la salida", step.street_name);
    case "fork":
      return appendStreet(
        directionInstruction(modifier, "Mantente en la bifurcación"),
        step.street_name,
      );
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      return appendStreet("Entra a la glorieta", step.street_name);
    case "exit rotary":
      return appendStreet("Sal de la glorieta", step.street_name);
    case "use lane":
      return "Usa el carril indicado";
    default:
      return appendStreet("Continúa siguiendo la ruta", step.street_name);
  }
}

export function formatNavigationStepDistance(
  step: NavigationStep,
  remainingMeters?: number,
): string {
  const distance = remainingMeters ?? step.distance_meters;
  if (step.type.toLowerCase() === "depart" || distance < 20) {
    return "Ahora";
  }
  return `En ${formatNavigationDistance(distance)}`;
}
