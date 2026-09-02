import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const isDesktop = width > 768;

export function AdoptionCardGlobal({ perfil, onPress }: { perfil: any, onPress: () => void }) {
  const fotoUrl = perfil.foto_portada?.foto_url;
  const esMacho = perfil.sexo === 'macho';

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.card}>
      <View style={styles.imageContainer}>
        {fotoUrl ? (
          <Image source={{ uri: fotoUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="paw" size={40} color="#EDC55B" />
          </View>
        )}
        
        {/* Badge de Asociación */}
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>{perfil.asociacion?.nombre || 'Rescate'}</Text>
        </View>
      </View>

      <View style={styles.infoContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>{perfil.nombre_publico}</Text>
          <Ionicons 
            name={esMacho ? 'male' : (perfil.sexo === 'hembra' ? 'female' : 'help')} 
            size={16} 
            color={esMacho ? '#3498DB' : '#E74C3C'} 
          />
        </View>
        
        <Text style={styles.details} numberOfLines={1}>
          {perfil.edad_aproximada} · {perfil.tamanio?.descripcion || 'Tamaño mediano'}
        </Text>
        
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={12} color="#8C7A6B" />
          <Text style={styles.locationText} numberOfLines={1}>
            {perfil.zona_general || 'Zona sin especificar'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  imageContainer: {
    width: '100%',
    height: isDesktop ? 280 : 200, // Altura más grande y vistosa para la galería
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: '#FAF3EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: '85%',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4A3728',
  },
  infoContainer: {
    padding: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '900',
    color: '#4A3728',
    flex: 1,
  },
  details: {
    fontSize: 12,
    color: '#8C7A6B',
    textTransform: 'capitalize',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 11,
    color: '#8C7A6B',
    marginLeft: 4,
    flex: 1,
  }
});