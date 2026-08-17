import React, { useState, useCallback } from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import axios from 'axios';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins';

export default function NotificationBell() {
  const router = useRouter();
  const { token } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  // useFocusEffect se ejecuta cada vez que la pantalla vuelve a estar activa/visible
  useFocusEffect(
    useCallback(() => {
      const fetchUnread = async () => {
        try {
          const headers = { Authorization: `Bearer ${token}` };
          const resultados = await Promise.allSettled([
            axios.get(`${API_URL}/reports/me/notificaciones-moderacion`, { headers }),
            axios.get(`${API_URL}/red-aliados/me/notificaciones`, { headers }),
            axios.get(`${API_URL}/reputacion/me/notificaciones`, { headers }),
          ]);
          const unread = resultados.reduce((total, resultado) => {
            if (resultado.status !== 'fulfilled' || !Array.isArray(resultado.value.data)) return total;
            return total + resultado.value.data.filter((n: any) => !n.leida).length;
          }, 0);
          setUnreadCount(unread);
        } catch {
          setUnreadCount(0);
        }
      };

      if (token) {
        fetchUnread();
      }
    }, [token])
  );

  return (
    <TouchableOpacity 
      onPress={() => router.push('/notificaciones' as never)}
      style={{ padding: 8, position: 'relative' }}
    >
      <Ionicons name="notifications-outline" size={26} color="#2E2A26" />
      
      {unreadCount > 0 && (
        <View style={{
          position: 'absolute',
          top: 4,
          right: 6,
          backgroundColor: '#F5842B',
          borderRadius: 10,
          minWidth: 18,
          height: 18,
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: 2,
          borderColor: '#FFF',
          paddingHorizontal: 4
        }}>
          <Text style={{ 
            color: '#FFF', 
            fontSize: 10, 
            fontFamily: 'Poppins_600SemiBold',
            lineHeight: 12
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
