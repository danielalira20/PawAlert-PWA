import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import { CARTO_LIGHT_TILE_URL } from "../../constants/mapTiles";
import type { CaseNavigationMapProps } from "./CaseNavigationMap.types";
import {
  geoJsonLineStringToMapCoordinates,
  navigationMapBounds,
} from "./caseNavigationMap.utils";

interface LeafletProps extends CaseNavigationMapProps {
  width: number;
}

const originIcon = L.divIcon({
  className: "pawalert-navigation-origin",
  html: '<div aria-hidden="true" style="width:20px;height:20px;border-radius:50%;background:#4285F4;border:4px solid #FFFFFF;box-shadow:0 2px 8px rgba(46,42,38,.35)"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const destinationIcon = L.divIcon({
  className: "pawalert-navigation-destination",
  html: '<div aria-hidden="true" style="position:relative;width:24px;height:24px;border-radius:7px 7px 7px 2px;transform:rotate(-45deg);background:#EC802B;border:4px solid #FFFFFF;box-shadow:0 2px 8px rgba(46,42,38,.35)"><div style="width:6px;height:6px;border-radius:50%;background:#FFFFFF;position:absolute;left:5px;top:5px"></div></div>',
  iconSize: [24, 24],
  iconAnchor: [6, 22],
});

function FitNavigationBounds({
  coordinates,
  fitRequestId,
  width,
}: {
  coordinates: [number, number][];
  fitRequestId: number;
  width: number;
}) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    if (coordinates.length === 0) return;
    if (coordinates.length === 1) {
      map.setView(coordinates[0], 16);
      return;
    }
    map.fitBounds(coordinates, { padding: [36, 36], maxZoom: 17 });
  }, [coordinates, fitRequestId, map, width]);

  return null;
}

export default function CaseNavigationLeafletMap({
  origin,
  destination,
  geometry,
  width,
  height = 360,
  fitRequestId = 0,
}: LeafletProps) {
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
      ).map(
        ({ latitude, longitude }) => [latitude, longitude] as [number, number],
      ),
    [destinationCoordinate, originCoordinate, routeCoordinates],
  );
  const routePositions = useMemo(
    () =>
      routeCoordinates.map(
        ({ latitude, longitude }) => [latitude, longitude] as [number, number],
      ),
    [routeCoordinates],
  );

  return (
    <MapContainer
      center={[origin.latitude, origin.longitude]}
      zoom={15}
      style={{ width, height }}
      zoomControl
      scrollWheelZoom
    >
      <FitNavigationBounds
        coordinates={bounds}
        fitRequestId={fitRequestId}
        width={width}
      />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={CARTO_LIGHT_TILE_URL}
      />
      {routePositions.length >= 2 && (
        <Polyline
          positions={routePositions}
          pathOptions={{ color: "#2F8F87", weight: 6, opacity: 0.9 }}
        />
      )}
      <Marker position={[origin.latitude, origin.longitude]} icon={originIcon}>
        <Tooltip direction="top" offset={[0, -8]}>
          Tu ubicación
        </Tooltip>
      </Marker>
      <Marker
        position={[destination.latitude, destination.longitude]}
        icon={destinationIcon}
      >
        <Tooltip direction="top" offset={[0, -18]}>
          Última ubicación confirmada
        </Tooltip>
      </Marker>
    </MapContainer>
  );
}
