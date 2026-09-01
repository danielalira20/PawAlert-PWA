import React, { useEffect, useState } from 'react';
import { View, FlatList, ActivityIndicator, Text, StyleSheet, TextInput } from 'react-native';
import { router } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { AdoptionCard } from '../../components/adopciones/AdoptionCard';
import { FiltrosAdopcion } from '../../components/adopciones/FiltrosAdopcion';

export default function AdopcionesGalleryScreen() {
  const [perfiles, setPerfiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [tieneMas, setTieneMas] = useState(true);

  // Estados para filtros
  const [filtros, setFiltros] = useState({ especie: null, edad: null });
  const [zonaBuscada, setZonaBuscada] = useState('');

  // Efecto que se dispara al cargar o al cambiar los filtros
  useEffect(() => {
    setPagina(1); // Reiniciamos paginación si cambia un filtro
    cargarPerfiles(1, true);
  }, [filtros, zonaBuscada]);

  const cargarPerfiles = async (pageToFetch: number, reset = false) => {
    if (reset) setIsLoading(true);
    else setIsFetchingMore(true);

    try {
      // Construimos los query params
      const params = new URLSearchParams({
        pagina: pageToFetch.toString(),
        limite: '20'
      });
      if (filtros.especie) params.append('especie', filtros.especie);
      if (filtros.edad) params.append('edad', filtros.edad);
      if (zonaBuscada.trim().length > 2) params.append('zona', zonaBuscada.trim());

      const res = await axios.get(`${API_URL}/adoptions?${params.toString()}`);
      
      const nuevosItems = res.data.items || [];
      setPerfiles(reset ? nuevosItems : [...perfiles, ...nuevosItems]);
      setTieneMas(res.data.tiene_mas);
      setPagina(pageToFetch);

    } catch (error) {
      console.log('Error cargando galería:', error);
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!isFetchingMore && tieneMas && !isLoading) {
      cargarPerfiles(pagina + 1);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header y Buscador */}
      <View style={styles.header}>
        <Text style={styles.title}>Encuentra a tu mejor amigo</Text>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#8C7A6B" style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Buscar por zona (Ej. Puebla)"
            value={zonaBuscada}
            onChangeText={setZonaBuscada}
            placeholderTextColor="#8C7A6B"
          />
        </View>
      </View>

      {/* Componente de Filtros */}
      <FiltrosAdopcion filtros={filtros} setFiltros={setFiltros} />

      {/* Cuadrícula de Perfiles */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#EC802B" />
        </View>
      ) : perfiles.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="paw-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyText}>No encontramos peluditos con estos filtros.</Text>
        </View>
      ) : (
        <FlatList
          data={perfiles}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <AdoptionCard 
              perfil={item} 
              onPress={() => router.push(`/adopciones/${item.id}`)} 
            />
          )}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingMore ? <ActivityIndicator size="small" color="#EC802B" style={{ marginVertical: 20 }} /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F6F0', // Un fondo cálido
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 60, // Ajusta según tu safe area
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#4A3728',
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: '#4A3728',
  },
  row: {
    justifyContent: 'space-between',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 15,
    color: '#8C7A6B',
    textAlign: 'center',
    fontWeight: '600',
  }
});