import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Toast, useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

interface AsociacionInfo {
  id: string;
  nombre: string;
  estado: 'pendiente' | 'rechazada' | 'aprobada';
  motivo_rechazo: string | null;
}

interface ReporteAsignado {
  asignacion_id: string;
  reporte_id: string;
  estado_asignacion_clave: string;
  estado_reporte: string;
  municipio: string | null;
  colonia: string | null;
  calle: string | null;
  latitud?: number;
  longitud?: number;
  created_at: string;
  foto_url: string | null;
  fotos_urls: string[];
  animal: {
    tipo_animal: string | null;
    condicion: string | null;
    tamanio: string | null;
    sexo: string | null;
    edad_aproximada: string | null;
    descripcion: string | null;
  };
}

type FiltroAsignacion = 'todas' | 'pendientes' | 'aceptadas' | 'rechazadas';

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

export default function AssociationStatusScreen({ onClose }: Props) {
  const { token, logout, isLoading } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const [info, setInfo] = useState<AsociacionInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);

  const [nombreRep, setNombreRep] = useState('');
  const [apellidoRep, setApellidoRep] = useState('');
  const [telefonoRep, setTelefonoRep] = useState('');
  const [emailRep, setEmailRep] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [reportes, setReportes] = useState<ReporteAsignado[]>([]);
  const [isLoadingReportes, setIsLoadingReportes] = useState(false);
  const [filtro, setFiltro] = useState<FiltroAsignacion>('pendientes');
  const [nuevosReportes, setNuevosReportes] = useState(0);

  const [reporteSeleccionado, setReporteSeleccionado] = useState<ReporteAsignado | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showEncontreModal, setShowEncontreModal] = useState(false);
  const [showCerrarModal, setShowCerrarModal] = useState(false);
  
  const [reporteAccionId, setReporteAccionId] = useState<string | null>(null);
  const [isSubmittingAccion, setIsSubmittingAccion] = useState(false);

  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [notasRechazo, setNotasRechazo] = useState('');
  const [estadoEncontre, setEstadoEncontre] = useState('');
  const [estadoCierre, setEstadoCierre] = useState('');
  const [notasHito, setNotasHito] = useState('');
  const [fotoHito, setFotoHito] = useState<string | null>(null);

  const screenWidth = Dimensions.get('window').width;
 
  /// Estadode conexion para staff 
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffSeleccionado, setStaffSeleccionado] = useState<string | null>(null);
  
  const MOTIVOS_RECHAZO = [
    'No tenemos capacidad disponible ahora mismo',
    'El animal ya no está en el lugar reportado',
    'El caso requiere atención veterinaria especializada que no tenemos',
    'Ya estamos atendiendo una emergencia mayor'
  ];

  const OPCIONES_ENCONTRE = [
    'Igual que en el reporte',
    'Peor de lo esperado',
    'En estado crítico',
    'No estaba en el lugar'
  ];

  const OPCIONES_CIERRE = [
    'Animal rescatado y estable',
    'Animal en tratamiento veterinario',
    'Animal en hogar temporal',
    'Animal adoptado',
    'No se pudo rescatar'
  ];

  const cargarEstado = async () => {
    setIsLoadingInfo(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInfo(res.data);
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos cargar el estado.' });
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const calcularNuevosReportes = async (data: ReporteAsignado[]) => {
    try {
      const ultimaVista = await AsyncStorage.getItem('ultima_vista_reportes');
      if (ultimaVista) {
        const fechaUltima = new Date(ultimaVista);
        const count = data.filter(r => new Date(r.created_at) > fechaUltima).length;
        setNuevosReportes(count);
      } else {
        setNuevosReportes(data.length);
      }
      await AsyncStorage.setItem('ultima_vista_reportes', new Date().toISOString());
    } catch (e) {
      console.log('Error leyendo AsyncStorage', e);
      setNuevosReportes(data.length);
    }
  };

  const limpiarBadgeNuevos = () => {
    setNuevosReportes(0);
  };

  const cargarReportes = async () => {
    setIsLoadingReportes(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/reportes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReportes(res.data);
      calcularNuevosReportes(res.data);
    } catch {
      // Silencioso para UX
    } finally {
      setIsLoadingReportes(false);
    }
  };

  useEffect(() => {
    if (!isLoading) cargarEstado();
  }, [isLoading]);

  useEffect(() => {
    if (info?.estado === 'aprobada') cargarReportes();
  }, [info]);

  const handleAgregarRepresentante = async () => {
    if (!nombreRep.trim() || !apellidoRep.trim() || !telefonoRep.trim()) {
      showToast({ type: 'warning', title: 'Datos incompletos', message: 'Nombre, apellido y teléfono son obligatorios.' });
      return;
    }
    if (!info) return;
    setIsAdding(true);
    try {
      await axios.post(
        `${API_URL}/associations/${info.id}/representantes`,
        {
          nombre: nombreRep.trim(),
          apellido_paterno: apellidoRep.trim(),
          telefono: telefonoRep.replace(/\s|-/g, ''),
          email: emailRep.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast({ type: 'success', title: '¡Listo!', message: 'Persona agregada correctamente.' });
      setNombreRep(''); setApellidoRep(''); setTelefonoRep(''); setEmailRep('');
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos agregar al representante.' });
    } finally {
      setIsAdding(false);
    }
  };

  const handlePickFoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled) setFotoHito(result.assets[0].uri);
  };

  const resetModales = () => {
    setMotivoRechazo(''); setNotasRechazo(''); setEstadoEncontre(''); setEstadoCierre('');
    setNotasHito(''); setFotoHito(null); setReporteAccionId(null);
  };

  // ─── CONEXIÓN A ENDPOINTS REALES: ASINGACION DE STAFF POST ACEPTACION ───

  const confirmarAceptacion = async () => {
  if (!reporteAccionId) return;
  setIsSubmittingAccion(true);
  try {
    // Cargar staff disponible
    const res = await axios.get(`${API_URL}/associations/me/staff`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setStaffList(res.data);
    setShowAcceptModal(false);
    setShowStaffModal(true); // ← abrir modal de staff
  } catch (error: any) {
    showToast({ type: 'error', title: 'Error', message: 'No pudimos cargar el staff disponible.' });
  } finally {
    setIsSubmittingAccion(false);
  }
};

const confirmarAsignacionStaff = async () => {
  if (!reporteAccionId || !staffSeleccionado) {
    showToast({ type: 'warning', title: 'Faltan datos', message: 'Selecciona un miembro del staff.' });
    return;
  }
  setIsSubmittingAccion(true);
  try {
    await axios.post(
      `${API_URL}/reports/${reporteAccionId}/asignar-staff`,
      { staff_id: staffSeleccionado },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await cargarReportes();
    showToast({ type: 'success', title: 'Reporte aceptado', message: 'Staff asignado. Notificaremos que van en camino.' });
  } catch (error: any) {
    showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos asignar el staff.' });
  } finally {
    setShowStaffModal(false);
    resetModales();
    setStaffSeleccionado(null);
    setIsSubmittingAccion(false);
  }
};

  const confirmarRechazo = async () => {
    if (!reporteAccionId || !motivoRechazo) {
      showToast({ type: 'warning', title: 'Faltan datos', message: 'Selecciona un motivo de rechazo.' });
      return;
    }
    setIsSubmittingAccion(true);
    try {
      await axios.patch(`${API_URL}/reports/${reporteAccionId}/rechazar`, { motivo: motivoRechazo, notas: notasRechazo.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      await cargarReportes();
      showToast({ type: 'info', title: 'Reporte rechazado', message: 'El caso será reasignado.' });
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error al rechazar', message: error?.response?.data?.detail || 'No pudimos procesar el rechazo.' });
    } finally {
      setShowRejectModal(false);
      resetModales();
      setIsSubmittingAccion(false);
    }
  };

  const registrarHitoEncontre = async () => {
    if (!reporteAccionId || !estadoEncontre) {
      showToast({ type: 'warning', title: 'Faltan datos', message: 'Selecciona el estado actual del animal.' });
      return;
    }
    setIsSubmittingAccion(true);
    try {
    await axios.post(
      `${API_URL}/reports/${reporteAccionId}/hitos`,
        {
          tipo_hito: "encontre_animal",
          condicion_observada: estadoEncontre,
          comentario: notasHito.trim() || null,
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      await cargarReportes();
      showToast({ type: 'success', title: 'Hito registrado', message: 'El avance ha sido guardado exitosamente.' });
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error al registrar', message: error?.response?.data?.detail || 'No pudimos guardar el hito.' });
    } finally {
      setShowEncontreModal(false);
      resetModales();
      setIsSubmittingAccion(false);
    }
  };

  const registrarCierre = async () => {
    if (!reporteAccionId || !estadoCierre) {
      showToast({ type: 'warning', title: 'Faltan datos', message: 'Selecciona cómo concluyó el rescate.' });
      return;
    }
    setIsSubmittingAccion(true);
    try {
      await axios.patch(`${API_URL}/reports/${reporteAccionId}/status`, { estado: 'cerrado', conclusion: estadoCierre, notas: notasHito.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      await cargarReportes();
      showToast({ type: 'success', title: 'Caso cerrado', message: 'El rescate ha finalizado correctamente.' });
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error al cerrar', message: error?.response?.data?.detail || 'No pudimos cerrar el caso.' });
    } finally {
      setShowCerrarModal(false);
      resetModales();
      setIsSubmittingAccion(false);
    }
  };

  if (isLoadingInfo) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5' }}>
        <ActivityIndicator size="large" color="#3498DB" />
      </View>
    );
  }

  if (!info) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5', padding: 24 }}>
        <Text style={{ fontSize: 14, color: '#7F8C8D', textAlign: 'center', marginBottom: 16 }}>
          No pudimos cargar la información de tu asociación.
        </Text>
      </View>
    );
  }

  const reportesFiltrados = reportes.filter((r) => {
    if (filtro === 'todas') return true;
    if (filtro === 'pendientes') return r.estado_reporte === 'asignado' || r.estado_asignacion_clave === 'notificada';
    if (filtro === 'aceptadas') return ['en_camino', 'en_atencion'].includes(r.estado_reporte) || ['aceptada', 'completada'].includes(r.estado_asignacion_clave);
    if (filtro === 'rechazadas') return ['rechazada', 'cancelada'].includes(r.estado_asignacion_clave);
    return true;
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      <Toast toast={toast} translateY={translateY} />

      {/* Cabecera con Botón de Cierre */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>Panel de Asociación</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#95A5A6' }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>{info.nombre}</Text>
        <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 24 }}>Estado de tu asociación</Text>

        {info.estado === 'pendiente' && (
          <Card>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#F39C12', marginBottom: 8 }}>En revisión</Text>
            <Text style={{ fontSize: 14, color: '#566573', lineHeight: 20 }}>
              Tu asociación está siendo revisada por nuestro equipo. Te avisaremos en cuanto sea aprobada.
            </Text>
          </Card>
        )}

        {info.estado === 'rechazada' && (
          <Card>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#E74C3C', marginBottom: 8 }}>Solicitud rechazada</Text>
            <Text style={{ fontSize: 14, color: '#566573', lineHeight: 20 }}>{info.motivo_rechazo || 'No se especificó motivo.'}</Text>
          </Card>
        )}

        {info.estado === 'aprobada' && (
          <>
            <Card>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#27AE60', marginBottom: 8 }}>Asociación activa</Text>
              <Text style={{ fontSize: 14, color: '#566573', lineHeight: 20 }}>Tu asociación ya puede recibir reportes en tu zona.</Text>
            </Card>

            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>Reportes asignados</Text>
                {nuevosReportes > 0 && (
                  <View style={{ backgroundColor: '#E74C3C', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: 'bold' }}>{nuevosReportes} nuevos</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 16 }}>Historial y casos pendientes en tu zona.</Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['pendientes', 'aceptadas', 'rechazadas', 'todas'] as FiltroAsignacion[]).map((f) => (
                    <TouchableOpacity
                      key={f}
                      onPress={() => { setFiltro(f); limpiarBadgeNuevos(); }}
                      style={{
                        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                        backgroundColor: filtro === f ? '#3498DB' : '#EAEDED'
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', textTransform: 'capitalize', color: filtro === f ? '#FFF' : '#7F8C8D' }}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {isLoadingReportes ? (
                <ActivityIndicator size="small" color="#3498DB" style={{ marginTop: 20 }} />
              ) : reportesFiltrados.length === 0 ? (
                <Text style={{ fontSize: 14, color: '#95A5A6', textAlign: 'center', paddingVertical: 16 }}>No hay reportes en esta categoría.</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-start' }}>
                  {reportesFiltrados.map((reporte) => {
                    const enProceso = ['en_camino', 'en_atencion'].includes(reporte.estado_reporte);
                    return (
                      <View key={reporte.asignacion_id} style={{
                        width: screenWidth > 768 ? '23.5%' : '48%',
                        borderWidth: 1, borderColor: enProceso ? '#3498DB' : '#ECF0F1', borderRadius: 12,
                        marginBottom: 16, backgroundColor: '#FFF',
                        ...SHADOW_STYLE
                      }}>
                        <View style={{ position: 'relative' }}>
                          {reporte.foto_url ? (
                            <Image source={{ uri: reporte.foto_url }} style={{ width: '100%', aspectRatio: 1.5, borderTopLeftRadius: 12, borderTopRightRadius: 12 }} resizeMode="cover" />
                          ) : (
                            <View style={{ width: '100%', aspectRatio: 1.5, backgroundColor: '#EAEDED', alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                              <Text style={{ color: '#BDC3C7', fontSize: 13 }}>Sin foto</Text>
                            </View>
                          )}
                          <View style={{
                            position: 'absolute', top: 10, left: 10,
                            backgroundColor: reporte.animal?.condicion === 'grave' ? 'rgba(231, 76, 60, 0.9)' : 'rgba(243, 156, 18, 0.9)',
                            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12
                          }}>
                            <Text style={{ color: '#FFF', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>{reporte.animal?.condicion || 'Desconocida'}</Text>
                          </View>
                        </View>

                        <View style={{ padding: 12 }}>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: '#2C3E50', textTransform: 'capitalize', marginBottom: 4 }} numberOfLines={1}>
                            {reporte.animal?.tipo_animal || 'Animal'}
                          </Text>
                          
                          {enProceso ? (
                             <Text style={{ fontSize: 13, color: '#34495E', marginBottom: 8, lineHeight: 18 }}>
                               {[reporte.calle, reporte.colonia, reporte.municipio].filter(Boolean).join(', ')}
                             </Text>
                          ) : (
                             <Text style={{ fontSize: 13, color: '#566573', marginBottom: 8 }} numberOfLines={2}>
                               {[reporte.colonia, reporte.municipio].filter(Boolean).join(', ')}
                             </Text>
                          )}

                          <TouchableOpacity onPress={() => { setReporteSeleccionado(reporte); setCurrentPhotoIndex(0); }} style={{ backgroundColor: '#F0F3F4', paddingVertical: 8, borderRadius: 8, alignItems: 'center', marginBottom: 10 }}>
                            <Text style={{ color: '#34495E', fontWeight: '700', fontSize: 13 }}>Ver detalles</Text>
                          </TouchableOpacity>

                          {/* ─── BOTONES DE FLUJO ─── */}
                          {reporte.estado_reporte === 'asignado' || reporte.estado_asignacion_clave === 'notificada' ? (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity onPress={() => { setReporteAccionId(reporte.reporte_id); setShowAcceptModal(true); }} style={{ flex: 1, backgroundColor: '#27AE60', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Aceptar</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => { setReporteAccionId(reporte.reporte_id); setMotivoRechazo(''); setNotasRechazo(''); setShowRejectModal(true); }} style={{ flex: 1, borderWidth: 1, borderColor: '#E74C3C', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: '#E74C3C', fontWeight: '700', fontSize: 13 }}>Rechazar</Text>
                              </TouchableOpacity>
                            </View>
                          ) : ['en_camino', 'en_atencion'].includes(reporte.estado_reporte) ? (
                            <View style={{ gap: 8 }}>
                              <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${reporte.latitud},${reporte.longitud}`)} style={{ backgroundColor: '#3498DB', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>Cómo llegar</Text>
                              </TouchableOpacity>
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity onPress={() => { setReporteAccionId(reporte.reporte_id); setEstadoEncontre(''); setShowEncontreModal(true); }} style={{ flex: 1, backgroundColor: '#F39C12', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>Hito rescate</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => { setReporteAccionId(reporte.reporte_id); setEstadoCierre(''); setShowCerrarModal(true); }} style={{ flex: 1, backgroundColor: '#8E44AD', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>Cerrar caso</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : (
                            <View style={{ backgroundColor: '#EAFAF1', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                              <Text style={{ color: '#27AE60', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' }}>{reporte.estado_reporte}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Formulario de Representantes */}
            <Card>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>
                Agregar representante
              </Text>
              <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>
                Esa persona podrá iniciar sesión registrándose con el mismo teléfono que pongas aquí.
              </Text>
              <Input label="Nombre(s)" placeholder="Ej. Ana" value={nombreRep} onChangeText={setNombreRep} />
              <Input label="Apellido" placeholder="Ej. Pérez" value={apellidoRep} onChangeText={setApellidoRep} />
              <Input label="Teléfono" placeholder="Ej. 2221234567" value={telefonoRep} onChangeText={setTelefonoRep} keyboardType="numeric" maxLength={10} />
              <Input label="Correo (Opcional)" placeholder="Ej. correo@ejemplo.com" value={emailRep} onChangeText={setEmailRep} keyboardType="email-address" autoCapitalize="none" />
              <Button label="Agregar representante" onPress={handleAgregarRepresentante} isLoading={isAdding} />
            </Card>
          </>
        )}
      </ScrollView>

      {/* ─── MODALES DE INTERACCIÓN ─── */}

      {/* Modal Detalles */}
      {reporteSeleccionado && (
        <Modal visible={true} transparent animationType="slide">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: '#FFF', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90%', overflow: 'hidden' }}>
              <ScrollView>
                 <View style={{ padding: 20 }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#2C3E50', textTransform: 'capitalize', marginBottom: 4 }}>
                    {reporteSeleccionado.animal?.tipo_animal || 'Animal'}
                  </Text>
                  <Text style={{ fontSize: 14, color: reporteSeleccionado.animal?.condicion === 'grave' ? '#E74C3C' : '#F39C12', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 16 }}>
                    {reporteSeleccionado.animal?.condicion}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#34495E', marginTop: 8 }}>Descripción del Reporte</Text>
                  <Text style={{ fontSize: 14, color: '#566573', marginTop: 4 }}>{reporteSeleccionado.animal?.descripcion || 'Sin descripción'}</Text>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#34495E', marginTop: 16 }}>Ubicación</Text>
                  <Text style={{ fontSize: 14, color: '#566573', marginTop: 4 }}>{[reporteSeleccionado.calle, reporteSeleccionado.colonia, reporteSeleccionado.municipio].filter(Boolean).join(', ')}</Text>
                </View>
              </ScrollView>
              <View style={{ padding: 16, borderTopWidth: 1, borderColor: '#ECF0F1' }}>
                <TouchableOpacity style={{ backgroundColor: '#3498DB', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }} onPress={() => setReporteSeleccionado(null)}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal Aceptar Reporte */}
      <Modal visible={showAcceptModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>Confirmar Rescate</Text>
              <TouchableOpacity onPress={() => setShowAcceptModal(false)}><Text style={{ fontSize: 20, color: '#95A5A6' }}>✕</Text></TouchableOpacity>
            </View>
            <Text style={{ fontSize: 14, color: '#566573', marginBottom: 20, lineHeight: 20 }}>
              Al aceptar este caso te comprometes a atenderlo. El reportante será notificado de que vas en camino.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#EAEDED' }} onPress={() => setShowAcceptModal(false)} disabled={isSubmittingAccion}>
                <Text style={{ color: '#7F8C8D', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#27AE60' }} onPress={confirmarAceptacion} disabled={isSubmittingAccion}>
                {isSubmittingAccion ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Aceptar Caso</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Rechazar Reporte */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>¿Por qué rechazas este caso?</Text>
              <TouchableOpacity onPress={() => setShowRejectModal(false)}><Text style={{ fontSize: 20, color: '#95A5A6' }}>✕</Text></TouchableOpacity>
            </View>
            {MOTIVOS_RECHAZO.map((motivo) => (
               <TouchableOpacity key={motivo} onPress={() => setMotivoRechazo(motivo)} style={{ padding: 10, borderWidth: 1, borderColor: motivoRechazo === motivo ? '#3498DB' : '#ECF0F1', borderRadius: 8, marginBottom: 8, backgroundColor: motivoRechazo === motivo ? '#EBF5FB' : '#FFF' }}>
                 <Text style={{ fontSize: 13, color: '#2C3E50' }}>{motivo}</Text>
               </TouchableOpacity>
            ))}
            <TextInput style={{ borderWidth: 1, borderColor: '#BDC3C7', borderRadius: 8, padding: 10, fontSize: 13, marginTop: 8, marginBottom: 20, minHeight: 60 }} multiline placeholder="Comentarios adicionales (Opcional)" maxLength={150} value={notasRechazo} onChangeText={setNotasRechazo} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#EAEDED' }} onPress={() => setShowRejectModal(false)} disabled={isSubmittingAccion}>
                <Text style={{ color: '#7F8C8D', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#E74C3C' }} onPress={confirmarRechazo} disabled={isSubmittingAccion}>
                {isSubmittingAccion ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Rechazar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Encontré al Animal */}
      <Modal visible={showEncontreModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>¿Cómo está el animal ahora?</Text>
              <TouchableOpacity onPress={() => setShowEncontreModal(false)}><Text style={{ fontSize: 20, color: '#95A5A6' }}>✕</Text></TouchableOpacity>
            </View>
            {OPCIONES_ENCONTRE.map((opcion) => (
               <TouchableOpacity key={opcion} onPress={() => setEstadoEncontre(opcion)} style={{ padding: 10, borderWidth: 1, borderColor: estadoEncontre === opcion ? '#3498DB' : '#ECF0F1', borderRadius: 8, marginBottom: 8, backgroundColor: estadoEncontre === opcion ? '#EBF5FB' : '#FFF' }}>
                 <Text style={{ fontSize: 13, color: '#2C3E50' }}>{opcion}</Text>
               </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={handlePickFoto} style={{ padding: 12, backgroundColor: '#EAEDED', borderRadius: 8, marginTop: 8, alignItems: 'center' }}>
              <Text style={{ color: '#34495E', fontWeight: '600' }}>{fotoHito ? 'Foto adjuntada ✓' : 'Subir foto (Opcional)'}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#EAEDED' }} onPress={() => setShowEncontreModal(false)}>
                <Text style={{ color: '#7F8C8D', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#F39C12' }} onPress={registrarHitoEncontre} disabled={isSubmittingAccion}>
                {isSubmittingAccion ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Cerrar Caso */}
      <Modal visible={showCerrarModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>¿Cómo concluyó el rescate?</Text>
              <TouchableOpacity onPress={() => setShowCerrarModal(false)}><Text style={{ fontSize: 20, color: '#95A5A6' }}>✕</Text></TouchableOpacity>
            </View>
            {OPCIONES_CIERRE.map((opcion) => (
               <TouchableOpacity key={opcion} onPress={() => setEstadoCierre(opcion)} style={{ padding: 10, borderWidth: 1, borderColor: estadoCierre === opcion ? '#3498DB' : '#ECF0F1', borderRadius: 8, marginBottom: 8, backgroundColor: estadoCierre === opcion ? '#EBF5FB' : '#FFF' }}>
                 <Text style={{ fontSize: 13, color: '#2C3E50' }}>{opcion}</Text>
               </TouchableOpacity>
            ))}
            <TextInput style={{ borderWidth: 1, borderColor: '#BDC3C7', borderRadius: 8, padding: 10, fontSize: 13, marginTop: 8, minHeight: 60 }} multiline placeholder="Comentarios del cierre (Opcional)" value={notasHito} onChangeText={setNotasHito} />
            <TouchableOpacity onPress={handlePickFoto} style={{ padding: 12, backgroundColor: '#EAEDED', borderRadius: 8, marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: '#34495E', fontWeight: '600' }}>{fotoHito ? 'Foto adjuntada ✓' : 'Subir foto (Opcional)'}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#EAEDED' }} onPress={() => setShowCerrarModal(false)}>
                <Text style={{ color: '#7F8C8D', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#8E44AD' }} onPress={registrarCierre} disabled={isSubmittingAccion}>
                {isSubmittingAccion ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Cerrar Caso</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal seleccion de staff */}
      <Modal visible={showStaffModal} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 16 }}>
                ¿Quién atenderá este caso?
              </Text>
              {staffList.map((miembro) => (
                <TouchableOpacity
                  key={miembro.id}
                  onPress={() => miembro.disponible && setStaffSeleccionado(miembro.id)}
                  style={{
                    padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 8,
                    borderColor: staffSeleccionado === miembro.id ? '#27AE60' : '#ECF0F1',
                    backgroundColor: !miembro.disponible ? '#F8F9FA' : staffSeleccionado === miembro.id ? '#EAFAF1' : '#FFF',
                    opacity: miembro.disponible ? 1 : 0.5
                  }}
                >
                  <Text style={{ fontWeight: '600', color: '#2C3E50' }}>
                    {miembro.nombre} {miembro.apellido_paterno}
                  </Text>
                  {!miembro.disponible && (
                    <Text style={{ fontSize: 12, color: '#E74C3C', marginTop: 2 }}>
                      {miembro.motivo_no_disponible}
                    </Text>
                  )}
                  {miembro.disponible && (
                    <Text style={{ fontSize: 12, color: '#27AE60', marginTop: 2 }}>
                      Disponible — {miembro.casos_activos} casos activos
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#EAEDED' }}
                  onPress={() => { setShowStaffModal(false); resetModales(); }}
                >
                  <Text style={{ color: '#7F8C8D', fontWeight: 'bold' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#27AE60' }}
                  onPress={confirmarAsignacionStaff}
                  disabled={isSubmittingAccion}
                >
                  {isSubmittingAccion ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Asignar y confirmar</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

    </View>
  );
}