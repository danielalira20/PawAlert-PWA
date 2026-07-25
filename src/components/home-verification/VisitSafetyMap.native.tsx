import MapView, { Marker, Polyline } from 'react-native-maps';
import { View } from 'react-native';

interface Props {
  homeLatitude: number;
  homeLongitude: number;
  checkInLatitude: number;
  checkInLongitude: number;
  height?: number;
}

export default function VisitSafetyMap({
  homeLatitude,
  homeLongitude,
  checkInLatitude,
  checkInLongitude,
  height = 230,
}: Props) {
  const latitudeDelta = Math.max(
    Math.abs(homeLatitude - checkInLatitude) * 2.4,
    0.008,
  );
  const longitudeDelta = Math.max(
    Math.abs(homeLongitude - checkInLongitude) * 2.4,
    0.008,
  );
  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden' }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{
          latitude: (homeLatitude + checkInLatitude) / 2,
          longitude: (homeLongitude + checkInLongitude) / 2,
          latitudeDelta,
          longitudeDelta,
        }}
      >
        <Polyline
          coordinates={[
            { latitude: homeLatitude, longitude: homeLongitude },
            { latitude: checkInLatitude, longitude: checkInLongitude },
          ]}
          strokeColor="#8C7A6B"
          strokeWidth={2}
        />
        <Marker
          coordinate={{ latitude: homeLatitude, longitude: homeLongitude }}
          title="Hogar declarado"
          pinColor="#EC802B"
        />
        <Marker
          coordinate={{ latitude: checkInLatitude, longitude: checkInLongitude }}
          title="Check-in del verificador"
          pinColor="#66BCB4"
        />
      </MapView>
    </View>
  );
}
