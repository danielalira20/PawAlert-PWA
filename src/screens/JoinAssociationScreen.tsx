import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as Location from 'expo-location';

import { useAuth } from '../context/AuthContext';
import { Toast, useToast } from '../components/Toast';
import { API_URL } from '../constants/api';
import LocationPickerMap from './LocationPickerMap';

// ─── PALETA PETZEN ────────────────────────────────────────────────────────
const COLORS = {
  bgTeal: '#66BCB4',
  bgWhite: '#FFFFFF',
  primary: '#EC802B',
  secondary: '#EDC55B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  danger: '#E74C3C',
  grayLight: '#F3F4F6',
  border: '#E5E7EB',
};

const FORM_MAX_WIDTH = 750;

// ─── INTERFACES ─────────────────────────────────────────────────────────────
interface VoluntarioStatus {
  tiene_perfil_voluntario: boolean;
  voluntario_id?: string;
  estado?:
    | 'postulacion_pendiente'
    | 'activo_nivel_1'
    | 'activo_nivel_2'
    | 'rechazado'
    | 'dado_de_baja'
    | 'baja_definitiva';
  asociacion_id?: string;
  ultima_postulacion?: {
    id: string;
    tipo: string;
    estado: 'pendiente' | 'aceptada' | 'rechazada';
    motivo_rechazo?: string;
    numero_intento: number;
    asociacion_nombre?: string;
    resuelta_at?: string;
  } | null;
  intentos_previos?: Array<{
    id: string;
    numero_intento: number;
    estado: string;
    motivo_rechazo?: string;
    created_at: string;
    resuelta_at?: string;
    asociacion_nombre?: string;
  }>;
}
 
interface Asociacion {
  id: string;
  nombre: string;
  colonia?: string;
  municipio?: string;
  latitud: number;
  longitud: number;
  logo_url?: string;
  distancia?: number; // Calculado en frontend
}

interface UsuarioPerfil {
  nombre: string;
  apellido_paterno: string;
  apellido_materno?: string;
  email?: string;
  telefono?: string;
}

