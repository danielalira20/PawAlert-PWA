import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../../../constants/api';

const { width } = Dimensions.get('window');
const isDesktop = width > 768;

const C = {
  primary: '#F5842B', secondary: '#66C5BD', text: '#2E2A26',
  muted: '#9E8C7E', bg: '#FFFFFF', bgSoft: '#FDF8F4',
  accent: '#F6CE5B', neutralLight: '#E8CCAD',
};

export default function PublicAdoptionProfileScreen() {
  const { id } = useLocalSearchParams();
  const [perfil, setPerfil] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    cargarPerfilPublico();
  }, [id]);

  const cargarPerfilPublico = async () => {
    try {
      const res = await axios.get(`${API_URL}/adoptions/${id}`);
      setPerfil(res.data);
    } catch (error) {
      console.log('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <View style={styles.centerContainer}><ActivityIndicator size="large" color={C.primary} /></View>;
  if (!perfil) return (
    <View style={styles.centerContainer}>
      <Ionicons name="paw-outline" size={64} color={C.neutralLight} />
      <Text style={styles.errorText}>Perfil no disponible.</Text>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButtonBasic}>
        <Text style={{ color: C.bg, fontFamily: 'Poppins_600SemiBold' }}>Volver</Text>
      </TouchableOpacity>
    </View>
  );

  const esMacho = perfil.sexo === 'macho';

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* --- Carrusel Superior --- */}
        <View style={styles.imageContainer}>
          {perfil.fotos && perfil.fotos.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {perfil.fotos.map((foto: any, index: number) => (
                <Image key={index} source={{ uri: foto.foto_url }} style={styles.mainImage} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.mainImage, styles.placeholderImage]}>
              <Ionicons name="paw" size={80} color={C.neutralLight} />
            </View>
          )}
          <TouchableOpacity onPress={() => router.back()} style={styles.floatingBackButton}>
            <Feather name="arrow-left" size={24} color={C.text} />
          </TouchableOpacity>
        </View>

        {/* --- Contenido Blanco (Sube sobre la foto) --- */}
        <View style={styles.contentContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.name}>{perfil.nombre_publico}</Text>
            <View style={[styles.sexBadge, { backgroundColor: esMacho ? `${C.secondary}15` : `${C.primary}15` }]}>
              <Ionicons name={esMacho ? 'male' : (perfil.sexo === 'hembra' ? 'female' : 'help')} size={20} color={esMacho ? C.secondary : C.primary} />
            </View>
          </View>

          <View style={styles.badgesRow}>
            <View style={styles.detailBadge}><Text style={styles.detailText}>{perfil.edad_aproximada}</Text></View>
            <View style={styles.detailBadge}><Text style={styles.detailText}>{perfil.tamanio?.descripcion}</Text></View>
            <View style={styles.detailBadge}><Text style={styles.detailText}>{perfil.zona_general}</Text></View>
          </View>

          <View style={styles.associationCard}>
            <View style={styles.associationIcon}><Ionicons name="home" size={22} color={C.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.associationTitle}>En resguardo de</Text>
              <Text style={styles.associationName}>{perfil.asociacion?.nombre}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Su historia</Text>
            <Text style={styles.bodyText}>{perfil.descripcion}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personalidad</Text>
            <Text style={styles.bodyText}>{perfil.personalidad}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Estado médico</Text>
            <Text style={styles.bodyText}>{perfil.salud_conocida}</Text>
            <View style={{ marginTop: 12, gap: 8 }}>
              <View style={styles.healthRow}>
                <Ionicons name="checkmark-circle" size={18} color={perfil.vacunacion_estado === 'completo' ? C.secondary : C.muted} />
                <Text style={styles.healthText}>Vacunas: {perfil.vacunacion_estado.replace('_', ' ')}</Text>
              </View>
              <View style={styles.healthRow}>
                <Ionicons name="checkmark-circle" size={18} color={perfil.esterilizacion_estado === 'completo' ? C.secondary : C.muted} />
                <Text style={styles.healthText}>Esterilización: {perfil.esterilizacion_estado.replace('_', ' ')}</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* --- Botón Flotante Fijo Inferior --- */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.adoptButton} onPress={() => alert('Próximamente: Solicitud')}>
          <Ionicons name="heart" size={20} color={C.bg} style={{ marginRight: 8 }} />
          <Text style={styles.adoptButtonText}>¡Quiero Adoptar a {perfil.nombre_publico}!</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgSoft },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bgSoft },
  errorText: { fontSize: 16, fontFamily: 'Poppins_500Medium', color: C.muted, marginTop: 16 },
  backButtonBasic: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: C.primary, borderRadius: 100 },
  imageContainer: { width: width, height: isDesktop ? 500 : width * 1.1, position: 'relative' },
  mainImage: { width: width, height: '100%' },
  placeholderImage: { backgroundColor: '#FDF8F4', justifyContent: 'center', alignItems: 'center' },
  floatingBackButton: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  contentContainer: { backgroundColor: C.bg, borderTopLeftRadius: 40, borderTopRightRadius: 40, marginTop: -40, padding: 32, minHeight: 400, maxWidth: 800, width: '100%', alignSelf: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  name: { fontSize: 32, fontFamily: 'Fraunces_800ExtraBold', color: C.text, flex: 1, letterSpacing: -0.5 },
  sexBadge: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 32 },
  detailBadge: { backgroundColor: C.bgSoft, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, borderWidth: 1, borderColor: C.neutralLight },
  detailText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: C.text, textTransform: 'capitalize' },
  associationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: `${C.primary}10`, padding: 20, borderRadius: 24, marginBottom: 32, borderWidth: 1, borderColor: `${C.primary}25` },
  associationIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: `${C.primary}20`, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  associationTitle: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: C.primary, textTransform: 'uppercase', marginBottom: 2 },
  associationName: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: C.text },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 22, fontFamily: 'Fraunces_800ExtraBold', color: C.text, marginBottom: 12 },
  bodyText: { fontSize: 15, fontFamily: 'Poppins_400Regular', color: C.muted, lineHeight: 24 },
  healthRow: { flexDirection: 'row', alignItems: 'center' },
  healthText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: C.text, marginLeft: 8, textTransform: 'capitalize' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg, paddingHorizontal: 24, paddingVertical: 20, borderTopWidth: 1, borderTopColor: C.neutralLight, ...Platform.select({ web: { boxShadow: '0 -4px 20px rgba(0,0,0,0.05)' }, default: { elevation: 10 } }) },
  adoptButton: { flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 18, borderRadius: 100, justifyContent: 'center', alignItems: 'center', maxWidth: 600, width: '100%', alignSelf: 'center' },
  adoptButtonText: { color: C.bg, fontSize: 16, fontFamily: 'Poppins_600SemiBold' }
});