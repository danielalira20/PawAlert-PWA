import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { ActivityIndicator, Dimensions, Image, Linking, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Toast, useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { useWindowDimensions } from 'react-native';
import { PostulacionesPanel } from '../components/association-dashboard/PostulacionesPanel';
import { Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { Animal, getAnimales, totalAnimales, animalMasGrave } from '../types/reporte';
import { AnimalCarousel } from '../components/common/AnimalCarousel';

// ─── PALETA DE COLORES PETZEN ───
const COLORS = {
  bg: '#E8CCAD',
  primary: '#EC802B',
  secondary: '#EDC55B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  cardBg: '#FAF3EA'
};

const SHADOW_SM = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 2,
};
const SHADOW_MD = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
  elevation: 4,
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
  confirmacion_voluntario?: string | null;
  ultimo_rechazo?: { nombre_voluntario: string; creado_at: string } | null;
  municipio: string | null;
  colonia: string | null;
  calle: string | null;
  latitud?: number;
  longitud?: number;
  created_at: string;
  foto_url: string | null;
  fotos_urls: string[];
  animales: Animal[];
}

type FiltroAsignacion = 'todas' | 'pendientes' | 'aceptadas' | 'rechazadas';
type ActiveTab = 'reportes' | 'postulaciones' | 'voluntarios';

type TabAsignacion = 'staff' | 'voluntarios';
type EstadoVoluntarios = 'cargando' | 'candidatos' | 'esperando_confirmacion' | 'confirmado' | 'rechazado_mostrando_siguiente' | 'sin_candidatos';

interface ScoreCandidato {
  total: number;
  proximidad: number;
  compatibilidad: number;
  disponibilidad: number;
  carga: number;
}

interface Candidato {
  voluntario_id: string;
  nombre: string;
  tipo: string;
  etiqueta?: string;
  distancia_km: number;
  foto_url?: string | null;
  score: ScoreCandidato;
}

interface VoluntarioAsociacion {
  voluntario_id: string;
  estado: 'activo_nivel_1' | 'activo_nivel_2' | 'dado_de_baja';
  nombre: string | null;
  apellido_paterno: string | null;
  telefono: string | null;
  email: string | null;
  especies: string[];
  tamanios: string[];
  ofrece_casa_hogar: boolean;
}
type FiltroVoluntarios = 'activos' | 'dados_de_baja';

interface Props {
  onClose?: () => void;
  standalone?: boolean;
}

