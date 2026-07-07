import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import { AssocAvatar } from './AssocAvatar';
import { CompletenessChip } from './CompletenessChip';
import type { AsociacionPendienteItem } from '../../types/asociacionAdmin';

interface Props {
  asociacion: AsociacionPendienteItem;
  onPress: () => void;
}

const URGENTE_DESPUES_DE_DIAS = 7;

function diasDesde(fechaISO: string): number {
  const diffMs = Date.now() - new Date(fechaISO).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function AssocListCard({ asociacion, onPress }: Props) {
  const diasEsperando = diasDesde(asociacion.created_at);
  const esUrgente = diasEsperando > URGENTE_DESPUES_DE_DIAS;
  const faltaContacto = !asociacion.contacto_telefono?.trim() && !asociacion.contacto_email?.trim();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.wrapper}>
      <View style={[styles.card, esUrgente && styles.cardUrgente]}>
        <View style={styles.avatarSlot}>
          <AssocAvatar nombre={asociacion.nombre} logoUrl={asociacion.logo_url} size="md" />
          {esUrgente && <View style={styles.urgentDot} />}
        </View>

        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={styles.nombre} numberOfLines={1}>
              {asociacion.nombre}
            </Text>
            <Text style={[styles.tiempo, esUrgente && styles.tiempoUrgente]}>
              {esUrgente ? '⚑ ' : ''}
              hace {diasEsperando}d
            </Text>
          </View>

          <Text style={styles.responsable} numberOfLines={1}>
            {asociacion.nombre_responsable?.trim() || 'Responsable no especificado'}
          </Text>

          <View style={styles.contactoRow}>
            {faltaContacto ? (
              <View style={styles.alertaChip}>
                <Ionicons name="alert-outline" size={11} color="#C48A00" />
                <Text style={styles.alertaText}>Sin datos de contacto</Text>
              </View>
            ) : (
              <Text style={styles.contactoText} numberOfLines={1}>
                {asociacion.contacto_telefono?.trim() || asociacion.contacto_email}
              </Text>
            )}
          </View>

          <View style={styles.footerRow}>
            <CompletenessChip
              ok={asociacion.fotos_count > 0}
              okLabel={`${asociacion.fotos_count} foto${asociacion.fotos_count !== 1 ? 's' : ''}`}
              warnLabel="Sin fotos"
              icon="images-outline"
            />
            <View style={styles.chevronCircle}>
              <Ionicons name="chevron-forward" size={14} color={Brand.textMuted} />
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(60,35,16,0.09)',
    padding: 14,
    shadowColor: '#3C2310',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardUrgente: { borderColor: 'rgba(236,128,43,0.25)' },
  avatarSlot: { position: 'relative' },
  urgentDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Brand.primary,
    borderWidth: 2,
    borderColor: '#fff',
  },
  body: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  nombre: { flex: 1, fontSize: 15, fontWeight: '700', color: Brand.textDark },
  tiempo: { fontSize: 12, fontWeight: '600', color: '#A89070', flexShrink: 0 },
  tiempoUrgente: { color: Brand.danger },
  responsable: { fontSize: 12, color: Brand.textMuted, marginTop: 2 },
  contactoRow: { marginTop: 6 },
  contactoText: { fontSize: 12, color: Brand.textMuted },
  alertaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(237,197,91,0.25)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  alertaText: { fontSize: 11, fontWeight: '600', color: '#7A5800' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  chevronCircle: {
    marginLeft: 'auto',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Brand.backgroundWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});