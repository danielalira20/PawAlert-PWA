import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

// ─── DESIGN TOKENS ───
const C = {
  primary: '#F5842B',
  secondary: '#66C5BD',
  neutralLight: '#E8CCAD',
  text: '#2E2A26',
  bg: '#FFFFFF',
  bgSoft: '#FDF8F4',
  muted: '#9E8C7E',
};

const F = {
  displayBold: 'Fraunces_800ExtraBold',
  bodyRegular: 'Poppins_400Regular',
  bodySemiBold: 'Poppins_600SemiBold',
};

const isWeb = Platform.OS === 'web';

// ─── TIPOS ───
interface NotificacionAliado {
  id: string;
  necesidad_id: string;
  asociacion_nombre: string;
  categoria: string;
  mensaje: string;
  fecha: string;
  leida: boolean;
}

export default function NotificacionesAliadoScreen() {
  const router = useRouter();
  const { token } = useAuth();
  
  const [notificaciones, setNotificaciones] = useState<NotificacionAliado[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchNotificaciones = async () => {
      setIsLoading(true);
      try {
        // CORRECCIÓN: Ruta ajustada al prefijo correcto del backend
        const res = await axios.get(`${API_URL}/red-aliados/me/notificaciones`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setNotificaciones(res.data);
      } catch (error) {
        console.error("Error al cargar notificaciones:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchNotificaciones();
    }
  }, [token]);

  const renderNotificacion = ({ item }: { item: NotificacionAliado }) => (
    <TouchableOpacity
      onPress={() => {
        router.replace({
          pathname: '/red-aliados',
          params: { necesidad_id: item.necesidad_id }
        });
      }}
      style={{
        backgroundColor: item.leida ? C.bg : '#FFF5EB',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: item.leida ? `${C.neutralLight}50` : C.primary,
        ...(isWeb ? { boxShadow: '0 4px 15px rgba(0,0,0,0.03)' } : { elevation: 2 }),
      } as any}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${C.secondary}15`, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <Ionicons name="business-outline" size={20} color={C.secondary} />
          </View>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ fontSize: 13, fontFamily: F.bodySemiBold, color: C.muted }}>
              {item.asociacion_nombre}
            </Text>
            <Text style={{ fontSize: 16, fontFamily: F.displayBold, color: C.text }} numberOfLines={2}>
              {item.categoria}
            </Text>
          </View>
        </View>
        
        {!item.leida && (
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary, marginTop: 6 }} />
        )}
      </View>

      <Text style={{ fontSize: 14, fontFamily: F.bodyRegular, color: C.text, lineHeight: 22, marginBottom: 16 }}>
        {item.mensaje}
      </Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: `${C.neutralLight}40`, paddingTop: 14 }}>
        <Text style={{ fontSize: 12, fontFamily: F.bodyRegular, color: C.muted }}>
          {item.fecha}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13, fontFamily: F.bodySemiBold, color: C.primary }}>Ofrecer apoyo</Text>
          <Ionicons name="arrow-forward" size={14} color={C.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );

  // CORRECCIÓN: Renderizado con Modal transparente
  return (
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        
        <View style={{ 
          width: '100%', maxWidth: 700, maxHeight: '85%', 
          backgroundColor: C.bgSoft, borderRadius: 32, overflow: 'hidden',
          ...(isWeb ? { boxShadow: '0 20px 60px rgba(0,0,0,0.25)' } : { elevation: 15 }) as any
        }}>
          
          {/* HEADER MODAL */}
          <View style={{
            backgroundColor: C.bg, paddingHorizontal: 24, paddingVertical: 20,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            borderBottomWidth: 1, borderBottomColor: `${C.neutralLight}40`,
            zIndex: 10
          }}>
            <TouchableOpacity 
              onPress={() => router.back()} 
              hitSlop={10}
              style={{ position: 'absolute', right: 24, width: 40, height: 40, borderRadius: 20, backgroundColor: C.bgSoft, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontFamily: F.displayBold, color: C.text }}>
              Tus <Text style={{ color: C.primary }}>Matches</Text>
            </Text>
          </View>

          {/* LISTA */}
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24 }}>
            {isLoading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={{ marginTop: 12, fontFamily: F.bodySemiBold, color: C.muted }}>Buscando matches de ayuda...</Text>
              </View>
            ) : notificaciones.length === 0 ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 40 }}>
                <Ionicons name="heart-dislike-outline" size={60} color={C.neutralLight} style={{ marginBottom: 16 }} />
                <Text style={{ fontSize: 18, fontFamily: F.displayBold, color: C.text, textAlign: 'center' }}>
                  Aún no tienes notificaciones
                </Text>
                <Text style={{ fontSize: 14, fontFamily: F.bodyRegular, color: C.muted, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 }}>
                  Te avisaremos en cuanto una asociación necesite apoyo compatible con tu perfil.
                </Text>
              </View>
            ) : (
              <FlatList
                data={notificaciones}
                keyExtractor={(item) => item.id}
                renderItem={renderNotificacion}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
              />
            )}
          </View>

        </View>
      </View>
  );
}