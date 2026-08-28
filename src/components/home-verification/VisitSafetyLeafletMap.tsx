import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import { CARTO_LIGHT_TILE_URL } from '@/constants/mapTiles';
import { useEffect } from 'react';

const homeIcon = L.divIcon({
  className: 'visit-home-pin',
  html: '<div style="width:18px;height:18px;border-radius:5px;background:#EC802B;border:3px solid white;box-shadow:0 1px 5px rgba(0,0,0,.35)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const checkInIcon = L.divIcon({
  className: 'visit-checkin-pin',
  html: '<div style="width:20px;height:20px;border-radius:50%;background:#66BCB4;border:3px solid white;box-shadow:0 1px 5px rgba(0,0,0,.35)"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

interface Props {
  homeLatitude: number;
  homeLongitude: number;
  checkInLatitude: number;
  checkInLongitude: number;
  width: number;
  height: number;
}

function FitVisitBounds({
  homeLatitude,
  homeLongitude,
  checkInLatitude,
  checkInLongitude,
}: Omit<Props, 'width' | 'height'>) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(
      [
        [homeLatitude, homeLongitude],
        [checkInLatitude, checkInLongitude],
      ],
      { padding: [32, 32], maxZoom: 17 },
    );
  }, [map, homeLatitude, homeLongitude, checkInLatitude, checkInLongitude]);
  return null;
}

export default function VisitSafetyLeafletMap({
  homeLatitude,
  homeLongitude,
  checkInLatitude,
  checkInLongitude,
  width,
  height,
}: Props) {
  return (
    <MapContainer
      center={[homeLatitude, homeLongitude]}
      zoom={16}
      style={{ width, height }}
      zoomControl
      scrollWheelZoom={false}
    >
      <FitVisitBounds
        homeLatitude={homeLatitude}
        homeLongitude={homeLongitude}
        checkInLatitude={checkInLatitude}
        checkInLongitude={checkInLongitude}
      />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={CARTO_LIGHT_TILE_URL}
      />
      <Polyline
        positions={[
          [homeLatitude, homeLongitude],
          [checkInLatitude, checkInLongitude],
        ]}
        pathOptions={{ color: '#8C7A6B', weight: 2, dashArray: '6 6' }}
      />
      <Marker position={[homeLatitude, homeLongitude]} icon={homeIcon} />
      <Marker position={[checkInLatitude, checkInLongitude]} icon={checkInIcon} />
    </MapContainer>
  );
}
