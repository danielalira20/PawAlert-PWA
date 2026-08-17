import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermissionState,
  PushPermissionState,
} from '../services/pushRegistration';

type NotificationKind = 'moderacion' | 'aliado' | 'reputacion';

interface AppNotification {
  id: string;
  kind: NotificationKind;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  reportId?: string;
  needId?: string;
  title?: string;
}

const C = {
  orange: '#F5842B',
  teal: '#66C5BD',
  dark: '#2E2A26',
  muted: '#8F7D6E',
  border: '#EADBCB',
  soft: '#FDF8F4',
};

const TYPE_STYLE: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; label: string }> = {
  en_revision: { icon: 'alert-circle-outline', color: '#C77A00', bg: '#FFF6DA', label: 'Reporte en revisión' },
  aprobado: { icon: 'checkmark-circle-outline', color: '#209653', bg: '#EAF8F0', label: 'Reporte publicado' },
  rechazado: { icon: 'close-circle-outline', color: '#D6453D', bg: '#FDEDEC', label: 'Reporte retirado' },
  oferta_aceptada: { icon: 'gift-outline', color: '#209653', bg: '#EAF8F0', label: 'Oferta aceptada' },
  proximidad: { icon: 'location-outline', color: '#278F87', bg: '#E9F8F6', label: 'Apoyo cercano' },
  necesidad_disponible: { icon: 'heart-outline', color: '#278F87', bg: '#E9F8F6', label: 'Necesidad disponible' },
  bono_bienvenida: { icon: 'gift-outline', color: '#8B5CF6', bg: '#F3EEFF', label: 'Bono de bienvenida' },
  insignia_obtenida: { icon: 'ribbon-outline', color: '#C9971C', bg: '#FBF3DC', label: 'Nueva insignia' },
  insignia_mejorada: { icon: 'trophy-outline', color: '#C9971C', bg: '#FBF3DC', label: 'Insignia mejorada' },
  restriccion_activada: { icon: 'warning-outline', color: '#D6453D', bg: '#FDEDEC', label: 'Restricción activa' },
  restriccion_levantada: { icon: 'checkmark-done-outline', color: '#209653', bg: '#EAF8F0', label: 'Restricción levantada' },
};

function notificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '';
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function NotificationsScreen() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushPermission, setPushPermission] = useState<PushPermissionState>('default');
  const [updatingPush, setUpdatingPush] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!token) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    const [moderationResult, allyResult, reputationResult] = await Promise.allSettled([
      axios.get(`${API_URL}/reports/me/notificaciones-moderacion`, { headers }),
      axios.get(`${API_URL}/red-aliados/me/notificaciones`, { headers }),
      axios.get(`${API_URL}/reputacion/me/notificaciones`, { headers }),
    ]);

    const moderation: AppNotification[] = moderationResult.status === 'fulfilled'
      ? (moderationResult.value.data || []).map((item: any) => ({
          id: item.id,
          kind: 'moderacion' as const,
          type: item.tipo,
          title: TYPE_STYLE[item.tipo]?.label || 'Actualización de tu reporte',
          message: item.mensaje,
          read: Boolean(item.leida),
          createdAt: item.created_at,
          reportId: item.reporte_id,
        }))
      : [];

    const ally: AppNotification[] = allyResult.status === 'fulfilled'
      ? (allyResult.value.data || []).map((item: any) => ({
          id: item.id,
          kind: 'aliado' as const,
          type: item.tipo,
          title: item.categoria || item.asociacion_nombre || 'Red de aliados',
          message: item.mensaje,
          read: Boolean(item.leida),
          createdAt: item.fecha || item.created_at,
          needId: item.necesidad_id,
        }))
      : [];

    const reputation: AppNotification[] = reputationResult.status === 'fulfilled'
      ? (reputationResult.value.data || []).map((item: any) => ({
          id: item.id,
          kind: 'reputacion' as const,
          type: item.tipo,
          message: item.mensaje,
          read: Boolean(item.leida),
          createdAt: item.created_at,
        }))
      : [];

    setNotifications([...moderation, ...ally, ...reputation].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ));
    setLoading(false);
  }, [token]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    getPushPermissionState().then(setPushPermission).catch(() => {
      setPushPermission('unsupported');
    });
  }, []);

  const togglePush = async (enabled: boolean) => {
    if (!token || updatingPush) return;
    setUpdatingPush(true);
    try {
      if (enabled) {
        await enablePushNotifications(token);
        setPushPermission('granted');
      } else {
        const result = await disablePushNotifications(token);
        setPushPermission(result.permission);
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      Alert.alert(
        'No se activaron las alertas',
        code === 'push_permiso_denegado'
          ? 'Habilita las notificaciones de PawAlert desde los ajustes de tu dispositivo.'
          : 'Revisa la configuración de Firebase o inténtalo nuevamente.',
      );
      setPushPermission(
        await getPushPermissionState().catch(
          (): PushPermissionState => 'unsupported',
        ),
      );
    } finally {
      setUpdatingPush(false);
    }
  };

  const openNotification = async (item: AppNotification) => {
    if (!item.read && token) {
      const headers = { Authorization: `Bearer ${token}` };
      const url = item.kind === 'moderacion'
        ? `${API_URL}/reports/me/notificaciones-moderacion/${item.id}/leer`
        : item.kind === 'aliado'
        ? `${API_URL}/red-aliados/me/notificaciones/${item.id}/leer`
        : `${API_URL}/reputacion/me/notificaciones/${item.id}/leer`;
      try {
        await axios.patch(url, {}, { headers });
        setNotifications((current) => current.map((notification) => (
          notification.id === item.id && notification.kind === item.kind
            ? { ...notification, read: true }
            : notification
        )));
      } catch {
        return;
      }
    }

    if (item.kind === 'aliado' && item.needId) {
      router.replace({ pathname: '/red-aliados', params: { necesidad_id: item.needId } });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(38,30,24,0.58)', justifyContent: 'center', alignItems: 'center', padding: 18 }}>
      <View style={{ width: '100%', maxWidth: 720, maxHeight: '86%', backgroundColor: C.soft, borderRadius: 28, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 22px 70px rgba(0,0,0,0.28)' } : { elevation: 16 }) } as any}>
        <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFF0E4', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <Ionicons name="notifications" size={22} color={C.orange} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.dark, fontSize: 20, fontWeight: '900' }}>Notificaciones</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>Actualizaciones de tus reportes y apoyos</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={23} color={C.dark} />
          </TouchableOpacity>
        </View>

        {token && pushPermission !== 'unsupported' && (
          <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="phone-portrait-outline" size={21} color={C.teal} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.dark, fontSize: 13, fontWeight: '800' }}>Alertas en este dispositivo</Text>
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Recibe propuestas y cambios importantes</Text>
            </View>
            {updatingPush ? (
              <ActivityIndicator size="small" color={C.orange} />
            ) : (
              <Switch
                accessibilityLabel="Alertas en este dispositivo"
                value={pushPermission === 'granted'}
                onValueChange={togglePush}
                trackColor={{ false: '#D8CEC5', true: '#A7DDD8' }}
                thumbColor={pushPermission === 'granted' ? C.teal : '#FFFFFF'}
              />
            )}
          </View>
        )}

        {loading ? (
          <View style={{ minHeight: 280, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={C.orange} />
            <Text style={{ marginTop: 12, color: C.muted, fontWeight: '700' }}>Cargando notificaciones…</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={{ minHeight: 300, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
            <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: '#FFF0E4', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="notifications-off-outline" size={34} color={C.orange} />
            </View>
            <Text style={{ marginTop: 18, color: C.dark, fontSize: 18, fontWeight: '900' }}>Todo está al día</Text>
            <Text style={{ marginTop: 6, color: C.muted, fontSize: 13, textAlign: 'center' }}>Aquí aparecerán los cambios de estado de tus reportes.</Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => `${item.kind}-${item.id}`}
            contentContainerStyle={{ padding: 20, gap: 12 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const visual = TYPE_STYLE[item.type] || { icon: 'notifications-outline' as const, color: C.orange, bg: '#FFF0E4', label: item.title || 'Notificación' };
              return (
                <TouchableOpacity
                  onPress={() => openNotification(item)}
                  activeOpacity={0.82}
                  style={{ backgroundColor: item.read ? '#FFFFFF' : visual.bg, borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: item.read ? C.border : visual.color, flexDirection: 'row', gap: 13 }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: item.read ? visual.bg : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={visual.icon} size={23} color={visual.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ flex: 1, color: C.dark, fontSize: 14, fontWeight: '900' }}>{item.title || visual.label}</Text>
                      {!item.read && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: visual.color }} />}
                    </View>
                    <Text style={{ color: C.dark, fontSize: 13, lineHeight: 19, marginTop: 5 }}>{item.message}</Text>
                    <Text style={{ color: C.muted, fontSize: 10, marginTop: 9 }}>{notificationDate(item.createdAt)}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}
