import React from 'react';
import { SafeAreaView, ScrollView, Text, TouchableOpacity, View, Platform, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Fraunces_800ExtraBold } from '@expo-google-fonts/fraunces';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';

const C = {
  primary: '#EC802B',
  primaryLight: 'rgba(236, 128, 43, 0.1)',
  textDark: '#2E2A26',
  textLight: '#7A7571',
  bg: '#FAF3EA',
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
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={C.textDark} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.centeredContent}>
          <View style={styles.heroSection}>
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

      {/* Bottom Menu */}
      <View style={[styles.bottomMenu, { paddingBottom: Math.max(8, insets.bottom) }]}>
        <TouchableOpacity onPress={() => router.replace('/')} style={styles.menuItem}>
          <Ionicons name="home-outline" size={22} color={C.textLight} />
          <Text style={styles.menuText}>Inicio</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/map')} style={styles.menuItem}>
          <Ionicons name="map-outline" size={22} color={C.textLight} />
          <Text style={styles.menuText}>Mapa</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/events')} style={styles.menuItem}>
          <Ionicons name="calendar-outline" size={22} color={C.textLight} />
          <Text style={styles.menuText}>Eventos</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/nearby-cases')} style={styles.menuItem}>
          <Ionicons name="navigate-circle-outline" size={23} color={C.textLight} />
          <Text style={styles.menuText}>Cerca</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/adopciones')} style={styles.menuItem}>
          <Ionicons name="paw-outline" size={22} color={C.textLight} />
          <Text style={styles.menuText}>Adopta</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/profile')} style={styles.menuItem}>
          <Ionicons name="person-outline" size={22} color={C.textLight} />
          <Text style={styles.menuText}>Perfil</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bottomMenu: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0E6D6',
    ...Platform.select({
      web: {
        position: 'absolute', left: 16, right: 16, bottom: 18,
        maxWidth: 480, marginHorizontal: 'auto',
        borderRadius: 28, height: 68, elevation: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.9)'
      } as any,
      default: {
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06, shadowRadius: 16, elevation: 12,
      }
    })
  },
  menuItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    fontFamily: F.bodySemiBold,
    fontSize: 10,
    color: C.textLight,
    marginTop: 2,
  },
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 10 : 30,
    paddingBottom: 10,
    zIndex: 1,
  },
  backButton: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6DFD5',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    zIndex: 1,
  },
  centeredContent: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 30,
  },
  heroTitle: {
    fontFamily: F.displayBold,
    fontSize: 28,
    color: C.textDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontFamily: F.bodyMedium,
    fontSize: 14,
    color: C.textLight,
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
