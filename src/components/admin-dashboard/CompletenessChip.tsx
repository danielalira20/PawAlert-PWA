import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  ok: boolean;
  okLabel: string;
  warnLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export function CompletenessChip({ ok, okLabel, warnLabel, icon }: Props) {
  return (
    <View style={[styles.chip, ok ? styles.ok : styles.warn]}>
      <Ionicons name={icon} size={11} color={ok ? '#8A7060' : '#7A5800'} />
      <Text style={[styles.text, { color: ok ? '#8A7060' : '#7A5800' }]}>
        {ok ? okLabel : warnLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ok: { backgroundColor: 'rgba(60,35,16,0.07)' },
  warn: { backgroundColor: 'rgba(237,197,91,0.22)' },
  text: { fontSize: 10, fontWeight: '600' },
});