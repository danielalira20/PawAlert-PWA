import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, StyleSheet, Dimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { API_URL } from '../../constants/api';
import { AdoptionCard } from '../../components/adopciones/AdoptionCard';

const C = { primary: '#EC802B', bg: '#FFFFFF', bgSoft: '#F9F6F0', textDark: '#4A3728', textLight: '#8C7A6B' };
const { width } = Dimensions.get('window');
const isDesktop = width > 768;

export default function AdopcionesGlobalScreen() {
  const [perfiles, setPerfiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtroEspecie, setFiltroEspecie] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } else {
        // Si no da permiso, igual cargamos sin distancia
        cargarGaleria(null, null);
      }
    })();
  }, []);

  useEffect(() => {
    // Cuando ya tengamos la ubicación (o sepamos que no la dio), cargamos
    if (location !== undefined) {
      cargarGaleria(location?.lat, location?.lng, filtroEspecie);
    }
  }, [location, filtroEspecie]);

  const cargarGaleria = async (lat?: number | null, lng?: number | null, especie?: string | null) => {
    setIsLoading(true);
    try {
      let url = `${API_URL}/adoptions?limite=30&pagina=1`;
      if (lat && lng) url += `&lat=${lat}&lng=${lng}`;
      if (especie) url += `&especie=${especie}`;

      const res = await axios.get(url);
      setPerfiles(res.data.items || []);
    } catch (error) {
      console.log('Error cargando galería:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const FiltroBoton = ({ label, valor, icon }: { label: string, valor: string | null, icon: any }) => {
    const activo = filtroEspecie === valor;
    return (
      <TouchableOpacity 
        onPress={() => setFiltroEspecie(valor)}
        style={[styles.filtroBoton, activo && styles.filtroActivo]}
      >
        <Ionicons name={icon} size={16} color={activo ? C.bg : C.textDark} style={{ marginRight: 6 }} />
        <Text style={{ color: activo ? C.bg : C.textDark, fontWeight: activo ? '800' : '600', fontSize: 13 }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER Y FILTROS */}
      <View style={styles.header}>
        <Text style={styles.title}>Encuentra a tu mejor amigo</Text>
        <Text style={styles.subtitle}>
          {location ? "Ordenados por cercanía a ti" : "Mostrando todos los disponibles"}
        </Text>
        
        <View style={styles.filtrosRow}>
          <FiltroBoton label="Todos" valor={null} icon="paw" />
          <FiltroBoton label="Perros" valor="perro" icon="logo-octocat" />
          <FiltroBoton label="Gatos" valor="gato" icon="logo-octocat" />
        </View>
      </View>

      {/* GALERÍA */}
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : perfiles.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="search" size={64} color="#D1D5DB" />
          <Text style={styles.emptyText}>No hay peluditos disponibles en esta categoría.</Text>
        </View>
      ) : (
        <FlatList
          data={perfiles}
          keyExtractor={(item) => item.id}
          numColumns={isDesktop ? 3 : 2}
          key={isDesktop ? 'desktop-3' : 'mobile-2'}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <AdoptionCard 
              perfil={item} 
              // Usa la ruta que creaste anteriormente para el detalle público
              onPress={() => router.push(`/adopcion/${item.id}` as any)} 
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgSoft },
  header: { paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 20, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title: { fontSize: 24, fontWeight: '900', color: C.textDark, marginBottom: 4 },
  subtitle: { fontSize: 13, color: C.textLight, marginBottom: 16 },
  filtrosRow: { flexDirection: 'row', gap: 12 },
  filtroBoton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  filtroActivo: { backgroundColor: C.primary },
  columnWrapper: { justifyContent: 'flex-start', gap: isDesktop ? 20 : 10, paddingHorizontal: 24 },
  listContent: { paddingBottom: 40, paddingTop: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { marginTop: 16, fontSize: 15, fontWeight: '600', color: C.textLight, textAlign: 'center' }
});