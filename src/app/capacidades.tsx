import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import CapacidadesFormScreen from '../screens/CapacidadesFormScreen'; 

const heroImage = require('../assets/images/imagen_hero.png');

export default function CapacidadesRoute() {
  const handleClose = () => {
    router.replace('/'); 
  };

  return (
    <View style={styles.container}>
      <Image source={heroImage} style={styles.backgroundImage} resizeMode="cover" />
      <View style={styles.overlay} />
      <CapacidadesFormScreen 
        esPostulacionNueva={true} 
        esPostulacionExterna={true}
        onClose={handleClose} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDF8F4',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.15,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(253, 248, 244, 0.85)',
  }
});
