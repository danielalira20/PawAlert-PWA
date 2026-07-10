import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../constants/api';

// ─── GOOGLE FONTS ─────────────────────────────────────────────────────────────
import { useFonts } from 'expo-font';
import {
  Fraunces_800ExtraBold,
} from '@expo-google-fonts/fraunces';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from '@expo-google-fonts/poppins';

// IMPORTANTE: Importamos el formulario de forma "perezosa" (Lazy Load)
const AssociationFormScreen = lazy(() => import('./AssociationFormScreen'));
const ReportGuideScreen = lazy(() => import('./ReportGuideScreen'));

const isWeb = Platform.OS === 'web';

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
  danger: '#E85D4B',
};

// ─── FONT FAMILY HELPERS ────────────────────────────────────────────────────
const F = {
  displayBold: 'Fraunces_800ExtraBold',
  displaySemi: 'Fraunces_800ExtraBold',
  bodyRegular: 'Poppins_400Regular',
  bodyMedium: 'Poppins_500Medium',
  bodySemiBold: 'Poppins_600SemiBold',
};

// ─── ANIMATED BUTTON ────────────────────────────────────────────────────────
function AnimatedButton({
  onPress,
  style,
  children,
}: {
  onPress: () => void;
  style?: any;
  children: React.ReactNode;
}) {
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

// ─── PAW PRINT DECORATION ──────────────────────────────────────────────────
function PawDecor({ top, left, right, bottom, size = 32, opacity = 0.08, color = C.primary, rotate }: any) {
  return (
    <View
      style={{
        position: 'absolute',
        top, left, right, bottom,
        width: size, height: size,
        alignItems: 'center', justifyContent: 'center',
        opacity,
        ...(rotate ? { transform: [{ rotate: `${rotate}deg` }] } : {}),
      }}
    >
      <Ionicons name="paw" size={size} color={color} />
    </View>
  );
}

// ─── SECTION LABEL ──────────────────────────────────────────────────────────
function SectionLabel({ text, color = C.primary }: { text: string; color?: string }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      marginBottom: 8, gap: 6,
    }}>
      <Ionicons name="paw" size={12} color={color} />
      <Text style={{
        fontSize: 11, fontFamily: F.bodySemiBold, fontWeight: '700', color,
        textTransform: 'uppercase', letterSpacing: 2.5,
      }}>
        {text}
      </Text>
      <Ionicons name="paw" size={12} color={color} />
    </View>
  );
}

// ─── ROLES ──────────────────────────────────────────────────────────────────
const ROLES = [
  {
    id: 'reportante',
    title: 'Reportante',
    icon: 'camera-outline',
    does: 'Reporta animales en situación de calle desde la app, con foto y ubicación.',
    requirements: 'Solo necesita crear una cuenta básica y tener acceso a la cámara/ubicación.',
    ctaLabel: 'Reportar',
    ctaRoute: '/map',
  },
  {
    id: 'voluntario-asociacion',
    title: 'Voluntario de asociación',
    icon: 'people-outline',
    does: 'Se une a una asociación de rescate existente para atender los reportes recibidos.',
    requirements: 'Debe pertenecer o ser aceptado por una asociación registrada en la plataforma.',
    ctaLabel: 'Únete a una asociación',
    ctaRoute: '/join-association',
  },
  {
    id: 'voluntario-externo',
    title: 'Voluntario externo – Casa hogar',
    icon: 'home-outline',
    does: 'Ofrece su hogar de forma temporal para el resguardo de animales rescatados.',
    requirements: 'Completar un formulario de postulación y validación básica del espacio disponible.',
    ctaLabel: 'Postúlate como casa hogar',
    ctaRoute: '/foster-application',
  },
  {
    id: 'asociacion',
    title: 'Asociación',
    icon: 'business-outline',
    does: 'Recibe alertas de reportes cercanos, coordina rescates y gestiona su equipo de voluntarios.',
    requirements: 'Registrar la organización y pasar por un proceso de validación.',
    ctaLabel: 'Registra tu asociación',
    ctaRoute: '/association-register',
  },
  {
    id: 'patrocinador',
    title: 'Patrocinador',
    icon: 'star-outline',
    does: 'Apoya económicamente el sostenimiento de rescates y campañas (función futura).',
    requirements: 'Próximamente disponible.',
    ctaLabel: 'Próximamente',
    ctaRoute: null,
  },
];

// ─── PAW PATTERN BACKGROUND ─────────────────────────────────────────────────
function PawPatternBackground() {
  const { width, height } = useWindowDimensions();
  const columns = Math.ceil(width / 80) + 1;
  const rows = Math.ceil((height || 1000) / 80) + 1;
  const paws = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      const isOffset = i % 2 !== 0;
      const offsetX = (i * 7 + j * 13) % 20 - 10;
      const offsetY = (i * 11 + j * 5) % 20 - 10;
      const rotation = (i * 3 + j * 7) % 30 - 15;
      paws.push(
        <View
          key={`${i}-${j}`}
          style={{
            position: 'absolute',
            top: i * 80 + offsetY,
            left: j * 80 + (isOffset ? 40 : 0) + offsetX,
            opacity: 0.04,
            transform: [{ rotate: `${rotation}deg` }],
          }}
        >
          <Ionicons name="paw" size={24} color={C.muted} />
        </View>
      );
    }
  }
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 0 }} pointerEvents="none">
      {paws}
    </View>
  );
}

