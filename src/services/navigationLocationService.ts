import * as Location from "expo-location";
import { Platform } from "react-native";

export interface NavigationDevicePosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
}

const WEB_LOCATION_TIMEOUT_MS = 15_000;
const TRACKING_TIME_INTERVAL_MS = 5_000;
const TRACKING_DISTANCE_INTERVAL_METERS = 5;

function normalizePosition(
  latitude: number,
  longitude: number,
  accuracy: number | null,
  timestamp: number,
): NavigationDevicePosition {
  return {
    latitude,
    longitude,
    accuracyMeters:
      accuracy !== null && Number.isFinite(accuracy) && accuracy > 0
        ? accuracy
        : null,
    capturedAt: new Date(timestamp).toISOString(),
  };
}

export function getFreshWebNavigationPosition(): Promise<NavigationDevicePosition> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Geolocalización no disponible."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(
          normalizePosition(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy,
            position.timestamp,
          ),
        );
      },
      reject,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: WEB_LOCATION_TIMEOUT_MS,
      },
    );
  });
}

export async function getFreshNavigationPosition(): Promise<NavigationDevicePosition> {
  if (Platform.OS === "web") {
    return getFreshWebNavigationPosition();
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return normalizePosition(
    position.coords.latitude,
    position.coords.longitude,
    position.coords.accuracy,
    position.timestamp,
  );
}

export async function watchNavigationPosition(
  onPosition: (position: NavigationDevicePosition) => void,
  onError?: (error: unknown) => void,
): Promise<() => void> {
  if (Platform.OS === "web") {
    return watchWebNavigationPosition(onPosition, onError);
  }

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: TRACKING_TIME_INTERVAL_MS,
      distanceInterval: TRACKING_DISTANCE_INTERVAL_METERS,
    },
    (position) => {
      onPosition(
        normalizePosition(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy,
          position.timestamp,
        ),
      );
    },
  );
  return () => subscription.remove();
}

export function watchWebNavigationPosition(
  onPosition: (position: NavigationDevicePosition) => void,
  onError?: (error: unknown) => void,
): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Geolocalización no disponible.");
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onPosition(
        normalizePosition(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy,
          position.timestamp,
        ),
      );
    },
    onError,
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: WEB_LOCATION_TIMEOUT_MS,
    },
  );
  return () => navigator.geolocation.clearWatch(watchId);
}
