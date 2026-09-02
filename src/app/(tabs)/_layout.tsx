import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';

const ACTIVE_COLOR = '#EC802B';
const INACTIVE_COLOR = '#5C4B3A';
const isWeb = Platform.OS === 'web';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: isWeb
          ? ({
              position: 'absolute',
              left: 16, right: 16, bottom: 18,
              maxWidth: 480,
              marginHorizontal: 'auto',
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              borderRadius: 28,
              height: 68,
              paddingTop: 8, paddingBottom: 8,
              elevation: 0,
            } as any)
          : {
              backgroundColor: '#FFFFFF',
              borderTopWidth: 1, borderTopColor: '#F0E6D6',
              height: 54 + insets.bottom,
              paddingBottom: Math.max(8, insets.bottom),
              paddingTop: 8,
              shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.06, shadowRadius: 16, elevation: 12,
            },
        tabBarBackground: isWeb
          ? () => (
              <BlurView intensity={45} tint="light"
                style={[StyleSheet.absoluteFillObject, { borderRadius: 28, overflow: 'hidden' }]} />
            )
          : undefined,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
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
        name="events"
        options={{
          title: 'Eventos',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="nearby-cases"
        options={{
          title: 'Ayuda cerca',
          tabBarAccessibilityLabel: 'Casos cerca de mí',
          tabBarLabel: ({ color }) => (
            <Text
              numberOfLines={2}
              style={{
                width: 64,
                color,
                fontSize: 10,
                lineHeight: 11,
                fontWeight: '700',
                letterSpacing: 0.2,
                textAlign: 'center',
              }}
            >
              Ayuda{'\n'}cerca
            </Text>
          ),
          href: user?.rol === 'voluntario_externo' ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'navigate-circle' : 'navigate-circle-outline'}
              size={23}
              color={color}
            />
          ),
        }}
      />
      {/* 1. Insertamos adopciones antes de "Mi perfil" y le agregamos el emoji */}
      <Tabs.Screen
        name="adopciones"
        options={{
          title: 'Adopta', 
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'paw' : 'paw-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* 2. Mi perfil queda como el último visible a la derecha */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Mi perfil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
      
      {/* (join-association se queda oculto al final) */}
      <Tabs.Screen
        name="join-association"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
