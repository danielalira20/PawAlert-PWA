import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Ellipse, Circle, Path, Text as SvgText } from 'react-native-svg';
import { Brand } from '../../constants/theme';

const ILLUSTRATION_SIZE = 100;
const CIRCLE_SIZE = ILLUSTRATION_SIZE * 1.36; // misma proporción que el original (w-36 vs el svg de 100)

export function RecentReportsEmptyState() {
  // TODO: ajusta esta ruta a donde de verdad viva el flujo de "crear reporte"
  // en tu navegación (probablemente el tab de Mapa/Inicio con el FAB).
  const irAReportar = () => router.push('/map');

  return (
    <View style={styles.container}>
      {/* Ilustración — traducida directo del SVG del mockup */}
      <View style={styles.illustrationWrap}>
        <View style={styles.circleBg}>
          <Svg width={ILLUSTRATION_SIZE} height={ILLUSTRATION_SIZE} viewBox="0 0 130 130" fill="none">
            {/* Sombra */}
            <Ellipse cx="65" cy="118" rx="28" ry="6" fill="rgba(46,42,38,0.07)" />
            {/* Cuerpo */}
            <Ellipse cx="65" cy="88" rx="26" ry="22" fill="#EDC55B" />
            {/* Cabeza */}
            <Circle cx="65" cy="60" r="24" fill="#EDC55B" />
            {/* Orejas */}
            <Ellipse cx="46" cy="43" rx="9" ry="13" fill="#EC802B" transform="rotate(-20 46 43)" />
            <Ellipse cx="84" cy="43" rx="9" ry="13" fill="#EC802B" transform="rotate(20 84 43)" />
            {/* Ojos */}
            <Circle cx="57" cy="57" r="4.5" fill="#2E2A26" />
            <Circle cx="73" cy="57" r="4.5" fill="#2E2A26" />
            <Circle cx="58.5" cy="55.5" r="1.8" fill="white" />
            <Circle cx="74.5" cy="55.5" r="1.8" fill="white" />
            {/* Nariz */}
            <Ellipse cx="65" cy="66" rx="4" ry="3" fill="#2E2A26" />
            {/* Boca neutral */}
            <Path d="M59 71 Q65 68 71 71" stroke="#2E2A26" strokeWidth="2" strokeLinecap="round" fill="none" />
            {/* Patas delanteras */}
            <Ellipse cx="50" cy="106" rx="11" ry="9" fill="#EC802B" />
            <Ellipse cx="80" cy="106" rx="11" ry="9" fill="#EC802B" />
            {/* Cola */}
            <Path d="M91 84 Q110 72 107 56" stroke="#EC802B" strokeWidth="9" strokeLinecap="round" fill="none" />
            {/* Globo con "?" */}
            <Circle cx="96" cy="36" r="14" fill="#66BCB4" />
            <SvgText x="96" y="41" textAnchor="middle" fontSize="17" fontWeight="800" fill="white">
              ?
            </SvgText>
          </Svg>
        </View>

        {/* Huellita flotante en la esquina */}
        <View style={styles.floatingPaw}>
          <Ionicons name="paw" size={16} color="#66BCB4" />
        </View>
      </View>

      <Text style={styles.title}>Aún no has hecho ningún reporte</Text>
      <Text style={styles.subtitle}>
        Cuando encuentres un animal en situación de riesgo, puedes reportarlo para que alguien lo ayude
        rápidamente.
      </Text>

      <TouchableOpacity onPress={irAReportar} activeOpacity={0.85} style={styles.ctaButton}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.ctaText}>Reportar un animal</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 20 },

  illustrationWrap: {
    position: 'relative',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBg: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: '#F5EDE2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingPaw: {
    position: 'absolute',
    top: 4,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E6F6F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: { fontSize: 19, fontWeight: '800', color: Brand.textDark, textAlign: 'center' },
  subtitle: { fontSize: 13, color: Brand.textFaint, textAlign: 'center', lineHeight: 19, maxWidth: 320 },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Brand.primary,
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: Brand.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});