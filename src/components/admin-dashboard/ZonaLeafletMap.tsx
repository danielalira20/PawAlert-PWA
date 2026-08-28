import React, { useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, Circle, Popup, TileLayer } from 'react-leaflet';
import { CARTO_LIGHT_TILE_URL } from '@/constants/mapTiles';
import type { ZonaStat } from './ZonaHeatMap.web';

const NIVEL_COLOR: Record<string, string> = {
  rojo: '#E74C3C',
  amarillo: '#F39C12',
  verde: '#27AE60',
};

const claveZona = (z: ZonaStat) => `${z.latitud}-${z.longitud}`;

// Anillos concéntricos con opacidad decreciente — Leaflet no soporta un
// fillColor con degradado radial nativo, así que se simula apilando varios
// círculos (mismo criterio que ZonaGlow en LeafletMap.tsx).
const ANILLOS_GLOW = [
  { factor: 1, opacity: 0.05 },
  { factor: 0.7, opacity: 0.09 },
  { factor: 0.45, opacity: 0.16 },
  { factor: 0.22, opacity: 0.3 },
];

function ZonaGlow({ zona }: { zona: ZonaStat }) {
  const color = NIVEL_COLOR[zona.nivel_urgencia_max ?? ''] ?? '#95A5A6';
  const radioBase = 500 + zona.cantidad * 180;
  return (
    <>
      {ANILLOS_GLOW.map((anillo) => (
        <Circle
          key={anillo.factor}
          center={[zona.latitud, zona.longitud]}
          radius={radioBase * anillo.factor}
          pathOptions={{ stroke: false, fillColor: color, fillOpacity: anillo.opacity }}
        />
      ))}
    </>
  );
}

function crearPinZona(cantidad: number, nivel: string | null, seleccionada: boolean) {
  const color = NIVEL_COLOR[nivel ?? ''] ?? '#95A5A6';
  const size = seleccionada ? 36 : 30;
  const html = `
    <div style="
      width:${size}px; height:${size}px; border-radius:50%;
      background:${color}; border:2px solid #FFFFFF;
      display:flex; align-items:center; justify-content:center;
      font-size:12px; font-weight:800; color:#FFFFFF; font-family:sans-serif;
      box-shadow:0 2px 8px ${color}88;
    ">${cantidad}</div>`;
  return L.divIcon({
    className: 'zona-heat-pin',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

interface Props {
  zonas: ZonaStat[];
  width: number;
  height: number;
}

export default function ZonaLeafletMap({ zonas, width, height }: Props) {
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const posiciones = zonas.map((z): [number, number] => [z.latitud, z.longitud]);
  const zonaActiva = zonas.find((z) => claveZona(z) === seleccionada) ?? null;

  return (
    <MapContainer
      bounds={posiciones.length > 1 ? posiciones : undefined}
      center={posiciones.length === 1 ? posiciones[0] : undefined}
      zoom={posiciones.length === 1 ? 13 : undefined}
      boundsOptions={{ padding: [30, 30] }}
      style={{ width, height }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={CARTO_LIGHT_TILE_URL}
      />
      {/* Zona seleccionada: circulo difuminado tipo "mapa de calor",
          solo aparece al hacer click en un pin — no todas a la vez, para
          no saturar el mapa. */}
      {zonaActiva && <ZonaGlow zona={zonaActiva} />}
      {zonas.map((zona) => {
        const clave = claveZona(zona);
        return (
          <Marker
            key={clave}
            position={[zona.latitud, zona.longitud]}
            icon={crearPinZona(zona.cantidad, zona.nivel_urgencia_max, clave === seleccionada)}
            eventHandlers={{
              click: () => setSeleccionada((actual) => (actual === clave ? null : clave)),
            }}
          >
            <Popup closeButton={false} offset={[0, -6]}>
              {zona.cantidad} {zona.cantidad === 1 ? 'reporte' : 'reportes'} en esta zona
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
