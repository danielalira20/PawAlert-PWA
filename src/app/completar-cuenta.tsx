import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import axios from 'axios';
import CrearCuentaInvitadoFlow from '../screens/CrearCuentaInvitadoFlow';
import { petzen } from '../constants/petzenTheme';
import { API_URL } from '../constants/api';

export default function CompletarCuentaRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [telefono, setTelefono] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return; // esperamos, sin redirigir — el token puede tardar
                         // una fracción de segundo en llegar en web

    (async () => {
      try {
        const res = await axios.get(`${API_URL}/auth/resolver-token-invitacion`, { params: { token } });
        setTelefono(res.data.telefono);
      } catch (err: any) {
        setError(err?.response?.data?.detail || 'Este link ya no es válido.');
      }
    })();
  }, [token]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: petzen.colors.background, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontFamily: petzen.fonts.bold, fontSize: 18, color: petzen.colors.textDark, textAlign: 'center' }}>
          {error}
        </Text>
      </View>
    );
  }

  if (!telefono) {
    return (
      <View style={{ flex: 1, backgroundColor: petzen.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={petzen.colors.orange} />
      </View>
    );
  }

  return (
    <CrearCuentaInvitadoFlow
      telefono={telefono}
      onClose={() => router.replace('/')}
      petzen={petzen}
    />
  );
}