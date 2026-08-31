import { EVENT_FORM_STEPS } from "../constants/eventForm";
import type { EventState } from "../types/event";

export type EventLifecycleAction = "publish" | "pause" | "cancel";

export function getEventLifecycleActions(
  state: EventState,
): EventLifecycleAction[] {
  if (state === "borrador") return ["publish"];
  if (state === "publicado") return ["pause", "cancel"];
  if (state === "pausado") return ["publish", "cancel"];
  return [];
}

export function getIncompleteEventSteps(completed: boolean[]) {
  return EVENT_FORM_STEPS.filter((_, index) => !completed[index]);
}
