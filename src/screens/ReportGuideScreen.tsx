import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// ─── DESIGN TOKENS ──────────────────────────────────────────────────────────
const C = {
  primary: '#F5842B',
  primaryLight: '#F1D5B6',
  secondary: '#66C5BD',
  accent: '#F6CE5B',
  neutralLight: '#E8CCAD',
  text: '#2E2A26',
  bg: '#FFFFFF',
  bgSoft: '#FDF8F4',
  muted: '#9E8C7E',
};

const F = {
  displayBold: 'Fraunces_800ExtraBold',
  displaySemi: 'Fraunces_800ExtraBold',
  bodyRegular: 'Poppins_400Regular',
  bodyMedium: 'Poppins_500Medium',
  bodySemiBold: 'Poppins_600SemiBold',
};

const isWeb = Platform.OS === 'web';

// ─── COMPONENTS ─────────────────────────────────────────────────────────────
function AnimatedButton({ onPress, style, children }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start()}
        activeOpacity={1}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

function PawDecor({ top, left, right, bottom, size = 32, opacity = 0.08, color = C.primary, rotate }: any) {
  return (
    <View
      style={{
        position: 'absolute', top, left, right, bottom,
        width: size, height: size,
        alignItems: 'center', justifyContent: 'center', opacity,
        ...(rotate ? { transform: [{ rotate: `${rotate}deg` }] } : {}),
      }}
    >
      <Ionicons name="paw" size={size} color={color} />
    </View>
  );
}

// ─── DATA ───────────────────────────────────────────────────────────────────
const GUIDE_STEPS = [
  { title: '1. Mantén la calma y asegura la zona', content: 'No asustes al animal. Si está en una vía transitada, prioriza tu seguridad y la de él antes de acercarte.' },
  { title: '2. Toma una fotografía clara', content: 'Intenta capturar al animal de cuerpo entero y que se vean sus características principales (color, tamaño, collar si tiene).' },
  { title: '3. Abre la aplicación y reporta', content: 'Ingresa a la vista del mapa en la aplicación y selecciona la opción para agregar un nuevo reporte en tu ubicación actual.' },
  { title: '4. Completa la información', content: 'Describe brevemente el estado de salud visible del animal, su comportamiento (asustado, herido, amigable) y cualquier otro detalle útil.' },
  { title: '5. Mantente al tanto', content: 'Una vez enviado, las asociaciones cercanas recibirán una alerta. Recibirás notificaciones cuando alguien asuma el rescate.' },
];

const STEP_ICONS = [
  { icon: 'alert-circle-outline', color: C.primary, bg: `${C.primary}20` },
  { icon: 'camera-outline', color: C.secondary, bg: `${C.secondary}20` },
  { icon: 'map-outline', color: C.accent, bg: `${C.accent}30` },
  { icon: 'document-text-outline', color: '#D1A373', bg: '#D1A37330' },
  { icon: 'notifications-outline', color: C.primary, bg: `${C.primary}20` },
];

