import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export function AuthSessionLoading() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color="#F5842B" size="large" />
      <Text style={styles.title}>Completando tu acceso…</Text>
      <Text style={styles.description}>
        Estamos preparando tu perfil de PawAlert.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#FDF8F4',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#2E2A26',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 18,
    textAlign: 'center',
  },
  description: {
    color: '#9E8C7E',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
});
