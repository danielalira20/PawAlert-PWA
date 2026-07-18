import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  isLast?: boolean;
  locked?: boolean;
}

export function AccessRow({ icon, label, onPress, isLast, locked }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, !isLast && styles.rowDivider]}
    >
      <View style={[styles.iconCircle, locked && styles.iconCircleLocked]}>
        <Ionicons name={icon} size={17} color={locked ? Brand.textFaint : Brand.primary} />
      </View>
      <Text style={[styles.label, locked && styles.labelLocked]}>{label}</Text>
      <Ionicons
        name={locked ? 'lock-closed' : 'chevron-forward'}
        size={locked ? 14 : 16}
        color={Brand.textFaint}
      />
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
  iconCircleLocked: { backgroundColor: '#F0E6D6' },
  label: { flex: 1, fontSize: 14, fontWeight: '700', color: Brand.textDark },
  labelLocked: { color: Brand.textFaint },
});