export default function AssociationStatusScreen({ onClose, standalone = true }: Props) {
  const { token, logout, isLoading } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const [info, setInfo] = useState<AsociacionInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);

  const [nombreRep, setNombreRep] = useState('');
  const [apellidoRep, setApellidoRep] = useState('');
  const [telefonoRep, setTelefonoRep] = useState('');
  const [emailRep, setEmailRep] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [esStaff, setEsStaff] = useState(false);

  // 1. Agregar estado para los errores del formulario
  const [errorsRep, setErrorsRep] = useState<Record<string, string>>({});

  const [reportes, setReportes] = useState<ReporteAsignado[]>([]);
  const [isLoadingReportes, setIsLoadingReportes] = useState(false);
  const [filtro, setFiltro] = useState<FiltroAsignacion>('pendientes');
  const [nuevosReportes, setNuevosReportes] = useState(0);

  const [reporteSeleccionado, setReporteSeleccionado] = useState<ReporteAsignado | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showFullImage, setShowFullImage] = useState(false);

  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showEncontreModal, setShowEncontreModal] = useState(false);
  const [showCerrarModal, setShowCerrarModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);

  const [reporteAccionId, setReporteAccionId] = useState<string | null>(null);
  const [isSubmittingAccion, setIsSubmittingAccion] = useState(false);

  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffSeleccionado, setStaffSeleccionado] = useState<string | null>(null);

  // ── Pestaña Voluntarios ──
  const [tabAsignacion, setTabAsignacion] = useState<TabAsignacion>('staff');
  const [candidatosList, setCandidatosList] = useState<Candidato[]>([]);
  const [modoAsignacion, setModoAsignacion] = useState<string>('manual');
  const [timeoutMin, setTimeoutMin] = useState<number>(10);
  const [estadoVoluntarios, setEstadoVoluntarios] = useState<EstadoVoluntarios>('cargando');
  const [voluntarioEsperando, setVoluntarioEsperando] = useState<{ id: string; nombre: string } | null>(null);
  const [showConfirmVoluntarioModal, setShowConfirmVoluntarioModal] = useState(false);
  const [candidatoAConfirmar, setCandidatoAConfirmar] = useState<Candidato | null>(null);
  const [pollingRef, setPollingRef] = useState<ReturnType<typeof setInterval> | null>(null);

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
  const [activeTab, setActiveTab] = useState<ActiveTab>('reportes');

  // ── Configuración de Asignación ──
  const [modoAsignacionConfig, setModoAsignacionConfig] = useState<'manual' | 'semi_automatico' | 'automatico'>('manual');
  const [timeoutGrave, setTimeoutGrave] = useState('10');
  const [timeoutHerido, setTimeoutHerido] = useState('30');
  const [timeoutEstable, setTimeoutEstable] = useState('60');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // ── Pestaña "Mis voluntarios" ──
  const [voluntarios, setVoluntarios] = useState<VoluntarioAsociacion[]>([]);
  const [isLoadingVoluntarios, setIsLoadingVoluntarios] = useState(false);
  const [filtroVoluntarios, setFiltroVoluntarios] = useState<FiltroVoluntarios>('activos');
  const [voluntarioAccion, setVoluntarioAccion] = useState<VoluntarioAsociacion | null>(null);
  const [showBajaModal, setShowBajaModal] = useState(false);
  const [showReactivarModal, setShowReactivarModal] = useState(false);
  const [isSubmittingVoluntario, setIsSubmittingVoluntario] = useState(false);

  ///subfiltros de aceptados
  const [subFiltroAceptadas, setSubFiltroAceptadas] = useState<'todas' | 'en_proceso' | 'por_cerrar' | 'completados'>('todas');


  const { width: screenWidth } = useWindowDimensions();

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


  // 2. Funciones de validación en tiempo real para el formulario de miembro
  const handleNombreRepChange = (val: string) => {
    setNombreRep(val);
    if (!val.trim()) setErrorsRep(prev => ({ ...prev, nombreRep: 'El nombre es obligatorio.' }));
    else if (/\d/.test(val)) setErrorsRep(prev => ({ ...prev, nombreRep: 'El nombre no debe contener números.' }));
    else setErrorsRep(prev => ({ ...prev, nombreRep: '' }));
  };

  const handleApellidoRepChange = (val: string) => {
    setApellidoRep(val);
    if (!val.trim()) setErrorsRep(prev => ({ ...prev, apellidoRep: 'El apellido es obligatorio.' }));
    else if (/\d/.test(val)) setErrorsRep(prev => ({ ...prev, apellidoRep: 'El apellido no debe contener números.' }));
    else setErrorsRep(prev => ({ ...prev, apellidoRep: '' }));
  };

  const handleTelefonoRepChange = (val: string) => {
    setTelefonoRep(val);
    if (!val.trim()) {
      setErrorsRep(prev => ({ ...prev, telefonoRep: 'El teléfono es obligatorio.' }));
    } else if (/[a-zA-Z]/.test(val)) {
      setErrorsRep(prev => ({ ...prev, telefonoRep: 'El teléfono no puede contener letras.' }));
    } else if (!/^\d{10}$/.test(val.trim())) {
      setErrorsRep(prev => ({ ...prev, telefonoRep: 'Debe tener 10 dígitos numéricos.' }));
    } else {
      setErrorsRep(prev => ({ ...prev, telefonoRep: '' }));
    }
  };

  const handleEmailRepChange = (val: string) => {
    setEmailRep(val);
    if (val.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      setErrorsRep(prev => ({ ...prev, emailRep: 'Ingresa un correo válido.' }));
    } else {
      setErrorsRep(prev => ({ ...prev, emailRep: '' }));
    }
  };


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

  const [sobreAbierto, setSobreAbierto] = useState(false);
  const notaAnim = useState(new Animated.Value(0))[0];

  const abrirSobre = () => {
    setSobreAbierto(true);
    Animated.spring(notaAnim, {
      toValue: 1,
      friction: 7,
      tension: 50,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
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
    } catch (error) { }
  };

  const cargarConfiguracionAsignacion = async () => {
    setIsLoadingConfig(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/config-asignacion`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data) {
        setModoAsignacionConfig(res.data.modo_asignacion || 'manual');
        setTimeoutGrave(String(res.data.timeout_grave || 10));
        setTimeoutHerido(String(res.data.timeout_herido || 30));
        setTimeoutEstable(String(res.data.timeout_estable || 60));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const guardarConfiguracionAsignacion = async () => {
    const g = parseInt(timeoutGrave, 10);
    const h = parseInt(timeoutHerido, 10);
    const e = parseInt(timeoutEstable, 10);

    if (modoAsignacionConfig !== 'manual') {
      if (isNaN(g) || g < 1 || g > 240 || isNaN(h) || h < 1 || h > 240 || isNaN(e) || e < 1 || e > 240) {
        showToast({ type: 'warning', title: 'Valores inválidos', message: 'Los tiempos deben estar entre 1 y 240 minutos.' });
        return;
      }
    }

    setIsSavingConfig(true);
    try {
      await axios.patch(`${API_URL}/associations/me/config-asignacion`, {
        modo_asignacion: modoAsignacionConfig,
        timeout_grave: g,
        timeout_herido: h,
        timeout_estable: e
      }, { headers: { Authorization: `Bearer ${token}` } });
      showToast({ type: 'success', title: '¡Listo!', message: 'Configuración guardada.' });
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos guardar la configuración.' });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const cargarVoluntarios = async () => {
  setIsLoadingVoluntarios(true);
  try {
    const res = await axios.get(`${API_URL}/associations/me/voluntarios`, { headers: { Authorization: `Bearer ${token}` } });
    setVoluntarios(res.data || []);
  } catch (error: any) {
    showToast({ type: 'error', title: 'Error', message: 'No pudimos cargar tus voluntarios.' });
  } finally {
    setIsLoadingVoluntarios(false);
  }
};

const confirmarDarDeBaja = async () => {
  if (!voluntarioAccion) return;
  setIsSubmittingVoluntario(true);
  try {
    await axios.patch(
      `${API_URL}/associations/me/voluntarios/${voluntarioAccion.voluntario_id}/baja`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    showToast({ type: 'success', title: 'Voluntario dado de baja', message: 'Sus casos activos volvieron al pool de asignación.' });
    await cargarVoluntarios();
  } catch (error: any) {
    showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos dar de baja al voluntario.' });
  } finally {
    setShowBajaModal(false);
    setVoluntarioAccion(null);
    setIsSubmittingVoluntario(false);
  }
};

const confirmarReactivar = async () => {
  if (!voluntarioAccion) return;
  setIsSubmittingVoluntario(true);
  try {
    await axios.patch(
      `${API_URL}/associations/me/voluntarios/${voluntarioAccion.voluntario_id}/reactivar`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    showToast({ type: 'success', title: 'Voluntario reactivado', message: 'Ya vuelve a aparecer en el ranking de candidatos.' });
    await cargarVoluntarios();
  } catch (error: any) {
    showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos reactivar al voluntario.' });
  } finally {
    setShowReactivarModal(false);
    setVoluntarioAccion(null);
    setIsSubmittingVoluntario(false);
  }
};

  useEffect(() => {
    if (!isLoading) cargarEstado();
  }, [isLoading]);

  useEffect(() => {
    if (info?.estado === 'aprobada') {
      cargarReportes();
      cargarConfiguracionAsignacion();
      cargarVoluntarios();
    } else if (info?.estado === 'rechazada') {
      verificarApelacion();
    }
  }, [info]);

  useEffect(() => {
    if (info?.estado !== 'aprobada') return;
    const interval = setInterval(() => {
      cargarReportes();
    }, 60000);
    return () => clearInterval(interval);
  }, [info?.estado, token]);

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
    // Validaciones finales antes del envío
    let hasErrors = false;
    const newErrors: Record<string, string> = {};

    if (!nombreRep.trim()) { newErrors.nombreRep = 'El nombre es obligatorio.'; hasErrors = true; }
    else if (/\d/.test(nombreRep)) { newErrors.nombreRep = 'El nombre no debe contener números.'; hasErrors = true; }

    if (!apellidoRep.trim()) { newErrors.apellidoRep = 'El apellido es obligatorio.'; hasErrors = true; }
    else if (/\d/.test(apellidoRep)) { newErrors.apellidoRep = 'El apellido no debe contener números.'; hasErrors = true; }

    if (!telefonoRep.trim()) { newErrors.telefonoRep = 'El teléfono es obligatorio.'; hasErrors = true; }
    else if (/[a-zA-Z]/.test(telefonoRep)) { newErrors.telefonoRep = 'El teléfono no puede contener letras.'; hasErrors = true; }
    else if (!/^\d{10}$/.test(telefonoRep.trim())) { newErrors.telefonoRep = 'Debe tener 10 dígitos numéricos.'; hasErrors = true; }

    if (emailRep.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRep.trim())) {
      newErrors.emailRep = 'Ingresa un correo válido.';
      hasErrors = true;
    }

    if (hasErrors) {
      setErrorsRep(prev => ({ ...prev, ...newErrors }));
      showToast({ type: 'warning', title: 'Datos inválidos', message: 'Revisa los campos marcados en rojo.' });
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
      setErrorsRep({}); // Limpiamos los errores si todo fue un éxito
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
    setTabAsignacion('staff');
    setCandidatosList([]);
    setEstadoVoluntarios('cargando');
    setVoluntarioEsperando(null);
    setCandidatoAConfirmar(null);
    setShowConfirmVoluntarioModal(false);
    if (pollingRef) { clearInterval(pollingRef); setPollingRef(null); }
  };

  const confirmarAceptacion = async () => {
    if (!reporteAccionId) return;
    setIsSubmittingAccion(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/staff`, { headers: { Authorization: `Bearer ${token}` } });
      setStaffList(res.data);

      setTabAsignacion('staff');
      setCandidatosList([]);
      setEstadoVoluntarios('cargando');
      setVoluntarioEsperando(null);
      setCandidatoAConfirmar(null);
      setShowConfirmVoluntarioModal(false);
      if (pollingRef) { clearInterval(pollingRef); setPollingRef(null); }

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

  // ── Funciones de Voluntarios ──
  const cargarCandidatos = async (reporteId: string) => {
    setEstadoVoluntarios('cargando');
    try {
      const res = await axios.get(`${API_URL}/reports/${reporteId}/candidatos`, { headers: { Authorization: `Bearer ${token}` } });
      const data = res.data;
      setCandidatosList(data.candidatos || []);
      setModoAsignacion(data.modo_asignacion || 'manual');
      setTimeoutMin(data.timeout_min || 10);
      if ((data.candidatos || []).length === 0) {
        setEstadoVoluntarios('sin_candidatos');
      } else {
        setEstadoVoluntarios('candidatos');
      }
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos cargar los candidatos.' });
      setEstadoVoluntarios('sin_candidatos');
    }
  };

  const confirmarAsignacionVoluntario = async () => {
    if (!reporteAccionId || !candidatoAConfirmar) return;
    setShowConfirmVoluntarioModal(false);
    setVoluntarioEsperando({ id: candidatoAConfirmar.voluntario_id, nombre: candidatoAConfirmar.nombre });
    setEstadoVoluntarios('esperando_confirmacion');
    try {
      await axios.post(
        `${API_URL}/reports/${reporteAccionId}/asignar`,
        { voluntario_id: candidatoAConfirmar.voluntario_id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Polling cada 5s para detectar confirmación o rechazo
      const interval = setInterval(async () => {
        try {
          const res = await axios.get(`${API_URL}/reports/${reporteAccionId}/candidatos`, { headers: { Authorization: `Bearer ${token}` } });
          const confirmacion = res.data?.confirmacion_voluntario;
          if (confirmacion === 'confirmado') {
            clearInterval(interval);
            setPollingRef(null);
            setEstadoVoluntarios('confirmado');
          } else if (confirmacion !== 'esperando') {
            // null/undefined mientras se esperaba 'esperando' = el voluntario
            // rechazó (o fue dado de baja a medio camino) — el backend nunca
            // escribe un valor 'rechazado' literal, resetea a null.
            clearInterval(interval);
            setPollingRef(null);
            setEstadoVoluntarios('rechazado_mostrando_siguiente');
            setTimeout(() => {
              if (reporteAccionId) cargarCandidatos(reporteAccionId);
            }, 2500);
          }
        } catch { }
      }, 5000);
      setPollingRef(interval);
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos asignar el voluntario.' });
      setEstadoVoluntarios('candidatos');
    } finally {
      setCandidatoAConfirmar(null);
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

  const getBadgeColor = (condicion: string | null) => {
    switch (condicion?.toLowerCase()) {
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
    if (filtro === 'pendientes') {if (['rechazada', 'cancelada'].includes(r.estado_asignacion_clave)) return false; return r.estado_reporte === 'asignado' && !r.confirmacion_voluntario;}
    if (filtro === 'aceptadas') {
        const esAceptado = ['en_camino', 'en_atencion', 'rescatado'].includes(r.estado_reporte)
          || (r.estado_reporte === 'asignado' && r.confirmacion_voluntario === 'esperando')
          || r.estado_asignacion_clave === 'completada';
        if (!esAceptado) return false;

        if (subFiltroAceptadas === 'todas') return true;
        if (subFiltroAceptadas === 'en_proceso') {
          return r.confirmacion_voluntario === 'esperando' || ['en_camino', 'en_atencion'].includes(r.estado_reporte);
        }
        if (subFiltroAceptadas === 'por_cerrar') return r.estado_reporte === 'rescatado';
        if (subFiltroAceptadas === 'completados') return r.estado_asignacion_clave === 'completada';
      }
    if (filtro === 'rechazadas') return ['rechazada', 'cancelada'].includes(r.estado_asignacion_clave);
    return true;
  });

  if (!standalone) {
    return (
      <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', position: 'relative' }}>
        {onClose && (
          <TouchableOpacity
            onPress={onClose}
            style={{ position: 'absolute', top: -14, right: -14, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
          >
            <Ionicons name="close" size={16} color="#FFF" />
          </TouchableOpacity>
        )}
        {!sobreAbierto ? (
          <TouchableOpacity activeOpacity={0.85} onPress={abrirSobre} style={{ alignItems: 'center' }}>
            <View style={{
              width: '100%', aspectRatio: 1.5,
              backgroundColor: '#D9BB93',
              borderRadius: 20,
              justifyContent: 'center', alignItems: 'center',
              ...(Platform.OS === 'web'
                ? { boxShadow: '0 10px 28px rgba(74,55,40,0.2)' } as any
                : { elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16 }),
            }}>
              <View style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: 0, width: 0,
                borderLeftWidth: 190, borderRightWidth: 190,
                borderTopWidth: 90,
                borderLeftColor: 'transparent', borderRightColor: 'transparent',
                borderTopColor: '#C7A87A',
              }} />
              <Ionicons name="mail-outline" size={40} color={COLORS.textDark} style={{ marginTop: 20 }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginTop: 8 }}>
                Toca para abrir
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <Animated.View style={{
            opacity: notaAnim,
            transform: [
              { translateY: notaAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) },
              { scale: notaAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              { rotate: '-1deg' },
            ],
          }}>
            <View style={{
              backgroundColor: COLORS.cardBg,
              borderRadius: 28,
              padding: 28,
              paddingTop: 44,
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
              ...(Platform.OS === 'web'
                ? { boxShadow: '0 12px 32px rgba(74,55,40,0.18)' } as any
                : { elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20 }),
            }}>
              <View style={{ position: 'absolute', top: -28, left: -14, transform: [{ rotate: '-6deg' }] }}>
                <Image source={require('../../assets/images/sobre-perrito.png')} style={{ width: 90, height: 90 }} resizeMode="contain" />
              </View>
              <View style={{ position: 'absolute', top: -24, right: -12, transform: [{ rotate: '7deg' }] }}>
                <Image source={require('../../assets/images/sobre-gatito.png')} style={{ width: 84, height: 84 }} resizeMode="contain" />
              </View>
              <View style={{ alignItems: 'center', marginBottom: 14, marginTop: 10 }}>
                <Ionicons name="mail-open-outline" size={30} color={COLORS.primary} style={{ marginBottom: 8 }} />
                <Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.textDark, textAlign: 'center' }}>
                  Tu solicitud está en revisión
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: COLORS.textLight, lineHeight: 22, textAlign: 'center', marginBottom: 20 }}>
                Nuestro equipo está revisando los datos de{' '}
                <Text style={{ fontWeight: '700', color: COLORS.textDark }}>{info?.nombre}</Text>.
                Te avisaremos en cuanto sea aprobada.
              </Text>
              <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginBottom: 16 }} />
              <View style={{
                flexDirection: 'row', alignItems: 'flex-start',
                backgroundColor: 'rgba(102,188,180,0.14)', borderRadius: 16, padding: 14,
              }}>
                <Ionicons name="key-outline" size={18} color={COLORS.accent} style={{ marginRight: 10, marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, color: COLORS.textDark, lineHeight: 19 }}>
                  Ya puedes iniciar sesión con el correo y la contraseña que registraste. Ahí podrás ver el estado de tu solicitud en cualquier momento.
                </Text>
              </View>
            </View>
          </Animated.View>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Toast toast={toast} translateY={translateY} />

      <View style={{ flex: 1, width: '100%', maxWidth: 900, alignSelf: 'center' }}>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 24, }}>
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
        </View>

        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

          {info.estado === 'pendiente' && (
            <View style={{ backgroundColor: COLORS.cardBg, padding: 24, borderRadius: 24, ...SHADOW_SM, marginBottom: 24, borderLeftWidth: 6, borderLeftColor: COLORS.secondary }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="time" size={24} color={COLORS.secondary} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: COLORS.textDark }}>Tu solicitud está en revisión</Text>
              </View>
              <Text style={{ fontSize: 14, color: COLORS.textDark, lineHeight: 22 }}>
                Nuestro equipo está revisando los datos de <Text style={{ fontWeight: '700' }}>{info?.nombre}</Text>. Te avisaremos en cuanto sea aprobada para que puedas comenzar a recibir y gestionar reportes.
              </Text>
            </View>
          )}

          {info.estado === 'rechazada' && (
            <>
              <View style={{ backgroundColor: COLORS.cardBg, padding: 24, borderRadius: 24, ...SHADOW_SM, marginBottom: 24, borderLeftWidth: 6, borderLeftColor: COLORS.danger }}>
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

                  <View style={{ backgroundColor: COLORS.cardBg, padding: 24, borderRadius: 24, ...SHADOW_SM }}>
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

          {info.estado === 'aprobada' && (
            <>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
                <View style={{ flex: 1, backgroundColor: COLORS.primary, borderRadius: 24, padding: 20, alignItems: 'center', ...SHADOW_MD }}>
                  <Ionicons name="pulse" size={24} color={COLORS.white} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 32, fontWeight: '900', color: COLORS.white }}>{reportes.length}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.white, fontWeight: '500' }}>Casos activos</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: COLORS.cardBg, borderRadius: 24, padding: 20, alignItems: 'center', ...SHADOW_SM }}>
                  <Ionicons name="navigate" size={24} color={COLORS.accent} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textDark }}>{reportes.filter(r => r.estado_reporte === 'en_camino').length}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '500' }}>En camino</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: COLORS.cardBg, borderRadius: 24, padding: 20, alignItems: 'center', ...SHADOW_SM }}>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.secondary} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textDark }}>{reportes.filter(r => r.estado_reporte === 'cerrado').length}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '500' }}>Cerrados</Text>
                </View>
              </View>

              {/* Tabs de navegación */}
              <View style={{ flexDirection: 'row', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                <TouchableOpacity
                  onPress={() => setActiveTab('reportes')}
                  style={{
                    paddingBottom: 12,
                    marginRight: 24,
                    borderBottomWidth: activeTab === 'reportes' ? 3 : 0,
                    borderBottomColor: COLORS.primary
                  }}
                >
                  <Text style={{
                    fontSize: 16,
                    fontWeight: activeTab === 'reportes' ? '800' : '600',
                    color: activeTab === 'reportes' ? COLORS.primary : COLORS.textLight
                  }}>
                    Reportes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setActiveTab('postulaciones')}
                  style={{
                    paddingBottom: 12,
                      marginRight: 24,  
                    borderBottomWidth: activeTab === 'postulaciones' ? 3 : 0,
                    borderBottomColor: COLORS.primary
                  }}
                >
                  <Text style={{
                    fontSize: 16,
                    fontWeight: activeTab === 'postulaciones' ? '800' : '600',
                    color: activeTab === 'postulaciones' ? COLORS.primary : COLORS.textLight
                  }}>
                    Postulaciones
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setActiveTab('voluntarios')}
                  style={{
                    paddingBottom: 12,
                    borderBottomWidth: activeTab === 'voluntarios' ? 3 : 0,
                    borderBottomColor: COLORS.primary
                  }}
                >
                  <Text style={{
                    fontSize: 16,
                    fontWeight: activeTab === 'voluntarios' ? '800' : '600',
                    color: activeTab === 'voluntarios' ? COLORS.primary : COLORS.textLight
                  }}>
                    Mis voluntarios
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Título de sección */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 22, fontWeight: 'bold', color: COLORS.textDark }}>
                  {activeTab === 'reportes' ? 'Reportes asignados' : activeTab === 'postulaciones' ? 'Postulaciones de voluntarios' : 'Mis voluntarios'}
                </Text>
                {activeTab === 'reportes' && nuevosReportes > 0 && (
                  <View style={{ backgroundColor: COLORS.danger, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '800' }}>{nuevosReportes}</Text>
                  </View>
                )}
              </View>

              {activeTab === 'reportes' ? (
                <>
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

                  {filtro === 'aceptadas' && (
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        {([
                          { key: 'todas', label: 'Todas' },
                          { key: 'en_proceso', label: 'En proceso' },
                          { key: 'por_cerrar', label: 'Por cerrar' },
                          { key: 'completados', label: 'Completados' },
                        ] as const).map((s) => (
                          <TouchableOpacity
                            key={s.key}
                            onPress={() => setSubFiltroAceptadas(s.key)}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
                              backgroundColor: subFiltroAceptadas === s.key ? COLORS.secondary : COLORS.white,
                              borderWidth: subFiltroAceptadas === s.key ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                            }}
                          >
                            <Text style={{
                              color: subFiltroAceptadas === s.key ? COLORS.white : COLORS.textDark,
                              fontWeight: '700', fontSize: 12,
                            }}>
                              {s.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
                      {reportesFiltrados.length === 0 ? (
                        <View style={{ width: '100%', alignItems: 'center', paddingVertical: 40 }}>
                          <Ionicons name="file-tray-outline" size={40} color={COLORS.textLight} style={{ marginBottom: 12, opacity: 0.6 }} />
                          <Text style={{ color: COLORS.textLight, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                            No hay casos en esta categoría por ahora.
                          </Text>
                        </View>
                      ) : (
                    reportesFiltrados.map((reporte) => {
                      const enProceso = ['en_camino', 'en_atencion'].includes(reporte.estado_reporte);
                      const esperandoConfirmacion = reporte.confirmacion_voluntario === 'esperando';
                      const yaRescatado = reporte.estado_reporte === 'rescatado';
                      const fueRechazada = reporte.estado_asignacion_clave === 'rechazada';
                      const completado = reporte.estado_asignacion_clave === 'completada';
                      const animales = getAnimales(reporte);
                      const grave = animalMasGrave(animales);
                      const totalCaso = totalAnimales(animales);
                      return (
                        <View key={reporte.asignacion_id} style={{
                          flexGrow: 1,
                          flexBasis: 260,
                          maxWidth: 300,
                          backgroundColor: COLORS.cardBg, borderRadius: 20, overflow: 'hidden', marginBottom: 8,
                          opacity: fueRechazada ? 0.65 : 1,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.1,
                          shadowRadius: 10,
                          elevation: 3,
                        }}>
                          <View style={{ position: 'relative' }}>
                            <View style={{ width: '100%', height: 130, backgroundColor: '#2E2A26', justifyContent: 'center' }}>
                              <Image
                                source={{ uri: reporte.foto_url || 'https://via.placeholder.com/400' }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="contain"
                              />
                            </View>
                            <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: getBadgeColor(grave?.condicion || ''), paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16 }}>
                              <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 12, textTransform: 'capitalize' }}>{grave?.condicion || 'Desconocido'}</Text>
                            </View>
                            {totalCaso > 1 && (
                              <View style={{ position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="paw" size={11} color={COLORS.white} />
                                <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 11 }}>{totalCaso}</Text>
                              </View>
                            )}
                            {fueRechazada && (
                              <View style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: 'rgba(46,42,38,0.45)',
                                justifyContent: 'center', alignItems: 'center',
                              }}>
                                <View style={{
                                  backgroundColor: COLORS.danger, paddingHorizontal: 18, paddingVertical: 6,
                                  borderRadius: 8, transform: [{ rotate: '-8deg' }],
                                }}>
                                  <Text style={{ color: COLORS.white, fontWeight: '900', fontSize: 14, letterSpacing: 1 }}>
                                    RECHAZADO
                                  </Text>
                                </View>
                              </View>
                            )}
                            {esperandoConfirmacion ? (
                              <View style={{ position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(230, 168, 20, 0.9)', paddingVertical: 8, paddingHorizontal: 16 }}>
                                <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '600' }}><Ionicons name="time" size={12} /> Esperando confirmación del rescatista</Text>
                              </View>
                            ) : enProceso ? (
                              <View style={{ position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(102, 188, 180, 0.9)', paddingVertical: 8, paddingHorizontal: 16 }}>
                                <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '600' }}><Ionicons name="car" size={12} /> Rescatista en camino</Text>
                              </View>
                            ) : yaRescatado ? (
                              <View style={{ position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(236, 128, 43, 0.92)', paddingVertical: 8, paddingHorizontal: 16 }}>
                                <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '700' }}><Ionicons name="alert-circle" size={12} /> Llegó al refugio — cierra el caso</Text>
                              </View>
                            ) : completado ? (
                              <View style={{ position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(107, 114, 128, 0.9)', paddingVertical: 8, paddingHorizontal: 16 }}>
                                <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '600' }}><Ionicons name="checkmark-done" size={12} /> Caso completado</Text>
                              </View>
                            ) : null}
                          </View>

                          <View style={{ padding: 15 }}>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textDark, textTransform: 'capitalize' }}>{grave?.tipo_animal || 'Animal'}{totalCaso > 1 ? ` · ${totalCaso} animales` : ''}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                              <Ionicons name="location-outline" size={13} color={COLORS.primary} />
                              <Text style={{ color: COLORS.textLight, fontSize: 12, marginLeft: 4 }} numberOfLines={1}>
                                {[reporte.colonia, reporte.municipio].filter(Boolean).join(', ')}
                              </Text>
                            </View>
                            <Text style={{ color: COLORS.textLight, fontSize: 11, marginTop: 3, marginLeft: 2 }}>
                              hace {formatDistanceToNow(new Date(reporte.created_at), { locale: es })}
                            </Text>

                            {reporte.ultimo_rechazo && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(230, 168, 20, 0.12)', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 8, marginTop: 8 }}>
                                <Ionicons name="alert-circle-outline" size={13} color="#B87F0A" />
                                <Text style={{ color: '#B87F0A', fontSize: 11, fontWeight: '600', marginLeft: 5, flexShrink: 1 }} numberOfLines={2}>
                                  {reporte.ultimo_rechazo.nombre_voluntario} rechazó — {modoAsignacionConfig !== 'manual' ? 'buscando siguiente candidato' : 'elige otro voluntario'}
                                </Text>
                              </View>
                            )}

                            {/* Datos rápidos del animal — para decidir si aceptar sin
                            tener que adivinar. Navegable si el caso trae más de uno. */}
                            <View style={{ marginTop: 8 }}>
                              <AnimalCarousel animales={animales} compact />
                            </View>

                            <TouchableOpacity onPress={() => setReporteSeleccionado(reporte)} style={{ marginTop: 8 }}>
                              <Text style={{ fontSize: 12, color: COLORS.accent, fontWeight: '700' }}>Ver detalle completo →</Text>
                            </TouchableOpacity>

                            <View style={{ marginTop: 14 }}>
                              {!['rechazada', 'cancelada', 'aceptada', 'completada'].includes(reporte.estado_asignacion_clave)&& (reporte.estado_reporte === 'asignado' || reporte.estado_asignacion_clave === 'notificada') ? (
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                  <TouchableOpacity onPress={() => { setReporteAccionId(reporte.reporte_id); setShowAcceptModal(true); }} style={{ flex: 1, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 16, alignItems: 'center' }}>
                                    <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Aceptar</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => { resetModales(); setReporteAccionId(reporte.reporte_id); setShowRejectModal(true); }} style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.danger, paddingVertical: 14, borderRadius: 16, alignItems: 'center' }}>
                                    <Text style={{ color: COLORS.danger, fontWeight: 'bold' }}>Rechazar</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : yaRescatado ? (
                                // El staff ya mandó su hito final ("llegué al refugio") — ya
                                // se puede cerrar el caso formalmente.
                                <View style={{ gap: 10 }}>
                                  <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=$${reporte.latitud},${reporte.longitud}`)} style={{ backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
                                    <Ionicons name="map" size={16} color={COLORS.white} style={{ marginRight: 6 }} />
                                    <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Cómo llegar</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => { resetModales(); setReporteAccionId(reporte.reporte_id); setShowCerrarModal(true); }} style={{ backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 16, alignItems: 'center' }}>
                                    <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Cerrar caso</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : enProceso ? (
                                // en_camino / en_atencion: el staff sigue trabajando el caso.
                                // "Hito rescate" NO va aquí — le pertenece al dashboard del
                                // staff (el backend lo rechaza con 403 si alguien más lo llama).
                                // La asociación solo monitorea mientras tanto.
                                <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=$${reporte.latitud},${reporte.longitud}`)} style={{ backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
                                  <Ionicons name="map" size={16} color={COLORS.white} style={{ marginRight: 6 }} />
                                  <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Cómo llegar</Text>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity onPress={() => setReporteSeleccionado(reporte)} style={{ backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
                                  <Ionicons name="eye" size={16} color={COLORS.white} style={{ marginRight: 6 }} />
                                  <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Ver detalle</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                  </View>
                </>

                ) : activeTab === 'postulaciones' ? (
                  <PostulacionesPanel visible={activeTab === 'postulaciones'} />
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                      {([
                        { key: 'activos', label: 'Activos' },
                        { key: 'dados_de_baja', label: 'Dados de baja' },
                      ] as { key: FiltroVoluntarios; label: string }[]).map((f) => (
                        <TouchableOpacity
                          key={f.key} onPress={() => setFiltroVoluntarios(f.key)}
                          style={{
                            paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24,
                            backgroundColor: filtroVoluntarios === f.key ? COLORS.primary : COLORS.cardBg,
                            borderWidth: filtroVoluntarios === f.key ? 0 : 1, borderColor: 'rgba(0,0,0,0.05)',
                          }}
                        >
                          <Text style={{ color: filtroVoluntarios === f.key ? COLORS.white : COLORS.textDark, fontWeight: '700' }}>{f.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {isLoadingVoluntarios ? (
                      <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
                    ) : voluntarios.filter((v) =>
                        filtroVoluntarios === 'activos'
                          ? ['activo_nivel_1', 'activo_nivel_2'].includes(v.estado)
                          : v.estado === 'dado_de_baja'
                      ).length === 0 ? (
                      <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                        <Text style={{ fontSize: 40, marginBottom: 12 }}>🐾</Text>
                        <Text style={{ fontSize: 15, color: COLORS.textLight, textAlign: 'center' }}>
                          {filtroVoluntarios === 'activos' ? 'No tienes voluntarios activos todavía.' : 'No hay voluntarios dados de baja.'}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: 12 }}>
                        {voluntarios.filter((v) =>
                          filtroVoluntarios === 'activos'
                            ? ['activo_nivel_1', 'activo_nivel_2'].includes(v.estado)
                            : v.estado === 'dado_de_baja'
                        ).map((v) => {
                          const nivel = v.estado === 'activo_nivel_2' ? 'Nivel 2 — casa hogar' : v.estado === 'activo_nivel_1' ? 'Nivel 1 — campo' : null;
                          return (
                            <View key={v.voluntario_id} style={{ backgroundColor: COLORS.cardBg, borderRadius: 20, padding: 16, ...SHADOW_SM }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textDark }}>
                                    {v.nombre} {v.apellido_paterno}
                                  </Text>
                                  {v.telefono && (
                                    <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 2 }}>📞 {v.telefono}</Text>
                                  )}
                                  {nivel && (
                                    <View style={{ backgroundColor: 'rgba(102,188,180,0.15)', alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 }}>
                                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.accent }}>{nivel}</Text>
                                    </View>
                                  )}
                                  {v.especies.length > 0 && (
                                    <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 6, textTransform: 'capitalize' }}>
                                      Atiende: {v.especies.join(', ')}
                                    </Text>
                                  )}
                                  {v.estado === 'dado_de_baja' && (
                                    <View style={{ backgroundColor: 'rgba(231,76,60,0.12)', alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 }}>
                                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.danger }}>Dado de baja</Text>
                                    </View>
                                  )}
                                </View>

                                {v.estado === 'dado_de_baja' ? (
                                  <TouchableOpacity
                                    onPress={() => { setVoluntarioAccion(v); setShowReactivarModal(true); }}
                                    style={{ backgroundColor: COLORS.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 }}
                                  >
                                    <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 13 }}>Reactivar</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <TouchableOpacity
                                    onPress={() => { setVoluntarioAccion(v); setShowBajaModal(true); }}
                                    style={{ backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.danger, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 }}
                                  >
                                    <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 13 }}>Dar de baja</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}

              

              <View style={{ backgroundColor: COLORS.cardBg, padding: 28, borderRadius: 32, marginTop: 32, ...SHADOW_MD }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textDark, marginBottom: 6 }}>Modo de asignación de casos</Text>
                <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 20 }}>Define cómo se le asigna un voluntario a cada reporte que reciben.</Text>

                {isLoadingConfig ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <>
                    <View style={{ gap: 12, marginBottom: 20 }}>
                      {[
                        { id: 'manual', titulo: 'Manual', desc: 'Siempre eliges tú a que voluntario asignar el caso.' },
                        { id: 'semi_automatico', titulo: 'Semi-automático', desc: 'Tú eliges a que voluntario asignar el caso, pero si no respondes a tiempo el sistema asigna uno.' },
                        { id: 'automatico', titulo: 'Automático', desc: 'El sistema asigna el caso a un voluntario y tú solo supervisas.' }
                      ].map(modo => (
                        <TouchableOpacity
                          key={modo.id}
                          onPress={() => setModoAsignacionConfig(modo.id as any)}
                          style={{
                            padding: 16, borderWidth: 2, borderRadius: 16,
                            borderColor: modoAsignacionConfig === modo.id ? COLORS.primary : 'transparent',
                            backgroundColor: modoAsignacionConfig === modo.id ? 'rgba(236, 128, 43, 0.1)' : COLORS.white,
                            flexDirection: 'row', alignItems: 'center'
                          }}
                        >
                          <View style={{
                            width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                            borderColor: modoAsignacionConfig === modo.id ? COLORS.primary : COLORS.textLight,
                            marginRight: 12, justifyContent: 'center', alignItems: 'center'
                          }}>
                            {modoAsignacionConfig === modo.id && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary }} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '700', fontSize: 16, color: COLORS.textDark }}>{modo.titulo}</Text>
                            <Text style={{ fontSize: 13, color: COLORS.textLight, marginTop: 2 }}>{modo.desc}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {modoAsignacionConfig === 'semi_automatico' && (
                      <View style={{ backgroundColor: COLORS.white, padding: 16, borderRadius: 16, marginBottom: 20 }}>
                        <Text style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 16, fontStyle: 'italic' }}>
                          {modoAsignacionConfig === 'semi_automatico'
                            ? 'Tienes hasta el tiempo límite indicado para asignar un voluntario manualmente. Si no lo haces, el sistema elegirá al más apto de forma automática.'
                            : 'El sistema asignará automáticamente al voluntario más apto si el caso no es atendido dentro del tiempo límite indicado.'}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                          <View style={{ flexGrow: 1, flexBasis: 100 }}>
                            <Input label="Caso grave (min)" placeholder="Ej. 10" value={timeoutGrave} onChangeText={setTimeoutGrave} keyboardType="numeric" />
                          </View>
                          <View style={{ flexGrow: 1, flexBasis: 100 }}>
                            <Input label="Caso herido (min)" placeholder="Ej. 30" value={timeoutHerido} onChangeText={setTimeoutHerido} keyboardType="numeric" />
                          </View>
                          <View style={{ flexGrow: 1, flexBasis: 100 }}>
                            <Input label="Caso estable (min)" placeholder="Ej. 60" value={timeoutEstable} onChangeText={setTimeoutEstable} keyboardType="numeric" />
                          </View>
                        </View>
                      </View>
                    )}

                    <Button label="Guardar cambios" onPress={guardarConfiguracionAsignacion} isLoading={isSavingConfig} />
                  </>
                )}
              </View>

              <View style={{ backgroundColor: COLORS.cardBg, padding: 28, borderRadius: 32, marginTop: 32, ...SHADOW_MD }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textDark, marginBottom: 6 }}>Agregar miembro</Text>
                <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 20 }}>Esta persona podrá iniciar sesión con el mismo teléfono que registres.</Text>

                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 10 }}>Tipo de miembro</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                  <TouchableOpacity onPress={() => { setEsStaff(false); setErrorsRep({}); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: !esStaff ? COLORS.accent : 'transparent', borderWidth: !esStaff ? 0 : 1, borderColor: '#D1D5DB' }}>
                    <Text style={{ color: !esStaff ? COLORS.white : COLORS.textLight, fontWeight: '700' }}>Representante</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEsStaff(true); setErrorsRep({}); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: esStaff ? COLORS.secondary : 'transparent', borderWidth: esStaff ? 0 : 1, borderColor: '#D1D5DB' }}>
                    <Text style={{ color: esStaff ? COLORS.textDark : COLORS.textLight, fontWeight: '700' }}>Staff</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <View style={{ flexGrow: 1, flexBasis: 200, minWidth: 180 }}>
                    <Input label="Nombre(s)" placeholder="Ej. Ana" value={nombreRep} onChangeText={handleNombreRepChange} error={errorsRep.nombreRep} />
                  </View>
                  <View style={{ flexGrow: 1, flexBasis: 200, minWidth: 180 }}>
                    <Input label="Apellido" placeholder="Ej. Pérez" value={apellidoRep} onChangeText={handleApellidoRepChange} error={errorsRep.apellidoRep} />
                  </View>
                  <View style={{ flexGrow: 1, flexBasis: 200, minWidth: 180 }}>
                    <Input label="Teléfono" placeholder="Ej. 2221234567" value={telefonoRep} onChangeText={handleTelefonoRepChange} keyboardType="numeric" maxLength={10} error={errorsRep.telefonoRep} />
                  </View>
                  <View style={{ flexGrow: 1, flexBasis: 200, minWidth: 180 }}>
                    <Input label="Correo (Opcional)" placeholder="Ej. correo@ejemplo.com" value={emailRep} onChangeText={handleEmailRepChange} keyboardType="email-address" autoCapitalize="none" error={errorsRep.emailRep} />
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <Button label={esStaff ? "Agregar staff" : "Agregar representante"} onPress={handleAgregarRepresentante} isLoading={isAdding} />
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </View>

      {reporteSeleccionado && (
        <Modal visible={true} transparent animationType="slide">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 32, width: '100%', maxWidth: 500, maxHeight: '90%' }}>
              <ScrollView showsVerticalScrollIndicator={false}>
   
                {/* ─── Foto(s) del reporte ─── */}
              {(() => {
                const fotos = reporteSeleccionado.fotos_urls?.length
                  ? reporteSeleccionado.fotos_urls
                  : reporteSeleccionado.foto_url
                  ? [reporteSeleccionado.foto_url]
                  : [];
                if (fotos.length === 0) return null;

                if (fotos.length === 1) {
                  return (
                    <TouchableOpacity
                      onPress={() => { setCurrentPhotoIndex(0); setShowFullImage(true); }}
                      activeOpacity={0.85}
                      style={{ alignItems: 'center', marginBottom: 20 }}
                    >
                      <Image
                        source={{ uri: fotos[0] }}
                        style={{ width: '100%', maxWidth: 320, height: 220, borderRadius: 18, backgroundColor: '#2E2A26'}}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                  );
                }

                return (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 20 }}
                    contentContainerStyle={{ gap: 10, justifyContent: 'center', flexGrow: 1 }}
                  >
                    {fotos.map((url, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => { setCurrentPhotoIndex(idx); setShowFullImage(true); }}
                        activeOpacity={0.85}
                      >
                        <Image
                          source={{ uri: url }}
                          style={{ width: 220, height: 160, borderRadius: 18, backgroundColor: '#2E2A26'}}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                );
              })()}
                {(() => {
                  const animalesSel = getAnimales(reporteSeleccionado);
                  const totalSel = totalAnimales(animalesSel);
                  return (
                    <View style={{ marginBottom: 24 }}>
                      {totalSel > 1 && (
                        <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', marginBottom: 8 }}>
                          {totalSel} animales en este caso
                        </Text>
                      )}
                      <AnimalCarousel animales={animalesSel} />
                    </View>
                  );
                })()}

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

      {showFullImage && reporteSeleccionado && (() => {
        const fotos = reporteSeleccionado.fotos_urls?.length
          ? reporteSeleccionado.fotos_urls
          : reporteSeleccionado.foto_url
          ? [reporteSeleccionado.foto_url]
          : [];
        return (
          <Modal visible={true} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => setShowFullImage(false)}
                style={{ position: 'absolute', top: 50, right: 24, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 24 }}
              >
                <Ionicons name="close" size={26} color={COLORS.white} />
              </TouchableOpacity>

              <Image
                source={{ uri: fotos[currentPhotoIndex] }}
                style={{ width: '92%', height: '75%' }}
                resizeMode="contain"
              />

              {fotos.length > 1 && (
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 20, alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => setCurrentPhotoIndex((i) => (i === 0 ? fotos.length - 1 : i - 1))}
                    style={{ padding: 10 }}
                  >
                    <Ionicons name="chevron-back" size={28} color={COLORS.white} />
                  </TouchableOpacity>
                  <Text style={{ color: COLORS.white, fontWeight: '700' }}>
                    {currentPhotoIndex + 1} / {fotos.length}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setCurrentPhotoIndex((i) => (i === fotos.length - 1 ? 0 : i + 1))}
                    style={{ padding: 10 }}
                  >
                    <Ionicons name="chevron-forward" size={28} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Modal>
        );
      })()}

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
              <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}><Ionicons name="camera" size={16} /> {fotoHito ? 'Foto adjuntada ✓' : 'Subir foto (Opcional)'}</Text>
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

      {/* ══════════════════════════════════════════════
           MODAL AMPLIADO: STAFF | VOLUNTARIOS
         ══════════════════════════════════════════════ */}
      <Modal visible={showStaffModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{
            backgroundColor: COLORS.cardBg, borderRadius: 32,
            padding: 24, width: '100%', maxWidth: 480,
            ...(Platform.OS === 'web'
              ? { boxShadow: '0 20px 60px rgba(0,0,0,0.25)' } as any
              : { elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20 })
          }}>
            {/* Header */}
            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', marginBottom: 16 }}>
              ¿Quién atenderá este caso?
            </Text>

            {/* Selector de pestañas pill */}
            <View style={{
              flexDirection: 'row', backgroundColor: COLORS.white,
              borderRadius: 20, padding: 4, marginBottom: 20,
              ...(Platform.OS === 'web'
                ? { boxShadow: '0 2px 8px rgba(0,0,0,0.07)' } as any
                : { elevation: 2 })
            }}>
              {(['staff', 'voluntarios'] as TabAsignacion[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => {
                    setTabAsignacion(tab);
                    if (tab === 'voluntarios' && reporteAccionId && estadoVoluntarios === 'cargando') {
                      cargarCandidatos(reporteAccionId);
                    }
                  }}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 16, alignItems: 'center',
                    backgroundColor: tabAsignacion === tab ? COLORS.primary : 'transparent',
                  }}
                >
                  <Text style={{
                    fontWeight: '700', fontSize: 14, textTransform: 'capitalize',
                    color: tabAsignacion === tab ? COLORS.white : COLORS.textLight,
                  }}>
                    {tab === 'staff' ? '🧑‍💼 Staff' : '🤝 Voluntarios'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── PESTAÑA STAFF ── */}
            {tabAsignacion === 'staff' && (
              <>
                <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
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
                      <Text style={{ fontWeight: '700', fontSize: 15, color: COLORS.textDark }}>{miembro.nombre} {miembro.apellido_paterno}</Text>
                      {!miembro.disponible && <Text style={{ fontSize: 13, color: COLORS.danger, marginTop: 4 }}>{miembro.motivo_no_disponible}</Text>}
                      {miembro.disponible && <Text style={{ fontSize: 13, color: COLORS.accent, marginTop: 4 }}>Disponible — {miembro.casos_activos} casos activos</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 15, alignItems: 'center', borderRadius: 20, backgroundColor: '#E5E7EB' }}
                    onPress={() => { setShowStaffModal(false); resetModales(); }}
                  >
                    <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 15, alignItems: 'center', borderRadius: 20, backgroundColor: COLORS.primary }}
                    onPress={confirmarAsignacionStaff}
                    disabled={isSubmittingAccion}
                  >
                    {isSubmittingAccion
                      ? <ActivityIndicator color={COLORS.white} />
                      : <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Asignar Staff</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── PESTAÑA VOLUNTARIOS ── */}
            {tabAsignacion === 'voluntarios' && (
              <View style={{ minHeight: 200 }}>

                {/* ESTADO: cargando */}
                {estadoVoluntarios === 'cargando' && (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={{ color: COLORS.textLight, marginTop: 12, fontSize: 14 }}>Buscando candidatos…</Text>
                    {/* Skeletons */}
                    {[0, 1, 2].map((i) => (
                      <View key={i} style={{
                        width: '100%', height: 90, borderRadius: 16,
                        backgroundColor: 'rgba(0,0,0,0.06)', marginTop: 12,
                        opacity: 1 - i * 0.2,
                      }} />
                    ))}
                  </View>
                )}

                {/* ESTADO: sin_candidatos */}
                {estadoVoluntarios === 'sin_candidatos' && (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Text style={{ fontSize: 40, marginBottom: 12 }}>🐾</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textDark, textAlign: 'center', marginBottom: 8 }}>
                      Sin voluntarios disponibles
                    </Text>
                    <Text style={{ fontSize: 13, color: COLORS.textLight, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
                      No hay voluntarios disponibles cerca de este reporte por ahora.
                    </Text>
                    <TouchableOpacity
                      onPress={() => reporteAccionId && cargarCandidatos(reporteAccionId)}
                      style={{ backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 20 }}
                    >
                      <Text style={{ color: COLORS.white, fontWeight: '700' }}>🔄 Reintentar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setShowStaffModal(false); resetModales(); }}
                      style={{ marginTop: 12 }}
                    >
                      <Text style={{ color: COLORS.textLight, fontSize: 13 }}>Cerrar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ESTADO: esperando_confirmacion */}
                {estadoVoluntarios === 'esperando_confirmacion' && (
                  <View style={{ alignItems: 'center', paddingVertical: 36 }}>
                    <ActivityIndicator size="large" color={COLORS.accent} />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textDark, textAlign: 'center', marginTop: 16 }}>
                      Esperando confirmación de
                    </Text>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary, marginTop: 4 }}>
                      {voluntarioEsperando?.nombre}…
                    </Text>
                    <Text style={{ fontSize: 13, color: COLORS.textLight, marginTop: 10, textAlign: 'center' }}>
                      Revisando respuesta cada 5 segundos.
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowStaffModal(false)}
                      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center', marginTop: 18 }}
                    >
                      <Ionicons name="close" size={20} color={COLORS.textDark} />
                    </TouchableOpacity>
                  </View>
                )}

                {/* ESTADO: confirmado */}
                {estadoVoluntarios === 'confirmado' && (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <View style={{
                      width: 72, height: 72, borderRadius: 36,
                      backgroundColor: 'rgba(102,188,180,0.15)',
                      justifyContent: 'center', alignItems: 'center', marginBottom: 16
                    }}>
                      <Ionicons name="checkmark-circle" size={48} color={COLORS.accent} />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.accent, textAlign: 'center' }}>
                      {voluntarioEsperando?.nombre} confirmó y va en camino.
                    </Text>
                    <TouchableOpacity
                      onPress={() => { setShowStaffModal(false); resetModales(); cargarReportes(); }}
                      style={{ backgroundColor: COLORS.accent, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 20, marginTop: 24 }}
                    >
                      <Text style={{ color: COLORS.white, fontWeight: '700' }}>Cerrar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ESTADO: rechazado_mostrando_siguiente */}
                {estadoVoluntarios === 'rechazado_mostrando_siguiente' && (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Ionicons name="close-circle" size={48} color={COLORS.danger} />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.danger, textAlign: 'center', marginTop: 12 }}>
                      {voluntarioEsperando?.nombre} rechazó el caso.
                    </Text>
                    <Text style={{ fontSize: 13, color: COLORS.textLight, marginTop: 8 }}>Buscando siguiente candidato…</Text>
                    <ActivityIndicator color={COLORS.primary} style={{ marginTop: 16 }} />
                  </View>
                )}

                {/* ESTADO: candidatos */}
                {estadoVoluntarios === 'candidatos' && (
                  <>
                    {/* Banner condicional */}
                    {modoAsignacion !== 'manual' && (
                        <View style={{
                          backgroundColor: 'rgba(102,188,180,0.12)',
                          borderRadius: 14, padding: 14, flexDirection: 'row',
                          alignItems: 'flex-start', marginBottom: 14,
                          borderLeftWidth: 4, borderLeftColor: COLORS.accent,
                        }}>
                          <Ionicons name="time-outline" size={20} color={COLORS.accent} style={{ marginRight: 10, marginTop: 1 }} />
                          <Text style={{ flex: 1, fontSize: 13, color: COLORS.textDark, lineHeight: 19 }}>
                            {modoAsignacion === 'automatico'
                              ? 'El sistema asignará al mejor candidato en breve, sin esperar a que elijas.'
                              : <>Si no asignas en <Text style={{ fontWeight: '700' }}>{timeoutMin} min</Text>, el sistema asignará automáticamente al mejor candidato.</>}
                          </Text>
                        </View>
                      )}

                    <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                      {candidatosList.map((candidato) => {
                        const maxScores = { proximidad: 40, compatibilidad: 25, disponibilidad: 20, carga: 15 };
                        const barras = [
                          { label: 'Proximidad', valor: candidato.score.proximidad, max: maxScores.proximidad },
                          { label: 'Compatibilidad', valor: candidato.score.compatibilidad, max: maxScores.compatibilidad },
                          { label: 'Disponibilidad', valor: candidato.score.disponibilidad, max: maxScores.disponibilidad },
                          { label: 'Carga', valor: candidato.score.carga, max: maxScores.carga },
                        ];
                        const iniciales = candidato.nombre.split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase();
                        return (
                          <View
                            key={candidato.voluntario_id}
                            style={{
                              backgroundColor: COLORS.white, borderRadius: 20,
                              padding: 16, marginBottom: 14,
                              ...(Platform.OS === 'web'
                                ? { boxShadow: '0 4px 16px rgba(0,0,0,0.08)' } as any
                                : { elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 })
                            }}
                          >
                            {/* Fila superior: avatar + info + score total */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                              {/* Avatar */}
                              <View style={{
                                width: 48, height: 48, borderRadius: 24,
                                backgroundColor: 'rgba(236,128,43,0.15)',
                                justifyContent: 'center', alignItems: 'center', marginRight: 12
                              }}>
                                {candidato.foto_url
                                  ? <Image source={{ uri: candidato.foto_url }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                                  : <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.primary }}>{iniciales}</Text>}
                              </View>

                              {/* Nombre + distancia + chip externo */}
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark }}>{candidato.nombre}</Text>
                                <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 2 }}>
                                  📍 a {candidato.distancia_km} km
                                </Text>
                                {candidato.tipo === 'voluntario_externo' && (
                                  <View style={{
                                    backgroundColor: '#E8CCAD', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
                                    alignSelf: 'flex-start', marginTop: 5
                                  }}>
                                    <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textDark }}>
                                      {candidato.etiqueta || 'Voluntario externo verificado'}
                                    </Text>
                                  </View>
                                )}
                              </View>

                              {/* Score total */}
                              <View style={{ alignItems: 'center', marginLeft: 8 }}>
                                <Text style={{ fontSize: 28, fontWeight: '800', color: COLORS.primary, fontFamily: 'Fredoka' }}>
                                  {candidato.score.total}
                                </Text>
                                <Text style={{ fontSize: 10, color: COLORS.textLight, fontWeight: '600' }}>SCORE</Text>
                              </View>
                            </View>

                            {/* Mini-barras de score */}
                            {barras.map((barra) => {
                              const pct = Math.min(1, barra.valor / barra.max);
                              return (
                                <View key={barra.label} style={{ marginBottom: 6 }}>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                                    <Text style={{ fontSize: 11, color: COLORS.textLight, fontWeight: '600' }}>{barra.label}</Text>
                                    <Text style={{ fontSize: 11, color: COLORS.textDark, fontWeight: '700' }}>{barra.valor}/{barra.max}</Text>
                                  </View>
                                  <View style={{ backgroundColor: '#F0E6D2', borderRadius: 6, height: 6, overflow: 'hidden' }}>
                                    <View style={{
                                      width: `${Math.round(pct * 100)}%`,
                                      backgroundColor: COLORS.primary, height: 6, borderRadius: 6
                                    }} />
                                  </View>
                                </View>
                              );
                            })}

                            {/* Botón Asignar */}
                            <TouchableOpacity
                              onPress={() => { setCandidatoAConfirmar(candidato); setShowConfirmVoluntarioModal(true); }}
                              style={{
                                backgroundColor: COLORS.primary, borderRadius: 14,
                                paddingVertical: 11, alignItems: 'center', marginTop: 12
                              }}
                            >
                              <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 14 }}>Asignar</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </ScrollView>

                    <TouchableOpacity
                      onPress={() => { setShowStaffModal(false); resetModales(); }}
                      style={{ paddingVertical: 12, alignItems: 'center', marginTop: 4 }}
                    >
                      <Text style={{ color: COLORS.textLight, fontWeight: '600' }}>Cancelar</Text>
                    </TouchableOpacity>
                  </>
                )}

              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal de confirmación de asignación a voluntario ── */}
      <Modal visible={showConfirmVoluntarioModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{
            backgroundColor: COLORS.cardBg, borderRadius: 28,
            padding: 28, width: '100%', maxWidth: 380,
            ...(Platform.OS === 'web'
              ? { boxShadow: '0 16px 48px rgba(0,0,0,0.2)' } as any
              : { elevation: 16 })
          }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: 'rgba(236,128,43,0.12)',
                justifyContent: 'center', alignItems: 'center', marginBottom: 12
              }}>
                <Ionicons name="person-add" size={32} color={COLORS.primary} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark, textAlign: 'center' }}>
                ¿Asignar este caso a {candidatoAConfirmar?.nombre}?
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.textLight, textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
                El voluntario recibirá una notificación y deberá confirmar.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => { setShowConfirmVoluntarioModal(false); setCandidatoAConfirmar(null); }}
                style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 18, backgroundColor: '#E5E7EB' }}
              >
                <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmarAsignacionVoluntario}
                style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 18, backgroundColor: COLORS.primary }}
              >
                <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: reactivar voluntario ── */}
      <Modal visible={showReactivarModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 28, padding: 28, width: '100%', maxWidth: 400 }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(102,188,180,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="person-add" size={32} color={COLORS.accent} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark, textAlign: 'center' }}>
                ¿Reactivar a {voluntarioAccion?.nombre}?
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.textLight, textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
                Volverá a aparecer en el ranking de candidatos con el nivel que tenía antes de la baja.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity onPress={() => { setShowReactivarModal(false); setVoluntarioAccion(null); }} style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 18, backgroundColor: '#E5E7EB' }}>
                <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmarReactivar} style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 18, backgroundColor: COLORS.accent }}>
                {isSubmittingVoluntario ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Reactivar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: dar de baja voluntario ── */}
      <Modal visible={showBajaModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 32, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.textDark, marginBottom: 12, textAlign: 'center' }}>
              ¿Dar de baja a {voluntarioAccion?.nombre}?
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.textLight, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
              Si tiene un caso activo asignado, se liberará automáticamente para que otro voluntario pueda tomarlo.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => { setShowBajaModal(false); setVoluntarioAccion(null); }}
                style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 18, backgroundColor: '#E5E7EB' }}
              >
                <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmarDarDeBaja}
                style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 18, backgroundColor: COLORS.danger }}
              >
                {isSubmittingVoluntario ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Dar de baja</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}