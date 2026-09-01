import React, { useEffect, useState } from 'react';
import { View, FlatList, ActivityIndicator, Text, StyleSheet, TextInput, Platform, Dimensions } from 'react-native';
import { router } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../../constants/api';
import { AdoptionCard } from '../../../components/adopciones/AdoptionCard';
import { FiltrosAdopcion } from '../../../components/adopciones/FiltrosAdopcion';

const C = { bgSoft: '#FDF8F4', text: '#2E2A26', primary: '#F5842B', muted: '#9E8C7E', neutralLight: '#E8CCAD' };
const { width } = Dimensions.get('window');

export default function AdopcionesGalleryScreen() {
  const [perfiles, setPerfiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtros, setFiltros] = useState({ especie: null, edad: null });
  const [zonaBuscada, setZonaBuscada] = useState('');

  useEffect(() => {
    cargarPerfiles();
  }, [filtros, zonaBuscada]);

  const cargarPerfiles = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limite: '20' });
      if (filtros.especie) params.append('especie', filtros.especie);
      if (filtros.edad) params.append('edad', filtros.edad);
      if (zonaBuscada.trim().length > 2) params.append('zona', zonaBuscada.trim());
      const res = await axios.get(`${API_URL}/adoptions?${params.toString()}`);
      setPerfiles(res.data.items || []);
    } catch (error) {
      console.log('Error cargando galería:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Encuentra a tu mejor amigo</Text>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={C.muted} style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Buscar por zona (Ej. Puebla)"
            value={zonaBuscada}
            onChangeText={setZonaBuscada}
            placeholderTextColor={C.muted}
          />
        </View>
      </View>

      <FiltrosAdopcion filtros={filtros} setFiltros={setFiltros} />

      {isLoading ? (
        <View style={styles.centerContainer}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : perfiles.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="paw-outline" size={64} color={C.neutralLight} />
          <Text style={styles.emptyText}>No encontramos peluditos con estos filtros.</Text>
        </View>
      ) : (
        <FlatList
          data={perfiles}
          keyExtractor={(item) => item.id}
          numColumns={width > 768 ? 3 : 2}
          key={width > 768 ? 'desktop' : 'mobile'}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <AdoptionCard perfil={item} onPress={() => router.push(`/adopciones/${item.id}`)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgSoft },
  header: { paddingHorizontal: 24, paddingTop: Platform.OS === 'web' ? 40 : 60, paddingBottom: 24, maxWidth: 1024, width: '100%', alignSelf: 'center' },
  title: { fontSize: 32, fontFamily: 'Fraunces_800ExtraBold', color: C.text, marginBottom: 20, letterSpacing: -0.5 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 100, paddingHorizontal: 20, height: 56, borderWidth: 1, borderColor: C.neutralLight },
  searchIcon: { marginRight: 12 },
  searchInput: { flex: 1, height: '100%', fontSize: 15, fontFamily: 'Poppins_400Regular', color: C.text, outlineStyle: 'none' },
  row: { justifyContent: 'space-between', paddingHorizontal: 24 },
  listContent: { paddingBottom: 100, maxWidth: 1024, width: '100%', alignSelf: 'center' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { marginTop: 16, fontSize: 15, fontFamily: 'Poppins_500Medium', color: C.muted, textAlign: 'center' }
});