import React from 'react';
import { Linking, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import type { ContactoAliado, UbicacionAliado } from '../../types/reportestaff';

interface Props {
  contacto: ContactoAliado;
  ubicacion: UbicacionAliado;
  onEntendido: () => void;
}

export function SeguimientoAliadoCard({ contacto, ubicacion, onEntendido }: Props) {
  const direccion = [ubicacion.calle, ubicacion.colonia, ubicacion.municipio]
    .filter(Boolean)
    .join(', ');

  const abrirMapa = () => {
    const url =
      ubicacion.latitud != null && ubicacion.longitud != null
        ? `https://www.google.com/maps/search/?api=1&query=${ubicacion.latitud},${ubicacion.longitud}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
    Linking.openURL(url);
  };

  return (
    <View>
      <Text style={styles.title}>Llevando el caso a la veterinaria</Text>

      <View style={styles.card}>
        <Text style={styles.nombre}>{contacto.nombre || 'Aliado veterinario'}</Text>
        {direccion ? <Text style={styles.dato}>{direccion}</Text> : null}
        {ubicacion.referencia ? <Text style={styles.dato}>{ubicacion.referencia}</Text> : null}
        {contacto.telefono ? <Text style={styles.dato}>Tel: {contacto.telefono}</Text> : null}
      </View>

      <TouchableOpacity onPress={abrirMapa} style={styles.mapaButton}>
        <Ionicons name="navigate-outline" size={16} color={Brand.secondary} />
        <Text style={styles.mapaButtonText}>Cómo llegar</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.confirmButton} onPress={onEntendido}>
        <Text style={styles.confirmText}>Entendido</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', color: Brand.textDark, marginBottom: 16 },
  card: {
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  nombre: { fontSize: 13, fontWeight: '800', color: Brand.textDark },
  dato: { fontSize: 13, fontWeight: '600', color: Brand.textMuted, marginTop: 8 },
  mapaButton: {
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: `${Brand.secondary}1A`,
    borderWidth: 1,
    borderColor: `${Brand.secondary}55`,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  mapaButtonText: { color: Brand.secondary, fontWeight: '700', fontSize: 13 },
  confirmButton: {
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: Brand.primary,
  },
  confirmText: { color: '#fff', fontWeight: '800' },
});
