import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';

interface FiltrosProps {
  filtros: {
    especie: string | null;
    edad: string | null;
  };
  setFiltros: (filtros: any) => void;
}

export function FiltrosAdopcion({ filtros, setFiltros }: FiltrosProps) {
  const toggleEspecie = (valor: string) => {
    setFiltros({ ...filtros, especie: filtros.especie === valor ? null : valor });
  };

  const toggleEdad = (valor: string) => {
    setFiltros({ ...filtros, edad: filtros.edad === valor ? null : valor });
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Filtros de Especie */}
        <TouchableOpacity 
          style={[styles.chip, filtros.especie === 'perro' && styles.chipActive]} 
          onPress={() => toggleEspecie('perro')}
        >
          <Text style={[styles.chipText, filtros.especie === 'perro' && styles.chipTextActive]}>🐶 Perros</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.chip, filtros.especie === 'gato' && styles.chipActive]} 
          onPress={() => toggleEspecie('gato')}
        >
          <Text style={[styles.chipText, filtros.especie === 'gato' && styles.chipTextActive]}>🐱 Gatos</Text>
        </TouchableOpacity>

        {/* Separador visual */}
        <View style={styles.separator} />

        {/* Filtros de Edad */}
        <TouchableOpacity 
          style={[styles.chip, filtros.edad === 'cachorro' && styles.chipActive]} 
          onPress={() => toggleEdad('cachorro')}
        >
          <Text style={[styles.chipText, filtros.edad === 'cachorro' && styles.chipTextActive]}>Cachorros</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.chip, filtros.edad === 'adulto' && styles.chipActive]} 
          onPress={() => toggleEdad('adulto')}
        >
          <Text style={[styles.chipText, filtros.edad === 'adulto' && styles.chipTextActive]}>Adultos</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#EC802B',
    borderColor: '#EC802B',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8C7A6B',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  separator: {
    width: 1,
    height: 20,
    backgroundColor: '#D1D5DB',
    marginHorizontal: 4,
  }
});