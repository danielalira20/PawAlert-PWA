import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Brand } from '../../constants/theme';
import type { SugerenciaAliado } from '../../types/reportestaff';

interface Props {
  sugerencia: SugerenciaAliado;
  isSubmitting: boolean;
  onAceptar: () => void;
  onDescartar: () => void;
}

const NIVEL_URGENCIA_LABEL: Record<string, string> = {
  critico: 'Crítico',
  urgente: 'Urgente',
  no_urgente: 'No urgente',
};

const NIVEL_URGENCIA_COLOR: Record<string, string> = {
  critico: Brand.danger,
  urgente: Brand.accent,
  no_urgente: Brand.secondary,
};

export function SugerenciaAliadoCard({ sugerencia, isSubmitting, onAceptar, onDescartar }: Props) {
  return (
    <View>
      <Text style={styles.title}>Hay una veterinaria cercana disponible</Text>

      <View style={styles.card}>
        <Text style={styles.nombre}>{sugerencia.nombre}</Text>
        <Text style={styles.dato}>{sugerencia.distancia_km} km de distancia</Text>
        <Text style={styles.dato}>
          {sugerencia.capacidad_disponible} {sugerencia.unidad} disponibles
        </Text>
        <Text
          style={[
            styles.dato,
            { color: NIVEL_URGENCIA_COLOR[sugerencia.nivel_urgencia] || Brand.textDark, fontWeight: '800' },
          ]}
        >
          Urgencia: {NIVEL_URGENCIA_LABEL[sugerencia.nivel_urgencia] || sugerencia.nivel_urgencia}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelButton} onPress={onDescartar} disabled={isSubmitting}>
          <Text style={styles.cancelText}>No, gracias</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmButton, isSubmitting && styles.confirmButtonDisabled]}
          onPress={onAceptar}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmText}>Acercar a esta veterinaria</Text>
          )}
        </TouchableOpacity>
      </View>
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
  actions: { flexDirection: 'row', gap: 12 },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#EFE3CD',
  },
  cancelText: { color: Brand.textMuted, fontWeight: '800' },
  confirmButton: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: Brand.primary,
  },
  confirmButtonDisabled: { opacity: 0.7 },
  confirmText: { color: '#fff', fontWeight: '800' },
});
