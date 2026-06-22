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
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// IMPORTANTE: Importamos el formulario de forma "perezosa" (Lazy Load)
const AssociationFormScreen = lazy(() => import('./AssociationFormScreen'));

const { width } = Dimensions.get('window');
const isDesktop = width > 768;
const isWeb = Platform.OS === 'web';

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

export default function LandingScreen() {
  const router = useRouter();
  
  const [isAssociationFormVisible, setIsAssociationFormVisible] = useState(false);

  // Hero animations
  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;

  // Stagger sections
  const statsOpacity = useRef(new Animated.Value(0)).current;
  const statsSlide = useRef(new Animated.Value(32)).current;
  const howOpacity = useRef(new Animated.Value(0)).current;
  const howSlide = useRef(new Animated.Value(32)).current;
  const missionOpacity = useRef(new Animated.Value(0)).current;
  const missionSlide = useRef(new Animated.Value(32)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const ctaSlide = useRef(new Animated.Value(32)).current;

  useEffect(() => {
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
    stagger(missionOpacity, missionSlide, 650);
    stagger(ctaOpacity, ctaSlide, 800);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* ─── HERO ─── */}
        <View
          style={{
            backgroundColor: '#0F172A',
            paddingTop: 64,
            paddingBottom: 110,
            paddingHorizontal: 28,
            alignItems: 'center',
            overflow: 'hidden',
            borderBottomLeftRadius: 48,
            borderBottomRightRadius: 48,
          }}
        >
          <View style={{
            position: 'absolute', top: -100, left: -60, width: 360, height: 360,
            borderRadius: 180, backgroundColor: 'rgba(31,119,180,0.3)',
            ...(isWeb ? { filter: 'blur(90px)' } : {}),
          } as any} />
          <View style={{
            position: 'absolute', bottom: -60, right: -40, width: 300, height: 300,
            borderRadius: 150, backgroundColor: 'rgba(6,167,125,0.2)',
            ...(isWeb ? { filter: 'blur(80px)' } : {}),
          } as any} />

          <Animated.View style={{ transform: [{ scale: logoScale }], marginBottom: 28 }}>
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              padding: 20,
              borderRadius: 32,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
              ...(isWeb ? { backdropFilter: 'blur(20px)' } : {}),
            } as any}>
              <Image
                source={require('../../assets/images/logo-glow.png')}
                style={{ width: 80, height: 80, resizeMode: 'contain' }}
              />
            </View>
          </Animated.View>

          <Animated.View style={{
            alignItems: 'center', width: '100%', maxWidth: 720,
            opacity: heroFade, transform: [{ translateY: heroSlide }],
          }}>
            <Text style={{
              color: '#FFFFFF',
              fontSize: isDesktop ? 68 : 52,
              fontWeight: '800',
              textAlign: 'center',
              letterSpacing: -2,
              marginBottom: 6,
              lineHeight: isDesktop ? 76 : 58,
            }}>
              Paw<Text style={{ color: '#1F77B4' }}>Alert</Text>
            </Text>

            <View style={{
              backgroundColor: 'rgba(31,119,180,0.15)',
              paddingHorizontal: 18,
              paddingVertical: 6,
              borderRadius: 100,
              borderWidth: 1,
              borderColor: 'rgba(31,119,180,0.3)',
              marginBottom: 18,
            }}>
              <Text style={{ color: '#93C5FD', fontSize: 12, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' }}>
                Reportando para cambiar vidas
              </Text>
            </View>

            <Text style={{
              color: '#94A3B8',
              fontSize: isDesktop ? 18 : 15,
              fontWeight: '500',
              textAlign: 'center',
              maxWidth: 500,
              lineHeight: isDesktop ? 30 : 24,
              marginBottom: 36,
            }}>
              Conecta a ciudadanos con asociaciones para rescatar animales en situación de calle.
            </Text>

            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12, width: '100%', maxWidth: 460 }}>
              <AnimatedButton onPress={() => router.push('/map')} style={{ flex: 1 }}>
                <View style={{
                  backgroundColor: '#1F77B4',
                  paddingVertical: 15,
                  paddingHorizontal: 24,
                  borderRadius: 16,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                  ...(isWeb ? { boxShadow: '0 8px 28px rgba(31,119,180,0.45)' } : { elevation: 6 }),
                } as any}>
                  <Ionicons name="map" size={18} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Ver Reportes en Vivo</Text>
                </View>
              </AnimatedButton>

              <AnimatedButton onPress={() => setIsAssociationFormVisible(true)} style={{ flex: 1 }}>
                <View style={{
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  paddingVertical: 15,
                  paddingHorizontal: 24,
                  borderRadius: 16,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.18)',
                  ...(isWeb ? { backdropFilter: 'blur(10px)' } : {}),
                } as any}>
                  <Ionicons name="business-outline" size={18} color="#E2E8F0" />
                  <Text style={{ color: '#E2E8F0', fontSize: 15, fontWeight: '700' }}>Registrar Asociación</Text>
                </View>
              </AnimatedButton>
            </View>
          </Animated.View>
        </View>

        {/* ─── STATS STRIP ─── */}
        <Animated.View style={{
          flexDirection: 'row', justifyContent: 'center',
          paddingHorizontal: 24, marginTop: -44, zIndex: 20,
          opacity: statsOpacity, transform: [{ translateY: statsSlide }],
        }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            paddingVertical: 22,
            paddingHorizontal: 28,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-around',
            width: '100%',
            maxWidth: 800,
            borderWidth: 1,
            borderColor: '#F1F5F9',
            ...(isWeb ? { boxShadow: '0 20px 60px rgba(0,0,0,0.07)' } : { elevation: 8 }),
          } as any}>
            {[
              { value: '24/7', label: 'Atención', color: '#1F77B4' },
              { value: '100%', label: 'Gratuito', color: '#06A77D' },
              { value: '∞', label: 'Comunidad', color: '#F77F00' },
            ].map((stat, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={{ width: 1, height: 36, backgroundColor: '#E2E8F0' }} />}
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ fontSize: 26, fontWeight: '800', color: stat.color, marginBottom: 3 }}>{stat.value}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 2 }}>{stat.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </Animated.View>

        {/* ─── HOW IT WORKS ─── */}
        <Animated.View style={{
          paddingHorizontal: 24, paddingTop: 72, paddingBottom: 16,
          maxWidth: 960, alignSelf: 'center', width: '100%',
          opacity: howOpacity, transform: [{ translateY: howSlide }],
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#1F77B4', textTransform: 'uppercase', letterSpacing: 2.5, textAlign: 'center', marginBottom: 6 }}>
            ¿Cómo funciona?
          </Text>
          <Text style={{ fontSize: isDesktop ? 36 : 28, fontWeight: '800', color: '#1E293B', textAlign: 'center', letterSpacing: -0.8, marginBottom: 40 }}>
            3 pasos para salvar una vida
          </Text>

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16 }}>
            {[
              { step: '01', title: 'Reporta', desc: 'Toma una foto y marca la ubicación en segundos.', accent: '#1F77B4', icon: 'camera-outline' },
              { step: '02', title: 'Conectamos', desc: 'Notificamos a la asociación más cercana al instante.', accent: '#F77F00', icon: 'flash-outline' },
              { step: '03', title: 'Rescatamos', desc: 'La asociación se moviliza y actualiza el estado en vivo.', accent: '#06A77D', icon: 'paw-outline' },
            ].map((item, i) => (
              <View key={i} style={{
                flex: 1,
                backgroundColor: '#FFFFFF',
                borderRadius: 24,
                padding: 28,
                borderWidth: 1,
                borderColor: '#F1F5F9',
                position: 'relative',
                overflow: 'hidden',
                ...(isWeb ? { boxShadow: '0 2px 16px rgba(0,0,0,0.04)' } : { elevation: 2 }),
              } as any}>
                <View style={{ position: 'absolute', top: 0, left: 20, right: 20, height: 3, backgroundColor: item.accent, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: item.accent + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Ionicons name={item.icon as any} size={22} color={item.accent} />
                </View>
                <Text style={{ fontSize: 42, fontWeight: '800', color: '#F1F5F9', position: 'absolute', top: 12, right: 20 }}>{item.step}</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 6 }}>{item.title}</Text>
                <Text style={{ fontSize: 14, color: '#64748B', lineHeight: 22, fontWeight: '500' }}>{item.desc}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ─── MISIÓN / VISIÓN ─── */}
        <Animated.View style={{
          paddingHorizontal: 24, paddingTop: 56, paddingBottom: 56,
          maxWidth: 960, alignSelf: 'center', width: '100%',
          opacity: missionOpacity, transform: [{ translateY: missionSlide }],
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#06A77D', textTransform: 'uppercase', letterSpacing: 2.5, textAlign: 'center', marginBottom: 6 }}>
            Nuestro propósito
          </Text>
          <Text style={{ fontSize: isDesktop ? 36 : 28, fontWeight: '800', color: '#1E293B', textAlign: 'center', letterSpacing: -0.8, marginBottom: 36 }}>
            Lo que nos mueve cada día
          </Text>

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 20 }}>
            {[
              {
                icon: '🎯', accent: '#1F77B4', bg: 'rgba(31,119,180,0.06)',
                title: 'Nuestra Misión',
                text: 'Brindar ayuda rápida y efectiva a los animales en situación de calle, creando una red de apoyo que salva vidas a través de tecnología accesible para todos.',
              },
              {
                icon: '🌍', accent: '#06A77D', bg: 'rgba(6,167,125,0.06)',
                title: 'Nuestra Visión',
                text: 'Ser la plataforma líder en rescate animal, erradicando el sufrimiento en las calles y fomentando una cultura de adopción, respeto y empatía hacia toda forma de vida.',
              },
            ].map((card, i) => (
              <View key={i} style={{
                flex: 1,
                borderRadius: 28,
                padding: 32,
                overflow: 'hidden',
                position: 'relative',
                borderWidth: 1,
                borderColor: '#F1F5F9',
                backgroundColor: '#FFFFFF',
                ...(isWeb ? { boxShadow: '0 2px 16px rgba(0,0,0,0.04)' } : { elevation: 2 }),
              } as any}>
                <View style={{ position: 'absolute', top: -30, right: -30, width: 130, height: 130, borderRadius: 65, backgroundColor: card.bg }} />
                <View style={{ width: 52, height: 52, backgroundColor: card.bg, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Text style={{ fontSize: 26 }}>{card.icon}</Text>
                </View>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 10, letterSpacing: -0.3 }}>{card.title}</Text>
                <Text style={{ fontSize: 14, color: '#64748B', lineHeight: 24, fontWeight: '500' }}>{card.text}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ─── ASOCIACIONES ─── */}
        <View style={{ backgroundColor: '#FFFFFF', paddingTop: 56, paddingBottom: 72 }}>
          <View style={{ paddingHorizontal: 24, maxWidth: 960, alignSelf: 'center', width: '100%', marginBottom: 28 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#F77F00', textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 6 }}>Aliados</Text>
            <Text style={{ fontSize: isDesktop ? 36 : 28, fontWeight: '800', color: '#1E293B', letterSpacing: -0.8, marginBottom: 6 }}>Red de Asociaciones</Text>
            <Text style={{ fontSize: 14, color: '#94A3B8', fontWeight: '500' }}>Los héroes locales que hacen esto posible.</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 32 }}>
            {[
              { name: 'Huellitas de Amor', color: '#1F77B4' },
              { name: 'Patitas Felices', color: '#06A77D' },
              { name: 'Refugio Esperanza', color: '#F77F00' },
              { name: 'Amigos Peludos', color: '#E63946' },
              { name: 'SOS Animal', color: '#8B5CF6' },
              { name: 'Vida Animal', color: '#0EA5E9' },
            ].map((item, i) => (
              <View key={i} style={{
                backgroundColor: '#F8FAFC',
                padding: 24,
                borderRadius: 24,
                marginRight: 14,
                alignItems: 'center',
                justifyContent: 'center',
                width: 180,
                height: 200,
                borderWidth: 1,
                borderColor: '#F1F5F9',
              }}>
                <View style={{
                  width: 72, height: 72, borderRadius: 36,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                  borderWidth: 2,
                  borderColor: item.color + '25',
                  ...(isWeb ? { boxShadow: `0 4px 14px ${item.color}18` } : {}),
                } as any}>
                  <Image source={require('../../assets/images/icon.png')} style={{ width: 40, height: 40, opacity: 0.75 }} resizeMode="contain" />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B', textAlign: 'center', marginBottom: 8 }}>{item.name}</Text>
                <View style={{ backgroundColor: item.color + '18', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: item.color, textTransform: 'uppercase', letterSpacing: 1.2 }}>Activa</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ─── CTA BANNER ─── */}
        <Animated.View style={{
          paddingHorizontal: 24, paddingVertical: 52,
          opacity: ctaOpacity, transform: [{ translateY: ctaSlide }],
        }}>
          <View style={{
            backgroundColor: '#0F172A',
            borderRadius: 28,
            padding: isDesktop ? 52 : 32,
            alignItems: 'center',
            overflow: 'hidden',
            position: 'relative',
            maxWidth: 960,
            alignSelf: 'center',
            width: '100%',
            ...(isWeb ? { boxShadow: '0 20px 60px rgba(0,0,0,0.15)' } : { elevation: 8 }),
          } as any}>
            <View style={{
              position: 'absolute', top: -50, right: -50,
              width: 180, height: 180, borderRadius: 90,
              backgroundColor: 'rgba(31,119,180,0.2)',
              ...(isWeb ? { filter: 'blur(50px)' } : {}),
            } as any} />
            <View style={{
              position: 'absolute', bottom: -30, left: -30,
              width: 140, height: 140, borderRadius: 70,
              backgroundColor: 'rgba(6,167,125,0.15)',
              ...(isWeb ? { filter: 'blur(40px)' } : {}),
            } as any} />

            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(31,119,180,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, zIndex: 1 }}>
              <Ionicons name="alert-circle" size={28} color="#60A5FA" />
            </View>
            <Text style={{ fontSize: isDesktop ? 32 : 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 10, letterSpacing: -0.5, zIndex: 1 }}>
              ¿Viste un animal en peligro?
            </Text>
            <Text style={{ fontSize: 15, color: '#94A3B8', textAlign: 'center', marginBottom: 24, maxWidth: 380, lineHeight: 24, fontWeight: '500', zIndex: 1 }}>
              Tu reporte puede ser la diferencia. Actúa ahora.
            </Text>

            <AnimatedButton onPress={() => router.push('/map')}>
              <View style={{
                backgroundColor: '#1F77B4',
                paddingVertical: 14,
                paddingHorizontal: 36,
                borderRadius: 14,
                zIndex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                ...(isWeb ? { boxShadow: '0 8px 28px rgba(31,119,180,0.45)' } : {}),
              } as any}>
                <Ionicons name="map" size={18} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Ver Reportes en Vivo →</Text>
              </View>
            </AnimatedButton>
          </View>
        </Animated.View>

        {/* ─── FOOTER ─── */}
        <View style={{ backgroundColor: '#0F172A', paddingVertical: 36, paddingHorizontal: 24, alignItems: 'center' }}>
          <Image source={require('../../assets/images/logo-glow.png')} style={{ width: 24, height: 24, opacity: 0.35, marginBottom: 10, resizeMode: 'contain' }} />
          <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: '500', letterSpacing: 0.3, marginBottom: 3 }}>
            © 2026 PawAlert · Juntos salvando vidas
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.12)', fontSize: 10, fontWeight: '500' }}>
            Hecho con ❤️ para los que no tienen voz
          </Text>
        </View>

      </ScrollView>

      {/* MODAL PARA REGISTRO DE ASOCIACIÓN CON LAZY LOADING Y SUSPENSE */}
      <Modal
        visible={isAssociationFormVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAssociationFormVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
            {isAssociationFormVisible && (
              <Suspense fallback={
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#3498DB" />
                  <Text style={{ marginTop: 12, color: '#7F8C8D', fontWeight: '500' }}>Cargando formulario...</Text>
                </View>
              }>
                <AssociationFormScreen onClose={() => setIsAssociationFormVisible(false)} />
              </Suspense>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}