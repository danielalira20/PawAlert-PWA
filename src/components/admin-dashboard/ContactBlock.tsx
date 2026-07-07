import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

interface Props {
  telefono?: string | null;
  email?: string | null;
}

export function ContactBlock({ telefono, email }: Props) {
  const [copiado, setCopiado] = useState(false);
  const tieneTelefono = !!telefono?.trim();
  const tieneEmail = !!email?.trim();

  if (!tieneTelefono && !tieneEmail) {
    return <Text style={styles.empty}>Sin datos de contacto</Text>;
  }

  const copiarEmail = async () => {
    if (!email) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(email);
    } else {
      // Requiere `npx expo install expo-clipboard` si aún no lo tienen.
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(email);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  };

  return (
    <View style={{ gap: 10 }}>
      {tieneTelefono && (
        <TouchableOpacity style={styles.row} onPress={() => Linking.openURL(`tel:${telefono}`)}>
          <View style={styles.iconCircle}>
            <Ionicons name="call-outline" size={15} color={Brand.primary} />
          </View>
          <Text style={styles.text}>{telefono}</Text>
        </TouchableOpacity>
      )}
      {tieneEmail && (
        <View style={styles.row}>
          <View style={styles.iconCircle}>
            <Ionicons name="mail-outline" size={15} color={Brand.primary} />
          </View>
          <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>
            {email}
          </Text>
          <TouchableOpacity onPress={copiarEmail} hitSlop={8}>
            <Ionicons
              name={copiado ? 'checkmark' : 'copy-outline'}
              size={15}
              color={copiado ? Brand.secondary : Brand.textFaint}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: `${Brand.primary}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 14, color: Brand.textDark },
  empty: { fontSize: 14, color: Brand.textFaint },
});