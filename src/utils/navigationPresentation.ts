import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

import type { NavigationStep } from "../types/navigation";

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

export function formatNavigationInstruction(step: NavigationStep): string {
  const modifier = step.modifier?.toLowerCase() ?? null;
  const type = step.type.toLowerCase();

  switch (type) {
    case "depart":
      return appendStreet("Inicia el recorrido", step.street_name);
    case "arrive":
      return "Llegaste al destino";
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

export function formatNavigationStepDistance(step: NavigationStep): string {
  if (step.type.toLowerCase() === "depart" || step.distance_meters < 20) {
    return "Ahora";
  }
  return `En ${formatNavigationDistance(step.distance_meters)}`;
}
