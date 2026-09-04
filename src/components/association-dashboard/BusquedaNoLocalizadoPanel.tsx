import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_URL } from '../../constants/api';

type Decision =
  | 'repetir_busqueda'
  | 'ampliar_zona'
  | 'programar_otro_horario'
  | 'reasignar'
  | 'solicitar_apoyo_regional'
  | 'liberar_voluntario'
  | 'cerrar_no_localizado';

type Busqueda = {
  id: string;
  intento: number;
  comentario: string;
  tiempo_busqueda_minutos: number;
  creada_at: string;
};

const OPTIONS: Array<{
  value: Decision;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  needsInstructions?: boolean;
  danger?: boolean;
}> = [
  { value: 'repetir_busqueda', label: 'Repetir búsqueda', icon: 'refresh-outline' },
  { value: 'ampliar_zona', label: 'Ampliar zona', icon: 'expand-outline', needsInstructions: true },
  { value: 'programar_otro_horario', label: 'Otro horario', icon: 'calendar-outline', needsInstructions: true },
  { value: 'solicitar_apoyo_regional', label: 'Pedir apoyo regional', icon: 'people-outline', needsInstructions: true },
  { value: 'reasignar', label: 'Buscar otro responsable', icon: 'person-add-outline' },
  { value: 'liberar_voluntario', label: 'Liberar responsable', icon: 'exit-outline' },
  { value: 'cerrar_no_localizado', label: 'Cerrar como no localizado', icon: 'close-circle-outline', danger: true },
];

export function BusquedaNoLocalizadoPanel({
  reporteId,
  token,
  onResolved,
  onError,
}: {
  reporteId: string;
  token: string | null;
  onResolved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [instrucciones, setInstrucciones] = useState('');
  const [fecha, setFecha] = useState('');

  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/reports/${reporteId}/busqueda-no-localizado/pendiente`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setBusqueda(response.data.busqueda || null);
    } catch {
      setBusqueda(null);
    } finally {
      setLoading(false);
    }
  }, [reporteId, token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const option = useMemo(
    () => OPTIONS.find((item) => item.value === decision),
    [decision],
  );

  if (loading) {
    return <ActivityIndicator color="#EC802B" style={{ marginTop: 20 }} />;
  }
  if (!busqueda) return null;

  const resolver = async () => {
    if (!decision || !token) return;
    if (option?.needsInstructions && !instrucciones.trim()) {
      onError('Agrega instrucciones claras para el siguiente paso.');
      return;
    }
    if (decision === 'programar_otro_horario' && !fecha.trim()) {
      onError('Indica cuándo debe realizarse el siguiente intento.');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(
        `${API_URL}/reports/${reporteId}/busqueda-no-localizado/resolver`,
        {
          decision,
          instrucciones: instrucciones.trim() || null,
          programada_at: decision === 'programar_otro_horario'
            ? new Date(fecha).toISOString()
            : null,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setBusqueda(null);
      onResolved('La decisión quedó registrada y el flujo del caso fue actualizado.');
    } catch (error: any) {
      onError(error?.response?.data?.detail || 'No pudimos guardar la decisión.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ marginTop: 22, padding: 18, borderRadius: 20, backgroundColor: '#FFF7DF', borderWidth: 1.5, borderColor: '#EDC55B' }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: '#EDC55B', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="search-outline" size={20} color="#4A3728" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#4A3728', fontWeight: '900', fontSize: 16 }}>
            Búsqueda sin resultado · intento {busqueda.intento}
          </Text>
          <Text style={{ color: '#7E6A59', fontSize: 12, marginTop: 3 }}>
            Buscó durante {busqueda.tiempo_busqueda_minutos} minutos. El caso continúa activo hasta que definas el siguiente paso.
          </Text>
        </View>
      </View>

      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginTop: 12 }}>
        <Text style={{ color: '#4A3728', fontSize: 12, fontWeight: '800' }}>Observación de la búsqueda</Text>
        <Text style={{ color: '#7E6A59', fontSize: 12, lineHeight: 18, marginTop: 4 }}>{busqueda.comentario}</Text>
      </View>

      <Text style={{ color: '#4A3728', fontWeight: '900', fontSize: 13, marginTop: 15, marginBottom: 8 }}>
        ¿Qué debe pasar ahora?
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {OPTIONS.map((item) => {
          const selected = decision === item.value;
          return (
            <TouchableOpacity
              key={item.value}
              onPress={() => setDecision(item.value)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 13, borderWidth: 1.5, borderColor: selected ? (item.danger ? '#D94025' : '#66BCB4') : '#E8D9C7', backgroundColor: selected ? (item.danger ? '#FDEDE8' : '#EAF8F6') : '#FFFFFF' }}
            >
              <Ionicons name={item.icon} size={15} color={item.danger ? '#D94025' : '#4A3728'} />
              <Text style={{ color: item.danger ? '#D94025' : '#4A3728', fontWeight: '800', fontSize: 11 }}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {decision && option?.needsInstructions && (
        <TextInput
          value={instrucciones}
          onChangeText={setInstrucciones}
          maxLength={1000}
          placeholder="Indica zona, horario o apoyo necesario"
          multiline
          style={{ marginTop: 12, minHeight: 74, borderRadius: 14, borderWidth: 1, borderColor: '#E8D9C7', backgroundColor: '#FFFFFF', padding: 12, color: '#4A3728', textAlignVertical: 'top' }}
        />
      )}
      {decision === 'programar_otro_horario' && (
        <TextInput
          value={fecha}
          onChangeText={setFecha}
          maxLength={16}
          placeholder="AAAA-MM-DD HH:mm"
          style={{ marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: '#E8D9C7', backgroundColor: '#FFFFFF', padding: 12, color: '#4A3728' }}
        />
      )}

      {decision && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: option?.danger ? '#B83220' : '#7E6A59', fontSize: 11, lineHeight: 16, marginBottom: 9 }}>
            {option?.danger
              ? 'Esta decisión cerrará el caso y liberará al responsable. Confirma solamente si la búsqueda ya no continuará.'
              : 'La decisión quedará en el historial y se actualizará la disponibilidad del caso cuando corresponda.'}
          </Text>
          <TouchableOpacity
            disabled={submitting}
            onPress={() => void resolver()}
            style={{ minHeight: 46, borderRadius: 15, backgroundColor: option?.danger ? '#D94025' : '#66BCB4', alignItems: 'center', justifyContent: 'center', opacity: submitting ? 0.65 : 1 }}
          >
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>Confirmar decisión</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
