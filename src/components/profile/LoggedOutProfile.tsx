import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import { DesktopHeroPanel } from './DesktopHeroPanel';
import { BenefitsRow } from './BenefitsRow';

const DESKTOP_BREAKPOINT = 900;

export function LoggedOutProfile() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const contenido = (
    <View style={[styles.contentInner, isDesktop && styles.contentInnerDesktop]}>
      <View style={styles.iconCircleBig}>
        <Ionicons name="person-outline" size={38} color={Brand.textMuted} />
      </View>

      <Text style={styles.title}>¡Hola! Aún no has iniciado sesión</Text>
      <Text style={styles.subtitle}>
        Inicia sesión para ver tu perfil, reportar animales y mucho más.
      </Text>

      <TouchableOpacity
        onPress={() => router.push('/login')}
        style={[styles.loginButton, isDesktop && styles.loginButtonDesktop]}
        activeOpacity={0.85}
      >
        <Ionicons name="log-in-outline" size={19} color="#fff" />
        <Text style={styles.loginButtonText}>Iniciar sesión</Text>
      </TouchableOpacity>

      <View style={styles.benefitsWrap}>
        <BenefitsRow />
      </View>

      <TouchableOpacity onPress={() => router.push('/login')} style={{ marginTop: 18 }}>
        <Text style={styles.newHereText}>
          ¿Nuevo aquí? <Text style={styles.newHereLink}>Crear una cuenta</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopRow}>
        <View style={styles.desktopLeft}>
          <DesktopHeroPanel />
        </View>
        <ScrollView style={styles.desktopRight} contentContainerStyle={styles.desktopRightContent}>
          {contenido}
        </ScrollView>
      </View>
    );
  }

  // Móvil: solo el contenido de la derecha, sin ilustración — se probó con
  // la imagen chica arriba y no rendía bien en pantallas angostas.
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Brand.backgroundWarm }}
      contentContainerStyle={styles.mobileScrollContent}
    >
      {contenido}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  desktopRow: { flex: 1, flexDirection: 'row' },
  desktopLeft: { flex: 1 },
  desktopRight: { flex: 1, backgroundColor: Brand.cardWarm },
  desktopRightContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  mobileScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 40,
    justifyContent: 'center',
  },

  contentInner: { alignItems: 'center', paddingHorizontal: 4, paddingTop: 20, paddingBottom: 24 },
  contentInnerDesktop: { width: '100%', maxWidth: 480, paddingTop: 0 },

  iconCircleBig: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Brand.textDark,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 17,
    color: Brand.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Brand.primary,
    borderRadius: 28,
    paddingVertical: 17,
    width: '100%',
    shadowColor: Brand.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 38,
  },
  loginButtonDesktop: { maxWidth: 440 },
  loginButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  benefitsWrap: { width: '100%' },

  newHereText: { fontSize: 13, color: Brand.textMuted },
  newHereLink: { color: Brand.primary, fontWeight: '700' },
});