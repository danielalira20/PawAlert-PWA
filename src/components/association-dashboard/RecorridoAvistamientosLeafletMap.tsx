import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import { CARTO_LIGHT_TILE_URL } from '@/constants/mapTiles';
import { useEffect } from 'react';
import type { PuntoRecorrido } from './recorridoAvistamientos.types';

const origenIcon = L.divIcon({
  className: 'recorrido-origen-pin',
  html: '<div style="width:16px;height:16px;border-radius:4px;background:#8C7A6B;border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,.35)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const trayectoIcon = L.divIcon({
  className: 'recorrido-trayecto-pin',
  html: '<div style="width:12px;height:12px;border-radius:50%;background:#66BCB4;border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,.35)"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const masRecienteIcon = L.divIcon({
  className: 'recorrido-mas-reciente-pin',
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#EC802B;border:3px solid white;box-shadow:0 1px 6px rgba(0,0,0,.45)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function iconoPara(punto: PuntoRecorrido) {
  if (punto.esMasReciente) return masRecienteIcon;
  if (punto.esOrigen) return origenIcon;
  return trayectoIcon;
}

interface Props {
  puntos: PuntoRecorrido[];
  width: number;
  height: number;
}

function FitRecorridoBounds({ puntos }: { puntos: PuntoRecorrido[] }) {
  const map = useMap();
  useEffect(() => {
    if (puntos.length === 0) return;
    if (puntos.length === 1) {
      map.setView([puntos[0].latitud, puntos[0].longitud], 16);
      return;
    }
    map.fitBounds(
      puntos.map((p) => [p.latitud, p.longitud] as [number, number]),
      { padding: [32, 32], maxZoom: 17 },
    );
  }, [map, puntos]);
  return null;
}

export default function RecorridoAvistamientosLeafletMap({ puntos, width, height }: Props) {
  if (puntos.length === 0) {
    return null;
  }

  return (
    <MapContainer
      center={[puntos[0].latitud, puntos[0].longitud]}
      zoom={16}
      style={{ width, height }}
      zoomControl
      scrollWheelZoom={false}
    >
      <FitRecorridoBounds puntos={puntos} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={CARTO_LIGHT_TILE_URL}
      />
      <Polyline
        positions={puntos.map((p) => [p.latitud, p.longitud] as [number, number])}
        pathOptions={{ color: '#8C7A6B', weight: 2, dashArray: '6 6' }}
      />
      {puntos.map((punto, indice) => (
        <Marker
          key={`${punto.latitud}-${punto.longitud}-${indice}`}
          position={[punto.latitud, punto.longitud]}
          icon={iconoPara(punto)}
        />
      ))}
    </MapContainer>
  );
}
