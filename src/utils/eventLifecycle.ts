import { EVENT_FORM_STEPS } from "../constants/eventForm";
import type { EventState } from "../types/event";

export type EventLifecycleAction = "publish" | "pause" | "cancel";

export interface EventActionLock {
  current: boolean;
}

export function acquireEventActionLock(lock: EventActionLock) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

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
