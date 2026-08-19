import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getFormDraft(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setFormDraft(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // El formulario debe continuar aunque el dispositivo no pueda guardar.
  }
}

export async function removeFormDraft(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // No bloquear el cierre o envío por un fallo secundario de almacenamiento.
  }
}
