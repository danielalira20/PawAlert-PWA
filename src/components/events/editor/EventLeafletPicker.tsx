import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

const pinIcon = L.divIcon({
  className: "event-editor-pin",
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#EC802B;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function ClickHandler({
  onChange,
}: {
  onChange: (latitud: number, longitud: number) => void;
}) {
  useMapEvents({
    click: (event) => onChange(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

interface Props {
  latitud: number | null;
  longitud: number | null;
  onChange: (latitud: number, longitud: number) => void;
  width: number;
  height: number;
}

export default function EventLeafletPicker({
  latitud,
  longitud,
  onChange,
  width,
  height,
}: Props) {
  const center: [number, number] = [latitud ?? 19.4326, longitud ?? -99.1332];
  return (
    <MapContainer
      key={`${center[0]}-${center[1]}`}
      center={center}
      zoom={13}
      style={{ width, height }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <ClickHandler onChange={onChange} />
      {latitud != null && longitud != null && (
        <Marker
          draggable
          eventHandlers={{
            dragend: (event) => {
              const point = event.target.getLatLng();
              onChange(point.lat, point.lng);
            },
          }}
          icon={pinIcon}
          position={[latitud, longitud]}
        />
      )}
    </MapContainer>
  );
}
