import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

import { API_URL } from '../../constants/api';
import { Brand } from '../../constants/theme';

interface Props {
  token: string;
}

interface EstadoOperativo {
  disponible_operativamente: boolean;
  pausa_operativa_hasta: string | null;
  pausa_indefinida: boolean;
}

function fechaLocal(fechaIso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(fechaIso));
}

function finDelDia(fecha: string) {
  const partes = fecha.split('-').map(Number);
  if (partes.length !== 3 || partes.some((parte) => !Number.isFinite(parte))) {
    return null;
  }
  const [anio, mes, dia] = partes;
  const valor = new Date(anio, mes - 1, dia, 23, 59, 59);
  if (
    valor.getFullYear() !== anio
    || valor.getMonth() !== mes - 1
    || valor.getDate() !== dia
  ) {
    return null;
  }
  return valor;
}

export function OperationalAvailabilityCard({ token }: Props) {
  const [estado, setEstado] = useState<EstadoOperativo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [fechaPersonalizada, setFechaPersonalizada] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const respuesta = await axios.get(
        `${API_URL}/voluntarios/me/disponibilidad-operativa`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setEstado(respuesta.data);
    } catch {
      setEstado(null);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async (disponible: boolean, pausaHasta: Date | null) => {
    setGuardando(true);
    setError('');
    try {
      const respuesta = await axios.patch(
        `${API_URL}/voluntarios/me/disponibilidad-operativa`,
        {
          disponible,
          pausa_hasta: pausaHasta?.toISOString() ?? null,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setEstado(respuesta.data);
      setModalVisible(false);
      setFechaPersonalizada('');
    } catch (err: any) {
      setError(
        err?.response?.data?.detail
        || 'No pudimos actualizar tu disponibilidad.',
      );
    } finally {
      setGuardando(false);
    }
  };

  const pausarDias = (dias: number) => {
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + dias);
    guardar(false, hasta);
  };

  const guardarFechaPersonalizada = () => {
    const hasta = finDelDia(fechaPersonalizada);
    if (!hasta || hasta <= new Date()) {
      setError('Escribe una fecha futura con el formato AAAA-MM-DD.');
      return;
    }
    guardar(false, hasta);
  };

  if (cargando) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={Brand.primary} />
      </View>
    );
  }

  if (!estado) return null;

  const disponible = estado.disponible_operativamente;
  const descripcion = disponible
    ? 'Puedes aparecer en el pool de casos y verificaciones cercanas.'
    : estado.pausa_indefinida
      ? 'Tu participación está pausada hasta que decidas volver.'
      : `Pausa activa hasta ${fechaLocal(estado.pausa_operativa_hasta!)}`;

  return (
    <>
      <View style={[styles.card, !disponible && styles.cardPaused]}>
        <View style={styles.header}>
          <View style={[styles.icon, !disponible && styles.iconPaused]}>
            <Ionicons
              name={disponible ? 'checkmark-circle-outline' : 'pause-circle-outline'}
              size={24}
              color={disponible ? Brand.secondary : Brand.primary}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Disponibilidad operativa</Text>
            <Text style={styles.title}>
              {disponible ? 'Disponible para ayudar' : 'Pausado temporalmente'}
            </Text>
          </View>
        </View>

        <Text style={styles.description}>{descripcion}</Text>

        <TouchableOpacity
          style={[styles.action, disponible && styles.actionSecondary]}
          onPress={() => {
            if (disponible) {
              setError('');
              setModalVisible(true);
            } else {
              guardar(true, null);
            }
          }}
          disabled={guardando}
        >
          {guardando
            ? <ActivityIndicator color={disponible ? Brand.primary : '#fff'} />
            : (
              <Text style={[styles.actionText, disponible && styles.actionTextSecondary]}>
                {disponible ? 'Pausar disponibilidad' : 'Volver a estar disponible'}
              </Text>
            )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalIcon}>
              <Ionicons name="time-outline" size={26} color={Brand.primary} />
            </View>
            <Text style={styles.modalTitle}>¿Por cuánto tiempo?</Text>
            <Text style={styles.modalDescription}>
              Durante la pausa no recibirás nuevas propuestas. Tus casos actuales no cambian.
            </Text>

            <View style={styles.options}>
              <OptionButton
                label="Hasta mañana"
                onPress={() => pausarDias(1)}
                disabled={guardando}
              />
              <OptionButton
                label="Durante una semana"
                onPress={() => pausarDias(7)}
                disabled={guardando}
              />
              <OptionButton
                label="Indefinidamente"
                onPress={() => guardar(false, null)}
                disabled={guardando}
              />
            </View>

            <Text style={styles.customLabel}>O elige una fecha</Text>
            <View style={styles.customRow}>
              <TextInput
                value={fechaPersonalizada}
                onChangeText={setFechaPersonalizada}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={Brand.textFaint}
                style={styles.input}
                editable={!guardando}
                maxLength={10}
              />
              <TouchableOpacity
                style={styles.saveDate}
                onPress={guardarFechaPersonalizada}
                disabled={guardando}
              >
                <Text style={styles.saveDateText}>Guardar</Text>
              </TouchableOpacity>
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={styles.cancel}
              onPress={() => {
                setModalVisible(false);
                setError('');
              }}
              disabled={guardando}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function OptionButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.option}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.optionText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Brand.primary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(102,188,180,0.28)',
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2,
  },
  cardPaused: {
    backgroundColor: '#FFF8EE',
    borderColor: 'rgba(236,128,43,0.26)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(102,188,180,0.14)',
  },
  iconPaused: { backgroundColor: 'rgba(236,128,43,0.12)' },
  headerText: { flex: 1 },
  eyebrow: {
    color: Brand.textFaint,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    color: Brand.textDark,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  description: {
    color: Brand.textFaint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  action: {
    backgroundColor: Brand.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionSecondary: {
    backgroundColor: '#FFF8EE',
    borderWidth: 1,
    borderColor: Brand.primary,
  },
  actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  actionTextSecondary: { color: Brand.primary },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(46,42,38,0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 24,
  },
  modalIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#FFF3E7',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  modalTitle: {
    color: Brand.textDark,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 14,
  },
  modalDescription: {
    color: Brand.textFaint,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
  },
  options: { gap: 8, marginTop: 20 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF8EE',
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  optionText: { color: Brand.textDark, fontSize: 13, fontWeight: '700' },
  customLabel: {
    color: Brand.textFaint,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 7,
  },
  customRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(46,42,38,0.15)',
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: Brand.textDark,
    backgroundColor: '#FFFFFF',
  },
  saveDate: {
    backgroundColor: Brand.primary,
    borderRadius: 13,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  saveDateText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  error: {
    color: Brand.danger,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
    textAlign: 'center',
  },
  cancel: { alignItems: 'center', paddingVertical: 11, marginTop: 10 },
  cancelText: { color: Brand.textFaint, fontSize: 13, fontWeight: '700' },
});
