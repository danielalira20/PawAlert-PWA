import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

const ACTIVE_COLOR = '#EC802B';
// Un poco más oscuro que el gris genérico de antes — necesario porque ahora
// el fondo detrás del texto ya no es blanco sólido, sino vidrio traslúcido.
const INACTIVE_COLOR = '#5C4B3A';

const isWeb = Platform.OS === 'web';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: isWeb
          ? ({
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 18,
              maxWidth: 480,
              marginHorizontal: 'auto',
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              borderRadius: 28,
              height: 68,
              paddingTop: 8,
              paddingBottom: 8,
              elevation: 0,
            } as any)
          : {
              backgroundColor: '#FFFFFF',
              borderTopWidth: 1,
              borderTopColor: '#F0E6D6',
              height: Platform.OS === 'ios' ? 80 : 62,
              paddingBottom: Platform.OS === 'ios' ? 20 : 8,
              paddingTop: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.06,
              shadowRadius: 16,
              elevation: 12,
            },
        tabBarBackground: isWeb
          ? () => (
              <BlurView
                intensity={45}
                tint="light"
                style={[StyleSheet.absoluteFillObject, styles.blurShape]}
              />
            )
          : undefined,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Mapa',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Mi perfil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  blurShape: { borderRadius: 28, overflow: 'hidden' },
});
