import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuthorizationStatus,
  deleteToken,
  getMessaging,
  getToken,
  hasPermission,
  requestPermission,
} from '@react-native-firebase/messaging';
import axios from 'axios';
import { PermissionsAndroid, Platform } from 'react-native';

import { API_URL } from '../constants/api';

export type PushPermissionState =
  | 'unsupported'
  | 'default'
  | 'denied'
  | 'granted';

const STORAGE_KEY = '@pawalert_push_token';

export async function getPushPermissionState(): Promise<PushPermissionState> {
  const estado = await hasPermission(getMessaging());
  return estado === AuthorizationStatus.AUTHORIZED
    || estado === AuthorizationStatus.PROVISIONAL
    ? 'granted'
    : 'default';
}

export async function enablePushNotifications(accessToken: string) {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const permiso = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (permiso !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('push_permiso_denegado');
    }
  }

  const instancia = getMessaging();
  const estado = await requestPermission(instancia);
  const autorizado = estado === AuthorizationStatus.AUTHORIZED
    || estado === AuthorizationStatus.PROVISIONAL;
  if (!autorizado) throw new Error('push_permiso_denegado');

  const pushToken = await getToken(instancia);
  await axios.post(
    `${API_URL}/users/me/push-devices`,
    { token: pushToken, platform: Platform.OS },
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  await AsyncStorage.setItem(STORAGE_KEY, pushToken);
  return { permission: 'granted' as const };
}

export async function disablePushNotifications(accessToken: string) {
  const pushToken = await AsyncStorage.getItem(STORAGE_KEY);
  if (pushToken) {
    await axios.delete(
      `${API_URL}/users/me/push-devices/${encodeURIComponent(pushToken)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }
  await deleteToken(getMessaging());
  await AsyncStorage.removeItem(STORAGE_KEY);
  return { permission: 'default' as const };
}
