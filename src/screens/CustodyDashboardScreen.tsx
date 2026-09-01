import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { Toast, useToast } from '../components/Toast';
import { API_URL } from '../constants/api';
import { Brand } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';


interface Seguimiento {
  id: string;
  tipo: string;
  condicion_actual: string;
  foto_url: string;
  estado_validacion: string;
  creado_at: string;
  entorno_foto_url?: string | null;
}

interface Aclaracion {
  id: string;
  estado: 'pendiente_coordinadora' | 'enviada_voluntario' | 'respondida';
  pregunta_regional: string;
  mensaje_coordinadora?: string | null;
  respuesta_voluntario?: string | null;
  foto_respuesta_url?: string | null;
}

export interface Custodia {
  id: string;
  reporte_id: string;
  estado: string;
  inicio_at: string;
  fecha_limite?: string | null;
  proximo_seguimiento_at?: string | null;
  seguimiento_inicial_pendiente?: boolean;
  voluntario_nombre?: string;
  distancia_km?: number;
  es_coordinadora?: boolean;
  ubicacion_hogar?: {
    calle?: string | null;
    numero?: string | null;
    colonia?: string | null;
    municipio?: string | null;
    estado?: string | null;
    latitud?: number | null;
    longitud?: number | null;
  } | null;
  reporte: {
    id: string;
    foto_url?: string | null;
    animales?: Array<{ id: string; tipo_animal?: string; condicion?: string; tamanio?: string }>;
  };
  ultimo_seguimiento?: Seguimiento | null;
  seguimiento_anterior?: Seguimiento | null;
  seguimiento_inicial?: { id: string; foto_url?: string | null; entorno_foto_url?: string | null; creado_at: string } | null;
  ultima_evidencia_entorno?: { id: string; entorno_foto_url?: string | null; creado_at: string } | null;
  revision_activa?: {
    id: string;
    reservada_at: string;
    vence_at: string;
    asociaciones?: { nombre?: string | null } | null;
  } | null;
  ultima_validacion?: {
    decision: string;
    creado_at: string;
    asociaciones?: { nombre?: string | null } | null;
  } | null;
  aclaraciones?: Aclaracion[];
  solicitud_relevo?: { id: string; motivo: string; estado: string } | null;
  oferta_relevo?: {
    id: string;
    estado: 'pendiente_coordinadora' | 'autorizada' | 'confirmada_transporte';
    tipo_destino: 'ingreso_asociacion' | 'hogar_temporal';
    responsable_recepcion: string;
    direccion_recepcion?: string | null;
    ventana_inicio: string;
    ventana_fin: string;
    asociaciones?: { nombre?: string | null } | null;
  } | null;
  transferencia_activa?: {
    id: string;
    fecha_programada?: string | null;
    confirma_entrega_at?: string | null;
    confirma_recepcion_at?: string | null;
    estado: string;
    tipo_destino?: string | null;
    responsable_recepcion?: string | null;
    direccion_recepcion?: string | null;
    ventana_inicio?: string | null;
    ventana_fin?: string | null;
  } | null;
  puede_confirmar_recepcion?: boolean;
  propuesta_adopcion_activa?: { id: string; estado: string; informacion_solicitada?: string | null } | null;
  pregunta_vencimiento?: {
    id: string;
    fecha_limite_consultada: string;
    respuesta?: 'no_seguro' | null;
    respondida_at?: string | null;
  } | null;
}

type ModalMode = 'seguimiento' | 'relevo' | 'extension' | 'vencimiento' | 'validacion' | 'duda' | 'gestionar_duda' | 'responder_aclaracion' | 'aceptar' | 'autorizar_relevo' | 'transporte_relevo' | 'transferencia' | 'finalizar' | 'proponer_adopcion' | 'responder_info_adopcion' | null;
interface Props {
  onClose?: () => void;
}

