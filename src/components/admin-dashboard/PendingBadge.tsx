import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function PendingBadge() {
  return (
    <View style={styles.badge}>
      <View style={styles.dot} />
      <Text style={styles.text}>Pendiente de revisión</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#EDC55B',
    backgroundColor: '#FDF8E8',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'center',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EDC55B' },
  text: { fontSize: 12, fontWeight: '600', color: '#8A5F00' },
});