import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';
import { Toast, useToast } from '../components/Toast';

// Tipado para los reportes
interface Animal {
  tipo_animal: string | null;
  condicion: string | null;
  tamanio: string | null;
  sexo: string | null;
  edad_aproximada: string | null;
  descripcion: string | null;
}

interface ReporteStaff {
  id: string;
  estado_reporte: string;
  municipio: string | null;
  colonia: string | null;
  calle: string | null;
  referencia: string | null;
  latitud?: number;
  longitud?: number;
  created_at: string;
  foto_url: string | null;
  animal: Animal;
  asociacion: {
    nombre: string | null;
    telefono: string | null;
  };
}

interface RespuestaBackend {
  pendientes: ReporteStaff[];
  en_accion: ReporteStaff[];
  completados: ReporteStaff[];
}

const SHADOW_STYLE = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 3,
};

interface Props {
  onClose?: () => void;
}

export default function StaffDashboardScreen({ onClose }: Props) {
  const { token, user } = useAuth();
  const { toast, translateY, showToast } = useToast();

  // Estados para los reportes agrupados
  const [reportesPendientes, setReportesPendientes] = useState<ReporteStaff[]>([]);
  const [reportesEnAccion, setReportesEnAccion] = useState<ReporteStaff[]>([]);
  const [reportesCompletados, setReportesCompletados] = useState<ReporteStaff[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estados para modales
  const [reporteSeleccionado, setReporteSeleccionado] = useState<ReporteStaff | null>(null);
  const [showDetalles, setShowDetalles] = useState(false);
  const [showEncontreModal, setShowEncontreModal] = useState(false);
  const [showRefugioModal, setShowRefugioModal] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  // Estados para el formulario de hitos
  const [estadoEncontre, setEstadoEncontre] = useState('');
  const [estadoRefugio, setEstadoRefugio] = useState('');
  const [notasEncontre, setNotasEncontre] = useState('');
  const [notasRefugio, setNotasRefugio] = useState('');
  const [fotoEncontre, setFotoEncontre] = useState<string | null>(null);
  const [fotoRefugio, setFotoRefugio] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados para captura de GPS
  const [ubicacionActual, setUbicacionActual] = useState<{ latitude: number; longitude: number } | null>(null);
  const [permisoDenegado, setPermisoDenegado] = useState(false);
  const [obteniendoGPS, setObteniendoGPS] = useState(false);

  const screenWidth = Dimensions.get('window').width;

  const OPCIONES_ENCONTRE = [
    'Igual que en el reporte',
    'Peor de lo esperado',
    'En estado crítico',
    'No estaba en el lugar',
  ];

  const OPCIONES_REFUGIO = [
    'Animal rescatado y estable',
    'Animal en tratamiento veterinario',
    'Animal en hogar temporal',
    'Animal adoptado',
    'No se pudo rescatar',
  ];

  // Cargar reportes asignados al staff
  const cargarReportesAsignados = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/staff/me/reportes`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log('Respuesta del backend (Staff):', JSON.stringify(res.data, null, 2));

      // Procesar la respuesta correctamente
      if (res.data) {
        setReportesPendientes(res.data.pendientes || []);
        setReportesEnAccion(res.data.en_accion || []);
        setReportesCompletados(res.data.completados || []);
        
        console.log('✓ Reportes cargados:', {
          pendientes: res.data.pendientes?.length || 0,
          en_accion: res.data.en_accion?.length || 0,
          completados: res.data.completados?.length || 0,
        });
      } else {
        throw new Error('Formato de respuesta no esperado');
      }
    } catch (error: any) {
      console.error('Error al cargar reportes del staff:', error);
      const mensajeError = error?.response?.data?.detail || error.message || 'No pudimos cargar tus casos asignados.';
      showToast({ 
        type: 'error', 
        title: 'Error', 
        message: mensajeError,
      });
      setReportesPendientes([]);
      setReportesEnAccion([]);
      setReportesCompletados([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarReportesAsignados();
  }, []);

  // Obtener ubicación GPS automáticamente
  const obtenerUbicacionGPS = async () => {
    setObteniendoGPS(true);
    try {
      // Solicitar permiso de ubicación
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        setPermisoDenegado(true);
        showToast({
          type: 'error',
          title: 'Permiso denegado',
          message: 'Necesitamos acceso a tu ubicación para registrar la llegada al refugio',
        });
        setObteniendoGPS(false);
        return;
      }

      setPermisoDenegado(false);

      // Obtener ubicación actual
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setUbicacionActual({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      showToast({
        type: 'success',
        title: 'Ubicación obtenida',
        message: `GPS: ${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}`,
      });
    } catch (error: any) {
      console.error('Error obteniendo ubicación:', error);
      showToast({
        type: 'error',
        title: 'Error',
        message: 'No pudimos obtener tu ubicación actual',
      });
    } finally {
      setObteniendoGPS(false);
    }
  };

  // Usar cámara para capturar foto (obligatoria para "Llegué al refugio")
  const usarCamara = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        showToast({
          type: 'error',
          title: 'Permiso denegado',
          message: 'Necesitamos acceso a la cámara',
        });
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled) {
        const base64 = result.assets[0].base64;
        const fotoData = `data:image/jpeg;base64,${base64}`;
        
        if (showEncontreModal) {
          setFotoEncontre(fotoData);
        } else if (showRefugioModal) {
          setFotoRefugio(fotoData);
        }
      }
    } catch (error: any) {
      console.error('Error usando cámara:', error);
      showToast({
        type: 'error',
        title: 'Error',
        message: 'Error al usar la cámara',
      });
    }
  };

  // Galería - solo para "Encontré al animal"
  const handlePickFoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled) {
      const base64 = result.assets[0].base64;
      const fotoData = `data:image/jpeg;base64,${base64}`;
      
      if (showEncontreModal) {
        setFotoEncontre(fotoData);
      }
    }
  };

  const registrarEncontre = async () => {
    if (!reporteSeleccionado || !estadoEncontre) {
      showToast({
        type: 'warning',
        title: 'Faltan datos',
        message: 'Debes seleccionar el estado actual del animal.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(
        `${API_URL}/reports/${reporteSeleccionado.id}/hitos`,
        {
          tipo_hito: 'encontre_animal',
          condicion_observada: estadoEncontre,
          comentario: notasEncontre || null,
          foto_url: fotoEncontre || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showToast({
        type: 'success',
        title: 'Éxito',
        message: 'Hito registrado correctamente',
      });
      
      setShowEncontreModal(false);
      setEstadoEncontre('');
      setFotoEncontre(null);
      setNotasEncontre('');
      setReporteSeleccionado(null);
      
      await cargarReportesAsignados();
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: error?.response?.data?.detail || 'Error al registrar el hito',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const registrarRefugio = async () => {
    if (!reporteSeleccionado || !estadoRefugio) {
      showToast({
        type: 'warning',
        title: 'Faltan datos',
        message: 'Debes seleccionar el estado final del animal.',
      });
      return;
    }

    // Validar que se capturó ubicación GPS
    if (!ubicacionActual) {
      showToast({
        type: 'error',
        title: 'Ubicación requerida',
        message: 'Debes capturar tu ubicación GPS antes de cerrar el caso',
      });
      return;
    }

    // Validar que se tomó foto con cámara
    if (!fotoRefugio) {
      showToast({
        type: 'error',
        title: 'Foto requerida',
        message: 'Debes tomar una foto con la cámara para registrar la llegada al refugio',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(
        `${API_URL}/reports/${reporteSeleccionado.id}/hitos`,
        {
          tipo_hito: 'llegue_refugio',
          condicion_observada: estadoRefugio,
          comentario: notasRefugio || null,
          foto_url: fotoRefugio,
          latitud: ubicacionActual.latitude,
          longitud: ubicacionActual.longitude,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showToast({
        type: 'success',
        title: 'Éxito',
        message: 'Caso cerrado correctamente',
      });
      
      setShowRefugioModal(false);
      setEstadoRefugio('');
      setFotoRefugio(null);
      setNotasRefugio('');
      setUbicacionActual(null);
      setReporteSeleccionado(null);
      
      await cargarReportesAsignados();
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: error?.response?.data?.detail || 'Error al cerrar el caso',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const abrirMapa = () => {
    if (!reporteSeleccionado?.latitud || !reporteSeleccionado?.longitud) {
      showToast({
        type: 'error',
        title: 'Error',
        message: 'No hay coordenadas disponibles',
      });
      return;
    }

    const url = `https://www.google.com/maps/search/?api=1&query=${reporteSeleccionado.latitud},${reporteSeleccionado.longitud}`;
    Linking.openURL(url);
  };

  const resetModales = () => {
    setEstadoEncontre('');
    setEstadoRefugio('');
    setNotasEncontre('');
    setNotasRefugio('');
    setFotoEncontre(null);
    setFotoRefugio(null);
    setUbicacionActual(null);
    setPermisoDenegado(false);
  };

  const TarjetaReporte = ({ reporte }: { reporte: ReporteStaff }) => (
    <TouchableOpacity
      onPress={() => {
        setReporteSeleccionado(reporte);
        setCurrentPhotoIndex(0);
        setShowDetalles(true);
      }}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        ...SHADOW_STYLE,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {reporte.foto_url ? (
          <Image
            source={{ uri: reporte.foto_url }}
            style={{ width: 100, height: 100, borderRadius: 12 }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: 100,
              height: 100,
              borderRadius: 12,
              backgroundColor: '#F1F5F9',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="paw-outline" size={32} color="#94A3B8" />
          </View>
        )}

        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>
              {reporte.animal?.tipo_animal || 'Animal'}
            </Text>
            <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              {reporte.animal?.condicion || 'Sin información'}
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '500' }}>
            {[reporte.calle, reporte.colonia, reporte.municipio]
              .filter(Boolean)
              .join(', ') || 'Ubicación no disponible'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const totalReportes = reportesPendientes.length + reportesEnAccion.length + reportesCompletados.length;

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: '#0F172A',
          paddingTop: 16,
          paddingBottom: 20,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View>
          <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>
            Panel de Staff
          </Text>
          <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '500', marginTop: 2 }}>
            {user?.nombre} {user?.apellido_paterno}
          </Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close-circle" size={28} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Contenido */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1F77B4" />
          <Text style={{ marginTop: 12, color: '#64748B', fontSize: 14 }}>
            Cargando tus casos...
          </Text>
        </View>
      ) : totalReportes === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="inbox-outline" size={48} color="#CBD5E1" />
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#64748B', marginTop: 12, textAlign: 'center' }}>
            No tienes casos asignados en este momento
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
        >
          {/* Casos Pendientes */}
          {reportesPendientes.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: '#F39C12' }} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1E293B' }}>
                  Pendientes
                </Text>
                <View style={{ backgroundColor: '#F39C12', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                    {reportesPendientes.length}
                  </Text>
                </View>
              </View>
              {reportesPendientes.map((reporte) => (
                <TarjetaReporte key={reporte.id} reporte={reporte} />
              ))}
            </View>
          )}

          {/* Casos en Acción */}
          {reportesEnAccion.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: '#3498DB' }} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1E293B' }}>
                  En acción
                </Text>
                <View style={{ backgroundColor: '#3498DB', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                    {reportesEnAccion.length}
                  </Text>
                </View>
              </View>
              {reportesEnAccion.map((reporte) => (
                <TarjetaReporte key={reporte.id} reporte={reporte} />
              ))}
            </View>
          )}

          {/* Casos Completados */}
          {reportesCompletados.length > 0 && (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: '#27AE60' }} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1E293B' }}>
                  Completados
                </Text>
                <View style={{ backgroundColor: '#27AE60', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                    {reportesCompletados.length}
                  </Text>
                </View>
              </View>
              {reportesCompletados.map((reporte) => (
                <TarjetaReporte key={reporte.id} reporte={reporte} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Modal: Detalles del Reporte */}
      <Modal visible={showDetalles} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 16,
              paddingHorizontal: 16,
              maxHeight: '90%',
            }}
          >
            {/* Header Modal */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#1E293B' }}>
                Detalles del Caso
              </Text>
              <TouchableOpacity onPress={() => setShowDetalles(false)}>
                <Ionicons name="close" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {reporteSeleccionado && (
                <>
                  {/* Foto del animal */}
                  {reporteSeleccionado.foto_url ? (
                    <View style={{ marginBottom: 16 }}>
                      <Image
                        source={{ uri: reporteSeleccionado.foto_url }}
                        style={{ width: '100%', height: 250, borderRadius: 16 }}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View
                      style={{
                        width: '100%',
                        height: 250,
                        borderRadius: 16,
                        backgroundColor: '#F1F5F9',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 16,
                      }}
                    >
                      <Ionicons name="paw-outline" size={48} color="#94A3B8" />
                    </View>
                  )}

                  {/* Info del Animal */}
                  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8 }}>
                      Información del Animal
                    </Text>
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: '#64748B', fontSize: 13 }}>Tipo:</Text>
                        <Text style={{ color: '#1E293B', fontWeight: '600', fontSize: 13 }}>
                          {reporteSeleccionado.animal?.tipo_animal || 'N/A'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: '#64748B', fontSize: 13 }}>Condición:</Text>
                        <Text style={{ color: '#1E293B', fontWeight: '600', fontSize: 13 }}>
                          {reporteSeleccionado.animal?.condicion || 'N/A'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: '#64748B', fontSize: 13 }}>Tamaño:</Text>
                        <Text style={{ color: '#1E293B', fontWeight: '600', fontSize: 13 }}>
                          {reporteSeleccionado.animal?.tamanio || 'N/A'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: '#64748B', fontSize: 13 }}>Sexo:</Text>
                        <Text style={{ color: '#1E293B', fontWeight: '600', fontSize: 13 }}>
                          {reporteSeleccionado.animal?.sexo || 'N/A'}
                        </Text>
                      </View>
                      {reporteSeleccionado.animal?.descripcion && (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                          <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '600', marginBottom: 4 }}>
                            Descripción:
                          </Text>
                          <Text style={{ color: '#1E293B', fontSize: 12, lineHeight: 18 }}>
                            {reporteSeleccionado.animal.descripcion}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Ubicación */}
                  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8 }}>
                      Ubicación
                    </Text>
                    <View style={{ gap: 4 }}>
                      <Text style={{ color: '#1E293B', fontWeight: '600', fontSize: 13 }}>
                        {reporteSeleccionado.calle || 'Calle desconocida'}
                      </Text>
                      <Text style={{ color: '#64748B', fontSize: 12 }}>
                        {reporteSeleccionado.colonia || 'Colonia desconocida'}, {reporteSeleccionado.municipio || 'Municipio desconocido'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={abrirMapa}
                      style={{
                        marginTop: 12,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        backgroundColor: '#EFF6FF',
                        borderRadius: 8,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 8,
                        borderWidth: 1,
                        borderColor: '#DBEAFE',
                      }}
                    >
                      <Ionicons name="navigate-outline" size={16} color="#1F77B4" />
                      <Text style={{ color: '#1F77B4', fontWeight: '600', fontSize: 13 }}>
                        Cómo llegar
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Botones de Acción */}
                  <View style={{ gap: 10, marginBottom: 16 }}>
                    {reporteSeleccionado.estado_reporte === 'en_camino' && (
                      <TouchableOpacity
                        onPress={() => {
                          setShowDetalles(false);
                          setShowEncontreModal(true);
                        }}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          backgroundColor: '#F39C12',
                          borderRadius: 12,
                          alignItems: 'center',
                          flexDirection: 'row',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                          Encontré al animal
                        </Text>
                      </TouchableOpacity>
                    )}

                    {reporteSeleccionado.estado_reporte === 'en_atencion' && (
                      <TouchableOpacity
                        onPress={() => {
                          setShowDetalles(false);
                          setShowRefugioModal(true);
                        }}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          backgroundColor: '#8E44AD',
                          borderRadius: 12,
                          alignItems: 'center',
                          flexDirection: 'row',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        <Ionicons name="home-outline" size={18} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                          Llegué al refugio
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: Encontré al Animal */}
      <Modal visible={showEncontreModal} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: '#FFF',
              borderRadius: 12,
              padding: 20,
              width: '100%',
              maxWidth: 400,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>
                ¿Cómo está el animal?
              </Text>
              <TouchableOpacity onPress={() => { setShowEncontreModal(false); resetModales(); }}>
                <Text style={{ fontSize: 20, color: '#95A5A6' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300, marginBottom: 12 }}>
              {OPCIONES_ENCONTRE.map((opcion) => (
                <TouchableOpacity
                  key={opcion}
                  onPress={() => setEstadoEncontre(opcion)}
                  style={{
                    padding: 10,
                    borderWidth: 1,
                    borderColor: estadoEncontre === opcion ? '#3498DB' : '#ECF0F1',
                    borderRadius: 8,
                    marginBottom: 8,
                    backgroundColor: estadoEncontre === opcion ? '#EBF5FB' : '#FFF',
                  }}
                >
                  <Text style={{ fontSize: 13, color: '#2C3E50' }}>{opcion}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#BDC3C7',
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
                marginBottom: 12,
                minHeight: 60,
              }}
              multiline
              placeholder="Notas adicionales (Opcional)"
              value={notasEncontre}
              onChangeText={setNotasEncontre}
            />

            <TouchableOpacity
              onPress={handlePickFoto}
              style={{
                padding: 12,
                backgroundColor: '#EAEDED',
                borderRadius: 8,
                marginBottom: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#34495E', fontWeight: '600' }}>
                {fotoEncontre ? 'Foto adjuntada ✓' : 'Subir foto (Opcional)'}
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#EAEDED' }}
                onPress={() => { setShowEncontreModal(false); resetModales(); }}
              >
                <Text style={{ color: '#7F8C8D', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#F39C12' }}
                onPress={registrarEncontre}
                disabled={isSubmitting}
              >
                {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Llegué al Refugio */}
      <Modal visible={showRefugioModal} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: '#FFF',
              borderRadius: 12,
              padding: 20,
              width: '100%',
              maxWidth: 400,
              maxHeight: '90%',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>
                ¿Cómo concluyó el rescate?
              </Text>
              <TouchableOpacity onPress={() => { setShowRefugioModal(false); resetModales(); setUbicacionActual(null); }}>
                <Text style={{ fontSize: 20, color: '#95A5A6' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400, marginBottom: 12 }}>
              {/* Opciones de estado final */}
              {OPCIONES_REFUGIO.map((opcion) => (
                <TouchableOpacity
                  key={opcion}
                  onPress={() => setEstadoRefugio(opcion)}
                  style={{
                    padding: 10,
                    borderWidth: 1,
                    borderColor: estadoRefugio === opcion ? '#3498DB' : '#ECF0F1',
                    borderRadius: 8,
                    marginBottom: 8,
                    backgroundColor: estadoRefugio === opcion ? '#EBF5FB' : '#FFF',
                  }}
                >
                  <Text style={{ fontSize: 13, color: '#2C3E50' }}>{opcion}</Text>
                </TouchableOpacity>
              ))}

              {/* Notas del cierre */}
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: '#BDC3C7',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                  marginTop: 12,
                  marginBottom: 12,
                  minHeight: 60,
                }}
                multiline
                placeholder="Notas del cierre (Opcional)"
                value={notasRefugio}
                onChangeText={setNotasRefugio}
              />

              {/* Sección de GPS */}
              <View
                style={{
                  backgroundColor: '#EFF6FF',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#DBEAFE',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Ionicons name="location-outline" size={18} color="#1F77B4" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F77B4' }}>
                    Ubicación GPS
                  </Text>
                </View>

                {ubicacionActual ? (
                  <View style={{ backgroundColor: '#FFF', borderRadius: 6, padding: 8, marginBottom: 10 }}>
                    <Text style={{ fontSize: 11, color: '#27AE60', fontWeight: '600', marginBottom: 4 }}>
                      ✓ Ubicación capturada
                    </Text>
                    <Text style={{ fontSize: 10, color: '#64748B' }}>
                      Lat: {ubicacionActual.latitude.toFixed(4)}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#64748B' }}>
                      Lon: {ubicacionActual.longitude.toFixed(4)}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>
                    Se capturará automáticamente cuando presiones el botón
                  </Text>
                )}

                <TouchableOpacity
                  onPress={obtenerUbicacionGPS}
                  disabled={obteniendoGPS}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: '#1F77B4',
                    borderRadius: 6,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {obteniendoGPS ? (
                    <>
                      <ActivityIndicator size="small" color="#FFF" />
                      <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 12 }}>
                        Obteniendo ubicación...
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="navigate-circle-outline" size={16} color="#FFF" />
                      <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 12 }}>
                        Capturar mi ubicación GPS
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Sección de Foto - Obligatoria */}
              <View
                style={{
                  backgroundColor: '#FCF3E6',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#FCD34D',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Ionicons name="camera-outline" size={18} color="#F39C12" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#F39C12' }}>
                    Foto (Obligatoria)
                  </Text>
                </View>

                {fotoRefugio ? (
                  <View style={{ marginBottom: 10 }}>
                    <Image
                      source={{ uri: fotoRefugio }}
                      style={{
                        width: '100%',
                        height: 120,
                        borderRadius: 6,
                        marginBottom: 8,
                      }}
                      resizeMode="cover"
                    />
                    <Text style={{ fontSize: 11, color: '#27AE60', fontWeight: '600' }}>
                      ✓ Foto capturada
                    </Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>
                    La foto se capturará con la cámara de tu dispositivo
                  </Text>
                )}

                <TouchableOpacity
                  onPress={usarCamara}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: '#F39C12',
                    borderRadius: 6,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Ionicons name="camera-outline" size={16} color="#FFF" />
                  <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 12 }}>
                    {fotoRefugio ? 'Cambiar foto' : 'Abrir cámara'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Botones de acción */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderRadius: 8,
                  backgroundColor: '#EAEDED',
                }}
                onPress={() => {
                  setShowRefugioModal(false);
                  resetModales();
                  setUbicacionActual(null);
                }}
              >
                <Text style={{ color: '#7F8C8D', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderRadius: 8,
                  backgroundColor: '#8E44AD',
                }}
                onPress={registrarRefugio}
                disabled={isSubmitting || !ubicacionActual || !fotoRefugio}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>
                    {!ubicacionActual || !fotoRefugio ? 'Faltan datos' : 'Cerrar Caso'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast translateY={translateY} toast={toast} />
    </View>
  );
}
