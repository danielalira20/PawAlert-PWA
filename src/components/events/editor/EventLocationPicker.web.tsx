import { lazy, Suspense, useState } from "react";
import { ActivityIndicator, LayoutChangeEvent, View } from "react-native";

import { EventTheme } from "../../../constants/eventTheme";

const EventLeafletPicker = lazy(() => import("./EventLeafletPicker"));

interface Props {
  latitud: number | null;
  longitud: number | null;
  onChange: (latitud: number, longitud: number) => void;
}

export function EventLocationPicker({ latitud, longitud, onChange }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const handleLayout = (event: LayoutChangeEvent) =>
    setSize({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });

  return (
    <View
      onLayout={handleLayout}
      style={{
        borderRadius: EventTheme.radii.control,
        height: 240,
        overflow: "hidden",
      }}
    >
      {size && (
        <Suspense
          fallback={
            <View
              style={{
                alignItems: "center",
                flex: 1,
                justifyContent: "center",
              }}
            >
              <ActivityIndicator color={EventTheme.colors.primary} />
            </View>
          }
        >
          <EventLeafletPicker
            height={size.height}
            latitud={latitud}
            longitud={longitud}
            onChange={onChange}
            width={size.width}
          />
        </Suspense>
      )}
    </View>
  );
}
