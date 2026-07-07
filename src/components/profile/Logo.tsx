import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

export function Logo() {
  return (
    <View style={styles.row}>
      <View style={styles.iconCircle}>
        <Ionicons name="paw" size={16} color="#fff" />
      </View>
      <Text style={styles.text}>
        Paw<Text style={{ color: Brand.primary }}>Alert</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heart: { position: 'absolute', bottom: -3, right: -3 },
  text: { fontSize: 18, fontWeight: '800', color: Brand.textDark, letterSpacing: -0.3 },
});