export default function CustodyDashboardScreen({ onClose }: Props) {
  const { token, user } = useAuth();
  const { width } = useWindowDimensions();
  const { toast, translateY, showToast } = useToast();
  const esAsociacion = user?.rol === 'asociacion' || user?.rol === 'staff';
  const [custodias, setCustodias] = useState<Custodia[]>([]);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalMode>(null);
  const [seleccionada, setSeleccionada] = useState<Custodia | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [propuestasEnviadas, setPropuestasEnviadas] = useState<string[]>([]);
  const [form, setForm] = useState({
    condicion: '',
    salud: '',
    alimentacion: '',
    tratamiento: '',
    comportamiento: '',
    motivo: '',
    fecha: '',
    comentario: '',
    resolucion: '',
    tipoDestino: 'ingreso_asociacion' as 'ingreso_asociacion' | 'hogar_temporal',
    receptorId: '',
    responsable: '',
    direccion: '',
    horaInicio: '10:00',
    horaFin: '12:00',
    nuevaFecha: '',
    mismoAnimal: null as boolean | null,
    fotoClara: null as boolean | null,
    entornoAdecuado: null as boolean | null,
    condicionEvolucion: '',
    posiblesInconsistencias: false,
    revisionMedica: false,
    revisionLegal: false,
    nombreTemporal: '',
    temperamento: '',
    compatibilidad: '',
    razonAdopcion: '',
    tiempoCustodiaAdicional: '',
  });
  const [fotoAnimal, setFotoAnimal] = useState<string | null>(null);
  const [fotoEntorno, setFotoEntorno] = useState<string | null>(null);
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null);
  const [reservandoRevision, setReservandoRevision] = useState<string | null>(null);
  const [hogares, setHogares] = useState<Array<{ id: string; nombre: string; zona: string; espacios_disponibles: number }>>([]);

  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      const endpoint = esAsociacion ? '/custody/regional' : '/custody/me';
      const response = await axios.get(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustodias(response.data.custodias || []);
      setNotificaciones(response.data.notificaciones || []);
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos cargar el seguimiento',
        message: error?.response?.data?.detail || 'Inténtalo nuevamente.',
      });
    } finally {
      setLoading(false);
    }
  }, [esAsociacion, showToast, token]);

  useEffect(() => {
    void cargar();
    const timer = setInterval(() => void cargar(), 10000);
    return () => clearInterval(timer);
  }, [cargar]);

  const abrir = (modo: ModalMode, custodia: Custodia) => {
    setSeleccionada(custodia);
    setModal(modo);
    
    if (modo === 'proponer_adopcion') {
      setErrors({
        nombreTemporal: 'El nombre es obligatorio.',
        salud: 'El estado de salud es obligatorio.',
        temperamento: 'El temperamento es obligatorio.',
        razonAdopcion: 'La razón de adopción es obligatoria.',
      });
    } else {
      setErrors({});
    }
    setForm({
      condicion: '',
      salud: '',
      alimentacion: '',
      tratamiento: '',
      comportamiento: '',
      motivo: '',
      fecha: '',
      comentario: '',
      resolucion: '',
      tipoDestino: 'ingreso_asociacion',
      receptorId: '',
      responsable: '',
      direccion: '',
      horaInicio: '10:00',
      horaFin: '12:00',
      nuevaFecha: '',
      mismoAnimal: null,
      fotoClara: null,
      entornoAdecuado: null,
      condicionEvolucion: '',
      posiblesInconsistencias: false,
      revisionMedica: false,
      revisionLegal: false,
      nombreTemporal: '',
      temperamento: '',
      compatibilidad: '',
      razonAdopcion: '',
      tiempoCustodiaAdicional: '',
    });
    setFotoAnimal(null);
    setFotoEntorno(null);
    setGps(null);
  };

  useEffect(() => {
    if (modal !== 'aceptar' || !seleccionada?.solicitud_relevo || !token) {
      setHogares([]);
      return;
    }
    axios.get(
      `${API_URL}/custody/relief/${seleccionada.solicitud_relevo.id}/eligible-homes`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).then((response) => setHogares(response.data.hogares || [])).catch(() => setHogares([]));
  }, [modal, seleccionada?.solicitud_relevo?.id, token]);

  const cerrarModal = () => {
    if (submitting) return;
    setModal(null);
    setSeleccionada(null);
  };
  const handleNombreTemporalChange = (val: string) => {
    setForm({ ...form, nombreTemporal: val });
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, nombreTemporal: 'El nombre es obligatorio.' }));
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(val)) { // Se quitaron los números (0-9)
      setErrors(prev => ({ ...prev, nombreTemporal: 'Solo se permiten letras y espacios.' }));
    } else {
      setErrors(prev => ({ ...prev, nombreTemporal: '' }));
    }
  };
  const handleRespuestaAdopcionChange = (val: string) => {
    setForm({ ...form, comentario: val });
    if (val.trim().length < 5) {
      setErrors(prev => ({ ...prev, respuestaAdopcion: 'La respuesta debe tener al menos 5 caracteres.' }));
    } else {
      setErrors(prev => ({ ...prev, respuestaAdopcion: '' }));
    }
  };

  const handleSaludChange = (val: string) => {
    setForm({ ...form, salud: val });
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, salud: 'El estado de salud es obligatorio.' }));
    } else if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(val)) {
      setErrors(prev => ({ ...prev, salud: 'Debe contener al menos una letra.' }));
    } else {
      setErrors(prev => ({ ...prev, salud: '' }));
    }
  };

  const handleTemperamentoChange = (val: string) => {
    setForm({ ...form, temperamento: val });
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, temperamento: 'El temperamento es obligatorio.' }));
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s,.-]+$/.test(val)) {
      setErrors(prev => ({ ...prev, temperamento: 'Solo letras y signos básicos de puntuación.' }));
    } else {
      setErrors(prev => ({ ...prev, temperamento: '' }));
    }
  };

  const handleRazonAdopcionChange = (val: string) => {
    setForm({ ...form, razonAdopcion: val });
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, razonAdopcion: 'La razón de adopción es obligatoria.' }));
    } else if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(val)) {
      setErrors(prev => ({ ...prev, razonAdopcion: 'Debe contener al menos una letra.' }));
    } else {
      setErrors(prev => ({ ...prev, razonAdopcion: '' }));
    }
  };

  const abrirRevision = async (custodia: Custodia) => {
    if (!custodia.ultimo_seguimiento || reservandoRevision) return;
    setReservandoRevision(custodia.ultimo_seguimiento.id);
    try {
      await axios.post(
        `${API_URL}/custody/followups/${custodia.ultimo_seguimiento.id}/review/reserve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      abrir('validacion', custodia);
    } catch (error: any) {
      showToast({
        type: 'info',
        title: 'Revisión no disponible',
        message: error?.response?.data?.detail || 'No pudimos reservar esta revisión.',
      });
    } finally {
      setReservandoRevision(null);
    }
  };

  const tomarFoto = async (entorno = false) => {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      showToast({ type: 'error', title: 'Cámara requerida', message: 'Permite usar la cámara para guardar evidencia.' });
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!resultado.canceled) {
      if (entorno) setFotoEntorno(resultado.assets[0].uri);
      else setFotoAnimal(resultado.assets[0].uri);
    }
  };

  const capturarGps = async () => {
    const permiso = await Location.requestForegroundPermissionsAsync();
    if (!permiso.granted) {
      showToast({ type: 'error', title: 'Ubicación requerida', message: 'Permite usar tu GPS para confirmar la evidencia.' });
      return;
    }
    const posicion = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setGps(posicion.coords);
  };

  const subirFoto = async (uri: string) => {
    if (!seleccionada) return null;
    const data = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      data.append('foto', new File([blob], `custodia_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    } else {
      data.append('foto', { uri, name: `custodia_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
    }
    const response = await axios.post(
      `${API_URL}/reports/${seleccionada.reporte_id}/hitos/foto`,
      data,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } },
    );
    return response.data.foto_url as string;
  };

  const subirFotoPropuesta = async (uri: string) => {
    if (!seleccionada) return null;

    // 1. ¡LA CLAVE! Le inyectamos tu sesión al cliente de Supabase.
    // Usamos el token en ambos campos para evitar que Supabase lo rechace por formato inválido.
    if (token) {
      await supabase.auth.setSession({ 
        access_token: token, 
        refresh_token: token 
      });
    }

    // 2. Usamos blob() en lugar de arrayBuffer(), es más seguro en React Native
    const blob = await (await fetch(uri)).blob();
    
    // 3. El prefijo exacto que pide el backend
    const filePath = `adopciones/ingresos/${seleccionada.id}_${Date.now()}.jpg`;

    // 4. Subida al bucket
    const { data, error } = await supabase.storage
      .from('pawalert-adopciones-privado') 
      .upload(filePath, blob, { contentType: 'image/jpeg' });

    if (error) {
      throw new Error(`Error de permisos en Storage: ${error.message}`);
    }

    return data.path; 
  };

  const ejecutar = async (accion: () => Promise<void>, exito: string) => {
    setSubmitting(true);
    try {
      await accion();
      showToast({ type: 'success', title: 'Actualización registrada', message: exito });
      setModal(null);
      setSeleccionada(null);
      await cargar();
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos completar la acción',
        message: error?.response?.data?.detail || error?.message || 'Revisa los datos e inténtalo nuevamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const enviarSeguimiento = () => ejecutar(async () => {
    if (!seleccionada || !fotoAnimal || !form.condicion || !form.salud || !form.alimentacion || !form.comportamiento) {
      throw new Error('Completa la condición, salud, alimentación, comportamiento y fotografía.');
    }
    if (seleccionada.seguimiento_inicial_pendiente && !fotoEntorno) {
      throw new Error('El seguimiento inicial requiere fotografía del entorno.');
    }
    const foto_url = await subirFoto(fotoAnimal);
    const entorno_foto_url = fotoEntorno ? await subirFoto(fotoEntorno) : null;
    await axios.post(
      `${API_URL}/custody/${seleccionada.id}/followups`,
      {
        condicion_actual: form.condicion,
        salud: form.salud,
        alimentacion: form.alimentacion,
        tratamiento: form.tratamiento || null,
        comportamiento: form.comportamiento,
        foto_url,
        entorno_foto_url,
        latitud: gps?.latitude,
        longitud: gps?.longitude,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La asociación ya puede revisar la evidencia.');

  const enviarRelevo = () => ejecutar(async () => {
    if (!seleccionada || form.motivo.trim().length < 5) throw new Error('Explica por qué necesitas el relevo.');
    await axios.post(
      `${API_URL}/custody/${seleccionada.id}/relief`,
      { motivo: form.motivo.trim() },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'Las asociaciones regionales fueron notificadas.');

  const enviarExtension = () => ejecutar(async () => {
    if (!seleccionada || !form.fecha) throw new Error('Indica una nueva fecha.');
    await axios.post(
      `${API_URL}/custody/${seleccionada.id}/extension`,
      { nueva_fecha_limite: new Date(`${form.fecha}T18:00:00`).toISOString() },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La fecha límite del resguardo fue actualizada.');

  const responderVencimiento = (respuesta: 'puede_continuar' | 'no_puede' | 'no_seguro') => ejecutar(async () => {
    if (!seleccionada) throw new Error('No encontramos la custodia seleccionada.');
    if (respuesta === 'puede_continuar' && !form.fecha) {
      throw new Error('Indica hasta qué fecha puedes continuar.');
    }
    await axios.post(
      `${API_URL}/custody/${seleccionada.id}/expiry-response`,
      {
        respuesta,
        nueva_fecha_limite: respuesta === 'puede_continuar'
          ? new Date(`${form.fecha}T18:00:00`).toISOString()
          : null,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'Guardamos tu respuesta y la asociación coordinadora podrá darle seguimiento.');

  const validar = (decision: 'validado' | 'aclaracion_solicitada' | 'alerta') => ejecutar(async () => {
    if (!seleccionada?.ultimo_seguimiento) throw new Error('No hay seguimiento para validar.');
    if (form.mismoAnimal === null || form.fotoClara === null || form.entornoAdecuado === null || !form.condicionEvolucion) {
      throw new Error('Completa todos los puntos de la revisión manual.');
    }
    await axios.post(
      `${API_URL}/custody/followups/${seleccionada.ultimo_seguimiento.id}/validation`,
      {
        decision,
        comentario: form.comentario || null,
        mismo_animal: form.mismoAnimal,
        foto_clara: form.fotoClara,
        entorno_adecuado: form.entornoAdecuado,
        condicion_evolucion: form.condicionEvolucion,
        posibles_inconsistencias: form.posiblesInconsistencias,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La revisión quedó registrada.');

  const enviarDuda = () => ejecutar(async () => {
    if (!seleccionada?.ultimo_seguimiento || form.comentario.trim().length < 5) {
      throw new Error('Explica claramente la duda para la asociación coordinadora.');
    }
    if (form.mismoAnimal === null || form.fotoClara === null || form.entornoAdecuado === null || !form.condicionEvolucion) {
      throw new Error('Completa todos los puntos de la revisión manual.');
    }
    await axios.post(
      `${API_URL}/custody/followups/${seleccionada.ultimo_seguimiento.id}/questions`,
      {
        pregunta: form.comentario.trim(),
        mismo_animal: form.mismoAnimal,
        foto_clara: form.fotoClara,
        entorno_adecuado: form.entornoAdecuado,
        condicion_evolucion: form.condicionEvolucion,
        posibles_inconsistencias: form.posiblesInconsistencias,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La duda fue enviada a la asociación coordinadora.');

  const enviarAclaracion = () => ejecutar(async () => {
    const aclaracion = seleccionada?.aclaraciones?.[0];
    if (!aclaracion || form.comentario.trim().length < 5) {
      throw new Error('Redacta el mensaje que recibirá el hogar temporal.');
    }
    await axios.post(
      `${API_URL}/custody/clarifications/${aclaracion.id}/forward`,
      { mensaje: form.comentario.trim() },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La solicitud de aclaración fue enviada al hogar temporal.');

  const responderAclaracion = () => ejecutar(async () => {
    const aclaracion = seleccionada?.aclaraciones?.find((a) => a.estado === 'enviada_voluntario');
    if (!aclaracion || form.comentario.trim().length < 5) {
      throw new Error('Describe la aclaración antes de enviarla.');
    }
    const foto_url = fotoAnimal ? await subirFoto(fotoAnimal) : null;
    await axios.post(
      `${API_URL}/custody/clarifications/${aclaracion.id}/respond`,
      { respuesta: form.comentario.trim(), foto_url },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La respuesta llegó a la asociación coordinadora.');

  const resolverAclaracion = () => ejecutar(async () => {
    const aclaracion = seleccionada?.aclaraciones?.find((a) => a.estado === 'respondida');
    if (!aclaracion) throw new Error('Aún no hay una respuesta para resolver.');
    await axios.post(
      `${API_URL}/custody/clarifications/${aclaracion.id}/resolve`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La aclaración quedó resuelta.');

  const aceptarRelevo = () => ejecutar(async () => {
    if (!seleccionada?.solicitud_relevo || !form.fecha || !form.responsable || !form.direccion || !gps) {
      throw new Error('Completa fecha, responsable, dirección y GPS del punto de entrega.');
    }
    if (form.tipoDestino === 'hogar_temporal' && (!form.receptorId || !form.nuevaFecha)) {
      throw new Error('Selecciona el nuevo hogar y la fecha límite de su resguardo.');
    }
    await axios.post(
      `${API_URL}/custody/relief/${seleccionada.solicitud_relevo.id}/accept`,
      {
        tipo_destino: form.tipoDestino,
        voluntario_receptor_id: form.tipoDestino === 'hogar_temporal' ? form.receptorId : null,
        responsable_recepcion: form.responsable.trim(),
        direccion_recepcion: form.direccion.trim(),
        latitud_recepcion: gps.latitude,
        longitud_recepcion: gps.longitude,
        ventana_inicio: new Date(`${form.fecha}T${form.horaInicio}:00`).toISOString(),
        ventana_fin: new Date(`${form.fecha}T${form.horaFin}:00`).toISOString(),
        nueva_fecha_limite: form.tipoDestino === 'hogar_temporal'
          ? new Date(`${form.nuevaFecha}T18:00:00`).toISOString()
          : null,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La coordinadora revisará el destino antes de consultar el traslado con el hogar actual.');

  const autorizarRelevo = () => ejecutar(async () => {
    if (!seleccionada?.oferta_relevo) throw new Error('No encontramos la oferta de relevo.');
    await axios.post(
      `${API_URL}/custody/relief/offers/${seleccionada.oferta_relevo.id}/authorize`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'El hogar actual ya puede confirmar si realizará el traslado.');

  const responderTransporte = (puede_transportar: boolean) => ejecutar(async () => {
    if (!seleccionada?.oferta_relevo) throw new Error('No encontramos la oferta autorizada.');
    await axios.post(
      `${API_URL}/custody/relief/offers/${seleccionada.oferta_relevo.id}/transport-response`,
      { puede_transportar },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, puede_transportar
    ? 'El traslado quedó programado y ya puedes consultar el punto autorizado.'
    : 'La coordinadora buscará otra opción segura. La custodia continúa contigo por ahora.');

  const iniciarTraslado = (custodia: Custodia) => ejecutar(async () => {
    if (!custodia.transferencia_activa) throw new Error('No encontramos el traslado programado.');
    await axios.post(
      `${API_URL}/custody/transfers/${custodia.transferencia_activa.id}/start`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'El traslado está en curso. Confirma la entrega cuando llegues al punto autorizado.');

  const confirmarTransferencia = () => ejecutar(async () => {
    if (!seleccionada?.transferencia_activa || !fotoAnimal || !gps) {
      throw new Error('La confirmación requiere foto y GPS.');
    }
    const foto_url = await subirFoto(fotoAnimal);
    await axios.post(
      `${API_URL}/custody/transfers/${seleccionada.transferencia_activa.id}/confirm`,
      { foto_url, latitud: gps.latitude, longitud: gps.longitude },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'Tu parte quedó confirmada. La transferencia terminará cuando ambas partes confirmen.');
  const responderInfoAdopcion = () => ejecutar(async () => {
    if (!seleccionada?.propuesta_adopcion_activa?.id) throw new Error('Propuesta no encontrada.');
    if (form.comentario.trim().length < 5) {
      setErrors(prev => ({ ...prev, respuestaAdopcion: 'La respuesta debe tener al menos 5 caracteres.' }));
      throw new Error('Escribe una respuesta clara y detallada para la asociación.');
    }
    
    let nueva_foto_path = null;
    if (fotoAnimal) {
       nueva_foto_path = await subirFotoPropuesta(fotoAnimal);
    }

    await axios.post(
      `${API_URL}/adoption-intake-requests/${seleccionada.propuesta_adopcion_activa.id}/clarifications`,
      {
        respuesta: form.comentario.trim(),
        nueva_foto_path,
        idempotency_key: `aclaracion_adopcion_${Date.now()}_${seleccionada.id}`
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }, 'Tu respuesta y evidencia han sido enviadas a la asociación.');
  const enviarPropuestaAdopcion = () => ejecutar(async () => {
    const hasErrors = Object.values(errors).some(e => e !== '') || !form.nombreTemporal || !form.salud || !form.temperamento || !form.razonAdopcion;
    
    if (hasErrors || !fotoAnimal) {
      throw new Error('Revisa los errores en rojo y asegúrate de adjuntar una foto reciente.');
    }

    const animalId = seleccionada?.reporte.animales?.[0]?.id;
    if (!animalId || !seleccionada) {
      throw new Error('El backend no devolvió el ID del animal en la custodia.');
    }

    const foto_path = await subirFotoPropuesta(fotoAnimal);
    if (!foto_path) {
      throw new Error('No se pudo obtener la ruta de la imagen tras subirla.');
    }

    await axios.post(
      `${API_URL}/custody/${seleccionada.id}/adoption-intake-requests`,
      {
        animal_id: animalId,
        origen_individuo: 1, 
        fotos_propuesta_paths: [foto_path],
        salud_conocida: form.salud,
        temperamento_observado: form.temperamento,
        motivo_propuesta: form.razonAdopcion,
        idempotency_key: `propuesta_${Date.now()}_${seleccionada.id}`,
        nombre_temporal: form.nombreTemporal || null,
        compatibilidad_observada: form.compatibilidad ? { detalle: form.compatibilidad } : {},
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    // Ocultar botón de este caso tras propuesta exitosa
    setPropuestasEnviadas(prev => [...prev, seleccionada.id]);
  }, 'La propuesta ha sido enviada a la asociación coordinadora.');

  const finalizarCustodia = () => ejecutar(async () => {
    if (!seleccionada || !form.resolucion || form.comentario.trim().length < 3) {
      throw new Error('Selecciona la resolución e indica la referencia del proceso.');
    }
    if (form.resolucion !== 'transferencia_confirmada') {
      if (!form.revisionMedica || !form.revisionLegal) {
        throw new Error('Confirma la revisión médica y legal del proceso.');
      }
      await axios.post(
        `${API_URL}/custody/${seleccionada.id}/resolution-processes`,
        {
          tipo: form.resolucion,
          referencia: form.comentario.trim(),
          revision_medica: form.revisionMedica,
          revision_legal: form.revisionLegal,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    }
    await axios.post(
      `${API_URL}/custody/${seleccionada.id}/finish`,
      {
        resolucion: form.resolucion,
        referencia_proceso: form.comentario.trim(),
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La custodia y el caso quedaron finalizados.');

  const fecha = (valor?: string | null) =>
    valor ? new Date(valor).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Por definir';

  const animal = (custodia: Custodia) => custodia.reporte.animales?.[0] || {};
  const avisoActivo = notificaciones.find((n) => !n.leida);

  const cerrarAviso = async () => {
    if (!avisoActivo) return;
    setNotificaciones((actuales) =>
      actuales.map((n) => n.id === avisoActivo.id ? { ...n, leida: true } : n)
    );
    try {
      await axios.patch(
        `${API_URL}/custody/${avisoActivo.origen === 'coordinacion' ? 'coordination-notifications' : 'notifications'}/${avisoActivo.id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      // La lectura local evita bloquear el flujo; el próximo refresco reintenta.
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{esAsociacion ? 'COORDINACIÓN COMPARTIDA' : 'CUIDADO Y EVIDENCIA'}</Text>
          <Text style={styles.title}>
            {esAsociacion ? 'Seguimiento regional de hogares temporales' : 'Mis custodias temporales'}
          </Text>
          <Text style={styles.subtitle}>
            {esAsociacion
              ? 'Revisa evidencia, atiende alertas y coordina relevos sin exponer domicilios.'
              : 'Consulta próximos seguimientos, vencimientos y transferencias activas.'}
          </Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={22} color={Brand.textDark} />
          </TouchableOpacity>
        )}
      </View>

      {avisoActivo && (
        <View style={styles.notification}>
          <Ionicons name="notifications-outline" size={20} color="#9A6700" />
          <Text style={styles.notificationText}>{avisoActivo.mensaje}</Text>
          <TouchableOpacity onPress={cerrarAviso} hitSlop={8}>
            <Ionicons name="close" size={18} color="#795500" />
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.empty}><ActivityIndicator color={Brand.primary} /></View>
      ) : custodias.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="home-outline" size={38} color={Brand.textFaint} />
          <Text style={styles.emptyTitle}>No hay custodias activas</Text>
          <Text style={styles.emptyText}>Cuando inicie un resguardo aparecerá aquí con sus fechas y evidencias.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.grid, width >= 900 && styles.gridDesktop]}>
          {custodias.map((custodia) => {
            const ficha = animal(custodia);
            return (
              <View key={custodia.id} style={[styles.card, width >= 900 && styles.cardDesktop]}>
                <View style={styles.cardHeader}>
                  {custodia.reporte.foto_url ? (
                    <Image source={{ uri: custodia.reporte.foto_url }} style={styles.photo} />
                  ) : (
                    <View style={[styles.photo, styles.photoPlaceholder]}>
                      <Ionicons name="paw" size={24} color={Brand.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.folio}>CASO {custodia.reporte_id.slice(0, 8).toUpperCase()}</Text>
                    <Text style={styles.animal}>
                      {ficha.tipo_animal || 'Animal'} · {ficha.tamanio || 'Tamaño por confirmar'}
                    </Text>
                    {esAsociacion && (
                      <Text style={styles.volunteer}>
                        {custodia.voluntario_nombre || 'Hogar verificado'}
                        {custodia.distancia_km == null ? ' · Custodia coordinada' : ` · ${custodia.distancia_km} km`}
                      </Text>
                    )}
                  </View>
                  <View style={styles.statePill}><Text style={styles.stateText}>{custodia.estado.replaceAll('_', ' ')}</Text></View>
                </View>

                <View style={styles.dates}>
                  <DateCell label="Último seguimiento" value={fecha(custodia.ultimo_seguimiento?.creado_at)} />
                  <DateCell label="Próximo" value={fecha(custodia.proximo_seguimiento_at)} />
                  <DateCell label="Límite" value={fecha(custodia.fecha_limite)} />
                </View>

                {custodia.ultimo_seguimiento && (
                  <View style={styles.followup}>
                    <Ionicons name="heart-outline" size={17} color={Brand.secondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.followupTitle}>{custodia.ultimo_seguimiento.condicion_actual}</Text>
                      <Text style={styles.followupState}>Validación: {custodia.ultimo_seguimiento.estado_validacion.replaceAll('_', ' ')}</Text>
                    </View>
                  </View>
                )}

                {esAsociacion && custodia.revision_activa && (
                  <View style={styles.reviewStatus}>
                    <Ionicons name="time-outline" size={16} color="#8A6500" />
                    <Text style={styles.reviewStatusText}>
                      En revisión por {custodia.revision_activa.asociaciones?.nombre || 'una asociación'} hasta {fecha(custodia.revision_activa.vence_at)}
                    </Text>
                  </View>
                )}

                {esAsociacion && custodia.ultima_validacion && (
                  <Text style={styles.reviewedBy}>
                    Última revisión: {custodia.ultima_validacion.asociaciones?.nombre || 'Asociación verificada'} · {fecha(custodia.ultima_validacion.creado_at)}
                  </Text>
                )}

                {esAsociacion && custodia.ubicacion_hogar && (
                  <View style={styles.privateLocation}>
                    <Ionicons name="lock-closed-outline" size={17} color={Brand.secondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.privateLocationTitle}>Ubicación autorizada del hogar</Text>
                      <Text style={styles.privateLocationText}>
                        {[
                          [custodia.ubicacion_hogar.calle, custodia.ubicacion_hogar.numero]
                            .filter(Boolean)
                            .join(' '),
                          custodia.ubicacion_hogar.colonia,
                          custodia.ubicacion_hogar.municipio,
                          custodia.ubicacion_hogar.estado,
                        ].filter(Boolean).join(', ')}
                      </Text>
                    </View>
                  </View>
                )}

                {custodia.transferencia_activa?.direccion_recepcion && (
                  <View style={styles.privateLocation}>
                    <Ionicons name="navigate-outline" size={17} color={Brand.secondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.privateLocationTitle}>Punto autorizado de entrega</Text>
                      <Text style={styles.privateLocationText}>{custodia.transferencia_activa.direccion_recepcion}</Text>
                      <Text style={styles.privateLocationText}>
                        {fecha(custodia.transferencia_activa.ventana_inicio)}–{fecha(custodia.transferencia_activa.ventana_fin)} · Recibe {custodia.transferencia_activa.responsable_recepcion}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.actions}>
                  {!esAsociacion ? (
                    <>
                      {custodia.pregunta_vencimiento && (
                        <Action icon="time-outline" label="Confirmar disponibilidad" primary onPress={() => abrir('vencimiento', custodia)} />
                      )}
                      {custodia.estado === 'activo' && (
                        <Action icon="camera-outline" label={custodia.seguimiento_inicial_pendiente ? 'Seguimiento inicial' : 'Nuevo seguimiento'} primary onPress={() => abrir('seguimiento', custodia)} />
                      )}
                      {custodia.estado === 'activo' && !custodia.propuesta_adopcion_activa && !propuestasEnviadas.includes(custodia.id) && (
                        <Action icon="home-outline" label="Proponer para adopción" primary onPress={() => abrir('proponer_adopcion', custodia)} />
                      )}

                      {custodia.propuesta_adopcion_activa?.estado === 'requiere_informacion' && (
                        <Action icon="chatbox-ellipses-outline" label="Responder a asociación" primary onPress={() => abrir('responder_info_adopcion', custodia)} />
                      )}
                      
                      {/* Mostrar etiqueta si la propuesta ya está viva y no requiere info */}
                      {(custodia.propuesta_adopcion_activa || propuestasEnviadas.includes(custodia.id)) && custodia.propuesta_adopcion_activa?.estado !== 'requiere_informacion' && (
                        <View style={{ backgroundColor: '#F3F4F6', padding: 8, borderRadius: 11, alignItems: 'center', justifyContent: 'center', minHeight: 39, paddingHorizontal: 11 }}>
                          <Text style={{ fontSize: 10, color: Brand.textMuted, fontWeight: '700' }}>
                             🐾 Propuesta en revisión
                          </Text>
                        </View>
                      )}
                      {custodia.estado === 'activo' && <Action icon="calendar-outline" label="Extender" onPress={() => abrir('extension', custodia)} />}
                      {custodia.estado === 'activo' && <Action icon="swap-horizontal-outline" label="Necesito relevo" onPress={() => abrir('relevo', custodia)} />}
                      {custodia.aclaraciones?.some((a) => a.estado === 'enviada_voluntario') && (
                        <Action icon="chatbubble-ellipses-outline" label="Responder aclaración" primary onPress={() => abrir('responder_aclaracion', custodia)} />
                      )}
                      {custodia.oferta_relevo?.estado === 'autorizada' && !custodia.transferencia_activa && (
                        <Action icon="car-outline" label="Confirmar traslado" primary onPress={() => abrir('transporte_relevo', custodia)} />
                      )}
                      {custodia.transferencia_activa?.estado === 'programada' && (
                        <Action icon="navigate-outline" label="Iniciar traslado" primary onPress={() => iniciarTraslado(custodia)} />
                      )}
                      {['en_traslado', 'en_curso'].includes(custodia.transferencia_activa?.estado || '') && !custodia.transferencia_activa?.confirma_entrega_at && (
                        <Action icon="checkmark-done-outline" label="Confirmar entrega" primary onPress={() => abrir('transferencia', custodia)} />
                      )}
                    </>
                  ) : (
                    <>
                      {custodia.ultimo_seguimiento?.estado_validacion === 'pendiente' && (
                        <Action
                          icon="shield-checkmark-outline"
                          label={reservandoRevision === custodia.ultimo_seguimiento.id ? 'Reservando…' : 'Revisar evidencia'}
                          primary
                          onPress={() => void abrirRevision(custodia)}
                        />
                      )}
                      {custodia.es_coordinadora && !!custodia.aclaraciones?.length && (
                        <Action icon="chatbubbles-outline" label="Gestionar dudas" onPress={() => abrir('gestionar_duda', custodia)} />
                      )}
                      {custodia.solicitud_relevo?.estado === 'abierta' && !custodia.es_coordinadora && (
                        <Action icon="hand-left-outline" label="Recibir animal" onPress={() => abrir('aceptar', custodia)} />
                      )}
                      {custodia.es_coordinadora && custodia.oferta_relevo?.estado === 'pendiente_coordinadora' && (
                        <Action icon="shield-checkmark-outline" label="Autorizar relevo" primary onPress={() => abrir('autorizar_relevo', custodia)} />
                      )}
                      {custodia.puede_confirmar_recepcion && custodia.transferencia_activa?.confirma_entrega_at && !custodia.transferencia_activa.confirma_recepcion_at && (
                        <Action icon="checkmark-done-outline" label="Confirmar recepción" primary onPress={() => abrir('transferencia', custodia)} />
                      )}
                      {custodia.es_coordinadora && custodia.estado !== 'finalizado' && (
                        <Action icon="flag-outline" label="Finalizar custodia" primary onPress={() => abrir('finalizar', custodia)} />
                      )}
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={cerrarModal}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalTitle(modal)}</Text>
              <TouchableOpacity onPress={cerrarModal}><Ionicons name="close" size={22} color={Brand.textFaint} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
            {modal === 'proponer_adopcion' && (
                <>
                  <Text style={styles.modalCopy}>Propón a este animal para que la asociación lo evalúe y publique en la galería. Tú conservarás la custodia hasta la entrega.</Text>
                  <Field label="Nombre temporal" value={form.nombreTemporal} onChangeText={handleNombreTemporalChange} placeholder="Ej. Firulais" error={errors.nombreTemporal} />
                  <Field label="Estado de salud" value={form.salud} onChangeText={handleSaludChange} placeholder="Ej. Sano, vacunado" multiline error={errors.salud} />
                  <Field label="Temperamento" value={form.temperamento} onChangeText={handleTemperamentoChange} placeholder="Ej. Juguetón, tranquilo" error={errors.temperamento} />
                  <Field label="Compatibilidad (Opcional)" value={form.compatibilidad} onChangeText={(v) => setForm({ ...form, compatibilidad: v })} placeholder="Ej. Convive con niños y otros perros" />
                  <Field label="Razón para adopción" value={form.razonAdopcion} onChangeText={handleRazonAdopcionChange} placeholder="¿Por qué está listo para un hogar definitivo?" multiline error={errors.razonAdopcion} />
                  <Field label="Tiempo que puedes conservarlo (Opcional)" value={form.tiempoCustodiaAdicional} onChangeText={(v) => setForm({ ...form, tiempoCustodiaAdicional: v })} placeholder="Ej. 2 semanas" />
                  <EvidenceButtons animal={fotoAnimal} entorno={null} gps={gps} initial={false} onAnimal={() => tomarFoto()} onEntorno={() => undefined} onGps={capturarGps} />
                  <Submit label="Enviar propuesta" loading={submitting} onPress={enviarPropuestaAdopcion} />
                </>
              )}
              {modal === 'responder_info_adopcion' && seleccionada?.propuesta_adopcion_activa && (
                <>
                  <Text style={styles.modalCopy}>La asociación coordinadora revisó tu propuesta y necesita estos detalles para aprobarla:</Text>
                  <View style={styles.messageCard}>
                    <Text style={styles.messageText}>
                      {seleccionada.propuesta_adopcion_activa.informacion_solicitada || 'Por favor, proporciona más detalles sobre la salud o comportamiento del animal.'}
                    </Text>
                  </View>
                  
                  <Field 
                    label="Tu respuesta" 
                    value={form.comentario} 
                    onChangeText={handleRespuestaAdopcionChange} 
                    placeholder="Escribe aquí tu respuesta..." 
                    multiline 
                    error={errors.respuestaAdopcion}
                  />

                  <Text style={styles.modalCopy}>Si la asociación te pidió una nueva foto (por borrosa o desactualizada), adjúntala aquí. Reemplazará a la original.</Text>
                  <Action icon={fotoAnimal ? 'checkmark-circle' : 'camera-outline'} label={fotoAnimal ? 'Foto lista' : 'Adjuntar foto'} onPress={() => tomarFoto()} />
                  
                  <Submit label="Enviar respuesta" loading={submitting} onPress={responderInfoAdopcion} />
                </>
              )}
              {modal === 'seguimiento' && (
                <>
                  <Field label="Condición actual" value={form.condicion} onChangeText={(v) => setForm({ ...form, condicion: v })} placeholder="Estable, herido, en recuperación..." />
                  <Field label="Salud" value={form.salud} onChangeText={(v) => setForm({ ...form, salud: v })} placeholder="Cambios visibles, heridas o síntomas" multiline />
                  <Field label="Alimentación" value={form.alimentacion} onChangeText={(v) => setForm({ ...form, alimentacion: v })} placeholder="Qué comió y cuánto" />
                  <Field label="Tratamiento" value={form.tratamiento} onChangeText={(v) => setForm({ ...form, tratamiento: v })} placeholder="Medicamentos o indicaciones (opcional)" />
                  <Field label="Comportamiento" value={form.comportamiento} onChangeText={(v) => setForm({ ...form, comportamiento: v })} placeholder="Ánimo, sueño y convivencia" multiline />
                  <EvidenceButtons animal={fotoAnimal} entorno={fotoEntorno} gps={gps} initial={!!seleccionada?.seguimiento_inicial_pendiente} onAnimal={() => tomarFoto()} onEntorno={() => tomarFoto(true)} onGps={capturarGps} />
                  <Submit label="Enviar seguimiento" loading={submitting} onPress={enviarSeguimiento} />
                </>
              )}
              {modal === 'relevo' && (
                <>
                  <Text style={styles.modalCopy}>La custodia continuará contigo hasta realizar una entrega segura.</Text>
                  <Field label="Motivo" value={form.motivo} onChangeText={(v) => setForm({ ...form, motivo: v })} placeholder="Explica desde cuándo necesitas el relevo" multiline />
                  <Submit label="Solicitar relevo" loading={submitting} onPress={enviarRelevo} />
                </>
              )}
              {modal === 'vencimiento' && (
                <>
                  <Text style={styles.modalCopy}>
                    Tu resguardo llega a su fecha límite el {fecha(seleccionada?.fecha_limite)}. El animal seguirá bajo tu cuidado hasta una entrega segura.
                  </Text>
                  <Text style={styles.checklistTitle}>¿Podrás continuar después de esa fecha?</Text>
                  <Field label="Nueva fecha (si puedes continuar)" value={form.fecha} onChangeText={(v) => setForm({ ...form, fecha: v })} placeholder="AAAA-MM-DD" />
                  <View style={styles.validationRow}>
                    <Action icon="checkmark-circle-outline" label="Sí, puedo continuar" primary onPress={() => responderVencimiento('puede_continuar')} />
                    <Action icon="swap-horizontal-outline" label="No, necesito relevo" danger onPress={() => responderVencimiento('no_puede')} />
                    <Action icon="help-circle-outline" label="Todavía no lo sé" onPress={() => responderVencimiento('no_seguro')} />
                  </View>
                </>
              )}
              {modal === 'extension' && (
                <>
                  <Text style={styles.modalCopy}>Indica hasta qué fecha puedes continuar.</Text>
                  <Field label="Fecha (AAAA-MM-DD)" value={form.fecha} onChangeText={(v) => setForm({ ...form, fecha: v })} placeholder="2026-08-15" />
                  <Submit label="Confirmar extensión" loading={submitting} onPress={enviarExtension} />
                </>
              )}
              {modal === 'aceptar' && (
                <>
                  <Text style={styles.modalCopy}>Define un destino real y una ventana de recepción. La coordinadora lo autorizará antes de mostrar la dirección al hogar actual.</Text>
                  <View style={styles.validationRow}>
                    <Action icon="business-outline" label="Ingreso a asociación" primary={form.tipoDestino === 'ingreso_asociacion'} onPress={() => setForm({ ...form, tipoDestino: 'ingreso_asociacion', receptorId: '' })} />
                    <Action icon="home-outline" label="Otro hogar temporal" primary={form.tipoDestino === 'hogar_temporal'} onPress={() => setForm({ ...form, tipoDestino: 'hogar_temporal' })} />
                  </View>
                  {form.tipoDestino === 'hogar_temporal' && (
                    <>
                      <Text style={[styles.label, { marginTop: 14 }]}>Hogar receptor verificado</Text>
                      {hogares.length === 0 ? (
                        <Text style={styles.modalCopy}>No hay hogares con capacidad disponible en este momento.</Text>
                      ) : hogares.map((hogar) => (
                        <TouchableOpacity key={hogar.id} style={[styles.messageCard, form.receptorId === hogar.id && styles.selectedCard]} onPress={() => setForm({ ...form, receptorId: hogar.id })}>
                          <Text style={styles.messageText}>{hogar.nombre} · {hogar.espacios_disponibles} espacio(s)</Text>
                          {!!hogar.zona && <Text style={styles.privateLocationText}>{hogar.zona}</Text>}
                        </TouchableOpacity>
                      ))}
                      <Field label="Nueva fecha límite" value={form.nuevaFecha} onChangeText={(v) => setForm({ ...form, nuevaFecha: v })} placeholder="AAAA-MM-DD" />
                    </>
                  )}
                  <Field label="Responsable que recibirá" value={form.responsable} onChangeText={(v) => setForm({ ...form, responsable: v })} placeholder="Nombre completo" />
                  <Field label="Dirección autorizada" value={form.direccion} onChangeText={(v) => setForm({ ...form, direccion: v })} placeholder="Calle, número, colonia y municipio" multiline />
                  <Field label="Fecha del traslado" value={form.fecha} onChangeText={(v) => setForm({ ...form, fecha: v })} placeholder="AAAA-MM-DD" />
                  <View style={styles.timeRow}>
                    <View style={{ flex: 1 }}><Field label="Desde" value={form.horaInicio} onChangeText={(v) => setForm({ ...form, horaInicio: v })} placeholder="10:00" /></View>
                    <View style={{ flex: 1 }}><Field label="Hasta" value={form.horaFin} onChangeText={(v) => setForm({ ...form, horaFin: v })} placeholder="12:00" /></View>
                  </View>
                  <Action icon={gps ? 'checkmark-circle' : 'locate-outline'} label={gps ? 'Punto GPS listo' : 'Guardar GPS del destino'} onPress={capturarGps} />
                  <Submit label="Enviar destino a autorización" loading={submitting} onPress={aceptarRelevo} />
                </>
              )}
              {modal === 'autorizar_relevo' && seleccionada?.oferta_relevo && (
                <>
                  <Text style={styles.modalCopy}>Verifica que el destino, responsable y horario sean adecuados. La dirección sólo se revelará al hogar actual después de su confirmación de traslado.</Text>
                  <View style={styles.messageCard}>
                    <Text style={styles.messageText}>{seleccionada.oferta_relevo.asociaciones?.nombre || 'Asociación receptora'} · {seleccionada.oferta_relevo.tipo_destino === 'hogar_temporal' ? 'Otro hogar temporal' : 'Ingreso formal'}</Text>
                    <Text style={styles.privateLocationText}>Recibe: {seleccionada.oferta_relevo.responsable_recepcion}</Text>
                    <Text style={styles.privateLocationText}>{seleccionada.oferta_relevo.direccion_recepcion}</Text>
                    <Text style={styles.privateLocationText}>{fecha(seleccionada.oferta_relevo.ventana_inicio)}–{fecha(seleccionada.oferta_relevo.ventana_fin)}</Text>
                  </View>
                  <Submit label="Autorizar y consultar traslado" loading={submitting} onPress={autorizarRelevo} />
                </>
              )}
              {modal === 'transporte_relevo' && seleccionada?.oferta_relevo && (
                <>
                  <Text style={styles.modalCopy}>La coordinadora autorizó que {seleccionada.oferta_relevo.asociaciones?.nombre || 'la asociación receptora'} reciba al animal entre {fecha(seleccionada.oferta_relevo.ventana_inicio)} y {fecha(seleccionada.oferta_relevo.ventana_fin)}.</Text>
                  <Text style={styles.modalCopy}>¿Puedes llevarlo personalmente? Si respondes que no, se buscará otra opción y el animal continuará contigo hasta una entrega segura.</Text>
                  <View style={styles.validationRow}>
                    <Action icon="car-outline" label="Sí, puedo trasladarlo" primary onPress={() => responderTransporte(true)} />
                    <Action icon="close-circle-outline" label="No puedo trasladarlo" danger onPress={() => responderTransporte(false)} />
                  </View>
                </>
              )}
              {modal === 'validacion' && (
                <>
                  <Text style={styles.modalCopy}>
                    La revisión está reservada para tu asociación durante 30 minutos. Compara las fotos y los datos antes de decidir.
                  </Text>
                  <View style={[styles.comparison, width < 600 && styles.comparisonMobile]}>
                    <EvidenceComparison
                      label="Foto inicial"
                      uri={seleccionada?.seguimiento_inicial?.foto_url}
                      empty="Sin foto inicial"
                    />
                    <EvidenceComparison
                      label="Foto anterior"
                      uri={seleccionada?.seguimiento_anterior?.foto_url}
                      empty="Es el primer seguimiento"
                    />
                    <EvidenceComparison
                      label="Evidencia actual"
                      uri={seleccionada?.ultimo_seguimiento?.foto_url}
                      empty="No hay foto actual"
                    />
                    <EvidenceComparison
                      label="Último entorno"
                      uri={seleccionada?.ultima_evidencia_entorno?.entorno_foto_url}
                      empty="Sin evidencia del entorno"
                    />
                  </View>
                  <Text style={styles.checklistTitle}>Checklist de revisión</Text>
                  <ReviewBoolean
                    label="¿Parece ser el mismo animal?"
                    value={form.mismoAnimal}
                    onChange={(value) => setForm({ ...form, mismoAnimal: value })}
                  />
                  <ReviewBoolean
                    label="¿La fotografía es suficientemente clara?"
                    value={form.fotoClara}
                    onChange={(value) => setForm({ ...form, fotoClara: value })}
                  />
                  <ReviewBoolean
                    label="¿El entorno parece adecuado?"
                    value={form.entornoAdecuado}
                    onChange={(value) => setForm({ ...form, entornoAdecuado: value })}
                  />
                  <Text style={styles.label}>Cambio visible en la condición</Text>
                  <View style={styles.reviewChoices}>
                    {[
                      ['mejor', 'Mejor'], ['igual', 'Igual'], ['peor', 'Peor'],
                      ['no_determinable', 'No determinable'],
                    ].map(([value, label]) => (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setForm({ ...form, condicionEvolucion: value })}
                        style={[styles.reviewChoice, form.condicionEvolucion === value && styles.reviewChoiceActive]}
                      >
                        <Text style={[styles.reviewChoiceText, form.condicionEvolucion === value && styles.reviewChoiceTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[styles.inconsistency, form.posiblesInconsistencias && styles.inconsistencyActive]}
                    onPress={() => setForm({ ...form, posiblesInconsistencias: !form.posiblesInconsistencias })}
                  >
                    <Ionicons name={form.posiblesInconsistencias ? 'checkbox' : 'square-outline'} size={19} color={form.posiblesInconsistencias ? '#B84A3A' : Brand.textMuted} />
                    <Text style={styles.inconsistencyText}>Detecté posibles inconsistencias</Text>
                  </TouchableOpacity>
                  <Field label="Comentario" value={form.comentario} onChangeText={(v) => setForm({ ...form, comentario: v })} placeholder="Observaciones o aclaraciones necesarias" multiline />
                  <View style={styles.validationRow}>
                    <Action icon="checkmark-circle-outline" label="Validar" primary onPress={() => validar('validado')} />
                    {seleccionada?.es_coordinadora ? (
                      <>
                        <Action icon="help-circle-outline" label="Pedir aclaración" onPress={() => validar('aclaracion_solicitada')} />
                        <Action icon="warning-outline" label="Alerta" danger onPress={() => validar('alerta')} />
                      </>
                    ) : (
                      <Action icon="chatbubble-ellipses-outline" label="Enviar duda" onPress={enviarDuda} />
                    )}
                  </View>
                </>
              )}
              {modal === 'gestionar_duda' && seleccionada?.aclaraciones?.[0] && (
                <>
                  <Text style={styles.label}>Duda regional</Text>
                  <View style={styles.messageCard}><Text style={styles.messageText}>{seleccionada.aclaraciones[0].pregunta_regional}</Text></View>
                  {seleccionada.aclaraciones[0].respuesta_voluntario && (
                    <>
                      <Text style={styles.label}>Respuesta del hogar temporal</Text>
                      <View style={styles.messageCard}><Text style={styles.messageText}>{seleccionada.aclaraciones[0].respuesta_voluntario}</Text></View>
                      {seleccionada.aclaraciones[0].foto_respuesta_url && <Image source={{ uri: seleccionada.aclaraciones[0].foto_respuesta_url }} style={styles.evidencePhoto} />}
                    </>
                  )}
                  {seleccionada.aclaraciones[0].estado === 'respondida' ? (
                    <>
                      <Field label="Mensaje adicional (si hace falta)" value={form.comentario} onChangeText={(v) => setForm({ ...form, comentario: v })} placeholder="Indica qué información sigue pendiente" multiline />
                      <View style={styles.validationRow}>
                        <Action icon="checkmark-circle-outline" label="Resolver" primary onPress={resolverAclaracion} />
                        <Action icon="refresh-outline" label="Pedir más información" onPress={enviarAclaracion} />
                      </View>
                    </>
                  ) : seleccionada.aclaraciones[0].estado === 'pendiente_coordinadora' ? (
                    <>
                      <Field label="Mensaje para el hogar temporal" value={form.comentario} onChangeText={(v) => setForm({ ...form, comentario: v })} placeholder="Reformula la duda con instrucciones claras" multiline />
                      <Submit label="Solicitar aclaración" loading={submitting} onPress={enviarAclaracion} />
                    </>
                  ) : (
                    <Text style={styles.modalCopy}>Esperando respuesta del hogar temporal.</Text>
                  )}
                </>
              )}
              {modal === 'responder_aclaracion' && seleccionada?.aclaraciones?.find((a) => a.estado === 'enviada_voluntario') && (
                <>
                  <Text style={styles.label}>Solicitud de la asociación coordinadora</Text>
                  <View style={styles.messageCard}>
                    <Text style={styles.messageText}>{seleccionada.aclaraciones.find((a) => a.estado === 'enviada_voluntario')?.mensaje_coordinadora}</Text>
                  </View>
                  <Field label="Tu respuesta" value={form.comentario} onChangeText={(v) => setForm({ ...form, comentario: v })} placeholder="Explica lo ocurrido o los cambios observados" multiline />
                  <Text style={styles.modalCopy}>Puedes adjuntar una foto nueva si ayuda a aclarar la evidencia.</Text>
                  <Action icon={fotoAnimal ? 'checkmark-circle' : 'camera-outline'} label={fotoAnimal ? 'Foto lista' : 'Adjuntar foto'} onPress={() => tomarFoto()} />
                  <Submit label="Enviar aclaración" loading={submitting} onPress={responderAclaracion} />
                </>
              )}
              {modal === 'transferencia' && (
                <>
                  <Text style={styles.modalCopy}>
                    {esAsociacion
                      ? 'Confirma la recepción cuando Rafael llegue. Tu foto y GPS deben estar a menos de 200 metros de su confirmación.'
                      : 'Tú realizas el traslado. Confirma la entrega al llegar; después la asociación receptora confirmará con foto y GPS.'}
                  </Text>
                  <EvidenceButtons animal={fotoAnimal} entorno={null} gps={gps} initial={false} onAnimal={() => tomarFoto()} onEntorno={() => undefined} onGps={capturarGps} />
                  <Submit label={esAsociacion ? 'Confirmar recepción' : 'Confirmar entrega'} loading={submitting} onPress={confirmarTransferencia} />
                </>
              )}
              {modal === 'finalizar' && (
                <>
                  <Text style={styles.modalCopy}>Elige únicamente una resolución ya formalizada: transferencia confirmada o ingreso formal a una asociación.</Text>
                  <View style={styles.validationRow}>
                    <Action icon="swap-horizontal-outline" label="Transferencia confirmada" primary={form.resolucion === 'transferencia_confirmada'} onPress={() => setForm({ ...form, resolucion: 'transferencia_confirmada' })} />
                    <Action icon="business-outline" label="Ingreso formal" primary={form.resolucion === 'ingreso_formal_asociacion'} onPress={() => setForm({ ...form, resolucion: 'ingreso_formal_asociacion' })} />
                  </View>
                  <Field label="Folio o referencia del proceso" value={form.comentario} onChangeText={(v) => setForm({ ...form, comentario: v })} placeholder="Ej. expediente de ingreso formal" />
                  {form.resolucion !== 'transferencia_confirmada' && !!form.resolucion && (
                    <>
                      <TouchableOpacity style={[styles.inconsistency, form.revisionMedica && styles.selectedCard]} onPress={() => setForm({ ...form, revisionMedica: !form.revisionMedica })}>
                        <Ionicons name={form.revisionMedica ? 'checkbox' : 'square-outline'} size={19} color={Brand.secondary} />
                        <Text style={styles.inconsistencyText}>Expediente médico revisado</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.inconsistency, form.revisionLegal && styles.selectedCard]} onPress={() => setForm({ ...form, revisionLegal: !form.revisionLegal })}>
                        <Ionicons name={form.revisionLegal ? 'checkbox' : 'square-outline'} size={19} color={Brand.secondary} />
                        <Text style={styles.inconsistencyText}>Documentación legal revisada</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  <Submit label="Finalizar custodia" loading={submitting} onPress={finalizarCustodia} />
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Toast toast={toast} translateY={translateY} />
    </View>
  );
}

function DateCell({ label, value }: { label: string; value: string }) {
  return <View style={styles.dateCell}><Text style={styles.dateLabel}>{label}</Text><Text style={styles.dateValue}>{value}</Text></View>;
}

function EvidenceComparison({ label, uri, empty }: { label: string; uri?: string | null; empty: string }) {
  return (
    <View style={styles.comparisonCard}>
      <Text style={styles.comparisonLabel}>{label}</Text>
      {uri ? (
        <Image source={{ uri }} style={styles.evidencePhoto} />
      ) : (
        <View style={styles.comparisonEmpty}>
          <Ionicons name="image-outline" size={24} color={Brand.textFaint} />
          <Text style={styles.comparisonEmptyText}>{empty}</Text>
        </View>
      )}
    </View>
  );
}

function ReviewBoolean({ label, value, onChange }: { label: string; value: boolean | null; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.reviewQuestion}>
      <Text style={styles.reviewQuestionText}>{label}</Text>
      <View style={styles.reviewChoices}>
        {[{ value: true, label: 'Sí' }, { value: false, label: 'No' }].map((option) => (
          <TouchableOpacity
            key={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.reviewChoice, value === option.value && styles.reviewChoiceActive]}
          >
            <Text style={[styles.reviewChoiceText, value === option.value && styles.reviewChoiceTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function Action({ icon, label, onPress, primary, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <TouchableOpacity style={[styles.action, primary && styles.actionPrimary, danger && styles.actionDanger]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={primary || danger ? '#fff' : Brand.textDark} />
      <Text style={[styles.actionText, (primary || danger) && styles.actionTextLight]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field(props: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; multiline?: boolean; error?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput 
        {...props} 
        style={[
          styles.input, 
          props.multiline && styles.textArea,
          props.error ? { borderColor: '#B84A3A', borderWidth: 1.5 } : null
        ]} 
        placeholderTextColor={Brand.textFaint} 
      />
      {props.error ? <Text style={{ color: '#B84A3A', fontSize: 11, fontWeight: '700', marginTop: 4 }}>{props.error}</Text> : null}
    </View>
  );
}

function EvidenceButtons({ animal, entorno, gps, initial, onAnimal, onEntorno, onGps }: any) {
  return (
    <View style={styles.evidenceRow}>
      <Action icon={animal ? 'checkmark-circle' : 'camera-outline'} label={animal ? 'Foto lista' : 'Foto animal'} onPress={onAnimal} />
      {initial && <Action icon={entorno ? 'checkmark-circle' : 'home-outline'} label={entorno ? 'Entorno listo' : 'Foto entorno'} onPress={onEntorno} />}
      <Action icon={gps ? 'checkmark-circle' : 'locate-outline'} label={gps ? 'GPS listo' : 'Capturar GPS'} onPress={onGps} />
    </View>
  );
}

function Submit({ label, loading, onPress }: { label: string; loading: boolean; onPress: () => void }) {
  return <TouchableOpacity style={styles.submit} onPress={onPress} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{label}</Text>}</TouchableOpacity>;
}

function modalTitle(mode: ModalMode) {
  return ({
    seguimiento: 'Registrar seguimiento',
    relevo: 'Solicitar relevo',
    extension: 'Extender resguardo',
    vencimiento: 'Confirmar disponibilidad',
    validacion: 'Revisar evidencia',
    duda: 'Enviar duda',
    gestionar_duda: 'Gestionar aclaración',
    responder_aclaracion: 'Responder aclaración',
    aceptar: 'Recibir al animal',
    autorizar_relevo: 'Autorizar destino del relevo',
    transporte_relevo: 'Confirmar traslado',
    transferencia: 'Confirmar transferencia',
    finalizar: 'Finalizar custodia',
    proponer_adopcion: 'Proponer para adopción',
    responder_info_adopcion: 'Responder a la asociación',
  } as any)[mode || ''] || '';
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.backgroundWarm },
  header: { flexDirection: 'row', gap: 16, padding: 22, borderBottomWidth: 1, borderBottomColor: '#E7D8C4' },
  eyebrow: { color: Brand.primary, fontWeight: '900', fontSize: 10, letterSpacing: 1.2 },
  title: { color: Brand.textDark, fontWeight: '900', fontSize: 24, marginTop: 4 },
  subtitle: { color: Brand.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5, maxWidth: 650 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  notification: { margin: 18, marginBottom: 0, padding: 12, borderRadius: 14, backgroundColor: '#FFF3CD', flexDirection: 'row', gap: 9, alignItems: 'center' },
  notificationText: { color: '#795500', fontSize: 12, flex: 1, fontWeight: '700' },
  grid: { padding: 18, gap: 14 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#E7D8C4' },
  cardDesktop: { width: '48.5%' },
  cardHeader: { flexDirection: 'row', gap: 11, alignItems: 'center' },
  photo: { width: 56, height: 56, borderRadius: 16 },
  photoPlaceholder: { backgroundColor: `${Brand.primary}14`, alignItems: 'center', justifyContent: 'center' },
  folio: { color: Brand.textFaint, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  animal: { color: Brand.textDark, fontSize: 14, fontWeight: '900', marginTop: 3, textTransform: 'capitalize' },
  volunteer: { color: Brand.secondary, fontSize: 10, fontWeight: '700', marginTop: 3 },
  statePill: { backgroundColor: `${Brand.secondary}16`, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99 },
  stateText: { color: Brand.secondary, fontSize: 9, fontWeight: '900', textTransform: 'capitalize' },
  dates: { flexDirection: 'row', marginTop: 14, gap: 7 },
  dateCell: { flex: 1, borderRadius: 12, padding: 9, backgroundColor: Brand.cardWarm },
  dateLabel: { color: Brand.textFaint, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' },
  dateValue: { color: Brand.textDark, fontSize: 10, fontWeight: '700', marginTop: 4 },
  followup: { marginTop: 12, borderRadius: 13, padding: 11, backgroundColor: `${Brand.secondary}10`, flexDirection: 'row', gap: 8, alignItems: 'center' },
  followupTitle: { color: Brand.textDark, fontSize: 12, fontWeight: '800' },
  followupState: { color: Brand.textMuted, fontSize: 10, marginTop: 2, textTransform: 'capitalize' },
  reviewStatus: { flexDirection: 'row', gap: 7, alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: '#FFF4D6', marginTop: 10 },
  reviewStatusText: { color: '#795500', fontSize: 10, lineHeight: 15, fontWeight: '700', flex: 1 },
  reviewedBy: { color: Brand.textMuted, fontSize: 9, lineHeight: 14, marginTop: 8 },
  privateLocation: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: '#EAF7F5', borderWidth: 1, borderColor: '#C3E8E4', marginTop: 12 },
  privateLocationTitle: { color: Brand.textDark, fontWeight: '800', fontSize: 11 },
  privateLocationText: { color: Brand.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 },
  action: { minHeight: 39, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EFE3CD' },
  actionPrimary: { backgroundColor: Brand.secondary },
  actionDanger: { backgroundColor: '#B84A3A' },
  actionText: { color: Brand.textDark, fontSize: 10, fontWeight: '800' },
  actionTextLight: { color: '#fff' },
  empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyTitle: { color: Brand.textDark, fontSize: 17, fontWeight: '900', marginTop: 12 },
  emptyText: { color: Brand.textMuted, fontSize: 12, textAlign: 'center', maxWidth: 340, marginTop: 5 },
  overlay: { flex: 1, backgroundColor: 'rgba(46,42,38,0.6)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modal: { width: '100%', maxWidth: 480, maxHeight: '92%', borderRadius: 24, padding: 20, backgroundColor: Brand.cardWarm },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { color: Brand.textDark, fontSize: 19, fontWeight: '900' },
  modalCopy: { color: Brand.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  messageCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4D3B8', borderRadius: 13, padding: 12, marginBottom: 14 },
  selectedCard: { borderColor: Brand.secondary, backgroundColor: '#EAF7F5' },
  messageText: { color: Brand.textDark, fontSize: 12, lineHeight: 18 },
  label: { color: Brand.textDark, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#E4D3B8', borderRadius: 12, backgroundColor: '#fff', padding: 11, color: Brand.textDark, fontSize: 12 },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 8 },
  comparison: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  comparisonMobile: { flexDirection: 'column' },
  comparisonCard: { flexGrow: 1, flexBasis: '46%', minWidth: 0 },
  comparisonLabel: { color: Brand.textDark, fontSize: 10, fontWeight: '900', marginBottom: 6 },
  comparisonEmpty: { height: 170, borderRadius: 15, backgroundColor: '#EFE3CD', alignItems: 'center', justifyContent: 'center', padding: 12 },
  comparisonEmptyText: { color: Brand.textMuted, fontSize: 10, textAlign: 'center', marginTop: 6 },
  evidencePhoto: { width: '100%', height: 170, borderRadius: 15 },
  checklistTitle: { color: Brand.textDark, fontSize: 14, fontWeight: '900', marginBottom: 10 },
  reviewQuestion: { borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4D3B8', padding: 10, marginBottom: 8 },
  reviewQuestionText: { color: Brand.textDark, fontSize: 11, fontWeight: '800', marginBottom: 8 },
  reviewChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  reviewChoice: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: '#EFE3CD', borderWidth: 1, borderColor: 'transparent' },
  reviewChoiceActive: { backgroundColor: `${Brand.secondary}16`, borderColor: Brand.secondary },
  reviewChoiceText: { color: Brand.textMuted, fontSize: 10, fontWeight: '800' },
  reviewChoiceTextActive: { color: Brand.secondary },
  inconsistency: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4D3B8', marginBottom: 12 },
  inconsistencyActive: { borderColor: '#B84A3A', backgroundColor: '#FFF1EF' },
  inconsistencyText: { color: Brand.textDark, fontSize: 11, fontWeight: '800', flex: 1 },
  validationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeRow: { flexDirection: 'row', gap: 10 },
  submit: { minHeight: 48, borderRadius: 14, backgroundColor: Brand.primary, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  submitText: { color: '#fff', fontSize: 13, fontWeight: '900' },
});