// ─── FUNCIÓN MATEMÁTICA PARA DISTANCIA (Haversine) ────────────────────────
function getDistanceFromLatLonInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function JoinAssociationScreen() {
  const { token, isLoggedIn, isLoading: isAuthLoading, refreshUser } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<VoluntarioStatus | null>(null);
  const [isReapplying, setIsReapplying] = useState(false);
  const [usuarioPerfil, setUsuarioPerfil] = useState<UsuarioPerfil | null>(null);

  const [asociaciones, setAsociaciones] = useState<Asociacion[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinLocation, setPinLocation] = useState<{
    latitud: number;
    longitud: number;
  }>({
    latitud: 19.0414,
    longitud: -98.2063,
  });
  const [isLoadingGps, setIsLoadingGps] = useState(false);

  const [assocSeleccionada, setAssocSeleccionada] = useState<Asociacion | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Verificación de Autenticación
  useEffect(() => {
    if (!isAuthLoading && !isLoggedIn) {
      showToast({
        type: 'warning',
        title: 'Requiere cuenta',
        message: 'Regístrate para unirte a una asociación.',
      });
      setTimeout(() => router.replace('/login?tab=register' as any), 1000);
    }
  }, [isAuthLoading, isLoggedIn]);

  // 2. Cargar Estado del Voluntario y Perfil del Usuario
const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/voluntarios/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.tiene_perfil_voluntario) {
        setStatus(res.data);
      // Si ya fue aceptado, el rol del usuario cambió en el backend
        // (reportante -> voluntario_interno/externo) pero AuthContext
        // sigue con el objeto viejo hasta que lo refresquemos aquí.
        if (res.data.estado === 'activo_nivel_1' || res.data.estado === 'activo_nivel_2') {
          refreshUser();
        }
      } else {
        setStatus(null);
      }
    } catch (error: any) {
      console.error('Error fetching voluntario status:', error);
      setStatus(null);
    }
  };

  // Cargar perfil del usuario (para enviar junto con postulación)
  const fetchUsuarioPerfil = async () => {
    try {
      const res = await axios.get(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsuarioPerfil(res.data);
    } catch (error: any) {
      console.error('Error fetching usuario perfil:', error);
      // Si no existe el endpoint, se mantiene null
    }
  };

  // 3. Cargar Asociaciones (endpoint correcto: /associations, no /asociaciones)
  const fetchAsociaciones = async () => {
    try {
      const res = await axios.get(`${API_URL}/associations`);
      // El backend ya filtra por verificado=True y activo=True
      setAsociaciones(res.data);
    } catch (error) {
      console.error('Error al cargar asociaciones:', error);
      showToast({
        type: 'error',
        title: 'Error',
        message: 'No pudimos cargar las asociaciones. Intenta de nuevo.',
      });
    }
  };

  useEffect(() => {
    if (isLoggedIn && token) {
      fetchStatus();
      fetchUsuarioPerfil();
      fetchAsociaciones();
      handleGetLocation();
    }
  }, [isLoggedIn, token]);

  // Cuando termina de cargar, desactiva el loading
  useEffect(() => {
    if (!isAuthLoading && asociaciones.length >= 0) {
      setIsLoading(false);
    }
  }, [isAuthLoading, asociaciones]);

  // 4. Obtener GPS para ordenar la lista
  const handleGetLocation = async () => {
    setIsLoadingGps(true);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setPinLocation({
            latitud: position.coords.latitude,
            longitud: position.coords.longitude,
          });
          setIsLoadingGps(false);
        },
        () => {
          setIsLoadingGps(false);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
      return;
    }
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let currentLocation = await Location.getCurrentPositionAsync({});
        setPinLocation({
          latitud: currentLocation.coords.latitude,
          longitud: currentLocation.coords.longitude,
        });
      }
    } catch (error) {
      console.error('Error getting location:', error);
    } finally {
      setIsLoadingGps(false);
    }
  };

  // 5. Enviar Postulación
  const handlePostular = async () => {
    if (!assocSeleccionada) return;
    setIsSubmitting(true);
    try {
      // POST /voluntarios/postulaciones
      // Envía tipo='interno' y asociacion_id
      // El backend crea el voluntario si no existe, o trae uno existente
      const response = await axios.post(
        `${API_URL}/voluntarios/postulaciones`,
        {
          tipo: 'interno',
          asociacion_id: assocSeleccionada.id,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      showToast({
        type: 'success',
        title: '¡Postulación enviada!',
        message: `Tu solicitud fue enviada a ${assocSeleccionada.nombre}`,
      });

      setAssocSeleccionada(null);
      setIsReapplying(false);

      // Recargar estado para mostrar la pantalla de confirmación
      await fetchStatus();
    } catch (error: any) {
      console.error('Error al postular:', error);
      const message =
        error?.response?.data?.detail ||
        'No pudimos procesar tu solicitud. Intenta de nuevo.';
      showToast({
        type: 'error',
        title: 'Error',
        message: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthLoading || isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.bgTeal,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color={COLORS.bgWhite} />
      </View>
    );
  }

  const showSelectionList = !status || isReapplying;

  // Filtrar y ordenar asociaciones
  const asociacionesOrdenadas = asociaciones
    .filter((a) => {
      const query = searchQuery.toLowerCase();
      const coincideNombre = a.nombre
        ? a.nombre.toLowerCase().includes(query)
        : false;
      const coincideColonia = a.colonia
        ? a.colonia.toLowerCase().includes(query)
        : false;
      const coincideMunicipio = a.municipio
        ? a.municipio.toLowerCase().includes(query)
        : false;
      return coincideNombre || coincideColonia || coincideMunicipio;
    })
    .map((a) => ({
      ...a,
      distancia: getDistanceFromLatLonInKm(
        pinLocation.latitud,
        pinLocation.longitud,
        a.latitud,
        a.longitud
      ),
    }))
    .sort((a, b) => {
      // Primero por distancia
      if (a.distancia !== b.distancia) {
        return (a.distancia || 0) - (b.distancia || 0);
      }
      // Luego alfabéticamente por nombre como desempate
      return (a.nombre || '').localeCompare(b.nombre || '');
    });

  return (
    // CONTENEDOR PRINCIPAL FONDO
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: Platform.OS === 'web' ? 20 : 0,
      }}
    >
      <Toast toast={toast} translateY={translateY} />

      {/* TARJETA CENTRADA */}
      <View
        style={{
          width: '100%',
          maxWidth: FORM_MAX_WIDTH,
          height: Platform.OS === 'web' ? 800 : '100%',
          maxHeight: '95%',
          backgroundColor: COLORS.bgWhite,
          borderRadius: Platform.OS === 'web' ? 30 : 0,
          overflow: 'hidden',
          ...(Platform.OS === 'web'
            ? { boxShadow: '0 10px 40px rgba(0,0,0,0.15)' as any }
            : { elevation: 0 }),
          flexDirection: 'column',
        }}
      >
        {/* ─── HEADER TEAL ─── */}
        <View
          style={{
            backgroundColor: COLORS.bgTeal,
            paddingHorizontal: 30,
            paddingTop: Platform.OS === 'web' ? 30 : 60,
            paddingBottom: 40,
            position: 'relative',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            {/* Títulos */}
            <View style={{ flex: 1, zIndex: 1 }}>
              <Text
                style={{
                  fontSize: 32,
                  fontWeight: '900',
                  color: COLORS.bgWhite,
                  textShadowColor: 'rgba(0,0,0,0.1)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 4,
                }}
              >
                Voluntariado
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: COLORS.bgWhite,
                  opacity: 0.9,
                }}
              >
                {showSelectionList
                  ? 'Encuentra tu equipo ideal.'
                  : 'Seguimiento de postulación'}
              </Text>
            </View>

            {/* Decoración pata */}
            <View
              style={{
                position: 'absolute',
                right: 10,
                top: -18,
                zIndex: 2,
              }}
            >
              <Image
                source={{
                  uri: 'https://cdn-icons-png.flaticon.com/512/3047/3047928.png',
                }}
                style={{ width: 100, height: 100, opacity: 0.9 }}
                resizeMode="contain"
              />
            </View>

            {/* Botón Cerrar X */}
            <TouchableOpacity
              onPress={() => router.replace('/')}
              style={{
                backgroundColor: 'rgba(255,255,255,0.4)',
                padding: 6,
                borderRadius: 20,
                zIndex: 10,
                marginLeft: 16,
                marginTop: 4,
              }}
            >
              <Ionicons name="close" size={24} color={COLORS.bgWhite} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── CUERPO BLANCO (Scrollable) ─── */}
        <View
          style={{
            flex: 1,
            backgroundColor: COLORS.bgWhite,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            marginTop: -20,
            paddingHorizontal: Platform.OS === 'web' ? 30 : 20,
            paddingTop: 30,
            zIndex: 5,
          }}
        >
          {showSelectionList ? (
            // ─── PANTALLA: SELECCIÓN DE ASOCIACIÓN ───
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: '800',
                  color: COLORS.textDark,
                  marginBottom: 4,
                }}
              >
                Asociaciones cercanas a ti
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: COLORS.textLight,
                  marginBottom: 20,
                }}
              >
                Elige la asociación a la que deseas unirte para ayudar en
                rescates.
              </Text>

              {/* Ajuste de Ubicación */}
              <View
                style={{
                  backgroundColor: COLORS.grayLight,
                  padding: 16,
                  borderRadius: 24,
                  marginBottom: 20,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: COLORS.textDark,
                    }}
                  >
                    Tu ubicación de referencia
                  </Text>
                  <TouchableOpacity
                    onPress={handleGetLocation}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                  >
                    <Ionicons
                      name="locate"
                      size={16}
                      color={COLORS.primary}
                    />
                    <Text
                      style={{
                        color: COLORS.primary,
                        fontSize: 12,
                        fontWeight: '700',
                        marginLeft: 4,
                      }}
                    >
                      {isLoadingGps ? 'Buscando...' : 'Usar GPS'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View
                  style={{
                    borderRadius: 16,
                    overflow: 'hidden',
                    height: 160,
                  }}
                >
                  <LocationPickerMap
                    selectedPosition={pinLocation}
                    onLocationSelect={(lat, lon) =>
                      setPinLocation({ latitud: lat, longitud: lon })
                    }
                  />
                </View>
              </View>

              {/* Buscador */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: COLORS.bgWhite,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 16,
                  paddingHorizontal: 16,
                  marginBottom: 24,
                }}
              >
                <Ionicons
                  name="search"
                  size={20}
                  color={COLORS.textLight}
                />
                <TextInput
                  placeholder="Buscar asociación por nombre"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    paddingHorizontal: 12,
                    color: COLORS.textDark,
                    fontSize: 15,
                    outlineStyle: 'none',
                  } as any}
                  placeholderTextColor={COLORS.textLight}
                />
              </View>

              {/* Lista de Asociaciones */}
              {asociacionesOrdenadas.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons
                    name="sad-outline"
                    size={48}
                    color={COLORS.textLight}
                    style={{ opacity: 0.5, marginBottom: 10 }}
                  />
                  <Text
                    style={{
                      color: COLORS.textLight,
                      fontSize: 15,
                      textAlign: 'center',
                    }}
                  >
                    No encontramos asociaciones cercanas.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 16 }}>
                  {asociacionesOrdenadas.map((assoc) => (
                    <View
                      key={assoc.id}
                      style={{
                        backgroundColor: COLORS.bgWhite,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        borderRadius: 24,
                        padding: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 16,
                        elevation: 1,
                      }}
                    >
                      {/* Logo */}
                      <View
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          backgroundColor: 'rgba(102, 188, 180, 0.15)',
                          justifyContent: 'center',
                          alignItems: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {assoc.logo_url ? (
                          <Image
                            source={{ uri: assoc.logo_url }}
                            style={{ width: '100%', height: '100%' }}
                          />
                        ) : (
                          <Ionicons
                            name="business"
                            size={24}
                            color={COLORS.accent}
                          />
                        )}
                      </View>

                      {/* Información */}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: '800',
                            color: COLORS.textDark,
                          }}
                          numberOfLines={1}
                        >
                          {assoc.nombre}
                        </Text>
                        {/* Dirección: colonia, municipio */}
                        <Text
                          style={{
                            fontSize: 13,
                            color: COLORS.textLight,
                            marginTop: 2,
                          }}
                          numberOfLines={1}
                        >
                          {[assoc.colonia, assoc.municipio]
                            .filter(Boolean)
                            .join(', ') || 'Ubicación no disponible'}
                        </Text>
                        {/* Distancia */}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: 6,
                          }}
                        >
                          <Ionicons
                            name="navigate-circle"
                            size={14}
                            color={COLORS.primary}
                          />
                          <Text
                            style={{
                              fontSize: 12,
                              color: COLORS.primary,
                              fontWeight: '700',
                              marginLeft: 4,
                            }}
                          >
                            A {(assoc.distancia || 0).toFixed(1)} km
                          </Text>
                        </View>
                      </View>

                      {/* Botón Postular */}
                      <TouchableOpacity
                        onPress={() => setAssocSeleccionada(assoc)}
                        style={{
                          backgroundColor: COLORS.bgTeal,
                          paddingVertical: 10,
                          paddingHorizontal: 20,
                          borderRadius: 16,
                        }}
                      >
                        <Text
                          style={{
                            color: COLORS.bgWhite,
                            fontWeight: '700',
                            fontSize: 13,
                          }}
                        >
                          Postular
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          ) : (
            // ─── PANTALLA: ESTADOS DEL VOLUNTARIO ───
            <ScrollView contentContainerStyle={{ justifyContent: 'center', paddingVertical: 40 }}>
              {status?.estado === 'postulacion_pendiente' && (
                <View style={{ alignItems: 'center' }}>
                  <View
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: 50,
                      backgroundColor: COLORS.secondary + '20',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: 24,
                    }}
                  >
                    <Ionicons
                      name="time"
                      size={48}
                      color={COLORS.secondary}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '900',
                      color: COLORS.textDark,
                      textAlign: 'center',
                      marginBottom: 12,
                    }}
                  >
                    Postulación en revisión
                  </Text>
                  <Text
                    style={{
                      fontSize: 15,
                      color: COLORS.textLight,
                      textAlign: 'center',
                      lineHeight: 24,
                      maxWidth: 300,
                    }}
                  >
                    Tu solicitud fue enviada a{' '}
                    <Text style={{ fontWeight: 'bold' }}>
                      {status.ultima_postulacion?.asociacion_nombre ||
                        'la asociación seleccionada'}
                    </Text>
                    . Te notificaremos en cuanto haya una respuesta.
                  </Text>
                </View>
              )}

              {status?.estado === 'rechazado' && (
                <View style={{ alignItems: 'center', width: '100%' }}>
                  <View
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: 50,
                      backgroundColor: COLORS.danger + '15',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: 24,
                    }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={48}
                      color={COLORS.danger}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '900',
                      color: COLORS.danger,
                      textAlign: 'center',
                      marginBottom: 12,
                    }}
                  >
                    Postulación Rechazada
                  </Text>

                  <View
                    style={{
                      backgroundColor: COLORS.grayLight,
                      padding: 20,
                      borderRadius: 20,
                      width: '100%',
                      marginBottom: 32,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: COLORS.textDark,
                        marginBottom: 8,
                      }}
                    >
                      Motivo de la asociación:
                    </Text>
                    <Text style={{ fontSize: 14, color: COLORS.textLight }}>
                      {status.ultima_postulacion?.motivo_rechazo ||
                        'No se especificó un motivo particular.'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => setIsReapplying(true)}
                    style={{
                      backgroundColor: COLORS.primary,
                      paddingVertical: 16,
                      paddingHorizontal: 32,
                      borderRadius: 24,
                      width: '100%',
                      alignItems: 'center',
                      elevation: 2,
                    }}
                  >
                    <Text
                      style={{
                        color: COLORS.bgWhite,
                        fontWeight: '800',
                        fontSize: 16,
                      }}
                    >
                      Volver a postular a otra
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {(status?.estado === 'activo_nivel_1' ||
                status?.estado === 'activo_nivel_2') && (
                <View style={{ alignItems: 'center', width: '100%' }}>
                  <View
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: 50,
                      backgroundColor: COLORS.bgTeal + '20',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: 24,
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={48}
                      color={COLORS.bgTeal}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '900',
                      color: COLORS.bgTeal,
                      textAlign: 'center',
                      marginBottom: 12,
                    }}
                  >
                    ¡Felicidades!
                  </Text>
                  <Text
                    style={{
                      fontSize: 15,
                      color: COLORS.textLight,
                      textAlign: 'center',
                      lineHeight: 24,
                      marginBottom: 40,
                      maxWidth: 320,
                    }}
                  >
                    La asociación ha aceptado tu solicitud. Solo falta un
                    último paso para que puedas empezar a recibir rescates.
                  </Text>

                  <TouchableOpacity
                    onPress={() =>
                      router.push('/capacidades-form' as any)
                    }
                    style={{
                      backgroundColor: COLORS.primary,
                      paddingVertical: 18,
                      paddingHorizontal: 32,
                      borderRadius: 24,
                      width: '100%',
                      alignItems: 'center',
                      elevation: 3,
                    }}
                  >
                    <Text
                      style={{
                        color: COLORS.bgWhite,
                        fontWeight: '900',
                        fontSize: 16,
                      }}
                    >
                      Termina de completar tu perfil
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>

      {/* ─── MODAL: CONFIRMACIÓN DE POSTULACIÓN ─── */}
      <Modal visible={!!assocSeleccionada} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.bgWhite,
              borderRadius: 32,
              padding: 32,
              width: '100%',
              maxWidth: 400,
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: 'rgba(102, 188, 180, 0.15)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <Ionicons
                  name="send"
                  size={32}
                  color={COLORS.accent}
                />
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '900',
                  color: COLORS.textDark,
                  textAlign: 'center',
                }}
              >
                ¿Enviar postulación?
              </Text>
            </View>
            <Text
              style={{
                fontSize: 15,
                color: COLORS.textLight,
                textAlign: 'center',
                marginBottom: 32,
                lineHeight: 22,
              }}
            >
              Se enviará tu solicitud a{' '}
              <Text style={{ fontWeight: '700', color: COLORS.textDark }}>
                {assocSeleccionada?.nombre}
              </Text>
              . Ellos revisarán tu perfil y te darán una respuesta.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setAssocSeleccionada(null)}
                style={{
                  flex: 1,
                  paddingVertical: 16,
                  alignItems: 'center',
                  borderRadius: 20,
                  backgroundColor: COLORS.grayLight,
                }}
              >
                <Text
                  style={{
                    color: COLORS.textLight,
                    fontWeight: '700',
                  }}
                >
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePostular}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  paddingVertical: 16,
                  alignItems: 'center',
                  borderRadius: 20,
                  backgroundColor: COLORS.primary,
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={COLORS.bgWhite} />
                ) : (
                  <Text
                    style={{
                      color: COLORS.bgWhite,
                      fontWeight: '800',
                    }}
                  >
                    Enviar
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
