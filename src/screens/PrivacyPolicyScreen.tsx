import React from 'react';
import { SafeAreaView, ScrollView, Text, TouchableOpacity, View, Platform, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Fraunces_800ExtraBold } from '@expo-google-fonts/fraunces';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';

const C = {
  primary: '#ffa45eff',
  primaryLight: 'rgba(245, 132, 43, 0.1)',
  textDark: '#2E2A26',
  textLight: '#7A7571',
  bg: '#F4F6F8',
  cardBg: '#FFFFFF',
  teal: '#66BCB4',
  tealLight: 'rgba(102, 188, 180, 0.15)',
};

const F = {
  displayBold: 'Fraunces_800ExtraBold',
  bodyRegular: 'Poppins_400Regular',
  bodyMedium: 'Poppins_500Medium',
  bodySemiBold: 'Poppins_600SemiBold',
};

const SECTIONS = [
  {
    icon: 'id-card-outline',
    color: '#8E44AD',
    bgColor: 'rgba(142, 68, 173, 0.1)',
    title: '1. Datos Personales que Recopilamos',
    content: 'Para brindarte un servicio óptimo en la red de rescate animal de PawAlert, recopilamos la siguiente información:\n\n• Datos de Contacto e Identidad: Nombre completo, teléfono, correo electrónico, identificaciones oficiales e información veterinaria (si aplica).\n• Datos de Ubicación: Coordenadas al reportar o postularte.\n• Archivos Multimedia: Fotografías y videos para evidencia.'
  },
  {
    icon: 'paw-outline',
    color: C.primary,
    bgColor: C.primaryLight,
    title: '2. Finalidad del Uso de tus Datos',
    content: 'La información se utilizará exclusivamente para:\n• Facilitar el rescate, resguardo y adopción de animales.\n• Verificar la identidad de nuestros voluntarios.\n• Mostrar a la comunidad reportes geolocalizados precisos.\n• Mantenerte informado a través de notificaciones.'
  },
  {
    icon: 'lock-closed-outline',
    color: '#3498DB',
    bgColor: 'rgba(52, 152, 219, 0.1)',
    title: '3. Transferencia de Datos',
    content: 'Tus datos sensibles (credencial, videos del hogar, teléfono) NO serán públicos. Solo se compartirán de forma encriptada con las Asociaciones Protectoras autorizadas.\n\nDatos como tu nombre de pila y zona podrán mostrarse a la comunidad para el mural de aportaciones ("Huellas que ayudan").'
  },
  {
    icon: 'shield-half-outline',
    color: C.teal,
    bgColor: C.tealLight,
    title: '4. Derechos ARCO',
    content: 'Tienes el derecho de Acceder, Rectificar, Cancelar u Oponerte al tratamiento de tus datos personales (Derechos ARCO). Para ejercerlos, envía una solicitud a nuestro soporte técnico.'
  },
  {
    icon: 'server-outline',
    color: '#E74C3C',
    bgColor: 'rgba(231, 76, 60, 0.1)',
    title: '5. Medidas de Seguridad',
    content: 'Toda la información es resguardada utilizando protocolos modernos de seguridad (almacenamiento autenticado). Entiendes que en internet ningún sistema es 100% infalible.'
  }
];

export default function PrivacyPolicyScreen() {
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
              <Ionicons name="shield-checkmark" size={40} color={C.primary} />
            </View>
            <Text style={styles.heroTitle}>Aviso de Privacidad</Text>
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
              Tu privacidad y seguridad son nuestra máxima prioridad al proteger a los animales.
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
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontFamily: F.bodyMedium,
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.9)',
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
