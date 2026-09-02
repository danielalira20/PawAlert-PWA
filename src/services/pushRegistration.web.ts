import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
} from 'firebase/messaging';

import { API_URL } from '../constants/api';
import { pwaPushSetupMessage } from '../utils/pwaPush';

export type PushPermissionState =
  | 'unsupported'
  | 'default'
  | 'denied'
  | 'granted';

const STORAGE_KEY = '@pawalert_push_token';

export async function getPushSetupMessage(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return pwaPushSetupMessage({
    userAgent: navigator.userAgent,
    navigatorStandalone: navigatorWithStandalone.standalone,
    displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches,
  });
}

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

function firebaseApp(): FirebaseApp {
  const obligatorios = [
    firebaseConfig.apiKey,
    firebaseConfig.projectId,
    firebaseConfig.messagingSenderId,
    firebaseConfig.appId,
  ];
  if (obligatorios.some((valor) => !valor)) {
    throw new Error('firebase_web_no_configurado');
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (
    typeof window === 'undefined'
    || !('Notification' in window)
    || !('serviceWorker' in navigator)
    || !(await isSupported())
  ) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return (await AsyncStorage.getItem(STORAGE_KEY)) ? 'granted' : 'default';
  }
  return Notification.permission;
}

export async function enablePushNotifications(accessToken: string) {
  const soporte = await getPushPermissionState();
  if (soporte === 'unsupported') throw new Error('push_no_compatible');

  const permiso = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('push_permiso_denegado');

  const vapidKey = process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error('firebase_vapid_no_configurado');

  const params = new URLSearchParams(
    Object.entries(firebaseConfig).reduce<Record<string, string>>(
      (resultado, [clave, valor]) => {
        if (valor) resultado[clave] = valor;
        return resultado;
      },
      {},
    ),
  );
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${params.toString()}`,
  );
  const messaging = getMessaging(firebaseApp());
  const pushToken = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!pushToken) throw new Error('fcm_token_no_disponible');

  await axios.post(
    `${API_URL}/users/me/push-devices`,
    { token: pushToken, platform: 'web' },
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
  if (await isSupported()) {
    await deleteToken(getMessaging(firebaseApp()));
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
  return { permission: 'default' as const };
}
