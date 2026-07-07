import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Pattern, G, Rect, Ellipse } from 'react-native-svg';

// Fondo de textura: huellitas repetidas muy tenues detrás de todo el
// contenido — mismo patrón que ya usamos en DesktopHeroPanel, aplicado
// esta vez a la pantalla completa en vez de solo al panel de ilustración.
export function PawPatternBackground() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={StyleSheet.absoluteFillObject} onLayout={handleLayout} pointerEvents="none">
      {size && (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <Pattern id="paws-bg" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
              <G fill="#C9A578" opacity={0.16} transform="translate(20,30) rotate(-18)">
                <Ellipse cx="0" cy="0" rx="7" ry="9" />
                <Ellipse cx="-11" cy="-9" rx="3.2" ry="4.2" />
                <Ellipse cx="-4" cy="-14" rx="3.2" ry="4.2" />
                <Ellipse cx="5" cy="-14" rx="3.2" ry="4.2" />
                <Ellipse cx="12" cy="-9" rx="3.2" ry="4.2" />
              </G>
              <G fill="#C9A578" opacity={0.16} transform="translate(85,85) rotate(24)">
                <Ellipse cx="0" cy="0" rx="7" ry="9" />
                <Ellipse cx="-11" cy="-9" rx="3.2" ry="4.2" />
                <Ellipse cx="-4" cy="-14" rx="3.2" ry="4.2" />
                <Ellipse cx="5" cy="-14" rx="3.2" ry="4.2" />
                <Ellipse cx="12" cy="-9" rx="3.2" ry="4.2" />
              </G>
            </Pattern>
          </Defs>
          <Rect width={size.width} height={size.height} fill="url(#paws-bg)" />
        </Svg>
      )}
    </View>
  );
}