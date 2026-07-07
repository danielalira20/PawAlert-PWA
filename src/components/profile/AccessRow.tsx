import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  isLast?: boolean;
}

export function AccessRow({ icon, label, onPress, isLast }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, !isLast && styles.rowDivider]}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={17} color={Brand.primary} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Brand.textFaint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F0E6D6' },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Brand.primary}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, fontSize: 14, fontWeight: '700', color: Brand.textDark },
});