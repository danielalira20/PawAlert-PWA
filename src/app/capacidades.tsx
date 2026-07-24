import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import CapacidadesFormScreen from '../screens/CapacidadesFormScreen'; 

export default function CapacidadesRoute() {
  
  // Función que se ejecutará si el usuario decide presionar "Descartar" o salir
  const handleClose = () => {
    // router.back() lo regresa a la pantalla anterior (LandingScreen o Perfil)
    // Si prefieres mandarlo al inicio forzosamente, usa router.replace('/')
    router.replace('/'); 
  };

  return (
    <View style={styles.container}>
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
    backgroundColor: 'transparent',
  },
});
