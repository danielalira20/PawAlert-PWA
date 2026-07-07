import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Pattern, G, Rect, Image as SvgImage, Ellipse } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import { Logo } from './Logo';

const ILUSTRACION = require('../../../assets/images/rescue-illustration.jpg');

export function DesktopHeroPanel() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {size && (
        <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFillObject}>
          

          <SvgImage
            href={ILUSTRACION}
            x="0"
            y="0"
            width={size.width}
            height={size.height}
            preserveAspectRatio="xMidYMid slice"
          />
          <Rect width={size.width} height={size.height} fill="url(#paws)" />
        </Svg>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(46,30,10,0.05)', 'rgba(46,30,10,0.78)']}
        locations={[0, 0.5, 1]}
        style={styles.scrim}
      />

      <BlurView intensity={35} tint="light" style={styles.logoBadge}>
        <Logo />
      </BlurView>

      
     
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative', backgroundColor: Brand.cardWarm, overflow: 'hidden' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%' },
  logoBadge: {
    position: 'absolute',
    top: 20,
    left: 24,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  floatingBadge: {
    position: 'absolute',
    top: '13%',
    right: '10%',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  floatingHeart: { position: 'absolute', bottom: -3, right: -3 },
  caption: {
    position: 'absolute',
    bottom: 28,
    left: 28,
    right: 28,
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
});