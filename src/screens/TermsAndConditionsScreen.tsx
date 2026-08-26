import React from 'react';
import { SafeAreaView, ScrollView, Text, TouchableOpacity, View, Platform, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Fraunces_800ExtraBold } from '@expo-google-fonts/fraunces';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';

const C = {
  primary:       '#F5842B',
  primaryLight:  'rgba(245, 132, 43, 0.1)',
  textDark:      '#2E2A26',
  textLight:     '#7A7571',
  bg:            '#F4F6F8', // A slightly cooler gray for contrast
  cardBg:        '#FFFFFF',
  teal:          '#66BCB4',
  tealLight:     'rgba(102, 188, 180, 0.15)',
};

const F = {
  displayBold: 'Fraunces_800ExtraBold',
  bodyRegular: 'Poppins_400Regular',
  bodyMedium: 'Poppins_500Medium',
  bodySemiBold: 'Poppins_600SemiBold',
};

const SECTIONS = [
  {
    icon: 'checkmark-circle',
    color: C.teal,
    bgColor: C.tealLight,
    title: '1. Aceptación de los Términos',
    content: 'Al acceder o utilizar PawAlert, aceptas estar sujeto a estos términos y condiciones. Si no estás de acuerdo con alguna parte de estos términos, no podrás usar nuestra plataforma.'
  },
  {
    icon: 'globe-outline',
    color: C.primary,
    bgColor: C.primaryLight,
    title: '2. Propósito de la Plataforma',
    content: 'PawAlert es una herramienta colaborativa para conectar rescatistas, voluntarios, asociaciones y aliados. Su propósito principal es coordinar la atención y el rescate de animales en situación de riesgo.'
  },
  {
    icon: 'shield-checkmark-outline',
    color: '#8E44AD',
    bgColor: 'rgba(142, 68, 173, 0.1)',
    title: '3. Responsabilidades del Usuario',
    content: '• Eres responsable de mantener la confidencialidad de tu cuenta.\n• Te comprometes a usar la plataforma únicamente con fines relacionados al bienestar animal.\n• Al registrarte como voluntario o aliado, aseguras que la información proporcionada es verídica.\n• Entiendes que el uso indebido de los reportes resultará en la suspensión inmediata.'
  },
  {
    icon: 'warning-outline',
    color: '#E74C3C',
    bgColor: 'rgba(231, 76, 60, 0.1)',
    title: '4. Limitación de Responsabilidad',
    content: 'PawAlert actúa como un facilitador de comunicación. No somos responsables por:\n• Daños, lesiones o accidentes ocurridos durante los procesos de rescate en campo.\n• Conflictos o desavenencias entre los usuarios.\n• Los gastos generados en clínicas y con terceros.'
  },
  {
    icon: 'document-text-outline',
    color: '#3498DB',
    bgColor: 'rgba(52, 152, 219, 0.1)',
    title: '5. Propiedad Intelectual',
    content: 'Todo el contenido original, características y funcionalidades de PawAlert son propiedad de nuestra organización y están protegidos por leyes de derechos de autor y propiedad intelectual.'
  },
  {
    icon: 'refresh-circle-outline',
    color: '#2ECC71',
    bgColor: 'rgba(46, 204, 113, 0.1)',
    title: '6. Modificaciones a los Términos',
    content: 'Nos reservamos el derecho de modificar estos términos en cualquier momento. El uso continuo de la aplicación después de cualquier modificación constituye tu aceptación de los nuevos Términos de Uso.'
  }
];

export default function TermsAndConditionsScreen() {
  const [fontsLoaded] = useFonts({
    Fraunces_800ExtraBold,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerBackground} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.centeredContent}>
          <View style={styles.heroSection}>
            <View style={styles.iconContainer}>
              <Ionicons name="document-text" size={40} color={C.primary} />
            </View>
            <Text style={styles.heroTitle}>Términos y Condiciones</Text>
            <Text style={styles.heroSubtitle}>Última actualización: Agosto 2026</Text>
          </View>

          <View style={styles.cardsContainer}>
            {SECTIONS.map((sec, idx) => (
              <View key={idx} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIconWrapper, { backgroundColor: sec.bgColor }]}>
                    <Ionicons name={sec.icon as any} size={24} color={sec.color} />
                  </View>
                  <Text style={styles.cardTitle}>{sec.title}</Text>
                </View>
                <Text style={styles.cardContent}>{sec.content}</Text>
              </View>
            ))}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Si tienes alguna duda sobre nuestros términos y condiciones, no dudes en contactarnos a través de los canales oficiales.
            </Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Aceptar y Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  headerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 250,
    backgroundColor: C.primary,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    zIndex: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 10 : 30,
    paddingBottom: 20,
    zIndex: 1,
  },
  backButton: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
  },
  headerTitle: {
    fontFamily: F.bodySemiBold,
    fontSize: 18,
    color: '#FFF',
    marginLeft: 16,
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    zIndex: 1,
  },
  centeredContent: {
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 30,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...Platform.select({
      web: { boxShadow: '0 8px 16px rgba(0,0,0,0.1)' } as any,
      default: { elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 }
    })
  },
  heroTitle: {
    fontFamily: F.displayBold,
    fontSize: 28,
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontFamily: F.bodyMedium,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  cardsContainer: {
    gap: 16,
  },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 24,
    padding: 20,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.05)' } as any,
      default: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }
    })
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitle: {
    flex: 1,
    fontFamily: F.bodySemiBold,
    fontSize: 16,
    color: C.textDark,
  },
  cardContent: {
    fontFamily: F.bodyRegular,
    fontSize: 14,
    color: C.textLight,
    lineHeight: 22,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    fontFamily: F.bodyMedium,
    fontSize: 13,
    color: C.textLight,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  primaryButton: {
    backgroundColor: C.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 20,
    width: '100%',
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(245, 132, 43, 0.3)' } as any,
      default: { elevation: 6, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }
    })
  },
  primaryButtonText: {
    fontFamily: F.bodySemiBold,
    fontSize: 16,
    color: '#FFF',
  }
});
