import { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

import { Brand } from "../../constants/theme";
import type { CaseNavigationMapProps } from "./CaseNavigationMap.types";
import {
  geoJsonLineStringToMapCoordinates,
  navigationMapBounds,
  regionForNavigationPoints,
} from "./caseNavigationMap.utils";

export default function CaseNavigationMap({
  origin,
  destination,
  geometry,
  height = 360,
  fitRequestId = 0,
}: CaseNavigationMapProps) {
  const mapRef = useRef<MapView>(null);
  const originCoordinate = useMemo(
    () => ({ latitude: origin.latitude, longitude: origin.longitude }),
    [origin.latitude, origin.longitude],
  );
  const destinationCoordinate = useMemo(
    () => ({
      latitude: destination.latitude,
      longitude: destination.longitude,
    }),
    [destination.latitude, destination.longitude],
  );
  const routeCoordinates = useMemo(
    () => geoJsonLineStringToMapCoordinates(geometry),
    [geometry],
  );
  const bounds = useMemo(
    () =>
      navigationMapBounds(
        originCoordinate,
        destinationCoordinate,
        routeCoordinates,
      ),
    [destinationCoordinate, originCoordinate, routeCoordinates],
  );
  const initialRegion = useMemo(
    () => regionForNavigationPoints(bounds),
    [bounds],
  );
  const fitRoute = useCallback(() => {
    if (bounds.length === 0) return;
    mapRef.current?.fitToCoordinates(bounds, {
      edgePadding: { top: 52, right: 42, bottom: 52, left: 42 },
      animated: true,
    });
  }, [bounds]);

  useEffect(() => {
    fitRoute();
  }, [fitRequestId, fitRoute, height]);

  return (
    <View
      accessibilityLabel="Mapa de navegación del caso"
      style={[styles.container, { height }]}
    >
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        onMapReady={fitRoute}
      >
        {routeCoordinates.length >= 2 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#2F8F87"
            strokeWidth={6}
          />
        )}
        <Marker coordinate={originCoordinate} title="Tu ubicación">
          <View style={styles.originMarker} />
        </Marker>
        <Marker
          coordinate={destinationCoordinate}
          title="Última ubicación confirmada"
        >
          <View style={styles.destinationMarker}>
            <View style={styles.destinationCenter} />
          </View>
        </Marker>
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 260,
    overflow: "hidden",
    backgroundColor: "#E9ECE8",
  },
  originMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Brand.info,
    borderWidth: 4,
    borderColor: "#FFFFFF",
  },
  destinationMarker: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Brand.primary,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "45deg" }],
  },
  destinationCenter: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
});
