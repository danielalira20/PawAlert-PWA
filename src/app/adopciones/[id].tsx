import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../../constants/api';

const { width } = Dimensions.get('window');
const COLORS = {
  primary: '#EC802B',
  bgWhite: '#FFFFFF',
  bgLight: '#F9F6F0',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  accent: '#66BCB4',
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
      // Ruta pública, no requiere token de autorización
      const res = await axios.get(`${API_URL}/adoptions/${id}`);
      setPerfil(res.data);
    } catch (error) {
      console.log('Error cargando perfil público:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!perfil) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="paw-outline" size={64} color="#D1D5DB" />
        <Text style={styles.errorText}>Este perfil ya no está disponible.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButtonBasic}>
          <Text style={styles.backButtonTextBasic}>Volver a la galería</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const esMacho = perfil.sexo === 'macho';

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* --- Carrusel de Fotos --- */}
        <View style={styles.imageContainer}>
          {perfil.fotos && perfil.fotos.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {perfil.fotos.map((foto: any, index: number) => (
                <Image key={index} source={{ uri: foto.foto_url }} style={styles.mainImage} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.mainImage, styles.placeholderImage]}>
              <Ionicons name="paw" size={80} color="#EDC55B" />
            </View>
          )}

          {/* Botón Flotante para regresar */}
          <TouchableOpacity onPress={() => router.back()} style={styles.floatingBackButton}>
            <Feather name="arrow-left" size={24} color={COLORS.textDark} />
          </TouchableOpacity>
        </View>

        {/* --- Contenido del Perfil --- */}
        <View style={styles.contentContainer}>
          
          {/* Header: Nombre y Sexo */}
          <View style={styles.headerRow}>
            <Text style={styles.name}>{perfil.nombre_publico}</Text>
            <View style={[styles.sexBadge, { backgroundColor: esMacho ? '#EAF2F8' : '#FDEDEC' }]}>
              <Ionicons 
                name={esMacho ? 'male' : (perfil.sexo === 'hembra' ? 'female' : 'help')} 
                size={18} 
                color={esMacho ? '#3498DB' : '#E74C3C'} 
              />
            </View>
          </View>

          {/* Badges de Detalles */}
          <View style={styles.badgesRow}>
            <View style={styles.detailBadge}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.textLight} />
              <Text style={styles.detailText}>{perfil.edad_aproximada}</Text>
            </View>
            <View style={styles.detailBadge}>
              <Ionicons name="resize-outline" size={14} color={COLORS.textLight} />
              <Text style={styles.detailText}>{perfil.tamanio?.descripcion}</Text>
            </View>
            <View style={styles.detailBadge}>
              <Ionicons name="location-outline" size={14} color={COLORS.textLight} />
              <Text style={styles.detailText}>{perfil.zona_general}</Text>
            </View>
          </View>

          {/* Tarjeta de la Asociación */}
          <View style={styles.associationCard}>
            <View style={styles.associationIcon}>
              <Ionicons name="home" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.associationTitle}>En resguardo de</Text>
              <Text style={styles.associationName}>{perfil.asociacion?.nombre}</Text>
            </View>
          </View>

          {/* Secciones de Texto */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Su historia</Text>
            <Text style={styles.bodyText}>{perfil.descripcion}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personalidad</Text>
            <Text style={styles.bodyText}>{perfil.personalidad}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Estado de salud</Text>
            <Text style={styles.bodyText}>{perfil.salud_conocida}</Text>
            
            <View style={styles.healthRow}>
              <Ionicons name="checkmark-circle" size={16} color={perfil.vacunacion_estado === 'completo' ? '#27AE60' : COLORS.textLight} />
              <Text style={styles.healthText}>Vacunas: <Text style={{textTransform: 'capitalize'}}>{perfil.vacunacion_estado.replace('_', ' ')}</Text></Text>
            </View>
            <View style={styles.healthRow}>
              <Ionicons name="checkmark-circle" size={16} color={perfil.esterilizacion_estado === 'completo' ? '#27AE60' : COLORS.textLight} />
              <Text style={styles.healthText}>Esterilización: <Text style={{textTransform: 'capitalize'}}>{perfil.esterilizacion_estado.replace('_', ' ')}</Text></Text>
            </View>
          </View>

        </View>
      </ScrollView>

      {/* --- Botón Inferior Fijo --- */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.adoptButton} onPress={() => alert('Próximamente: Flujo de solicitud')}>
          <Ionicons name="heart" size={20} color={COLORS.bgWhite} style={{ marginRight: 8 }} />
          <Text style={styles.adoptButtonText}>¡Quiero Adoptar a {perfil.nombre_publico}!</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bgLight, padding: 20 },
  errorText: { fontSize: 16, color: COLORS.textLight, marginTop: 16, textAlign: 'center', fontWeight: '600' },
  backButtonBasic: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: COLORS.primary, borderRadius: 20 },
  backButtonTextBasic: { color: COLORS.bgWhite, fontWeight: '800' },
  imageContainer: { width: width, height: width, position: 'relative' },
  mainImage: { width: width, height: width },
  placeholderImage: { backgroundColor: '#FAF3EA', justifyContent: 'center', alignItems: 'center' },
  floatingBackButton: { position: 'absolute', top: 50, left: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  contentContainer: { backgroundColor: COLORS.bgWhite, borderTopLeftRadius: 32, borderTopRightRadius: 32, marginTop: -32, padding: 24, minHeight: 400 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  name: { fontSize: 28, fontWeight: '900', color: COLORS.textDark, flex: 1 },
  sexBadge: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  detailBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  detailText: { fontSize: 13, color: COLORS.textDark, fontWeight: '600', marginLeft: 6, textTransform: 'capitalize' },
  associationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(236,128,43,0.05)', padding: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(236,128,43,0.2)' },
  associationIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(236,128,43,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  associationTitle: { fontSize: 11, color: COLORS.primary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  associationName: { fontSize: 16, color: COLORS.textDark, fontWeight: '800' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginBottom: 12 },
  bodyText: { fontSize: 15, color: '#566573', lineHeight: 24 },
  healthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  healthText: { fontSize: 14, color: COLORS.textDark, marginLeft: 8, fontWeight: '500' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.bgWhite, paddingHorizontal: 24, paddingVertical: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 10 },
  adoptButton: { flexDirection: 'row', backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  adoptButtonText: { color: COLORS.bgWhite, fontSize: 16, fontWeight: '900' }
});