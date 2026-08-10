import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import { useMiReputacion } from '../../hooks/useMiReputacion';

interface Props {
  rol: string; // 'reportante' | 'voluntario_interno' | 'voluntario_externo'
  refreshKey?: number;
}

/**
 * Va en el sidebar, justo debajo del badge de rol y arriba de
 * "Datos de cuenta" (desktop: dentro de unifiedCard tras avatarSection;
 * móvil: card nueva en mobileCentered antes de AccountDataCard).
 *
 * Versión simple, sin niveles ni XP inventados -- solo lo que el
 * backend ya calcula: saldo disponible y, si aplica, un mensaje de
 * restricción ya traducido a texto humano. El Trust Score numérico
 * nunca llega hasta aquí (el endpoint ya lo excluye).
 */
export function SaldoReputacionCard({ rol, refreshKey }: Props) {
  const { saldo, isLoading, recargar } = useMiReputacion(rol);

  React.useEffect(() => {
    if (refreshKey) {
      recargar();
    }
  }, [refreshKey, recargar]);

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={Brand.primary} size="small" />
      </View>
    );
  }

  if (!saldo) {
    return null; // sin datos, no mostramos la tarjeta en vez de un estado vacío raro
  }

  return (
    <View style={styles.card}>
      <View style={styles.filaSaldo}>
        <Text style={styles.etiqueta}>Tus puntos</Text>
        <Text style={styles.puntos}>{saldo.saldo_disponible} pts</Text>
      </View>

      {saldo.restriccion_activa && saldo.mensaje_restriccion && (
        <View style={styles.avisoRestriccion}>
          <Ionicons name="alert-circle" size={16} color={Brand.danger} style={styles.avisoIcono} />
          <Text style={styles.avisoTexto}>{saldo.mensaje_restriccion}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    marginBottom: 12,
  },
  filaSaldo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  etiqueta: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
  },
  puntos: {
    fontSize: 18,
    fontWeight: '900',
    color: Brand.primary,
  },
  avisoRestriccion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  avisoIcono: {
    marginTop: 1,
  },
  avisoTexto: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: Brand.danger,
    fontWeight: '600',
  },
});