import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Linking, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Toast, useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

// ─── PALETA DE COLORES PETZEN ───
const COLORS = {
  bg: '#E8CCAD',        // Light Brown (Fondo principal)
  primary: '#EC802B',   // Orange (Botones principales, Casos activos)
  secondary: '#EDC55B', // Yellow (Herido, estados intermedios)
  accent: '#66BCB4',    // Teal (Estable, Ver detalles, acciones secundarias)
  textDark: '#4A3728',  // Texto oscuro para contraste
  textLight: '#8C7A6B', // Texto secundario
  white: '#FFFFFF',
  danger: '#E74C3C',    // Rojo para Grave o Rechazar
  cardBg: '#FAF3EA'     // Un tono ligeramente más claro para las tarjetas
};

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

interface Props {
  onClose?: () => void;
}

export default function AssociationStatusScreen({ onClose }: Props) {
  // ─── TODA LA LÓGICA DE ESTADO SE MANTIENE INTACTA ───
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
  const [showStaffModal, setShowStaffModal] = useState(false);
  
  const [reporteAccionId, setReporteAccionId] = useState<string | null>(null);
  const [isSubmittingAccion, setIsSubmittingAccion] = useState(false);

  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffSeleccionado, setStaffSeleccionado] = useState<string | null>(null);
  const [esStaff, setEsStaff] = useState(false);

  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [notasRechazo, setNotasRechazo] = useState('');
  const [estadoEncontre, setEstadoEncontre] = useState('');
  const [estadoCierre, setEstadoCierre] = useState('');
  const [notasHito, setNotasHito] = useState('');
  const [fotoHito, setFotoHito] = useState<string | null>(null);

  const [apelacionTexto, setApelacionTexto] = useState('');
  const [apelacionDocs, setApelacionDocs] = useState<any[]>([]);
  const [isApelando, setIsApelando] = useState(false);
  const [apelacionEnviada, setApelacionEnviada] = useState(false);

  const screenWidth = Dimensions.get('window').width;

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

  // ─── FUNCIONES API INTACTAS ───
  const cargarEstado = async () => {
    setIsLoadingInfo(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me`, { headers: { Authorization: `Bearer ${token}` } });
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
      setNuevosReportes(data.length);
    }
  };

  const cargarReportes = async () => {
    setIsLoadingReportes(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/reportes`, { headers: { Authorization: `Bearer ${token}` } });
      setReportes(res.data);
      calcularNuevosReportes(res.data);
    } catch {
    } finally {
      setIsLoadingReportes(false);
    }
  };

  const verificarApelacion = async () => {
    try {
      const res = await axios.get(`${API_URL}/associations/me/apelacion`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data && res.data.tiene_apelacion && res.data.estado === 'pendiente') {
        setApelacionEnviada(true);
      } else {
        setApelacionEnviada(false);
      }
    } catch (error) {}
  };

  useEffect(() => {
    if (!isLoading) cargarEstado();
  }, [isLoading]);

  useEffect(() => {
    if (info?.estado === 'aprobada') {
      cargarReportes();
    } else if (info?.estado === 'rechazada') {
      verificarApelacion();
    }
  }, [info]);

  const handlePickDocument = async () => {
    if (apelacionDocs.length >= 3) {
      showToast({ type: 'warning', title: 'Límite alcanzado', message: 'Solo puedes adjuntar hasta 3 archivos.' });
      return;
    }
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,image/*';
      input.onchange = (e: any) => {
        const file = e.target.files[0];
        if (file) {
          setApelacionDocs(prev => [...prev, {
            uri: URL.createObjectURL(file), name: file.name, mimeType: file.type, file: file
          }]);
        }
      };
      input.click();
    } else {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
        if (!result.canceled && result.assets) setApelacionDocs(prev => [...prev, result.assets[0]]);
      } catch (err) { }
    }
  };

  const removeDoc = (index: number) => setApelacionDocs(prev => prev.filter((_, i) => i !== index));

  const enviarApelacion = async () => {
    if (!apelacionTexto.trim()) {
      showToast({ type: 'warning', title: 'Faltan datos', message: 'Escribe un mensaje para tu apelación.' });
      return;
    }
    setIsApelando(true);
    try {
      const formData = new FormData();
      formData.append('mensaje', apelacionTexto.trim());

      if (Platform.OS === 'web') {
          for (const doc of apelacionDocs) {
            if (doc.file) {
              formData.append('documentos', doc.file, doc.name);
            } else {
              const res = await fetch(doc.uri);
              const blob = await res.blob();
              formData.append('documentos', blob, doc.name || 'documento');
            }
          }
        } else {
          apelacionDocs.forEach((doc, index) => {
            formData.append('documentos', {
              uri: doc.uri, name: doc.name || `documento_${index}`, type: doc.mimeType || 'application/octet-stream'
            } as any);
          });
        }

      await axios.post(`${API_URL}/associations/me/apelar`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      setApelacionEnviada(true);
      showToast({ type: 'success', title: 'Apelación enviada', message: 'Tus documentos están en revisión.' });
    } catch (error: any) {
       showToast({ type: 'error', title: 'Error', message: 'No pudimos enviar la apelación.' });
    } finally {
      setIsApelando(false);
    }
  };

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
          nombre: nombreRep.trim(), apellido_paterno: apellidoRep.trim(), telefono: telefonoRep.replace(/\s|-/g, ''),
          email: emailRep.trim() || undefined, es_staff: esStaff,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast({ type: 'success', title: '¡Listo!', message: 'Persona agregada correctamente.' });
      setNombreRep(''); setApellidoRep(''); setTelefonoRep(''); setEmailRep(''); setEsStaff(false);
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

  const confirmarAceptacion = async () => {
    if (!reporteAccionId) return;
    setIsSubmittingAccion(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/staff`, { headers: { Authorization: `Bearer ${token}` } });
      setStaffList(res.data);
      setShowAcceptModal(false);
      setShowStaffModal(true);
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
      await axios.post(`${API_URL}/reports/${reporteAccionId}/asignar-staff`, { staff_id: staffSeleccionado }, { headers: { Authorization: `Bearer ${token}` } });
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
      await axios.post(`${API_URL}/reports/${reporteAccionId}/hitos`, { tipo_hito: "encontre_animal", condicion_observada: estadoEncontre, comentario: notasHito.trim() || null }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
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

  // ─── FUNCIONES DE APOYO VISUAL PETZEN ───
  const getBadgeColor = (condicion: string | null) => {
    switch(condicion?.toLowerCase()) {
      case 'grave': return COLORS.danger;
      case 'herido': return COLORS.secondary;
      case 'estable': return COLORS.accent;
      default: return COLORS.textLight;
    }
  };

  if (isLoadingInfo) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!info) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, padding: 24 }}>
        <Text style={{ fontSize: 14, color: COLORS.textLight, textAlign: 'center' }}>No pudimos cargar la información de tu asociación.</Text>
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
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Toast toast={toast} translateY={translateY} />

      {/* CONTENEDOR RESPONSIVO (Centro flotante en Web, pantalla completa en móvil) */}
      <View style={{ flex: 1, width: '100%', maxWidth: 1000, alignSelf: 'center' }}>
        
        {/* HEADER PETZEN */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: Platform.OS === 'web' ? 24 : 60 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
              <Text style={{ color: COLORS.white, fontWeight: 'bold', fontSize: 20 }}>
                {info?.nombre?.substring(0, 2).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={{ color: COLORS.textLight, fontSize: 14, fontWeight: '500' }}>Hola de nuevo,</Text>
              <Text style={{ color: COLORS.textDark, fontSize: 22, fontWeight: 'bold' }}>{info?.nombre}</Text>
            </View>
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={{ backgroundColor: 'rgba(74, 55, 40, 0.1)', padding: 10, borderRadius: 20 }}>
              <Ionicons name="close" size={24} color={COLORS.textDark} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

          {/* ─── ESTADOS PENDIENTE Y RECHAZADA ─── */}
          {info.estado === 'pendiente' && (
            <View style={{ backgroundColor: COLORS.cardBg, padding: 24, borderRadius: 24, elevation: 2 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: COLORS.secondary, marginBottom: 8 }}>En revisión</Text>
              <Text style={{ fontSize: 14, color: COLORS.textLight, lineHeight: 22 }}>Tu asociación está siendo revisada por nuestro equipo. Te avisaremos en cuanto sea aprobada.</Text>
            </View>
          )}

          {info.estado === 'rechazada' && (
            <>
              <View style={{ backgroundColor: COLORS.cardBg, padding: 24, borderRadius: 24, elevation: 2, marginBottom: 24, borderLeftWidth: 6, borderLeftColor: COLORS.danger }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: COLORS.danger, marginBottom: 8 }}>Solicitud rechazada</Text>
                <Text style={{ fontSize: 14, color: COLORS.textDark, lineHeight: 22 }}>Motivo: {info.motivo_rechazo || 'No se especificó motivo.'}</Text>
              </View>

              {!apelacionEnviada ? (
                <>
                  <View style={{ backgroundColor: COLORS.white, padding: 20, borderRadius: 20, marginBottom: 20 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 12 }}>Requisitos para aprobación</Text>
                    <Text style={{ color: COLORS.textLight, marginBottom: 4 }}>• Acta constitutiva o registro formal</Text>
                    <Text style={{ color: COLORS.textLight, marginBottom: 4 }}>• Redes sociales activas con evidencia</Text>
                    <Text style={{ color: COLORS.textLight, marginBottom: 4 }}>• Fotos del refugio o instalaciones</Text>
                    <Text style={{ color: COLORS.textLight }}>• RFC o registro ante autoridad</Text>
                  </View>

                  <View style={{ backgroundColor: COLORS.cardBg, padding: 24, borderRadius: 24, elevation: 2 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 12 }}>Enviar Apelación</Text>
                    <TextInput
                      style={{ backgroundColor: COLORS.white, borderRadius: 16, padding: 16, fontSize: 14, color: COLORS.textDark, minHeight: 120, textAlignVertical: 'top', borderWidth: 1, borderColor: '#F0E6D2' }}
                      multiline maxLength={300} placeholder="Explica por qué deberíamos reconsiderar tu solicitud..."
                      value={apelacionTexto} onChangeText={setApelacionTexto}
                    />
                    <Text style={{ textAlign: 'right', fontSize: 12, color: COLORS.textLight, marginTop: 4, marginBottom: 16 }}>{apelacionTexto.length}/300</Text>

                    <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textDark, marginBottom: 8 }}>Documentos de soporte (Máx. 3)</Text>
                    {apelacionDocs.map((doc, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.white, padding: 12, borderRadius: 12, marginBottom: 8 }}>
                        <Text style={{ fontSize: 13, color: COLORS.textDark, flex: 1 }} numberOfLines={1}>{doc.name}</Text>
                        <TouchableOpacity onPress={() => removeDoc(idx)}><Text style={{ color: COLORS.danger, fontWeight: 'bold', marginLeft: 10 }}>✕</Text></TouchableOpacity>
                      </View>
                    ))}
                    {apelacionDocs.length < 3 && (
                      <TouchableOpacity onPress={handlePickDocument} style={{ padding: 14, backgroundColor: 'rgba(102, 188, 180, 0.15)', borderRadius: 12, alignItems: 'center', marginBottom: 20 }}>
                        <Text style={{ color: COLORS.accent, fontWeight: '700' }}>+ Adjuntar PDF o Imagen</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={{ backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 20, alignItems: 'center', opacity: isApelando ? 0.7 : 1 }} onPress={enviarApelacion} disabled={isApelando}>
                      {isApelando ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: 'bold', fontSize: 16 }}>Enviar apelación</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={{ backgroundColor: 'rgba(102, 188, 180, 0.15)', padding: 24, borderRadius: 24, alignItems: 'center' }}>
                  <Ionicons name="checkmark-circle" size={40} color={COLORS.accent} style={{ marginBottom: 10 }} />
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: COLORS.accent, marginBottom: 8 }}>Apelación enviada</Text>
                  <Text style={{ fontSize: 14, color: COLORS.textDark, textAlign: 'center', lineHeight: 22 }}>Tu apelación está en revisión. Te notificaremos por correo cuando haya una respuesta.</Text>
                </View>
              )}
            </>
          )}

          {/* ─── ASOCIACIÓN APROBADA ─── */}
          {info.estado === 'aprobada' && (
            <>
              {/* Tarjetas de Estadísticas tipo María López */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
                <View style={{ flex: 1, backgroundColor: COLORS.primary, borderRadius: 24, padding: 20, alignItems: 'center', elevation: 4 }}>
                  <Ionicons name="pulse" size={24} color={COLORS.white} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 32, fontWeight: '900', color: COLORS.white }}>{reportes.length}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.white, fontWeight: '500' }}>Casos activos</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: COLORS.cardBg, borderRadius: 24, padding: 20, alignItems: 'center', elevation: 2 }}>
                  <Ionicons name="navigate" size={24} color={COLORS.accent} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textDark }}>{reportes.filter(r => r.estado_reporte === 'en_camino').length}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '500' }}>En camino</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: COLORS.cardBg, borderRadius: 24, padding: 20, alignItems: 'center', elevation: 2 }}>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.secondary} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textDark }}>{reportes.filter(r => r.estado_reporte === 'cerrado').length}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '500' }}>Cerrados</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 22, fontWeight: 'bold', color: COLORS.textDark }}>Reportes asignados</Text>
                {nuevosReportes > 0 && (
                  <View style={{ backgroundColor: COLORS.danger, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '800' }}>{nuevosReportes}</Text>
                  </View>
                )}
              </View>

              {/* Filtros estilo Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['pendientes', 'aceptadas', 'rechazadas', 'todas'] as FiltroAsignacion[]).map((f) => (
                    <TouchableOpacity 
                      key={f} onPress={() => setFiltro(f)}
                      style={{ 
                        paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, 
                        backgroundColor: filtro === f ? COLORS.primary : COLORS.cardBg,
                        borderWidth: filtro === f ? 0 : 1, borderColor: 'rgba(0,0,0,0.05)'
                      }}
                    >
                      <Text style={{ color: filtro === f ? COLORS.white : COLORS.textDark, fontWeight: '700', textTransform: 'capitalize' }}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Grid de Reportes */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' }}>
                {reportesFiltrados.map((reporte) => {
                  const enProceso = ['en_camino', 'en_atencion'].includes(reporte.estado_reporte);
                  return (
                    <View key={reporte.asignacion_id} style={{ 
                      width: screenWidth > 768 ? '48%' : '100%', 
                      backgroundColor: COLORS.cardBg, borderRadius: 24, overflow: 'hidden', elevation: 3, marginBottom: 8
                    }}>
                      <View style={{ position: 'relative' }}>
                        <Image source={{ uri: reporte.foto_url || 'https://via.placeholder.com/400' }} style={{ width: '100%', height: 160 }} resizeMode="cover" />
                        {/* Badge de Condición estilo María López */}
                        <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: getBadgeColor(reporte.animal?.condicion || ''), paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16 }}>
                          <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 12, textTransform: 'capitalize' }}>{reporte.animal?.condicion || 'Desconocido'}</Text>
                        </View>
                        {/* Cinta de estado si está en proceso */}
                        {enProceso && (
                          <View style={{ position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(102, 188, 180, 0.9)', paddingVertical: 8, paddingHorizontal: 16 }}>
                            <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '600' }}><Ionicons name="car" size={12}/> Rescatista en camino</Text>
                          </View>
                        )}
                      </View>

                      <View style={{ padding: 20 }}>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark, textTransform: 'capitalize' }}>{reporte.animal?.tipo_animal || 'Animal'}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                          <Ionicons name="location-outline" size={16} color={COLORS.primary} />
                          <Text style={{ color: COLORS.textLight, fontSize: 13, marginLeft: 4 }} numberOfLines={1}>
                            {[reporte.colonia, reporte.municipio].filter(Boolean).join(', ')}
                          </Text>
                        </View>
                        <Text style={{ color: COLORS.textLight, fontSize: 12, marginTop: 4, marginLeft: 2 }}>hace 1 h</Text>

                        {/* Botones estilo PetZen */}
                        <View style={{ marginTop: 20 }}>
                          {reporte.estado_reporte === 'asignado' || reporte.estado_asignacion_clave === 'notificada' ? (
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                              <TouchableOpacity onPress={() => { setReporteAccionId(reporte.reporte_id); setShowAcceptModal(true); }} style={{ flex: 1, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 16, alignItems: 'center' }}>
                                <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Aceptar</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => { setReporteAccionId(reporte.reporte_id); resetModales(); setShowRejectModal(true); }} style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.danger, paddingVertical: 14, borderRadius: 16, alignItems: 'center' }}>
                                <Text style={{ color: COLORS.danger, fontWeight: 'bold' }}>Rechazar</Text>
                              </TouchableOpacity>
                            </View>
                          ) : enProceso ? (
                            <View style={{ gap: 10 }}>
                              <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=$${reporte.latitud},${reporte.longitud}`)} style={{ backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
                                <Ionicons name="map" size={16} color={COLORS.white} style={{ marginRight: 6 }}/>
                                <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Cómo llegar</Text>
                              </TouchableOpacity>
                              <View style={{ flexDirection: 'row', gap: 10 }}>
                                <TouchableOpacity onPress={() => { setReporteAccionId(reporte.reporte_id); resetModales(); setShowEncontreModal(true); }} style={{ flex: 1, backgroundColor: COLORS.secondary, paddingVertical: 12, borderRadius: 14, alignItems: 'center' }}>
                                  <Text style={{ color: COLORS.textDark, fontWeight: 'bold' }}>Hito rescate</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => { setReporteAccionId(reporte.reporte_id); resetModales(); setShowCerrarModal(true); }} style={{ flex: 1, backgroundColor: COLORS.accent, paddingVertical: 12, borderRadius: 14, alignItems: 'center' }}>
                                  <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Cerrar caso</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : (
                            <TouchableOpacity onPress={() => setReporteSeleccionado(reporte)} style={{ backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
                              <Ionicons name="eye" size={16} color={COLORS.white} style={{ marginRight: 6 }}/>
                              <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Ver detalle</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* FORMULARIO DE REPRESENTANTES RESTAURADO A SU LÓGICA ORIGINAL + ESTILO PETZEN */}
              <View style={{ backgroundColor: COLORS.cardBg, padding: 28, borderRadius: 32, marginTop: 32, elevation: 4 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textDark, marginBottom: 6 }}>Agregar miembro</Text>
                <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 20 }}>Esta persona podrá iniciar sesión con el mismo teléfono que registres.</Text>
                
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 10 }}>Tipo de miembro</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                  <TouchableOpacity onPress={() => setEsStaff(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: !esStaff ? COLORS.accent : 'transparent', borderWidth: !esStaff ? 0 : 1, borderColor: '#D1D5DB' }}>
                    <Text style={{ color: !esStaff ? COLORS.white : COLORS.textLight, fontWeight: '700' }}>Representante</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEsStaff(true)} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: esStaff ? COLORS.secondary : 'transparent', borderWidth: esStaff ? 0 : 1, borderColor: '#D1D5DB' }}>
                    <Text style={{ color: esStaff ? COLORS.textDark : COLORS.textLight, fontWeight: '700' }}>Staff</Text>
                  </TouchableOpacity>
                </View>

                {/* LOS 4 INPUTS ORIGINALES EXACTOS */}
                <Input label="Nombre(s)" placeholder="Ej. Ana" value={nombreRep} onChangeText={setNombreRep} />
                <Input label="Apellido" placeholder="Ej. Pérez" value={apellidoRep} onChangeText={setApellidoRep} />
                <Input label="Teléfono" placeholder="Ej. 2221234567" value={telefonoRep} onChangeText={setTelefonoRep} keyboardType="numeric" maxLength={10} />
                <Input label="Correo (Opcional)" placeholder="Ej. correo@ejemplo.com" value={emailRep} onChangeText={setEmailRep} keyboardType="email-address" autoCapitalize="none" />
                
                <View style={{ marginTop: 10 }}>
                   <Button label={esStaff ? "Agregar staff" : "Agregar representante"} onPress={handleAgregarRepresentante} isLoading={isAdding} />
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </View>

      {/* ─── MODALES DE INTERACCIÓN ESTILO PETZEN ─── */}
      {/* Modal Detalles */}
      {reporteSeleccionado && (
        <Modal visible={true} transparent animationType="slide">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 32, width: '100%', maxWidth: 500, maxHeight: '90%' }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: 28, fontWeight: '900', color: COLORS.textDark, textTransform: 'capitalize', marginBottom: 4 }}>{reporteSeleccionado.animal?.tipo_animal}</Text>
                <Text style={{ fontSize: 16, color: getBadgeColor(reporteSeleccionado.animal?.condicion || ''), fontWeight: '800', textTransform: 'uppercase', marginBottom: 24 }}>{reporteSeleccionado.animal?.condicion}</Text>
                
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginBottom: 8 }}>Descripción</Text>
                <Text style={{ fontSize: 15, color: COLORS.textLight, marginBottom: 24, lineHeight: 22 }}>{reporteSeleccionado.animal?.descripcion || 'Sin descripción detallada.'}</Text>
                
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginBottom: 8 }}>Ubicación</Text>
                <Text style={{ fontSize: 15, color: COLORS.textLight, lineHeight: 22 }}>{[reporteSeleccionado.calle, reporteSeleccionado.colonia, reporteSeleccionado.municipio].filter(Boolean).join(', ')}</Text>
              </ScrollView>
              <TouchableOpacity onPress={() => setReporteSeleccionado(null)} style={{ backgroundColor: COLORS.accent, paddingVertical: 16, borderRadius: 20, alignItems: 'center', marginTop: 24 }}>
                <Text style={{ color: COLORS.white, fontWeight: 'bold', fontSize: 16 }}>Cerrar detalles</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal Aceptar */}
      <Modal visible={showAcceptModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 32, width: '100%', maxWidth: 400 }}>
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(236, 128, 43, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                <Ionicons name="paw" size={40} color={COLORS.primary} />
              </View>
              <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textDark, textAlign: 'center' }}>Confirmar Rescate</Text>
            </View>
            <Text style={{ fontSize: 15, color: COLORS.textLight, textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>Al aceptar este caso te comprometes a atenderlo. El reportante será notificado de que vas en camino.</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => setShowAcceptModal(false)} style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: '#E5E7EB' }}>
                <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmarAceptacion} style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: COLORS.primary }}>
                {isSubmittingAccion ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Aceptar Caso</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Rechazar */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 32, width: '100%', maxWidth: 450 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textDark, marginBottom: 20 }}>¿Por qué rechazas este caso?</Text>
            {MOTIVOS_RECHAZO.map((motivo) => (
               <TouchableOpacity key={motivo} onPress={() => setMotivoRechazo(motivo)} style={{ padding: 16, borderWidth: 2, borderColor: motivoRechazo === motivo ? COLORS.danger : 'transparent', borderRadius: 16, marginBottom: 10, backgroundColor: motivoRechazo === motivo ? 'rgba(231, 76, 60, 0.05)' : COLORS.white }}>
                 <Text style={{ fontSize: 14, color: COLORS.textDark, fontWeight: motivoRechazo === motivo ? '700' : '500' }}>{motivo}</Text>
               </TouchableOpacity>
            ))}
            <TextInput style={{ backgroundColor: COLORS.white, borderRadius: 16, padding: 16, fontSize: 14, marginTop: 12, marginBottom: 24, minHeight: 80, textAlignVertical: 'top' }} multiline placeholder="Comentarios adicionales (Opcional)" maxLength={150} value={notasRechazo} onChangeText={setNotasRechazo} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => setShowRejectModal(false)} style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: '#E5E7EB' }}>
                <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmarRechazo} style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: COLORS.danger }}>
                {isSubmittingAccion ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Rechazar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Encontré al Animal / Cerrar Caso */}
      <Modal visible={showEncontreModal || showCerrarModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 32, width: '100%', maxWidth: 450 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textDark, marginBottom: 20 }}>
              {showEncontreModal ? '¿Cómo está el animal ahora?' : '¿Cómo concluyó el rescate?'}
            </Text>
            {(showEncontreModal ? OPCIONES_ENCONTRE : OPCIONES_CIERRE).map((opcion) => {
              const seleccionado = showEncontreModal ? estadoEncontre === opcion : estadoCierre === opcion;
              return (
               <TouchableOpacity key={opcion} onPress={() => showEncontreModal ? setEstadoEncontre(opcion) : setEstadoCierre(opcion)} style={{ padding: 16, borderWidth: 2, borderColor: seleccionado ? COLORS.accent : 'transparent', borderRadius: 16, marginBottom: 10, backgroundColor: seleccionado ? 'rgba(102, 188, 180, 0.1)' : COLORS.white }}>
                 <Text style={{ fontSize: 14, color: COLORS.textDark, fontWeight: seleccionado ? '700' : '500' }}>{opcion}</Text>
               </TouchableOpacity>
              )
            })}
            <TextInput style={{ backgroundColor: COLORS.white, borderRadius: 16, padding: 16, fontSize: 14, marginTop: 12, minHeight: 80, textAlignVertical: 'top' }} multiline placeholder="Comentarios (Opcional)" value={notasHito} onChangeText={setNotasHito} />
            <TouchableOpacity onPress={handlePickFoto} style={{ padding: 16, backgroundColor: COLORS.white, borderRadius: 16, marginTop: 12, alignItems: 'center', borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed' }}>
              <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}><Ionicons name="camera" size={16}/> {fotoHito ? 'Foto adjuntada ✓' : 'Subir foto (Opcional)'}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
              <TouchableOpacity onPress={() => showEncontreModal ? setShowEncontreModal(false) : setShowCerrarModal(false)} style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: '#E5E7EB' }}>
                <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={showEncontreModal ? registrarHitoEncontre : registrarCierre} style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: COLORS.accent }}>
                {isSubmittingAccion ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Staff */}
      <Modal visible={showStaffModal} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 32, width: '100%', maxWidth: 450 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textDark, marginBottom: 20 }}>¿Quién atenderá este caso?</Text>
              <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
                {staffList.map((miembro) => (
                  <TouchableOpacity
                    key={miembro.id}
                    onPress={() => miembro.disponible && setStaffSeleccionado(miembro.id)}
                    style={{
                      padding: 16, borderWidth: 2, borderRadius: 16, marginBottom: 12,
                      borderColor: staffSeleccionado === miembro.id ? COLORS.primary : 'transparent',
                      backgroundColor: !miembro.disponible ? '#F3F4F6' : staffSeleccionado === miembro.id ? 'rgba(236, 128, 43, 0.1)' : COLORS.white,
                      opacity: miembro.disponible ? 1 : 0.6
                    }}
                  >
                    <Text style={{ fontWeight: '700', fontSize: 16, color: COLORS.textDark }}>{miembro.nombre} {miembro.apellido_paterno}</Text>
                    {!miembro.disponible && <Text style={{ fontSize: 13, color: COLORS.danger, marginTop: 4 }}>{miembro.motivo_no_disponible}</Text>}
                    {miembro.disponible && <Text style={{ fontSize: 13, color: COLORS.accent, marginTop: 4 }}>Disponible — {miembro.casos_activos} casos activos</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: '#E5E7EB' }} onPress={() => { setShowStaffModal(false); resetModales(); }}>
                  <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: COLORS.primary }} onPress={confirmarAsignacionStaff} disabled={isSubmittingAccion}>
                  {isSubmittingAccion ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Asignar Staff</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

    </View>
  );
}