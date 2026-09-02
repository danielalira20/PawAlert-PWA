import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, Circle, TileLayer } from 'react-leaflet';
import { CARTO_LIGHT_TILE_URL } from '@/constants/mapTiles';

const pinIcon = L.divIcon({
  className: 'assoc-pin',
  html: `<div style="
    width: 20px; height: 20px; border-radius: 50%;
    background-color: #EC802B; border: 2px solid white;
    box-shadow: 0 0 4px rgba(0,0,0,0.4);
  "></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

interface Props {
  latitud: number;
  longitud: number;
  radioKm: number;
  width: number;
  height: number;
}

export default function AssocLeafletMap({ latitud, longitud, radioKm, width, height }: Props) {
  return (
    <MapContainer
      center={[latitud, longitud]}
      zoom={11}
      style={{ width, height }}
      zoomControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={CARTO_LIGHT_TILE_URL}
      />
      <Circle
        center={[latitud, longitud]}
        radius={radioKm * 1000}
        pathOptions={{
          color: '#66BCB4',
          fillColor: '#66BCB4',
          fillOpacity: 0.15,
          weight: 1.5,
          dashArray: '5 3',
        }}
      />
      <Marker position={[latitud, longitud]} icon={pinIcon} />
    </MapContainer>
  );
}
