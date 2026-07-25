import { lazy, Suspense, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  View,
} from 'react-native';

const VisitSafetyLeafletMap = lazy(() => import('./VisitSafetyLeafletMap'));

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
  const [width, setWidth] = useState(0);
  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={handleLayout}
      style={{ height, borderRadius: 16, overflow: 'hidden' }}
    >
      {width > 0 && (
        <Suspense
          fallback={(
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#66BCB4" />
            </View>
          )}
        >
          <VisitSafetyLeafletMap
            homeLatitude={homeLatitude}
            homeLongitude={homeLongitude}
            checkInLatitude={checkInLatitude}
            checkInLongitude={checkInLongitude}
            width={width}
            height={height}
          />
        </Suspense>
      )}
    </View>
  );
}