// ─── MAIN SCREEN ────────────────────────────────────────────────────────────
export default function LandingScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  const router = useRouter();
  const [isAssociationFormVisible, setIsAssociationFormVisible] = useState(false);
  const [isReportGuideVisible, setIsReportGuideVisible] = useState(false);
  const [recentPhotos, setRecentPhotos] = useState<string[]>([]);

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const expandOpacity = useRef(new Animated.Value(0)).current;
  const expandTranslateY = useRef(new Animated.Value(20)).current;

  const handleRolePress = (id: string) => {
    if (selectedRoleId === id) {
      Animated.parallel([
        Animated.timing(expandOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(expandTranslateY, { toValue: -10, duration: 200, useNativeDriver: true })
      ]).start(() => setSelectedRoleId(null));
    } else {
      if (selectedRoleId) {
        Animated.parallel([
          Animated.timing(expandOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(expandTranslateY, { toValue: -10, duration: 150, useNativeDriver: true })
        ]).start(() => {
          setSelectedRoleId(id);
          expandTranslateY.setValue(20);
          Animated.parallel([
            Animated.timing(expandOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(expandTranslateY, { toValue: 0, duration: 300, useNativeDriver: true })
          ]).start();
        });
      } else {
        setSelectedRoleId(id);
        expandOpacity.setValue(0);
        expandTranslateY.setValue(20);
        Animated.parallel([
          Animated.timing(expandOpacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(expandTranslateY, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true })
        ]).start();
      }
    }
  };

  // ── Font loading ──
  const [fontsLoaded] = useFonts({
    Fraunces_800ExtraBold,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  // Animations
  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const statsOpacity = useRef(new Animated.Value(0)).current;
  const statsSlide = useRef(new Animated.Value(32)).current;
  const howOpacity = useRef(new Animated.Value(0)).current;
  const howSlide = useRef(new Animated.Value(32)).current;
  const missionOpacity = useRef(new Animated.Value(0)).current;
  const missionSlide = useRef(new Animated.Value(32)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const ctaSlide = useRef(new Animated.Value(32)).current;

  // New section animations
  const galleryOpacity = useRef(new Animated.Value(0)).current;
  const gallerySlide = useRef(new Animated.Value(32)).current;

  useEffect(() => {
    // Fetch photos para galería
    const fetchPhotos = async () => {
      try {
        const res = await axios.get(`${API_URL}/reports`);
        const reports = res.data;
        const photos: string[] = [];
        for (const r of reports) {
          if (r.foto_url) {
            photos.push(r.foto_url);
          }
        }
        setRecentPhotos(photos.slice(0, 6)); // Tomamos las últimas 6
      } catch (error) {
        console.error('Error al obtener fotos:', error);
      }
    };
    fetchPhotos();

    const ease = Easing.out(Easing.cubic);
    Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    Animated.parallel([
      Animated.timing(heroFade, { toValue: 1, duration: 700, easing: ease, useNativeDriver: true }),
      Animated.timing(heroSlide, { toValue: 0, duration: 700, easing: ease, useNativeDriver: true }),
    ]).start();
    const stagger = (opacity: Animated.Value, slide: Animated.Value, delay: number) => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 600, delay, easing: ease, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 600, delay, easing: ease, useNativeDriver: true }),
      ]).start();
    };
    stagger(statsOpacity, statsSlide, 300);
    stagger(howOpacity, howSlide, 500);
    stagger(missionOpacity, missionSlide, 600);
    stagger(ctaOpacity, ctaSlide, 750);
    stagger(galleryOpacity, gallerySlide, 850);
  }, []);

  // ── Loading screen while fonts load ──
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bgSoft, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={{ marginTop: 16, color: C.muted, fontSize: 14 }}>Cargando PawAlert…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bgSoft }}>
      <PawPatternBackground />
      <ScrollView style={{ flex: 1, zIndex: 1 }} showsVerticalScrollIndicator={false}>

        {/* ══════════════════════════════════════════════════════════════════
            SECCIÓN 1 — NAVBAR  (sticky-like header)
        ══════════════════════════════════════════════════════════════════ */}
        <View style={{
          backgroundColor: C.bg,
          paddingHorizontal: 24,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          ...(isWeb ? { boxShadow: '0 2px 12px rgba(46,42,38,0.06)' } : { elevation: 3 }),
        } as any}>
          {/* Logo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: C.primary,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="paw" size={20} color="#FFF" />
            </View>
            <Text style={{ fontSize: 22, fontFamily: F.displayBold, color: C.text, letterSpacing: -0.5 }}>
              Paw<Text style={{ color: C.primary }}>Alert</Text>
            </Text>
          </View>

          {/* CTA pill */}
          <AnimatedButton onPress={() => router.push('/map')}>
            <View style={{
              backgroundColor: C.primary,
              paddingHorizontal: 18, paddingVertical: 9,
              borderRadius: 100,
              flexDirection: 'row', alignItems: 'center', gap: 6,
              ...(isWeb ? { boxShadow: `0 4px 14px ${C.primary}40` } : {}),
            } as any}>
              <Ionicons name="map-outline" size={14} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 13, fontFamily: F.bodySemiBold }}>Ver mapa</Text>
            </View>
          </AnimatedButton>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECCIÓN 2 — HERO (Rediseñado)
        ══════════════════════════════════════════════════════════════════ */}
        <View style={{
          backgroundColor: 'transparent',
          paddingTop: 56,
          paddingBottom: 40,
          paddingHorizontal: 28,
          alignItems: 'center',
          position: 'relative',
        }}>
          {/* Hero content: 2 columnas en desktop */}
          <View style={{
            flexDirection: isDesktop ? 'row' : 'column',
            alignItems: 'center',
            maxWidth: 1024,
            width: '100%',
            gap: isDesktop ? 60 : 40,
          }}>
            {/* Columna izquierda */}
            <View style={{ flex: 1, alignItems: isDesktop ? 'flex-start' : 'center', zIndex: 1 }}>
              <Animated.View style={{
                alignItems: isDesktop ? 'flex-start' : 'center',
                width: '100%',
                opacity: heroFade, transform: [{ translateY: heroSlide }],
              }}>
                <Text style={{
                  color: C.text,
                  fontSize: isDesktop ? 72 : 52,
                  fontFamily: F.displayBold,
                  textAlign: isDesktop ? 'left' : 'center',
                  letterSpacing: -2,
                  marginBottom: 8,
                  lineHeight: isDesktop ? 80 : 60,
                }}>
                  Paw<Text style={{ color: C.primary }}>Alert</Text>
                </Text>

                <Text style={{
                  color: C.muted,
                  fontSize: isDesktop ? 22 : 18,
                  fontFamily: F.bodyMedium,
                  textAlign: isDesktop ? 'left' : 'center',
                  marginBottom: 40,
                }}>
                  Reportando para cambiar vidas
                </Text>

                {/* CTAs */}
                <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16, width: '100%', maxWidth: 480 }}>
                  <AnimatedButton onPress={() => router.push('/map')} style={{ flex: 1 }}>
                    <View style={{
                      backgroundColor: C.primary,
                      paddingVertical: 16, paddingHorizontal: 28,
                      borderRadius: 100,
                      alignItems: 'center', flexDirection: 'row',
                      justifyContent: 'center', gap: 10,
                      ...(isWeb ? { boxShadow: `0 8px 28px ${C.primary}50` } : { elevation: 6 }),
                    } as any}>
                      <Ionicons name="map" size={20} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: 16, fontFamily: F.bodySemiBold }}>Ver Reportes en Vivo</Text>
                    </View>
                  </AnimatedButton>

                  <AnimatedButton onPress={() => setIsAssociationFormVisible(true)} style={{ flex: 1 }}>
                    <View style={{
                      backgroundColor: C.bg,
                      paddingVertical: 16, paddingHorizontal: 28,
                      borderRadius: 100,
                      alignItems: 'center', flexDirection: 'row',
                      justifyContent: 'center', gap: 10,
                      borderWidth: 2, borderColor: C.primary,
                    }}>
                      <Ionicons name="business-outline" size={20} color={C.primary} />
                      <Text style={{ color: C.primary, fontSize: 16, fontFamily: F.bodySemiBold }}>Registrar Asociación</Text>
                    </View>
                  </AnimatedButton>
                </View>
              </Animated.View>
            </View>

            {/* Columna derecha: Blob con foto */}
            <Animated.View style={{
              flex: isDesktop ? 1 : undefined,
              width: isDesktop ? undefined : '100%',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              opacity: heroFade, transform: [{ translateY: heroSlide }],
            }}>
              {/* Blob contenedor */}
              <View style={{
                width: isDesktop ? 440 : 300,
                height: isDesktop ? 440 : 300,
                backgroundColor: `${C.secondary}40`,
                borderRadius: isDesktop ? 220 : 150,
                borderTopRightRadius: isDesktop ? 160 : 100,
                borderBottomLeftRadius: isDesktop ? 180 : 120,
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <View style={{
                  width: '90%', height: '90%',
                  backgroundColor: C.neutralLight,
                  borderRadius: isDesktop ? 200 : 140,
                  borderTopRightRadius: isDesktop ? 140 : 90,
                  borderBottomLeftRadius: isDesktop ? 160 : 110,
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {/* TODO: reemplazar por foto real del perro */}
                  <Ionicons name="image-outline" size={60} color={C.muted} />
                </View>
              </View>

              {/* PawDecor decorativos */}
              <PawDecor top={-10} right={isDesktop ? 20 : 0} size={48} opacity={0.15} color={C.primary} rotate={20} />
              <PawDecor bottom={20} left={isDesktop ? -20 : -10} size={36} opacity={0.12} color={C.accent} rotate={-15} />
            </Animated.View>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            NUEVA SECCIÓN: TIMELINE (3 pasos de un reporte)
        ══════════════════════════════════════════════════════════════════ */}
        <View style={{
          paddingHorizontal: 24, paddingTop: 40, paddingBottom: 60,
          maxWidth: 960, alignSelf: 'center', width: '100%',
        }}>
          <SectionLabel text="Proceso" color={C.secondary} />
          <Text style={{
            fontSize: isDesktop ? 36 : 28, fontFamily: F.displayBold, color: C.text,
            textAlign: 'center', letterSpacing: -0.8, marginBottom: 48,
          }}>
            Así funciona un reporte
          </Text>

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', position: 'relative', alignItems: isDesktop ? 'flex-start' : 'center', justifyContent: 'space-between' }}>
            {/* Línea conectora */}
            {isDesktop ? (
              <View style={{
                position: 'absolute', top: 12, left: '16%', right: '16%',
                height: 2, borderBottomWidth: 2, borderColor: C.neutralLight, borderStyle: 'dashed',
                zIndex: 0
              }} />
            ) : (
              <View style={{
                position: 'absolute', top: 20, bottom: 20, left: 40,
                width: 2, borderLeftWidth: 2, borderColor: C.neutralLight, borderStyle: 'dashed',
                zIndex: 0
              }} />
            )}

            {[
              { num: '01', title: 'Paso 1', desc: 'Descripción del paso 1.' },
              { num: '02', title: 'Paso 2', desc: 'Descripción del paso 2.' },
              { num: '03', title: 'Paso 3', desc: 'Descripción del paso 3.' },
            ].map((step, i) => (
              <View key={i} style={{
                flex: isDesktop ? 1 : undefined,
                width: isDesktop ? undefined : '100%',
                alignItems: isDesktop ? 'center' : 'flex-start',
                flexDirection: isDesktop ? 'column' : 'row',
                gap: isDesktop ? 16 : 24,
                marginBottom: isDesktop ? 0 : 32,
                zIndex: 1,
                paddingHorizontal: isDesktop ? 16 : 0,
              }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12, backgroundColor: C.secondary,
                  borderWidth: 4, borderColor: C.bgSoft,
                  marginTop: isDesktop ? 0 : 16,
                  marginLeft: isDesktop ? 0 : 29,
                }} />
                <View style={{ flex: isDesktop ? undefined : 1, alignItems: isDesktop ? 'center' : 'flex-start' }}>
                  <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{
                      fontSize: 48, fontFamily: F.displayBold, color: C.neutralLight, opacity: 0.3,
                      position: isDesktop ? 'absolute' : 'relative',
                      top: isDesktop ? -30 : 0, left: isDesktop ? 0 : 0,
                    }}>
                      {step.num}
                    </Text>
                    <Text style={{ fontSize: 20, fontFamily: F.displayBold, color: C.text, zIndex: 1, marginTop: isDesktop ? 0 : -20 }}>
                      {step.title}
                    </Text>
                  </View>
                  <Text style={{
                    fontSize: 14, color: C.muted, fontFamily: F.bodyMedium,
                    textAlign: isDesktop ? 'center' : 'left', marginTop: 8,
                  }}>
                    {step.desc}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            NUEVA SECCIÓN: ROLES (Cómo participar)
        ══════════════════════════════════════════════════════════════════ */}
        <View style={{
          paddingHorizontal: 24, paddingTop: 40, paddingBottom: 60,
          maxWidth: 960, alignSelf: 'center', width: '100%',
        }}>
          <SectionLabel text="Cómo participar" color={C.primary} />
          <Text style={{
            fontSize: isDesktop ? 36 : 28, fontFamily: F.displayBold, color: C.text,
            textAlign: 'center', letterSpacing: -0.8, marginBottom: 48,
          }}>
            Elige tu rol
          </Text>

          {/* Círculos de roles */}
          <ScrollView
            horizontal={!isDesktop}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              flexDirection: isDesktop ? 'row' : 'row',
              flexWrap: isDesktop ? 'wrap' : 'nowrap',
              justifyContent: 'center', gap: 24, paddingBottom: 16,
              minWidth: '100%',
            }}
          >
            {ROLES.map((role, i) => {
              const colors = [C.primary, C.secondary, C.accent, C.text, C.danger];
              const roleColor = colors[i % colors.length];
              const isActive = selectedRoleId === role.id;

              return (
                <View key={role.id} style={{ alignItems: 'center', width: isDesktop ? 140 : 120 }}>
                  <AnimatedButton onPress={() => handleRolePress(role.id)}>
                    <View style={{
                      width: 90, height: 90, borderRadius: 45,
                      backgroundColor: `${roleColor}15`,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: isActive ? 3 : 0,
                      borderColor: roleColor,
                      position: 'relative',
                      ...(isWeb && isActive ? { boxShadow: `0 0 15px ${roleColor}40` } : {}),
                    }}>
                      <Ionicons name={role.icon as any} size={36} color={roleColor} />
                      {isActive && (
                        <View style={{
                          position: 'absolute', bottom: -5, right: -5,
                          backgroundColor: C.bg, borderRadius: 12, padding: 2,
                        }}>
                          <Ionicons name="checkmark-circle" size={20} color={roleColor} />
                        </View>
                      )}
                    </View>
                  </AnimatedButton>
                  <Text style={{
                    fontSize: 14, fontFamily: F.bodySemiBold, color: C.text,
                    textAlign: 'center', marginTop: 12,
                  }}>
                    {role.title}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Tarjeta expandida */}
          {selectedRoleId && (
            <Animated.View style={{
              opacity: expandOpacity,
              transform: [{ translateY: expandTranslateY }],
              marginTop: 24,
            }}>
              {(() => {
                const activeRole = ROLES.find(r => r.id === selectedRoleId);
                if (!activeRole) return null;
                const activeIndex = ROLES.findIndex(r => r.id === selectedRoleId);
                const colors = [C.primary, C.secondary, C.accent, C.text, C.danger];
                const activeColor = colors[activeIndex % colors.length];

                return (
                  <View style={{
                    backgroundColor: C.bg,
                    borderRadius: 24, padding: 32,
                    borderWidth: 1, borderColor: `${activeColor}30`,
                    ...(isWeb ? { boxShadow: `0 8px 30px ${activeColor}15` } : { elevation: 4 }),
                  }}>
                    <Text style={{ fontSize: 24, fontFamily: F.displayBold, color: C.text, marginBottom: 12 }}>
                      {activeRole.title}
                    </Text>
                    <Text style={{ fontSize: 15, fontFamily: F.bodyMedium, color: C.text, marginBottom: 12, lineHeight: 24 }}>
                      {activeRole.does}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 24 }}>
                      <Ionicons name="information-circle-outline" size={20} color={C.muted} style={{ marginTop: 2 }} />
                      <Text style={{ fontSize: 14, fontFamily: F.bodyRegular, color: C.muted, flex: 1, lineHeight: 20 }}>
                        {activeRole.requirements}
                      </Text>
                    </View>

                    <AnimatedButton onPress={() => {
                      if (activeRole.ctaRoute === '/association-register') {
                        setIsAssociationFormVisible(true);
                      } else if (activeRole.ctaRoute) {
                        router.push(activeRole.ctaRoute);
                      }
                    }}>
                      <View style={{
                        backgroundColor: activeRole.ctaRoute ? activeColor : C.neutralLight,
                        paddingVertical: 14, paddingHorizontal: 24,
                        borderRadius: 100, alignSelf: 'flex-start',
                      }}>
                        <Text style={{
                          color: activeRole.ctaRoute ? (activeColor === C.accent ? C.text : '#FFF') : C.muted,
                          fontSize: 15, fontFamily: F.bodySemiBold
                        }}>
                          {activeRole.ctaLabel}
                        </Text>
                      </View>
                    </AnimatedButton>
                  </View>
                );
              })()}
            </Animated.View>
          )}
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECCIÓN 3 — STATS STRIP (floating card)
        ══════════════════════════════════════════════════════════════════ */}
        <Animated.View style={{
          flexDirection: 'row', justifyContent: 'center',
          paddingHorizontal: 24, marginTop: -40, zIndex: 20,
          opacity: statsOpacity, transform: [{ translateY: statsSlide }],
        }}>
          <View style={{
            backgroundColor: C.bg,
            borderRadius: 28,
            paddingVertical: 24, paddingHorizontal: 28,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-around',
            width: '100%', maxWidth: 800,
            borderWidth: 1, borderColor: `${C.neutralLight}80`,
            ...(isWeb ? { boxShadow: '0 20px 60px rgba(46,42,38,0.08)' } : { elevation: 8 }),
          } as any}>
            {[
              { value: '24/7', label: 'Atención', color: C.primary },
              { value: '100%', label: 'Gratuito', color: C.secondary },
              { value: '∞', label: 'Comunidad', color: C.accent },
            ].map((stat, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={{ width: 1, height: 36, backgroundColor: C.neutralLight }} />}
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ fontSize: 28, fontFamily: F.displayBold, color: stat.color, marginBottom: 3 }}>{stat.value}</Text>
                  <Text style={{ fontSize: 10, fontFamily: F.bodySemiBold, color: C.muted, textTransform: 'uppercase', letterSpacing: 2 }}>{stat.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </Animated.View>

        {/* ══════════════════════════════════════════════════════════════════
            SECCIÓN 4 — ¿POR QUÉ ELEGIRNOS?
        ══════════════════════════════════════════════════════════════════ */}
        <Animated.View style={{
          paddingHorizontal: 24, paddingTop: 72, paddingBottom: 16,
          maxWidth: 960, alignSelf: 'center', width: '100%',
          opacity: howOpacity, transform: [{ translateY: howSlide }],
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Huellas decorativas extra */}
          <PawDecor top={10} right={20} size={36} opacity={0.06} color={C.secondary} rotate={15} />
          <PawDecor bottom={30} left={10} size={28} opacity={0.06} color={C.accent} rotate={-20} />
          <PawDecor top={50} left={40} size={20} opacity={0.05} color={C.primary} rotate={30} />

          <SectionLabel text="Por qué elegirnos" color={C.secondary} />
          <Text style={{
            fontSize: isDesktop ? 36 : 28, fontFamily: F.displayBold, color: C.text,
            textAlign: 'center', letterSpacing: -0.8, marginBottom: 36,
          }}>
            Rescate que funciona de verdad
          </Text>

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16 }}>
            {[
              {
                icon: 'shield-checkmark-outline' as const,
                accent: C.secondary,
                bg: `${C.secondary}18`,
                title: 'Proceso responsable',
                desc: 'Cada reporte es validado y atendido por asociaciones verificadas en tu zona.',
              },
              {
                icon: 'flash-outline' as const,
                accent: C.primary,
                bg: `${C.primary}18`,
                title: 'Respuesta inmediata',
                desc: 'Notificamos a la asociación más cercana al instante. Sin demoras, sin burocracia.',
              },
              {
                icon: 'heart-outline' as const,
                accent: C.accent,
                bg: `${C.accent}25`,
                title: 'Seguimiento real',
                desc: 'Seguí el estado del animal rescatado en vivo desde la app.',
              },
            ].map((item, i) => (
              <View key={i} style={{
                flex: 1,
                backgroundColor: C.bg,
                borderRadius: 24,
                padding: 26,
                borderWidth: 1,
                borderColor: `${C.neutralLight}60`,
                alignItems: 'flex-start',
                position: 'relative', overflow: 'hidden',
                ...(isWeb ? { boxShadow: '0 4px 20px rgba(46,42,38,0.05)' } : { elevation: 2 }),
              } as any}>
                {/* Top accent line */}
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                  backgroundColor: item.accent, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
                }} />
                <View style={{
                  width: 48, height: 48, borderRadius: 16,
                  backgroundColor: item.bg,
                  alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                }}>
                  <Ionicons name={item.icon} size={24} color={item.accent} />
                </View>
                <Text style={{ fontSize: 18, fontFamily: F.displayBold, color: C.text, marginBottom: 6 }}>{item.title}</Text>
                <Text style={{ fontSize: 13, color: C.muted, lineHeight: 20, fontFamily: F.bodyMedium }}>{item.desc}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ══════════════════════════════════════════════════════════════════
            SECCIÓN 5 — CÓMO FUNCIONA (3 pasos)
        ══════════════════════════════════════════════════════════════════ */}
        <View style={{
          backgroundColor: C.bgSoft,
          paddingHorizontal: 24, paddingTop: 72, paddingBottom: 72,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Huellas decorativas de fondo */}
          <PawDecor top={20} right={40} size={60} opacity={0.05} color={C.primary} />
          <PawDecor bottom={20} left={30} size={48} opacity={0.05} color={C.secondary} />

          <View style={{ maxWidth: 960, alignSelf: 'center', width: '100%' }}>
            <SectionLabel text="Cómo funciona" color={C.primary} />
            <Text style={{
              fontSize: isDesktop ? 36 : 28, fontFamily: F.displayBold, color: C.text,
              textAlign: 'center', letterSpacing: -0.8, marginBottom: 44,
            }}>
              3 pasos para salvar una vida
            </Text>

            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 20 }}>
              {[
                {
                  step: '01', title: 'Reportá',
                  desc: 'Tomá una foto y marcá la ubicación en segundos desde tu celular.',
                  accent: C.primary, icon: 'camera-outline' as const,
                },
                {
                  step: '02', title: 'Conectamos',
                  desc: 'Notificamos a la asociación más cercana al instante.',
                  accent: C.secondary, icon: 'flash-outline' as const,
                },
                {
                  step: '03', title: 'Rescatamos',
                  desc: 'La asociación se moviliza y actualizá el estado del animal en vivo.',
                  accent: C.accent, icon: 'paw-outline' as const,
                },
              ].map((item, i) => (
                <View key={i} style={{
                  flex: 1,
                  backgroundColor: C.bg,
                  borderRadius: 28,
                  padding: 30,
                  borderWidth: 1,
                  borderColor: `${C.neutralLight}60`,
                  position: 'relative', overflow: 'hidden',
                  ...(isWeb ? { boxShadow: '0 4px 24px rgba(46,42,38,0.06)' } : { elevation: 3 }),
                } as any}>
                  {/* Blob de color detrás del número */}
                  <View style={{
                    position: 'absolute', top: -20, right: -20,
                    width: 100, height: 100, borderRadius: 50,
                    backgroundColor: item.accent + '18',
                  }} />
                  <Text style={{
                    fontSize: 52, fontFamily: F.displayBold,
                    color: item.accent + '22',
                    position: 'absolute', top: 10, right: 18,
                    letterSpacing: -2,
                  }}>{item.step}</Text>

                  <View style={{
                    width: 52, height: 52, borderRadius: 18,
                    backgroundColor: item.accent + '20',
                    alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16,
                  }}>
                    <Ionicons name={item.icon} size={26} color={item.accent} />
                  </View>
                  <Text style={{ fontSize: 20, fontFamily: F.displayBold, color: C.text, marginBottom: 6 }}>{item.title}</Text>
                  <Text style={{ fontSize: 13, color: C.muted, lineHeight: 21, fontFamily: F.bodyMedium }}>{item.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECCIÓN 5.5 — GUÍA PARA REPORTAR (Accordion)
        ══════════════════════════════════════════════════════════════════ */}
        <View style={{
          paddingHorizontal: 24, paddingBottom: 72,
          maxWidth: 700, alignSelf: 'center', width: '100%',
        }}>
          <SectionLabel text="Ayuda paso a paso" color={C.primary} />
          <Text style={{
            fontSize: isDesktop ? 36 : 28, fontFamily: F.displayBold, color: C.text,
            textAlign: 'center', letterSpacing: -0.8, marginBottom: 12,
          }}>
            Guía para reportar
          </Text>
          <Text style={{
            fontSize: 14, fontFamily: F.bodyMedium, color: C.muted,
            textAlign: 'center', marginBottom: 32,
          }}>
            Conoce los pasos clave para realizar un reporte efectivo y seguro.
          </Text>

          <View style={{ alignItems: 'center' }}>
            <AnimatedButton onPress={() => setIsReportGuideVisible(true)}>
              <View style={{
                backgroundColor: C.bg,
                borderWidth: 2, borderColor: C.primary,
                paddingVertical: 14, paddingHorizontal: 32,
                borderRadius: 100,
                flexDirection: 'row', alignItems: 'center', gap: 8,
                ...(isWeb ? { boxShadow: `0 8px 24px ${C.primary}20` } : { elevation: 3 }),
              } as any}>
                <Ionicons name="document-text-outline" size={20} color={C.primary} />
                <Text style={{ color: C.primary, fontSize: 16, fontFamily: F.displayBold }}>Ver Guía de Reporte</Text>
              </View>
            </AnimatedButton>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECCIÓN 6 — MISIÓN / VISIÓN
        ══════════════════════════════════════════════════════════════════ */}
        <Animated.View style={{
          paddingHorizontal: 24, paddingTop: 72, paddingBottom: 72,
          maxWidth: 960, alignSelf: 'center', width: '100%',
          opacity: missionOpacity, transform: [{ translateY: missionSlide }],
        }}>
          <SectionLabel text="Nuestro propósito" color={C.secondary} />
          <Text style={{
            fontSize: isDesktop ? 36 : 28, fontFamily: F.displayBold, color: C.text,
            textAlign: 'center', letterSpacing: -0.8, marginBottom: 36,
          }}>
            Lo que nos mueve cada día
          </Text>

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 20 }}>
            {[
              {
                icon: '🎯',
                accent: C.primary,
                bg: `${C.primary}10`,
                blobColor: `${C.primary}12`,
                title: 'Nuestra Misión',
                text: 'Brindar ayuda rápida y efectiva a los animales en situación de calle, creando una red de apoyo que salva vidas a través de tecnología accesible para todos.',
              },
              {
                icon: '🌍',
                accent: C.secondary,
                bg: `${C.secondary}12`,
                blobColor: `${C.secondary}15`,
                title: 'Nuestra Visión',
                text: 'Ser la plataforma líder en rescate animal, erradicando el sufrimiento en las calles y fomentando una cultura de adopción, respeto y empatía hacia toda forma de vida.',
              },
            ].map((card, i) => (
              <View key={i} style={{
                flex: 1, borderRadius: 28, padding: 32,
                overflow: 'hidden', position: 'relative',
                borderWidth: 1, borderColor: `${C.neutralLight}60`,
                backgroundColor: C.bg,
                ...(isWeb ? { boxShadow: '0 4px 20px rgba(46,42,38,0.05)' } : { elevation: 2 }),
              } as any}>
                {/* Blob decorativo esquina */}
                <View style={{
                  position: 'absolute', top: -30, right: -30,
                  width: 130, height: 130, borderRadius: 65,
                  backgroundColor: card.blobColor,
                }} />
                <View style={{
                  width: 52, height: 52, backgroundColor: card.bg,
                  borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                }}>
                  <Text style={{ fontSize: 26 }}>{card.icon}</Text>
                </View>
                <View style={{
                  alignSelf: 'flex-start',
                  backgroundColor: card.accent + '18',
                  paddingHorizontal: 10, paddingVertical: 3,
                  borderRadius: 100, marginBottom: 10,
                }}>
                  <Text style={{ fontSize: 10, fontFamily: F.bodySemiBold, color: card.accent, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                    {card.title}
                  </Text>
                </View>
                <Text style={{ fontSize: 22, fontFamily: F.displayBold, color: C.text, marginBottom: 10, letterSpacing: -0.3 }}>{card.title}</Text>
                <Text style={{ fontSize: 13, color: C.muted, lineHeight: 22, fontFamily: F.bodyMedium }}>{card.text}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ══════════════════════════════════════════════════════════════════
            SECCIÓN 7 — RED DE ASOCIACIONES
        ══════════════════════════════════════════════════════════════════ */}
        <View style={{
          backgroundColor: C.neutralLight + '55',
          paddingTop: 64, paddingBottom: 72,
          borderTopLeftRadius: 40,
          borderTopRightRadius: 40,
          overflow: 'hidden',
          position: 'relative',
        }}>
          <PawDecor top={16} right={24} size={44} opacity={0.08} color={C.primary} />
          <PawDecor bottom={24} left={20} size={32} opacity={0.07} color={C.secondary} />

          <View style={{ paddingHorizontal: 24, maxWidth: 960, alignSelf: 'center', width: '100%', marginBottom: 32 }}>
            <SectionLabel text="Aliados" color={C.primary} />
            <Text style={{ fontSize: isDesktop ? 36 : 28, fontFamily: F.displayBold, color: C.text, textAlign: 'center', letterSpacing: -0.8 }}>
              Red de Asociaciones
            </Text>
            <Text style={{ fontSize: 14, color: C.muted, fontFamily: F.bodyMedium, textAlign: 'center', marginTop: 8 }}>
              Los héroes locales que hacen esto posible.
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 32, flexGrow: 1, justifyContent: 'center' }}>
            {[
              { name: 'Huellitas de Amor', color: C.primary, image: null },
              { name: 'Patitas Felices', color: C.secondary, image: null },
              { name: 'Refugio Esperanza', color: C.accent, image: null },
              { name: 'Amigos Peludos', color: C.danger, image: null },
              { name: 'SOS Animal', color: '#9B59B6', image: null },
              { name: 'Vida Animal', color: '#27AE60', image: null },
            ].map((item, i) => (
              <View key={i} style={{
                backgroundColor: C.bg,
                padding: 24,
                borderRadius: 28,
                marginRight: 16,
                alignItems: 'center',
                justifyContent: 'center',
                width: 160, height: 190,
                borderWidth: 1,
                borderColor: `${item.color}25`,
                ...(isWeb ? { boxShadow: `0 4px 20px ${item.color}15` } : {}),
              } as any}>
                {/* Avatar: imagen del logo si existe, sino ícono de pata */}
                <View style={{
                  width: 68, height: 68, borderRadius: 34,
                  backgroundColor: item.color + '15',
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                  borderWidth: 2, borderColor: item.color + '30',
                  overflow: 'hidden',
                }}>
                  {item.image ? (
                    <Image
                      source={{ uri: item.image }}
                      style={{ width: 68, height: 68, borderRadius: 34 }}
                    />
                  ) : (
                    <Ionicons name="paw" size={30} color={item.color} />
                  )}
                </View>
                <Text style={{ fontSize: 12, fontFamily: F.bodySemiBold, color: C.text, textAlign: 'center', marginBottom: 10 }}>
                  {item.name}
                </Text>
                <View style={{
                  backgroundColor: item.color + '18',
                  paddingHorizontal: 10, paddingVertical: 4,
                  borderRadius: 100,
                }}>
                  <Text style={{ fontSize: 9, fontFamily: F.bodySemiBold, color: item.color, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    Activa
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECCIÓN 8 — CTA BANNER
        ══════════════════════════════════════════════════════════════════ */}
        {false && (
          <Animated.View style={{
            paddingHorizontal: 24, paddingVertical: 52,
            opacity: ctaOpacity, transform: [{ translateY: ctaSlide }],
          }}>
            <View style={{
              backgroundColor: C.primary,
              borderRadius: 36,
              padding: isDesktop ? 56 : 36,
              alignItems: 'center',
              overflow: 'hidden',
              position: 'relative',
              maxWidth: 960, alignSelf: 'center', width: '100%',
              ...(isWeb ? { boxShadow: `0 24px 60px ${C.primary}40` } : { elevation: 8 }),
            } as any}>
              {/* Blobs decorativos */}
              <View style={{
                position: 'absolute', top: -50, right: -50,
                width: 200, height: 200, borderRadius: 100,
                backgroundColor: '#FFFFFF18',
                ...(isWeb ? { filter: 'blur(50px)' } : {}),
              } as any} />
              <View style={{
                position: 'absolute', bottom: -30, left: -30,
                width: 160, height: 160, borderRadius: 80,
                backgroundColor: C.accent + '25',
                ...(isWeb ? { filter: 'blur(40px)' } : {}),
              } as any} />

              {/* Huellas decorativas */}
              <PawDecor top={16} left={20} size={36} opacity={0.15} color="#FFF" />
              <PawDecor bottom={16} right={20} size={28} opacity={0.12} color="#FFF" />
              <PawDecor top={50} right={60} size={22} opacity={0.10} color="#FFF" />

              {/* Icono */}
              <View style={{
                width: 60, height: 60, borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 18, zIndex: 1,
              }}>
                <Ionicons name="alert-circle" size={30} color="#FFF" />
              </View>

              <Text style={{
                fontSize: isDesktop ? 34 : 26, fontFamily: F.displayBold,
                color: '#FFF', textAlign: 'center',
                marginBottom: 10, letterSpacing: -0.5, zIndex: 1,
              }}>
                ¿Viste un animal en peligro?
              </Text>
              <Text style={{
                fontSize: 15, color: 'rgba(255,255,255,0.82)',
                textAlign: 'center', marginBottom: 28,
                maxWidth: 380, lineHeight: 24, fontFamily: F.bodyMedium, zIndex: 1,
              }}>
                Tu reporte puede ser la diferencia. Actúa ahora y deja que la comunidad te ayude.
              </Text>

              <AnimatedButton onPress={() => router.push('/map')}>
                <View style={{
                  backgroundColor: C.bg,
                  paddingVertical: 14, paddingHorizontal: 36,
                  borderRadius: 100, zIndex: 1,
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  ...(isWeb ? { boxShadow: '0 8px 24px rgba(0,0,0,0.12)' } : {}),
                } as any}>
                  <Ionicons name="map" size={18} color={C.primary} />
                  <Text style={{ color: C.primary, fontSize: 15, fontFamily: F.displayBold }}>Ver Reportes en Vivo →</Text>
                </View>
              </AnimatedButton>
            </View>
          </Animated.View>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SECCIÓN 8.5 — GALERÍA / HISTORIAS DE ÉXITO
        ══════════════════════════════════════════════════════════════════ */}
        {false && (
          <Animated.View style={{
            paddingHorizontal: 24, paddingTop: 20, paddingBottom: 64,
            maxWidth: 960, alignSelf: 'center', width: '100%',
            opacity: galleryOpacity, transform: [{ translateY: gallerySlide }],
          }}>
            <SectionLabel text="Historias" color={C.secondary} />
            <Text style={{
              fontSize: isDesktop ? 36 : 28, fontFamily: F.displayBold, color: C.text,
              textAlign: 'center', letterSpacing: -0.8, marginBottom: 12,
            }}>
              Momentos que inspiran
            </Text>
            <Text style={{
              fontSize: 14, fontFamily: F.bodyMedium, color: C.muted,
              textAlign: 'center', marginBottom: 32,
            }}>
              Cada foto es una historia de esperanza y segundas oportunidades.
            </Text>

            {/* Grid masonry simple: 2 columnas */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {/* Columna izquierda */}
              <View style={{ flex: 1, gap: 12 }}>
                {[
                  { height: 180, bgColor: `${C.primaryLight}60`, icon: 'heart' as const, iconColor: C.primary },
                  { height: 130, bgColor: `${C.secondary}20`, icon: 'happy' as const, iconColor: C.secondary },
                  { height: 160, bgColor: `${C.accent}25`, icon: 'paw' as const, iconColor: C.accent },
                ].map((item, i) => {
                  const photoUrl = recentPhotos[i];
                  return (
                    <View key={i} style={{
                      height: item.height,
                      backgroundColor: item.bgColor,
                      borderRadius: 18,
                      alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {photoUrl ? (
                        <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <Ionicons name={item.icon} size={36} color={item.iconColor} />
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Columna derecha (offset para efecto masonry) */}
              <View style={{ flex: 1, gap: 12, marginTop: 24 }}>
                {[
                  { height: 140, bgColor: `${C.secondary}18`, icon: 'paw' as const, iconColor: C.secondary },
                  { height: 190, bgColor: `${C.primary}15`, icon: 'heart' as const, iconColor: C.primary },
                  { height: 120, bgColor: `${C.neutralLight}50`, icon: 'happy' as const, iconColor: C.muted },
                ].map((item, i) => {
                  const photoUrl = recentPhotos[i + 3];
                  return (
                    <View key={i} style={{
                      height: item.height,
                      backgroundColor: item.bgColor,
                      borderRadius: 18,
                      alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {photoUrl ? (
                        <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <Ionicons name={item.icon} size={36} color={item.iconColor} />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </Animated.View>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SECCIÓN 9 — FOOTER
        ══════════════════════════════════════════════════════════════════ */}
        <View style={{
          backgroundColor: C.text,
          paddingVertical: 48,
          paddingHorizontal: 28,
          alignItems: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <PawDecor top={20} left={20} size={50} opacity={0.06} color={C.primaryLight} />
          <PawDecor bottom={20} right={20} size={40} opacity={0.05} color={C.secondary} />

          {/* Logo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <View style={{
              width: 34, height: 34, borderRadius: 10,
              backgroundColor: C.primary,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="paw" size={18} color="#FFF" />
            </View>
            <Text style={{ fontSize: 20, fontFamily: F.displayBold, color: '#FFF', letterSpacing: -0.4 }}>
              Paw<Text style={{ color: C.primary }}>Alert</Text>
            </Text>
          </View>

          <Text style={{
            color: `${C.primaryLight}80`, fontSize: 13, fontFamily: F.bodyMedium,
            textAlign: 'center', marginBottom: 4, letterSpacing: 0.3,
          }}>
            Cada huella cuenta
          </Text>

          {/* Divisor */}
          <View style={{ width: 40, height: 2, backgroundColor: C.primary + '40', borderRadius: 2, marginVertical: 20 }} />

          <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: F.bodyMedium, marginBottom: 4 }}>
            © 2026 PawAlert · Juntos salvando vidas
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11, fontFamily: F.bodyRegular }}>
            Hecho con ❤️ para los que no tienen voz
          </Text>
        </View>

      </ScrollView>

      {/* ── MODAL REGISTRO ASOCIACIÓN ────────────────────────────────────── */}
      <Modal
        visible={isAssociationFormVisible}
        animationType="fade" /* 'fade' se ve mucho mejor con efectos blur que 'slide' */
        transparent={true}
        onRequestClose={() => setIsAssociationFormVisible(false)}
      >
        {isAssociationFormVisible && (
          <Suspense fallback={
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
              <ActivityIndicator size="large" color={C.primary} />
              <Text style={{ marginTop: 12, color: '#FFF', fontFamily: F.bodyMedium }}>Cargando formulario...</Text>
            </View>
          }>
            <AssociationFormScreen onClose={() => setIsAssociationFormVisible(false)} />
          </Suspense>
        )}
      </Modal>
      {/* ── MODAL GUÍA DE REPORTE ────────────────────────────────────────── */}
      <Modal
        visible={isReportGuideVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsReportGuideVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(46,42,38,0.55)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: C.bgSoft, borderRadius: 24, overflow: 'hidden' }}>
            {isReportGuideVisible && (
              <Suspense fallback={
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={C.primary} />
                  <Text style={{ marginTop: 12, color: C.muted, fontFamily: F.bodyMedium }}>Cargando guía...</Text>
                </View>
              }>
                <ReportGuideScreen onClose={() => setIsReportGuideVisible(false)} />
              </Suspense>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}