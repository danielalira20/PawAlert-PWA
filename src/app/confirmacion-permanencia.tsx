import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_URL } from '../constants/api';

type Respuesta = 'sigue_ahi' | 'ya_no_esta';

const C = {
  orange: '#F5842B',
  teal: '#278F87',
  dark: '#2E2A26',
  muted: '#76685E',
  border: '#EADBCB',
  background: '#FDF8F4',
  white: '#FFFFFF',
};

export default function ConfirmacionPermanenciaRoute() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [sending, setSending] = useState<Respuesta | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const respond = async (respuesta: Respuesta) => {
    if (!token || sending) return;
    setSending(respuesta);
    setError(null);
    try {
      const result = await axios.post(
        `${API_URL}/reports/confirmacion-permanencia/invitado`,
        { token, respuesta },
      );
      setMessage(result.data.mensaje);
    } catch (requestError: unknown) {
      if (axios.isAxiosError(requestError)) {
        setError(
          requestError.response?.data?.detail
          || 'No pudimos guardar tu respuesta. Intenta nuevamente.',
        );
      } else {
        setError('No pudimos guardar tu respuesta. Intenta nuevamente.');
      }
    } finally {
      setSending(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 30 }}>
          <View style={{ width: 68, height: 68, borderRadius: 24, backgroundColor: '#E9F8F6', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="paw" size={34} color={C.teal} />
          </View>
          <Text style={{ color: C.dark, fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 18 }}>
            Confirma el estado del reporte
          </Text>
          <Text style={{ color: C.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 }}>
            ¿El animal sigue en el lugar donde lo reportaste?
          </Text>
        </View>

        {!token ? (
          <Text style={{ color: '#B93831', fontSize: 14, textAlign: 'center' }}>
            Este enlace no contiene una confirmación válida.
          </Text>
        ) : message ? (
          <View style={{ alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={52} color={C.teal} />
            <Text style={{ color: C.dark, fontSize: 16, fontWeight: '800', textAlign: 'center', marginTop: 14 }}>
              {message}
            </Text>
            <TouchableOpacity onPress={() => router.replace('/')} style={{ marginTop: 26, minHeight: 48, paddingHorizontal: 24, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
              <Text style={{ color: C.white, fontWeight: '800' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              disabled={Boolean(sending)}
              onPress={() => respond('sigue_ahi')}
              style={{ minHeight: 58, borderRadius: 8, paddingHorizontal: 18, backgroundColor: C.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: sending ? 0.7 : 1 }}
            >
              {sending === 'sigue_ahi' ? <ActivityIndicator color={C.white} /> : <Ionicons name="location" size={22} color={C.white} />}
              <Text style={{ color: C.white, fontSize: 15, fontWeight: '900' }}>Sí, sigue ahí</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={Boolean(sending)}
              onPress={() => respond('ya_no_esta')}
              style={{ minHeight: 58, borderRadius: 8, paddingHorizontal: 18, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: sending ? 0.7 : 1 }}
            >
              {sending === 'ya_no_esta' ? <ActivityIndicator color={C.orange} /> : <Ionicons name="search-outline" size={22} color={C.orange} />}
              <Text style={{ color: C.orange, fontSize: 15, fontWeight: '900' }}>Ya no está</Text>
            </TouchableOpacity>
            {error && (
              <Text accessibilityRole="alert" style={{ color: '#B93831', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 }}>
                {error}
              </Text>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
