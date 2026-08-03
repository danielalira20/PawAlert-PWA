import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const DEVICE_TOKEN_KEY = 'device_token';

export async function getDeviceToken(): Promise<string> {
  const existente = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
  if (existente) return existente;
  const nuevo = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_TOKEN_KEY, nuevo);
  return nuevo;
}
