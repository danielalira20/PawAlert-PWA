import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  type NavigationDevicePosition,
  watchNavigationPosition,
} from "../services/navigationLocationService";

export type ForegroundNavigationTrackingState =
  | "idle"
  | "starting"
  | "active"
  | "paused"
  | "error";

interface ForegroundNavigationTracking {
  position: NavigationDevicePosition | null;
  state: ForegroundNavigationTrackingState;
}

function isForeground(state: AppStateStatus | null): boolean {
  return state === null || state === "active";
}

export function useForegroundNavigationTracking(
  enabled: boolean,
): ForegroundNavigationTracking {
  const [position, setPosition] = useState<NavigationDevicePosition | null>(null);
  const [state, setState] =
    useState<ForegroundNavigationTrackingState>("idle");

  useEffect(() => {
    if (!enabled) {
      setPosition(null);
      setState("idle");
      return;
    }

    let disposed = false;
    let starting = false;
    let generation = 0;
    let stopWatching: (() => void) | null = null;

    const stop = (nextState: ForegroundNavigationTrackingState) => {
      generation += 1;
      starting = false;
      stopWatching?.();
      stopWatching = null;
      if (!disposed) setState(nextState);
    };

    const start = async () => {
      if (disposed || starting || stopWatching) return;
      starting = true;
      const currentGeneration = ++generation;
      setState("starting");
      try {
        const unsubscribe = await watchNavigationPosition(
          (nextPosition) => {
            if (disposed || currentGeneration !== generation) return;
            setPosition(nextPosition);
            setState("active");
          },
          () => {
            if (disposed || currentGeneration !== generation) return;
            setState("error");
          },
        );
        starting = false;
        if (
          disposed ||
          currentGeneration !== generation ||
          !isForeground(AppState.currentState)
        ) {
          unsubscribe();
          return;
        }
        stopWatching = unsubscribe;
      } catch {
        starting = false;
        if (!disposed && currentGeneration === generation) setState("error");
      }
    };

    if (isForeground(AppState.currentState)) {
      void start();
    } else {
      setState("paused");
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (isForeground(nextState)) {
        void start();
      } else {
        stop("paused");
      }
    });

    return () => {
      disposed = true;
      generation += 1;
      subscription.remove();
      stopWatching?.();
      stopWatching = null;
    };
  }, [enabled]);

  return { position, state };
}