// ─── MAIN SCREEN ────────────────────────────────────────────────────────────
export default function ReportGuideScreen({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  // Animations
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const introOpacity = useRef(new Animated.Value(0)).current;

  // Step animations
  const stepAnimations = useRef(GUIDE_STEPS.map(() => ({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(20)
  }))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(introOpacity, { toValue: 1, duration: 400, delay: 100, useNativeDriver: true })
    ]).start();

    const staggerAnimations = stepAnimations.map(anim => {
      return Animated.parallel([
        Animated.timing(anim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(anim.translateY, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      ]);
    });

    Animated.stagger(120, staggerAnimations).start();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bgSoft }}>
      {/* HEADER STICKY */}
      <Animated.View style={{
        opacity: headerOpacity,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 16, paddingHorizontal: 20, backgroundColor: C.bg,
        borderBottomWidth: 1, borderBottomColor: `${C.neutralLight}50`,
        ...(isWeb ? { boxShadow: '0 2px 10px rgba(0,0,0,0.05)' } : { elevation: 3 }),
        zIndex: 10
      }}>
        <Text style={{ fontSize: 18, fontFamily: F.displayBold, color: C.text }}>Cómo reportar un caso</Text>
        <TouchableOpacity onPress={onClose} style={{ position: 'absolute', right: 20, padding: 4 }}>
          <Ionicons name="close" size={24} color={C.text} />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* INTRO */}
        <Animated.View style={{ opacity: introOpacity, backgroundColor: C.primaryLight, padding: 32, alignItems: 'center', overflow: 'hidden' }}>
          <PawDecor top={10} left={20} size={40} opacity={0.12} color="#FFF" rotate={-15} />
          <PawDecor bottom={10} right={20} size={50} opacity={0.10} color={C.primary} rotate={20} />
          <PawDecor top={30} right={40} size={20} opacity={0.10} color={C.secondary} rotate={45} />

          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name="document-text-outline" size={32} color={C.primary} />
          </View>
          <Text style={{ fontSize: 24, fontFamily: F.displayBold, color: C.text, textAlign: 'center', marginBottom: 8, letterSpacing: -0.5 }}>
            5 pasos para ayudar a un animal en la calle
          </Text>
          <Text style={{ fontSize: 14, fontFamily: F.bodyMedium, color: 'rgba(46,42,38,0.7)', textAlign: 'center', lineHeight: 22, maxWidth: 300 }}>
            Sigue esta guía rápida antes de crear tu reporte. Tu seguridad y la del animal son lo primero.
          </Text>
        </Animated.View>

        {/* TIMELINE DE PASOS */}
        <View style={{ padding: 24, paddingBottom: 40, backgroundColor: C.bgSoft }}>
          {GUIDE_STEPS.map((step, idx) => {
            const isLast = idx === GUIDE_STEPS.length - 1;
            const config = STEP_ICONS[idx];
            return (
              <Animated.View key={idx} style={{
                opacity: stepAnimations[idx].opacity,
                transform: [{ translateY: stepAnimations[idx].translateY }],
                flexDirection: 'row',
                marginBottom: isLast ? 24 : 0
              }}>
                {/* Columna Izquierda: Círculo y línea */}
                <View style={{ alignItems: 'center', marginRight: 16 }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: config.bg,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2, borderColor: '#FFF',
                    zIndex: 2,
                    ...(isWeb ? { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' } : { elevation: 2 }),
                  }}>
                    <Ionicons name={config.icon as any} size={22} color={config.color} />
                  </View>
                  {!isLast && (
                    <View style={{
                      width: 2,
                      flex: 1,
                      backgroundColor: `${C.neutralLight}70`,
                      marginVertical: -4,
                      zIndex: 1
                    }} />
                  )}
                </View>

                {/* Columna Derecha: Tarjeta */}
                <View style={{ flex: 1, paddingBottom: isLast ? 28 : 0 }}>
                  <View style={{
                    backgroundColor: C.bg,
                    borderRadius: 20,
                    padding: 20,
                    borderWidth: 1, borderColor: `${C.neutralLight}40`,
                    ...(isWeb ? { boxShadow: '0 4px 16px rgba(46,42,38,0.04)' } : { elevation: 2 }),
                  }}>
                    <Text style={{ fontSize: 15, fontFamily: F.displaySemi, color: C.text, marginBottom: 8 }}>
                      {step.title}
                    </Text>
                    <Text style={{ fontSize: 13, fontFamily: F.bodyRegular, color: C.muted, lineHeight: 20 }}>
                      {step.content}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            );
          })}

          {/* NOTA DE SEGURIDAD */}
          <Animated.View style={{
            opacity: stepAnimations[GUIDE_STEPS.length - 1].opacity,
            transform: [{ translateY: stepAnimations[GUIDE_STEPS.length - 1].translateY }]
          }}>
            <View style={{
              backgroundColor: `${C.accent}25`,
              borderWidth: 1, borderColor: C.accent,
              borderRadius: 16, padding: 16,
              flexDirection: 'row', alignItems: 'flex-start', gap: 12
            }}>
              <Ionicons name="warning" size={24} color="#D4A137" />
              <Text style={{ flex: 1, fontSize: 13, fontFamily: F.bodyMedium, color: '#826019', lineHeight: 20 }}>
                Nunca te pongas en riesgo. Si el animal parece agresivo o está en una zona peligrosa, repórtalo desde la distancia y espera a que una asociación especializada se acerque.
              </Text>
            </View>
          </Animated.View>
        </View>

        {/* CTA FINAL */}
        <Animated.View style={{
          opacity: stepAnimations[GUIDE_STEPS.length - 1].opacity,
          padding: 24, paddingTop: 0, paddingBottom: 40, backgroundColor: C.bgSoft
        }}>
          <AnimatedButton onPress={() => { onClose(); router.push('/map'); }}>
            <View style={{
              backgroundColor: C.primary,
              paddingVertical: 16, borderRadius: 100,
              flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
              ...(isWeb ? { boxShadow: '0 8px 24px rgba(245,132,43,0.3)' } : { elevation: 4 }),
            }}>
              <Ionicons name="add-circle" size={22} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 16, fontFamily: F.displayBold }}>Crear mi reporte ahora</Text>
            </View>
          </AnimatedButton>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 16, alignItems: 'center', padding: 8 }}>
            <Text style={{ color: C.muted, fontSize: 14, fontFamily: F.bodySemiBold }}>Volver al inicio</Text>
          </TouchableOpacity>
        </Animated.View>

      </ScrollView>
    </View>
  );
}
