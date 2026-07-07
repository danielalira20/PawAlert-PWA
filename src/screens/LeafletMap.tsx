import L from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { Reporte } from '../types/reporte';

const INITIAL_CENTER: [number, number] = [19.0414, -98.2063];
const INITIAL_ZOOM = 13;

const createColoredIcon = (color: string) =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background-color: ${color};
      border: 2px solid white;
      box-shadow: 0 0 4px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

function MapClickHandler({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({ click: onMapClick });
  return null;
}

interface LeafletMapProps {
  reportes: Reporte[];
  getMarkerColor: (estado: string) => string;
  onSelectReport: (reporte: Reporte) => void;
  onMapClick: () => void;
  width: number;
  height: number;
}

export default function LeafletMap({ reportes, getMarkerColor, onSelectReport, onMapClick, width, height }: LeafletMapProps) {
  useEffect(() => {
    const linkId = 'leaflet-css';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.crossOrigin = '';
      document.head.appendChild(link);
    }
  }, []);

  return (
    <MapContainer center={INITIAL_CENTER} zoom={INITIAL_ZOOM} style={{ width, height }}>
      <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
      <MapClickHandler onMapClick={onMapClick} />
      {reportes
        .filter((r): r is typeof r & { latitud: number; longitud: number } => r.latitud !== null && r.longitud !== null)
        .map((reporte) => (
          <Marker
            key={reporte.id}
            position={[reporte.latitud, reporte.longitud]}
            icon={createColoredIcon(getMarkerColor(reporte.animal?.condicion ?? ''))}
            eventHandlers={{ click: () => onSelectReport(reporte) }}
          />
        ))}
    </MapContainer>
  );
}