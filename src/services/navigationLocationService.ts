import * as Location from "expo-location";
import { Platform } from "react-native";

export interface NavigationDevicePosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
}

const WEB_LOCATION_TIMEOUT_MS = 15_000;

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
