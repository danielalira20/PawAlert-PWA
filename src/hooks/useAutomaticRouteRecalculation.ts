import { useEffect, useRef, useState } from "react";

import type { NavigationGeometry, NavigationOrigin } from "../types/navigation";
import {
  navigationDistanceBetweenMeters,
  navigationDistanceToRouteMeters,
} from "../utils/navigationGeometry";

const OFF_ROUTE_THRESHOLD_METERS = 100;
const MAX_TRACKING_ACCURACY_METERS = 100;
const REQUIRED_OFF_ROUTE_READINGS = 3;
const EXPIRED_ROUTE_MOVEMENT_METERS = 50;
const MINIMUM_ROUTE_AGE_MS = 35_000;
const AUTO_RECALCULATION_COOLDOWN_MS = 60_000;

export type AutomaticRouteRecalculationState =
  | "monitoring"
  | "gps_imprecise"
  | "suspected"
  | "off_route"
  | "stale_route"
  | "recalculating"
  | "cooldown";

export type AutomaticRouteRecalculationTrigger =
  | "off_route"
  | "stale_route";

interface Options {
  enabled: boolean;
  origin: NavigationOrigin | null;
  routeOrigin: NavigationOrigin | null;
  geometry: NavigationGeometry | null;
  routeCalculatedAt: string | null;
  routeExpiresAt: string | null;
  isRefreshing: boolean;
  onRecalculate: () => Promise<void>;
}

interface Result {
  state: AutomaticRouteRecalculationState;
  trigger: AutomaticRouteRecalculationTrigger | null;
  distanceFromRouteMeters: number | null;
}

export function useAutomaticRouteRecalculation({
  enabled,
  origin,
  routeOrigin,
  geometry,
  routeCalculatedAt,
  routeExpiresAt,
  isRefreshing,
  onRecalculate,
}: Options): Result {
  const [state, setState] =
    useState<AutomaticRouteRecalculationState>("monitoring");
  const [distanceFromRouteMeters, setDistanceFromRouteMeters] = useState<
    number | null
  >(null);
  const [trigger, setTrigger] =
    useState<AutomaticRouteRecalculationTrigger | null>(null);
  const offRouteReadingsRef = useRef(0);
  const routeSeenAtRef = useRef(Date.now());
  const lastAttemptAtRef = useRef<number | null>(null);
  const lastPositionKeyRef = useRef<string | null>(null);
  const routeGenerationRef = useRef(0);

  useEffect(() => {
    routeGenerationRef.current += 1;
    routeSeenAtRef.current = Date.now();
    offRouteReadingsRef.current = 0;
    lastPositionKeyRef.current = null;
    setDistanceFromRouteMeters(null);
    setTrigger(null);
    setState("monitoring");
  }, [geometry, routeCalculatedAt]);

  useEffect(() => {
    if (!enabled || !origin || !geometry) {
      offRouteReadingsRef.current = 0;
      lastPositionKeyRef.current = null;
      setDistanceFromRouteMeters(null);
      setTrigger(null);
      setState("monitoring");
      return;
    }

    const positionKey = `${origin.captured_at ?? ""}:${origin.latitude}:${origin.longitude}`;
    if (positionKey === lastPositionKeyRef.current) return;
    lastPositionKeyRef.current = positionKey;

    if (
      origin.accuracy_meters !== null &&
      origin.accuracy_meters > MAX_TRACKING_ACCURACY_METERS
    ) {
      offRouteReadingsRef.current = 0;
      setDistanceFromRouteMeters(null);
      setTrigger(null);
      setState("gps_imprecise");
      return;
    }

    const distance = navigationDistanceToRouteMeters(origin, geometry);
    setDistanceFromRouteMeters(distance);
    if (distance === null) {
      offRouteReadingsRef.current = 0;
      setTrigger(null);
      setState("monitoring");
      return;
    }

    const accuracyMargin = Math.max(origin.accuracy_meters ?? 0, 0);
    const isOffRoute = distance > OFF_ROUTE_THRESHOLD_METERS + accuracyMargin;
    const expiresAt = routeExpiresAt ? new Date(routeExpiresAt).getTime() : NaN;
    const movedFromRouteOrigin = routeOrigin
      ? navigationDistanceBetweenMeters(origin, routeOrigin)
      : 0;
    const isStaleAfterMovement =
      Number.isFinite(expiresAt) &&
      Date.now() >= expiresAt &&
      movedFromRouteOrigin >= EXPIRED_ROUTE_MOVEMENT_METERS;

    if (!isOffRoute) {
      offRouteReadingsRef.current = 0;
    } else {
      offRouteReadingsRef.current += 1;
    }

    const confirmedOffRoute =
      offRouteReadingsRef.current >= REQUIRED_OFF_ROUTE_READINGS;
    if (!isStaleAfterMovement && !confirmedOffRoute) {
      setTrigger(null);
      if (!isOffRoute) {
        setState("monitoring");
        return;
      }
      setState("suspected");
      return;
    }

    const nextTrigger: AutomaticRouteRecalculationTrigger =
      isStaleAfterMovement ? "stale_route" : "off_route";
    setTrigger(nextTrigger);

    const now = Date.now();
    const lastAttemptAt = lastAttemptAtRef.current;
    const routeIsOldEnough =
      nextTrigger === "stale_route" ||
      now - routeSeenAtRef.current >= MINIMUM_ROUTE_AGE_MS;
    const cooldownFinished =
      lastAttemptAt === null ||
      now - lastAttemptAt >= AUTO_RECALCULATION_COOLDOWN_MS;
    if (!routeIsOldEnough || !cooldownFinished) {
      setState(
        lastAttemptAt === null
          ? nextTrigger === "stale_route"
            ? "stale_route"
            : "off_route"
          : "cooldown",
      );
      return;
    }
    if (isRefreshing) {
      setState("recalculating");
      return;
    }

    lastAttemptAtRef.current = now;
    const generation = routeGenerationRef.current;
    setState("recalculating");
    void onRecalculate().finally(() => {
      if (generation === routeGenerationRef.current) setState("cooldown");
    });
  }, [
    enabled,
    geometry,
    isRefreshing,
    onRecalculate,
    origin,
    routeExpiresAt,
    routeOrigin,
  ]);

  return { state, trigger, distanceFromRouteMeters };
}
