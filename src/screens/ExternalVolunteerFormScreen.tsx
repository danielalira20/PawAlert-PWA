import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Toast, useToast } from '../components/Toast';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import LocationPickerMap from './LocationPickerMap';

const COLORS = {
  bgTeal: '#66BCB4',
  bgWhite: '#FFFFFF',
  primary: '#EC802B',
  secondary: '#EDC55B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  danger: '#E74C3C',
  grayLight: '#F3F4F6',
  border: '#E5E7EB'
};

const FORM_MAX_WIDTH = 750;
const DRAFT_SAVE_DELAY_MS = 800;

const PASO_NOMBRES = ['Tu hogar', 'Convivencia y capacidad', 'Seguridad y compromisos', 'Evidencia'];
const TOTAL_PASOS = 4;

const HORAS_DISPONIBLES = [
  '07:00 AM', '07:30 AM', '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM',
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
  '07:00 PM'
];

interface Props {
  onClose?: () => void;
  modoReintento?: boolean;
}

export default function ExternalVolunteerFormScreen({ onClose, modoReintento = false }: Props) {
  const { setSession, token } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [paso, setPaso] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(modoReintento);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showSubmitError, setShowSubmitError] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [registroExitoso, setRegistroExitoso] = useState(false);
  const [correccionActiva, setCorreccionActiva] = useState(false);

  // Modal genérico para selectores
  const [selectorActivo, setSelectorActivo] = useState<string | null>(null);
  const [showInfoIdentidad, setShowInfoIdentidad] = useState(false);

  // ─── PASO 1: Tu hogar ───
  const [pinLocation, setPinLocation] = useState<{ latitud: number; longitud: number }>({ latitud: 19.0414, longitud: -98.2063 });
  const [ubicacionConfirmada, setUbicacionConfirmada] = useState(false);
  const [isLoadingGps, setIsLoadingGps] = useState(false);
  const [calle, setCalle] = useState('');
  const [numero, setNumero] = useState('');
  const [colonia, setColonia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [estado, setEstado] = useState('');
  const [referencia, setReferencia] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [direccionConfirmada, setDireccionConfirmada] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [tipoVivienda, setTipoVivienda] = useState('');
  const [subcategoriaVivienda, setSubcategoriaVivienda] = useState('');
  const [customViviendaInput, setCustomViviendaInput] = useState('');
  
  const [autorizacion, setAutorizacion] = useState('');
  const [ubicacionAnimal, setUbicacionAnimal] = useState('');
  const [aceptaVisita, setAceptaVisita] = useState('');

  // ─── PASO 2: Convivencia y capacidad ───
  const [numAdultos, setNumAdultos] = useState('');
  const [ninosEdades, setNinosEdades] = useState('');
  const [otrosAnimales, setOtrosAnimales] = useState('');
  const [vacunados, setVacunados] = useState('');
  const [puedeSeparar, setPuedeSeparar] = useState('');
  const [horasSolo, setHorasSolo] = useState('');
  const [preferenciaEspecie, setPreferenciaEspecie] = useState<string[]>([]);
  const [subcategoriaOtroEspecie, setSubcategoriaOtroEspecie] = useState('');
  const [customOtroEspecieInput, setCustomOtroEspecieInput] = useState('');
  const [preferenciaTamanio, setPreferenciaTamanio] = useState<string[]>([]);
  const [tiempoResguardo, setTiempoResguardo] = useState('');
  const [tiempoResguardoDias, setTiempoResguardoDias] = useState('');

  // ─── PASO 3: Seguridad y compromisos ───
  const [checkAccesos, setCheckAccesos] = useState(false);
  const [checkBardas, setCheckBardas] = useState(false);
  const [checkBalcones, setCheckBalcones] = useState(false);
  const [checkEspacio, setCheckEspacio] = useState(false);
  const [checkNingunoSeguridad, setCheckNingunoSeguridad] = useState(false);

  const [fotoAccesos, setFotoAccesos] = useState('');
  const [fotoBardas, setFotoBardas] = useState('');
  const [fotoBalcones, setFotoBalcones] = useState('');
  const [fotoEspacio, setFotoEspacio] = useState('');

  const [checkAislamiento, setCheckAislamiento] = useState(false);
  const [checkCuarentena, setCheckCuarentena] = useState(false);
  const [checkNoEntregar, setCheckNoEntregar] = useState(false);
  const [checkNingunoCompromiso, setCheckNingunoCompromiso] = useState(false);

  const [nombreEmergencia, setNombreEmergencia] = useState('');
  const [telEmergencia, setTelEmergencia] = useState('');

  // ─── PASO 4: Evidencia y disponibilidad ───
  const [identificacionUrl, setIdentificacionUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [identificacionOriginalUrl, setIdentificacionOriginalUrl] = useState('');
  const [videoOriginalUrl, setVideoOriginalUrl] = useState('');
  const [videoEliminado, setVideoEliminado] = useState(false);
  const [horario1Dia, setHorario1Dia] = useState('');
  const [horario1Hora, setHorario1Hora] = useState('');
  const [horario2Dia, setHorario2Dia] = useState('');
  const [horario2Hora, setHorario2Hora] = useState('');
  const [horario3Dia, setHorario3Dia] = useState('');
  const [horario3Hora, setHorario3Hora] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);

  // ─── Borrador (guardar progreso al recargar) ───
  const lastPersistedDraftRef = useRef<string | null>(null);
  const draftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draftPersistenceDisabledRef = useRef(false);

  useEffect(() => {
    const hasErrors = Object.values(errors).some(e => e !== '');
    if (!hasErrors) setShowSubmitError(false);
  }, [errors]);

  useEffect(() => {
    if (!token) {
      setIsLoadingExisting(false);
      return;
    }

    if (!modoReintento) {
      // Modo postulación nueva: solo restauramos el borrador local, no el
      // perfil ya confirmado (ese es exclusivo del flujo de corrección).
      let cancelado = false;
      (async () => {
        try {
          const { data } = await axios.get(
            `${API_URL}/voluntarios/externo/borrador`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const borrador = data?.borrador;
          if (cancelado || !borrador) return;

          const d = borrador.datos || {};
          setPinLocation(d.pinLocation || pinLocation);
          setUbicacionConfirmada(!!d.ubicacionConfirmada);
          setCalle(d.calle || '');
          setNumero(d.numero || '');
          setColonia(d.colonia || '');
          setMunicipio(d.municipio || '');
          setEstado(d.estado || '');
          setReferencia(d.referencia || '');
          setDireccionConfirmada(d.direccionConfirmada || '');
          setTipoVivienda(d.tipoVivienda || '');
          setSubcategoriaVivienda(d.subcategoriaVivienda || '');
          setCustomViviendaInput(d.customViviendaInput || '');
          setAutorizacion(d.autorizacion || '');
          setUbicacionAnimal(d.ubicacionAnimal || '');
          setAceptaVisita(d.aceptaVisita || '');
          setNumAdultos(d.numAdultos || '');
          setNinosEdades(d.ninosEdades || '');
          setOtrosAnimales(d.otrosAnimales || '');
          setVacunados(d.vacunados || '');
          setPuedeSeparar(d.puedeSeparar || '');
          setHorasSolo(d.horasSolo || '');
          setPreferenciaEspecie(d.preferenciaEspecie || []);
          setSubcategoriaOtroEspecie(d.subcategoriaOtroEspecie || '');
          setCustomOtroEspecieInput(d.customOtroEspecieInput || '');
          setPreferenciaTamanio(d.preferenciaTamanio || []);
          setTiempoResguardo(d.tiempoResguardo || '');
          setTiempoResguardoDias(d.tiempoResguardoDias || '');
          setCheckAccesos(!!d.checkAccesos);
          setCheckBardas(!!d.checkBardas);
          setCheckBalcones(!!d.checkBalcones);
          setCheckEspacio(!!d.checkEspacio);
          setCheckNingunoSeguridad(!!d.checkNingunoSeguridad);
          setCheckAislamiento(!!d.checkAislamiento);
          setCheckCuarentena(!!d.checkCuarentena);
          setCheckNoEntregar(!!d.checkNoEntregar);
          setCheckNingunoCompromiso(!!d.checkNingunoCompromiso);
          setNombreEmergencia(d.nombreEmergencia || '');
          setTelEmergencia(d.telEmergencia || '');
          setHorario1Dia(d.horario1Dia || '');
          setHorario1Hora(d.horario1Hora || '');
          setHorario2Dia(d.horario2Dia || '');
          setHorario2Hora(d.horario2Hora || '');
          setHorario3Dia(d.horario3Dia || '');
          setHorario3Hora(d.horario3Hora || '');
          setConsentimiento(!!d.consentimiento);
          setPaso(borrador.paso || 1);
          lastPersistedDraftRef.current = JSON.stringify(borrador);

          showToast({
            type: 'success',
            title: 'Recuperamos tu progreso',
            message: 'Continúa donde te quedaste. Vuelve a subir las fotos y el video.',
          });
        } catch (error) {
          // Sin borrador o sin conexión: se arranca con el formulario vacío.
        } finally {
          if (!cancelado) setIsLoadingExisting(false);
        }
      })();

      return () => {
        cancelado = true;
      };
    }

    let cancelado = false;
    (async () => {
      try {
        const { data } = await axios.get(
          `${API_URL}/voluntarios/externo/perfil`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const perfil = data?.perfil;
        if (cancelado || !perfil) return;

        setPinLocation({
          latitud: Number(perfil.latitud),
          longitud: Number(perfil.longitud),
        });
        setUbicacionConfirmada(true);
        setCalle(perfil.calle || '');
        setNumero(perfil.numero || '');
        setColonia(perfil.colonia || '');
        setMunicipio(perfil.municipio || '');
        setEstado(perfil.estado_ubicacion || '');
        setReferencia(perfil.referencia || '');
        setDireccionConfirmada(
          [perfil.calle, perfil.numero, perfil.colonia, perfil.municipio, perfil.estado_ubicacion]
            .filter(Boolean)
            .join(', '),
        );
        setTipoVivienda(perfil.tipo_vivienda || '');
        setSubcategoriaVivienda(perfil.subcategoria_vivienda || '');
        setCustomViviendaInput(perfil.vivienda_otra_desc || '');
        setAutorizacion(perfil.autorizacion_propietario || '');
        setUbicacionAnimal(perfil.ubicacion_animal || '');
        setAceptaVisita(perfil.acepta_visita || '');
        setNumAdultos(String(perfil.adultos_hogar ?? ''));
        setHorasSolo(String(perfil.horas_solo ?? ''));
        setNinosEdades(perfil.ninos_hogar || '');
        setOtrosAnimales(perfil.otros_animales || '');
        setVacunados(perfil.animales_vacunados || '');
        setPuedeSeparar(perfil.puede_aislar || '');
        setPreferenciaEspecie(perfil.preferencia_especies || []);
        setSubcategoriaOtroEspecie(perfil.subcategoria_otra_especie || '');
        setCustomOtroEspecieInput(perfil.especie_otra_desc || '');
        setPreferenciaTamanio(perfil.preferencia_tamanios || []);
        setTiempoResguardo(perfil.tiempo_resguardo || '');
        setTiempoResguardoDias(
          perfil.tiempo_resguardo_dias != null
            ? String(perfil.tiempo_resguardo_dias)
            : '',
        );
        setCheckBardas(!!perfil.chk_bardas);
        setCheckBalcones(!!perfil.chk_balcones);
        setCheckEspacio(!!perfil.chk_espacio);
        setFotoAccesos(perfil.foto_accesos_url || '');
        setFotoBardas(perfil.foto_bardas_url || '');
        setFotoBalcones(perfil.foto_balcones_url || '');
        setFotoEspacio(perfil.foto_espacio_url || '');
        setCheckNingunoSeguridad(
          !perfil.chk_accesos_seguros
          && !perfil.chk_bardas
          && !perfil.chk_balcones
          && !perfil.chk_espacio,
        );
        setCheckAislamiento(!!perfil.chk_aislamiento);
        setCheckCuarentena(!!perfil.chk_cuarentena);
        setCheckNoEntregar(!!perfil.chk_no_entregar);
        setCheckNingunoCompromiso(
          !perfil.chk_aislamiento
          && !perfil.chk_cuarentena
          && !perfil.chk_no_entregar,
        );
        setNombreEmergencia(perfil.contacto_emergencia_nombre || '');
        setTelEmergencia(perfil.contacto_emergencia_telefono || '');
        setIdentificacionUrl(perfil.identificacion_url || '');
        setIdentificacionOriginalUrl(perfil.identificacion_url || '');
        setVideoUrl(perfil.video_recorrido_url || '');
        setVideoOriginalUrl(perfil.video_recorrido_url || '');
        const horarios = perfil.horarios_visita || [];
        setHorario1Dia(horarios[0]?.dia || '');
        setHorario1Hora(horarios[0]?.hora || '');
        setHorario2Dia(horarios[1]?.dia || '');
        setHorario2Hora(horarios[1]?.hora || '');
        setHorario3Dia(horarios[2]?.dia || '');
        setHorario3Hora(horarios[2]?.hora || '');
        setConsentimiento(!!perfil.consentimiento_evidencia);
      } catch (error: any) {
        if (!cancelado) {
          showToast({
            type: 'error',
            title: 'No pudimos recuperar tu información',
            message: error?.response?.data?.detail || 'Intenta nuevamente.',
          });
        }
      } finally {
        if (!cancelado) setIsLoadingExisting(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [modoReintento, token]);

  const handleCloseRequest = () => setShowCloseConfirm(true);

  const handleSiguiente = () => {
    let valido = false;
    if (paso === 1) valido = validarPaso1();
    if (paso === 2) valido = validarPaso2();
    if (paso === 3) valido = validarPaso3();

    if (valido) {
      setErrors({});
      setShowSubmitError(false);
      setPaso(paso + 1);
    } else {
      setShowSubmitError(true);
    }
  };

  const handleAnterior = () => {
    setErrors({});
    setShowSubmitError(false);
    if (paso === 1) handleCloseRequest();
    else setPaso(paso - 1);
  };

  // ─── VALIDACIONES ───
  const validarPaso1 = () => {
    const newErrors: { [key: string]: string } = {};
    if (!ubicacionConfirmada) newErrors.ubicacion = 'Ubica tu hogar en el mapa.';

    if (!tipoVivienda) newErrors.tipoVivienda = 'Selecciona una opción.';
    else if (tipoVivienda === 'Otro') {
      if (!subcategoriaVivienda) newErrors.subcategoriaVivienda = 'Selecciona la categoría.';
      else if (subcategoriaVivienda === 'Otra específica' && !customViviendaInput.trim()) newErrors.customViviendaInput = 'Especifica el tipo de vivienda.';
    }

    if (!autorizacion) newErrors.autorizacion = 'Selecciona una opción.';
    if (!ubicacionAnimal) newErrors.ubicacionAnimal = 'Selecciona una opción.';
    if (!aceptaVisita) newErrors.aceptaVisita = 'Selecciona una opción.';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validarPaso2 = () => {
    const newErrors: { [key: string]: string } = {};
    if (!numAdultos) newErrors.numAdultos = 'Obligatorio.';
    if (!ninosEdades) newErrors.ninosEdades = 'Obligatorio.';
    if (!otrosAnimales) newErrors.otrosAnimales = 'Obligatorio.';
    if (!vacunados) newErrors.vacunados = 'Selecciona una opción.';
    if (!puedeSeparar) newErrors.puedeSeparar = 'Selecciona una opción.';
    if (!horasSolo) newErrors.horasSolo = 'Obligatorio.';
    
    if (preferenciaEspecie.length === 0) newErrors.preferenciaEspecie = 'Selecciona al menos uno.';
    if (preferenciaEspecie.includes('Otros')) {
      if (!subcategoriaOtroEspecie) newErrors.subcategoriaOtroEspecie = 'Selecciona la categoría.';
      else if (subcategoriaOtroEspecie === 'Otro' && !customOtroEspecieInput.trim()) newErrors.customOtroEspecieInput = 'Especifica el animal.';
    }

    if (preferenciaTamanio.length === 0) newErrors.preferenciaTamanio = 'Selecciona al menos uno.';
    
    if (!tiempoResguardoDias.trim()) newErrors.tiempoResguardoDias = 'Obligatorio.';
    else if (isNaN(Number(tiempoResguardoDias))) newErrors.tiempoResguardoDias = 'Debe ser un número válido.';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validarPaso3 = () => {
    const newErrors: { [key: string]: string } = {};

    if (!checkAccesos && !checkBardas && !checkBalcones && !checkEspacio && !checkNingunoSeguridad) {
      newErrors.seguridadGeneral = 'Debes marcar al menos una opción o indicar que no cumples con ninguna.';
    }
    
    if (checkAccesos && !fotoAccesos) newErrors.fotoAccesos = 'Sube una foto de evidencia.';
    if (checkBardas && !fotoBardas) newErrors.fotoBardas = 'Sube una foto de evidencia.';
    if (checkBalcones && !fotoBalcones) newErrors.fotoBalcones = 'Sube una foto de evidencia.';
    if (checkEspacio && !fotoEspacio) newErrors.fotoEspacio = 'Sube una foto de evidencia.';

    if (!checkAislamiento && !checkCuarentena && !checkNoEntregar && !checkNingunoCompromiso) {
      newErrors.compromisosGeneral = 'Debes marcar al menos una opción o indicar que no cumples con ninguna.';
    }

    if (!nombreEmergencia.trim()) newErrors.nombreEmergencia = 'Obligatorio.';
    else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(nombreEmergencia)) newErrors.nombreEmergencia = 'Solo letras.';

    if (!telEmergencia.trim()) newErrors.telEmergencia = 'Obligatorio.';
    else if (!/^\d{10}$/.test(telEmergencia.trim())) newErrors.telEmergencia = '10 dígitos numéricos.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validarPaso4 = () => {
    const newErrors: { [key: string]: string } = {};
    if (!identificacionUrl) newErrors.identificacionUrl = 'Debes subir una identificación.';
    if (!videoUrl) newErrors.videoUrl = 'Debes subir un video recorrido de tu hogar.';
    if (!horario1Dia || !horario1Hora) newErrors.horarios = 'Ingresa al menos la primera opción completa.';
    if (!consentimiento) newErrors.consentimiento = 'Debes aceptar los términos.';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─── HANDLERS ───
  const handleRegexChange = (val: string, setter: any, errorKey: string, regex: RegExp, errorMsg: string) => {
    setter(val);
    if (val.trim() && !regex.test(val)) setErrors(prev => ({ ...prev, [errorKey]: errorMsg }));
    else setErrors(prev => ({ ...prev, [errorKey]: '' }));
  };

  const toggleArray = (item: string, state: string[], setState: any, errorKey: string) => {
    const isSelected = state.includes(item);
    const newState = isSelected ? state.filter(i => i !== item) : [...state, item];
    setState(newState);
    if (newState.length > 0) setErrors(prev => ({ ...prev, [errorKey]: '' }));
  };

  const handleSeguridadCheck = (setter: any, value: boolean) => {
    setter(value);
    if (value) setCheckNingunoSeguridad(false);
    setErrors(prev => ({...prev, seguridadGeneral: ''}));
  };

  const handleNingunoSeguridad = (value: boolean) => {
    setCheckNingunoSeguridad(value);
    if (value) {
      setCheckAccesos(false); setCheckBardas(false); setCheckBalcones(false); setCheckEspacio(false);
    }
    setErrors(prev => ({...prev, seguridadGeneral: ''}));
  };

  const handleCompromisoCheck = (setter: any, value: boolean) => {
    setter(value);
    if (value) setCheckNingunoCompromiso(false);
    setErrors(prev => ({...prev, compromisosGeneral: ''}));
  };

  const handleNingunoCompromiso = (value: boolean) => {
    setCheckNingunoCompromiso(value);
    if (value) {
      setCheckAislamiento(false); setCheckCuarentena(false); setCheckNoEntregar(false);
    }
    setErrors(prev => ({...prev, compromisosGeneral: ''}));
  };

  // ─── LÓGICA DE SELECTORES MODALES ───
  const getSelectorOptions = () => {
    switch (selectorActivo) {
      case 'adultos': return Array.from({ length: 20 }, (_, i) => String(i + 1));
      case 'horasSolo': return Array.from({ length: 25 }, (_, i) => String(i));
      case 'ninos': return ['No hay', 'Bebés (0-3 años)', 'Niños (4-12 años)', 'Adolescentes (13-17 años)', 'Varias edades'];
      case 'otrosAnimales': return ['Ninguno', '1 Perro', '2+ Perros', '1 Gato', '2+ Gatos', 'Perros y Gatos', 'Aves/Otros'];
      case 'dia1': case 'dia2': case 'dia3': return ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      case 'hora1': case 'hora2': case 'hora3': return HORAS_DISPONIBLES;
      default: return [];
    }
  };

  const handleSelectorSelect = (val: string) => {
    if (selectorActivo === 'adultos') { setNumAdultos(val); setErrors(prev => ({ ...prev, numAdultos: '' })); }
    if (selectorActivo === 'horasSolo') { setHorasSolo(val); setErrors(prev => ({ ...prev, horasSolo: '' })); }
    if (selectorActivo === 'ninos') { setNinosEdades(val); setErrors(prev => ({ ...prev, ninosEdades: '' })); }
    if (selectorActivo === 'otrosAnimales') { setOtrosAnimales(val); setErrors(prev => ({ ...prev, otrosAnimales: '' })); }
    
    if (selectorActivo === 'dia1') { setHorario1Dia(val); setErrors(prev => ({ ...prev, horarios: '' })); }
    if (selectorActivo === 'hora1') { setHorario1Hora(val); setErrors(prev => ({ ...prev, horarios: '' })); }
    if (selectorActivo === 'dia2') setHorario2Dia(val);
    if (selectorActivo === 'hora2') setHorario2Hora(val);
    if (selectorActivo === 'dia3') setHorario3Dia(val);
    if (selectorActivo === 'hora3') setHorario3Hora(val);

    setSelectorActivo(null);
  };

// ─── MAPAS ───
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/reverse', { params: { lat, lon, format: 'json', addressdetails: 1 } });
      const address = res.data.address || {};
      setCalle(address.road || address.pedestrian || address.square || address.footway || address.path || '');
      setNumero(address.house_number || '');
      setColonia(address.suburb || address.neighbourhood || address.colonia || address.city_district || address.quarter || address.residential || address.village || address.hamlet || address.borough || '');
      setMunicipio(address.city || address.town || address.municipality || address.county || '');
      setEstado(address.state || '');
      setDireccionConfirmada(res.data.display_name || '');
    } catch (error) {}
  };

  const handlePinLocationSelect = (latitud: number, longitud: number) => {
    setPinLocation({ latitud, longitud });
    setUbicacionConfirmada(true);
    setErrors((prev) => ({ ...prev, ubicacion: '' }));
    reverseGeocode(latitud, longitud); 
  };

  const handleSelectSearchResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const address = result.address || {};
    
    setPinLocation({ latitud: lat, longitud: lon });
    setUbicacionConfirmada(true);
    setCalle(address.road || address.pedestrian || address.square || address.footway || address.path || result.name || '');
    setNumero(address.house_number || '');
    setColonia(address.suburb || address.neighbourhood || address.colonia || address.city_district || address.quarter || address.residential || address.village || address.hamlet || address.borough || '');
    setMunicipio(address.city || address.town || address.municipality || address.county || '');
    setEstado(address.state || '');
    setDireccionConfirmada(result.display_name);
    setSearchQuery('');
    setSearchResults([]);
    setErrors((prev) => ({ ...prev, ubicacion: '' }));
  };

  useEffect(() => {
    if (searchQuery.trim().length < 4) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', { params: { q: searchQuery + ', México', format: 'json', addressdetails: 1, limit: 5 } });
        setSearchResults(res.data);
      } catch (error) { setSearchResults([]); } finally { setIsSearching(false); }
    }, 600);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleGetLocation = async () => {
    setIsLoadingGps(true);
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          handlePinLocationSelect(position.coords.latitude, position.coords.longitude);
          setIsLoadingGps(false);
        },
        () => { setIsLoadingGps(false); showToast({ type: 'error', title: 'Error', message: 'Verifica tu GPS.' }); },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else { setIsLoadingGps(false); }
  };

  // ─── MULTIMEDIA ───
  const handlePickSecurityPhoto = async (setter: any, errorKey: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled) {
      setter(result.assets[0].uri);
      setErrors(prev => ({ ...prev, [errorKey]: '' }));
    }
  };

  const handlePickIdentificacion = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled) {
      setIdentificacionUrl(result.assets[0].uri);
      setErrors(prev => ({ ...prev, identificacionUrl: '' }));
    }
  };

  const handlePickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 0.8 });
    if (!result.canceled) {
      setVideoUrl(result.assets[0].uri);
      setVideoEliminado(false);
    }
  };

  // ─── BORRADOR: guardar progreso mientras se llena el formulario ───
  // No incluye fotoAccesos/fotoBardas/fotoBalcones/fotoEspacio/identificacionUrl/videoUrl:
  // son URIs locales (blob:) que dejan de existir al recargar la página.
  const draftDatos = useMemo(() => ({
    pinLocation, ubicacionConfirmada,
    calle, numero, colonia, municipio, estado, referencia, direccionConfirmada,
    tipoVivienda, subcategoriaVivienda, customViviendaInput,
    autorizacion, ubicacionAnimal, aceptaVisita,
    numAdultos, ninosEdades, otrosAnimales, vacunados, puedeSeparar, horasSolo,
    preferenciaEspecie, subcategoriaOtroEspecie, customOtroEspecieInput, preferenciaTamanio,
    tiempoResguardo, tiempoResguardoDias,
    checkAccesos, checkBardas, checkBalcones, checkEspacio, checkNingunoSeguridad,
    checkAislamiento, checkCuarentena, checkNoEntregar, checkNingunoCompromiso,
    nombreEmergencia, telEmergencia,
    horario1Dia, horario1Hora, horario2Dia, horario2Hora, horario3Dia, horario3Hora,
    consentimiento,
  }), [
    pinLocation, ubicacionConfirmada,
    calle, numero, colonia, municipio, estado, referencia, direccionConfirmada,
    tipoVivienda, subcategoriaVivienda, customViviendaInput,
    autorizacion, ubicacionAnimal, aceptaVisita,
    numAdultos, ninosEdades, otrosAnimales, vacunados, puedeSeparar, horasSolo,
    preferenciaEspecie, subcategoriaOtroEspecie, customOtroEspecieInput, preferenciaTamanio,
    tiempoResguardo, tiempoResguardoDias,
    checkAccesos, checkBardas, checkBalcones, checkEspacio, checkNingunoSeguridad,
    checkAislamiento, checkCuarentena, checkNoEntregar, checkNingunoCompromiso,
    nombreEmergencia, telEmergencia,
    horario1Dia, horario1Hora, horario2Dia, horario2Hora, horario3Dia, horario3Hora,
    consentimiento,
  ]);

  const hasMeaningfulDraft = ubicacionConfirmada
    || !!tipoVivienda
    || !!autorizacion
    || !!numAdultos
    || preferenciaEspecie.length > 0
    || !!nombreEmergencia
    || !!telEmergencia;

  const draftRequest = useMemo(() => ({ paso, datos: draftDatos }), [paso, draftDatos]);
  const serializedDraft = useMemo(() => JSON.stringify(draftRequest), [draftRequest]);

  const persistDraft = useCallback((request: typeof draftRequest, serialized: string): Promise<void> => {
    const operation = draftSaveQueueRef.current.catch(() => undefined).then(async () => {
      if (!token || draftPersistenceDisabledRef.current) return;
      try {
        await axios.put(`${API_URL}/voluntarios/externo/borrador`, request, {
          headers: { Authorization: `Bearer ${token}` },
        });
        lastPersistedDraftRef.current = serialized;
      } catch {
        // Falla silenciosa: el usuario sigue llenando el formulario, se
        // reintentará en el siguiente cambio.
      }
    });
    draftSaveQueueRef.current = operation;
    return operation;
  }, [token]);

  const deleteDraft = useCallback(async () => {
    if (!token) return;
    draftPersistenceDisabledRef.current = true;
    await draftSaveQueueRef.current.catch(() => undefined);
    try {
      await axios.delete(`${API_URL}/voluntarios/externo/borrador`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // La postulación ya quedó guardada; el borrador expira solo si esto falla.
    }
  }, [token]);

  useEffect(() => {
    if (
      modoReintento
      || isLoadingExisting
      || !token
      || registroExitoso
      || !hasMeaningfulDraft
      || draftPersistenceDisabledRef.current
    ) {
      return;
    }

    if (lastPersistedDraftRef.current === null) {
      lastPersistedDraftRef.current = serializedDraft;
      return;
    }
    if (lastPersistedDraftRef.current === serializedDraft) return;

    const timeout = setTimeout(() => {
      if (!draftPersistenceDisabledRef.current) {
        void persistDraft(draftRequest, serializedDraft);
      }
    }, DRAFT_SAVE_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [draftRequest, hasMeaningfulDraft, isLoadingExisting, modoReintento, persistDraft, registroExitoso, serializedDraft, token]);

  // ─── ENVÍO ───
  const handleSubmit = async () => {
    if (!validarPaso4()) { setShowSubmitError(true); return; }
    setShowSubmitError(false);
    setIsSubmitting(true);
    try {
      const formData = new FormData();

      // 1. Empaquetar todas las respuestas en un solo objeto JSON
      const datosFormulario = {
        latitud: pinLocation.latitud,
        longitud: pinLocation.longitud,
        calle, numero, colonia, municipio, estado, referencia,
        tipoVivienda, subcategoriaVivienda, customViviendaInput,
        autorizacion, ubicacionAnimal, aceptaVisita,
        numAdultos, horasSolo, ninosEdades, otrosAnimales, vacunados, puedeSeparar,
        preferenciaEspecie, subcategoriaOtroEspecie, customOtroEspecieInput, preferenciaTamanio,
        tiempoResguardo, tiempoResguardoDias,
        checkAccesos, checkBardas, checkBalcones, checkEspacio,
        checkAislamiento, checkCuarentena, checkNoEntregar,
        nombreEmergencia, telEmergencia,
        consentimiento,
        eliminarVideo: videoEliminado,
        // Agrupamos los horarios en un solo JSON bonito
        horariosVisita: [
          { dia: horario1Dia, hora: horario1Hora },
          ...(horario2Dia ? [{ dia: horario2Dia, hora: horario2Hora }] : []),
          ...(horario3Dia ? [{ dia: horario3Dia, hora: horario3Hora }] : [])
        ]
      };

      // Adjuntamos todo el JSON como un solo campo de texto
      formData.append('datos', JSON.stringify(datosFormulario));

      // 2. Adjuntar los archivos multimedia (adaptado para Expo)
      const identificacionEsNueva =
        !!identificacionUrl && identificacionUrl !== identificacionOriginalUrl;
      const videoEsNuevo = !!videoUrl && videoUrl !== videoOriginalUrl;
      if (Platform.OS === 'web') {
        if (identificacionEsNueva) {
          const idRes = await fetch(identificacionUrl);
          formData.append('identificacion', await idRes.blob(), `ine_${Date.now()}.jpg`);
        }
        if (videoEsNuevo) {
          const vidRes = await fetch(videoUrl);
          formData.append('video', await vidRes.blob(), `video_${Date.now()}.mp4`);
        }
      } else {
        if (identificacionEsNueva) {
          formData.append('identificacion', { uri: identificacionUrl, name: `ine_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
        }
        if (videoEsNuevo) {
          formData.append('video', { uri: videoUrl, name: `video_${Date.now()}.mp4`, type: 'video/mp4' } as any);
        }
      }

      const addImageToForm = async (uri: string, fieldName: string) => {
        if (!uri || uri.startsWith('http')) return; // Evita enviar si es URL de BD
        if (Platform.OS === 'web') {
          const res = await fetch(uri);
          formData.append(fieldName, await res.blob(), `${fieldName}_${Date.now()}.jpg`);
        } else {
          formData.append(fieldName, { uri, name: `${fieldName}_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
        }
      };

      await addImageToForm(fotoAccesos, 'foto_accesos');
      await addImageToForm(fotoBardas, 'foto_bardas');
      await addImageToForm(fotoBalcones, 'foto_balcones');
      await addImageToForm(fotoEspacio, 'foto_espacio');

      // 3. Hacer la petición al endpoint que acabamos de crear en FastAPI
      const { data: resultadoGuardado } = await axios.post(`${API_URL}/voluntarios/externo/postular`, formData, {
        headers: { 
          Authorization: `Bearer ${token}` 
        } 
      });

      setIsSubmitting(false);
      setCorreccionActiva(Boolean(resultadoGuardado?.correccion));
      setRegistroExitoso(true);
      if (!modoReintento) void deleteDraft();

    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'Error al enviar.' });
      setIsSubmitting(false);
    }
  };

  // ─── COMPONENTES UI ───
  const SelectInput = ({ label, value, placeholder, onPress, error }: any) => (
    <View style={{ marginBottom: 16 }}>
      {label && <Text style={[styles.sectionLabel, { marginTop: 0 }]}>{label}</Text>}
      <TouchableOpacity onPress={onPress} style={[styles.selectInput, error ? { borderColor: COLORS.danger } : {}]}>
        <Text style={{ color: value ? COLORS.textDark : COLORS.textLight, fontSize: 15 }}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={20} color={COLORS.textLight} />
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={{ flexDirection: 'row', alignItems: 'center', zIndex: 10 }}>
        <TouchableOpacity onPress={handleAnterior} style={styles.headerBackButton}>
          <Feather name="chevron-left" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {modoReintento ? 'Actualizar casa temporal' : 'Postulación de casa temporal'}
          </Text>
          <Text style={styles.headerSubtitle}>Paso {paso} de {TOTAL_PASOS}: {PASO_NOMBRES[paso - 1]}</Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={handleCloseRequest} style={styles.closeButton}>
            <Feather name="x" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
      <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, marginTop: 18, zIndex: 10 }}>
        <View style={{ height: 4, backgroundColor: COLORS.secondary, borderRadius: 2, width: `${(paso / TOTAL_PASOS) * 100}%` }} />
      </View>
      <Image source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3047/3047928.png' }} style={styles.decorationImage} resizeMode="contain" />
    </View>
  );

  const renderChipOptions = (opciones: string[], state: string, setState: any, errorKey: string) => (
    <View style={styles.animalChips}>
      {opciones.map((op) => (
        <TouchableOpacity key={op} onPress={() => { setState(op); setErrors(prev => ({...prev, [errorKey]: ''})) }} 
          style={[styles.animalChip, { backgroundColor: state === op ? COLORS.primary : COLORS.grayLight }]}>
          <Text style={{ fontWeight: '700', fontSize: 14, color: state === op ? COLORS.bgWhite : COLORS.textLight }}>{op}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderCheckbox = (label: string, value: boolean, setValue: any, errorKey?: string) => (
    <View style={{ marginBottom: 12 }}>
      <TouchableOpacity onPress={() => { setValue(!value); if (errorKey) setErrors(prev => ({...prev, [errorKey]: ''})) }} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name={value ? "checkbox" : "square-outline"} size={24} color={value ? COLORS.primary : COLORS.textLight} />
        <Text style={{ marginLeft: 10, color: COLORS.textDark, flex: 1, fontSize: 15, lineHeight: 22 }}>{label}</Text>
      </TouchableOpacity>
      {errorKey && errors[errorKey] && <Text style={styles.errorText}>{errors[errorKey]}</Text>}
    </View>
  );

  const renderPaso1 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <FormSection title="Ubicación Física" subtitle="Ajusta el pin en el mapa en el lugar exacto de resguardo.">
        <Input placeholder="Buscar dirección" value={searchQuery} onChangeText={setSearchQuery} />
        {isSearching && <Text style={styles.searchingText}>Buscando...</Text>}
        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.map((result, idx) => (
              <TouchableOpacity key={idx} onPress={() => {
                handlePinLocationSelect(parseFloat(result.lat), parseFloat(result.lon));
                setSearchQuery(''); setSearchResults([]);
              }} style={[styles.searchResult, { borderBottomWidth: idx === searchResults.length - 1 ? 0 : 1 }]}>
                <Text style={styles.searchResultText}>{result.display_name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity onPress={handleGetLocation} style={styles.locationButton}>
          <Ionicons name="location" size={18} color={COLORS.bgTeal} />
          <Text style={styles.locationButtonText}>{isLoadingGps ? 'Obteniendo tu ubicación...' : 'Usar mi ubicación actual'}</Text>
        </TouchableOpacity>

        <View style={[styles.mapContainer, { borderWidth: errors.ubicacion ? 2 : 0, borderColor: COLORS.danger }]}>
          <LocationPickerMap selectedPosition={pinLocation} onLocationSelect={handlePinLocationSelect} />
        </View>
        {errors.ubicacion && <Text style={styles.errorText}>{errors.ubicacion}</Text>}

        {/* --- NUEVA TARJETA AZUL DE DIRECCIÓN CONFIRMADA --- */}
        {direccionConfirmada !== '' && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EAF6FF', padding: 10, borderRadius: 8, marginTop: 8, marginBottom: 16 }}>
            <Feather name="map-pin" size={14} color="#2C3E50" style={{ marginRight: 6, marginTop: 2 }} />
            <Text style={{ fontSize: 12, color: '#2C3E50', flex: 1 }}>
              Ubicación seleccionada: <Text style={{ fontWeight: '600' }}>{direccionConfirmada}</Text>
            </Text>
          </View>
        )}

        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}><Input label="Calle" value={calle} onChangeText={setCalle} /></View>
          <View style={styles.halfWidth}><Input label="Número" value={numero} onChangeText={setNumero} /></View>
        </View>
        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}><Input label="Colonia" value={colonia} onChangeText={setColonia} /></View>
          <View style={styles.halfWidth}><Input label="Municipio" value={municipio} onChangeText={setMunicipio} /></View>
        </View>
        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}><Input label="Estado" value={estado} onChangeText={setEstado} /></View>
          <View style={styles.halfWidth}><Input label="Referencia" value={referencia} onChangeText={setReferencia} /></View>
        </View>
      </FormSection>

      <Divider />

      <FormSection title="Detalles del Hogar">
        <Text style={styles.sectionLabel}>Tipo de vivienda</Text>
        {renderChipOptions(['Casa', 'Departamento', 'Otro'], tipoVivienda, setTipoVivienda, 'tipoVivienda')}
        
        {tipoVivienda === 'Otro' && (
          <View style={{ marginTop: 12, padding: 12, backgroundColor: COLORS.grayLight, borderRadius: 16 }}>
            <Text style={styles.sectionLabel}>¿Qué tipo de lugar es?</Text>
            {renderChipOptions(['Quinta', 'Local comercial', 'Rancho', 'Terreno/Lote', 'Oficina', 'Otra específica'], subcategoriaVivienda, setSubcategoriaVivienda, 'subcategoriaVivienda')}
            {subcategoriaVivienda === 'Otra específica' && (
              <View style={{ marginTop: 8 }}>
                <Input placeholder="Especifique el tipo de vivienda" value={customViviendaInput} onChangeText={(v) => {setCustomViviendaInput(v); setErrors(prev=>({...prev, customViviendaInput: ''}))}} error={errors.customViviendaInput} />
              </View>
            )}
            {errors.subcategoriaVivienda && <Text style={styles.errorText}>{errors.subcategoriaVivienda}</Text>}
          </View>
        )}
        {errors.tipoVivienda && <Text style={styles.errorText}>{errors.tipoVivienda}</Text>}

        <Text style={styles.sectionLabel}>¿Tienes autorización del propietario / roomies?</Text>
        {renderChipOptions(['Sí', 'No', 'Soy propietario único'], autorizacion, setAutorizacion, 'autorizacion')}
        {errors.autorizacion && <Text style={styles.errorText}>{errors.autorizacion}</Text>}

        <Text style={styles.sectionLabel}>¿Dónde permanecerá el animal?</Text>
        {renderChipOptions(['Interior', 'Patio protegido', 'Ambos'], ubicacionAnimal, setUbicacionAnimal, 'ubicacionAnimal')}
        {errors.ubicacionAnimal && <Text style={styles.errorText}>{errors.ubicacionAnimal}</Text>}

        <Text style={styles.sectionLabel}>¿Aceptas una visita de verificación presencial?</Text>
        {renderChipOptions(['Sí', 'No'], aceptaVisita, setAceptaVisita, 'aceptaVisita')}
        {errors.aceptaVisita && <Text style={styles.errorText}>{errors.aceptaVisita}</Text>}
      </FormSection>

      {showSubmitError && <Text style={styles.submitError}>Revisa los campos en rojo arriba.</Text>}
      <TouchableOpacity onPress={handleSiguiente} style={styles.submitButton}><Text style={styles.submitButtonText}>Siguiente →</Text></TouchableOpacity>
    </ScrollView>
  );

  const renderPaso2 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <FormSection title="Convivencia">
        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}>
            <SelectInput label="Adultos en el hogar (Mayores de 18 años)" placeholder="Selecciona" value={numAdultos} onPress={() => setSelectorActivo('adultos')} error={errors.numAdultos} />
          </View>
          <View style={styles.halfWidth}>
            <SelectInput label="Horas al día que el animal pasaría solo" placeholder="Selecciona" value={horasSolo} onPress={() => setSelectorActivo('horasSolo')} error={errors.horasSolo} />
          </View>
        </View>
        
        <SelectInput label="Niños en el hogar (Edades)" placeholder="Selecciona" value={ninosEdades} onPress={() => setSelectorActivo('ninos')} error={errors.ninosEdades} />
        <SelectInput label="Otros animales en casa" placeholder="Selecciona" value={otrosAnimales} onPress={() => setSelectorActivo('otrosAnimales')} error={errors.otrosAnimales} />
        
        <Text style={styles.sectionLabel}>¿Tus animales están vacunados y esterilizados?</Text>
        {renderChipOptions(['Sí', 'No', 'No aplica (No tengo)'], vacunados, setVacunados, 'vacunados')}
        {errors.vacunados && <Text style={styles.errorText}>{errors.vacunados}</Text>}

        <Text style={styles.sectionLabel}>¿Puedes aislar al animal recién llegado los primeros días?</Text>
        {renderChipOptions(['Sí', 'No'], puedeSeparar, setPuedeSeparar, 'puedeSeparar')}
        {errors.puedeSeparar && <Text style={styles.errorText}>{errors.puedeSeparar}</Text>}
      </FormSection>

      <Divider />

      <FormSection title="Capacidad de Resguardo">
        <View style={{ backgroundColor: 'rgba(236, 128, 43, 0.1)', padding: 16, borderRadius: 16, marginBottom: 16 }}>
          <Text style={{ color: COLORS.primary, fontWeight: '700' }}>🐾 Capacidad inicial limitada a 1 animal por seguridad. La asociación podrá autorizar más tras la verificación.</Text>
        </View>

        <Text style={styles.sectionLabel}>Preferencias de especie (Selecciona varias si aplica)</Text>
        <View style={styles.animalChips}>
          {['Perros', 'Gatos', 'Otros'].map(op => {
            const isSelected = preferenciaEspecie.includes(op);
            return (
              <TouchableOpacity key={op} onPress={() => toggleArray(op, preferenciaEspecie, setPreferenciaEspecie, 'preferenciaEspecie')} style={[styles.animalChip, { backgroundColor: isSelected ? COLORS.primary : COLORS.grayLight }]}>
                <Text style={{ fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.bgWhite : COLORS.textLight }}>{op}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {errors.preferenciaEspecie && <Text style={styles.errorText}>{errors.preferenciaEspecie}</Text>}

        {preferenciaEspecie.includes('Otros') && (
          <View style={{ marginTop: 12, padding: 12, backgroundColor: COLORS.grayLight, borderRadius: 16 }}>
            <Text style={styles.sectionLabel}>Categoría del animal</Text>
            {renderChipOptions(['Ave', 'Reptil', 'Roedor', 'Fauna silvestre', 'Otro'], subcategoriaOtroEspecie, setSubcategoriaOtroEspecie, 'subcategoriaOtroEspecie')}
            {subcategoriaOtroEspecie === 'Otro' && (
              <View style={{ marginTop: 8 }}>
                <Input placeholder="Especifica qué animal" value={customOtroEspecieInput} onChangeText={(v) => {setCustomOtroEspecieInput(v); setErrors(prev=>({...prev, customOtroEspecieInput: ''}))}} error={errors.customOtroEspecieInput} />
              </View>
            )}
            {errors.subcategoriaOtroEspecie && <Text style={styles.errorText}>{errors.subcategoriaOtroEspecie}</Text>}
          </View>
        )}

        <Text style={styles.sectionLabel}>Tamaños que puedes manejar</Text>
        <View style={styles.animalChips}>
          {['Chico', 'Mediano', 'Grande'].map(op => {
            const isSelected = preferenciaTamanio.includes(op);
            return (
              <TouchableOpacity key={op} onPress={() => toggleArray(op, preferenciaTamanio, setPreferenciaTamanio, 'preferenciaTamanio')} style={[styles.animalChip, { backgroundColor: isSelected ? COLORS.secondary : COLORS.grayLight }]}>
                <Text style={{ fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.textDark : COLORS.textLight }}>{op}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {errors.preferenciaTamanio && <Text style={styles.errorText}>{errors.preferenciaTamanio}</Text>}

        <Text style={styles.sectionLabel}>Tiempo máximo de resguardo ofrecido (Días)</Text>
        <Input 
          keyboardType="numeric" 
          value={tiempoResguardoDias} 
          onChangeText={(v) => {
            setTiempoResguardoDias(v.replace(/[^0-9]/g, '')); 
            setErrors(prev=>({...prev, tiempoResguardoDias: ''}));
          }} 
          error={errors.tiempoResguardoDias} 
          placeholder="Ej. 5" 
        />
      </FormSection>

      {showSubmitError && <Text style={styles.submitError}>Revisa los campos en rojo arriba.</Text>}
      <TouchableOpacity onPress={handleSiguiente} style={styles.submitButton}><Text style={styles.submitButtonText}>Siguiente →</Text></TouchableOpacity>
    </ScrollView>
  );

  const renderSecurityCheckbox = (label: string, recommendation: string, checked: boolean, setChecked: any, photoUrl: string, setPhotoUrl: any, errorKeyPhoto: string) => (
    <View style={{ marginBottom: 16 }}>
      <TouchableOpacity onPress={() => handleSeguridadCheck(setChecked, !checked)} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name={checked ? "checkbox" : "square-outline"} size={24} color={checked ? COLORS.primary : COLORS.textLight} />
        <Text style={{ marginLeft: 10, color: COLORS.textDark, flex: 1, fontSize: 15, lineHeight: 22 }}>{label}</Text>
      </TouchableOpacity>
      {checked && (
        <View style={{ marginLeft: 34, marginTop: 8, padding: 12, backgroundColor: COLORS.grayLight, borderRadius: 12 }}>
          <Text style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 8 }}><Ionicons name="information-circle" /> {recommendation}</Text>
          {photoUrl ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Image source={{ uri: photoUrl }} style={{ width: 60, height: 60, borderRadius: 8 }} />
              <TouchableOpacity onPress={() => setPhotoUrl('')}><Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 12 }}>Eliminar foto</Text></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => handlePickSecurityPhoto(setPhotoUrl, errorKeyPhoto)} style={{ padding: 10, borderWidth: 1, borderColor: COLORS.primary, borderStyle: 'dashed', borderRadius: 8, alignItems: 'center' }}>
              <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '700' }}><Ionicons name="camera" /> Subir foto de evidencia</Text>
            </TouchableOpacity>
          )}
          {errors[errorKeyPhoto] && <Text style={styles.errorText}>{errors[errorKeyPhoto]}</Text>}
        </View>
      )}
    </View>
  );

  const renderPaso3 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <FormSection title="Checklist de Seguridad" subtitle="Selecciona las opciones con las que cumples (Obligatorio marcar al menos una):">
        {renderSecurityCheckbox('Puertas, ventanas y accesos seguros para evitar escapes.', 'Muestra una foto de la puerta principal o ventanas clave cerradas.', checkAccesos, setCheckAccesos, fotoAccesos, setFotoAccesos, 'fotoAccesos')}
        {renderSecurityCheckbox('Bardas o protecciones suficientes de acuerdo a las especies que acepto.', 'Muestra la altura de las bardas en patios o muros perimetrales.', checkBardas, setCheckBardas, fotoBardas, setFotoBardas, 'fotoBardas')}
        {renderSecurityCheckbox('NO tengo balcones abiertos, azoteas accesibles, albercas sin protección ni salida directa a la calle.', 'Muestra una foto general de la vivienda o fachada.', checkBalcones, setCheckBalcones, fotoBalcones, setFotoBalcones, 'fotoBalcones')}
        {renderSecurityCheckbox('Cuento con espacio ventilado, con sombra, agua constante y zona de descanso.', 'Muestra el área específica donde el animal pasará la mayor parte del tiempo.', checkEspacio, setCheckEspacio, fotoEspacio, setFotoEspacio, 'fotoEspacio')}
        {renderCheckbox('No cumplo con ninguna de las anteriores.', checkNingunoSeguridad, handleNingunoSeguridad)}
        {errors.seguridadGeneral && <Text style={styles.errorText}>{errors.seguridadGeneral}</Text>}
      </FormSection>

      <Divider />

      <FormSection title="Compromisos Operativos" subtitle="Selecciona las opciones con las que cumples (Obligatorio marcar al menos una):">
        {renderCheckbox('Tengo la posibilidad de aislar al animal en sus primeros días de llegada.', checkAislamiento, (v: boolean) => handleCompromisoCheck(setCheckAislamiento, v))}
        {renderCheckbox('Acepto mantener la cuarentena preventiva y seguir todas las indicaciones médicas de la asociación.', checkCuarentena, (v: boolean) => handleCompromisoCheck(setCheckCuarentena, v))}
        {renderCheckbox('Me comprometo a NO entregar, dar en adopción ni trasladar al animal sin autorización previa de PawAlert o la Asociación.', checkNoEntregar, (v: boolean) => handleCompromisoCheck(setCheckNoEntregar, v))}
        {renderCheckbox('No cumplo con ninguna de las anteriores.', checkNingunoCompromiso, handleNingunoCompromiso)}
        {errors.compromisosGeneral && <Text style={styles.errorText}>{errors.compromisosGeneral}</Text>}
      </FormSection>

      <Divider />

      <FormSection title="Contacto de Emergencia" subtitle="Por seguridad del rescatista en campo.">
        <Input label="Nombre de contacto" placeholder="Ej. Juan Pérez" value={nombreEmergencia} onChangeText={(v) => handleRegexChange(v, setNombreEmergencia, 'nombreEmergencia', /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'Solo letras')} error={errors.nombreEmergencia} />
        <Input label="Teléfono de emergencia" placeholder="Ej. 2221234567" value={telEmergencia} onChangeText={(v) => handleRegexChange(v, setTelEmergencia, 'telEmergencia', /^\d{10}$/, '10 dígitos numéricos')} keyboardType="numeric" maxLength={10} error={errors.telEmergencia} />
      </FormSection>

      {showSubmitError && <Text style={styles.submitError}>Revisa los campos en rojo arriba.</Text>}
      <TouchableOpacity onPress={handleSiguiente} style={styles.submitButton}><Text style={styles.submitButtonText}>Siguiente →</Text></TouchableOpacity>
    </ScrollView>
  );

  const renderPaso4 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <FormSection title="Evidencia de Identidad">
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 13, color: COLORS.textLight, lineHeight: 20, flex: 1 }}>
            Solo el equipo verificador verá este documento para validar tu postulación.
          </Text>
          <TouchableOpacity onPress={() => setShowInfoIdentidad(true)} style={{ marginLeft: 8, padding: 4 }}>
            <Ionicons name="information-circle" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {identificacionUrl ? (
          <View style={styles.fotoItem}>
            <Image source={{ uri: identificacionUrl }} style={styles.fotoImage} />
            <View style={styles.fotoContent}>
              <Text style={{ fontWeight: '700', color: COLORS.textDark, marginBottom: 4 }}>Identificación cargada</Text>
              <TouchableOpacity onPress={() => setIdentificacionUrl('')}><Text style={styles.fotoDelete}>Eliminar y re-subir</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={handlePickIdentificacion} style={[styles.addPhotoButton, { width: '100%', borderColor: errors.identificacionUrl ? COLORS.danger : COLORS.primary }]}>
            <Text style={styles.addPhotoText}><Ionicons name="card" size={16}/> Subir Foto de INE/Pasaporte</Text>
          </TouchableOpacity>
        )}
        {errors.identificacionUrl && <Text style={styles.errorText}>{errors.identificacionUrl}</Text>}
      </FormSection>

      <Divider />

      <FormSection 
        title="Recorrido del Hogar *" 
        subtitle="Un video corto mostrando los accesos y el lugar donde dormirá el animal es obligatorio para tu aprobación."
      >
        <View style={{ backgroundColor: 'rgba(236, 128, 43, 0.1)', padding: 12, borderRadius: 12, marginBottom: 16 }}>
          <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 13 }}>
            <Ionicons name="information-circle" size={14} /> Nota: El peso recomendado para el video es menor a 50MB.
          </Text>
        </View>

        {videoUrl ? (
          <View style={[styles.fotoItem, { backgroundColor: 'rgba(102, 188, 180, 0.1)' }]}>
            <Ionicons name="videocam" size={32} color={COLORS.bgTeal} style={{ marginHorizontal: 16 }} />
            <View style={styles.fotoContent}>
              <Text style={{ fontWeight: '700', color: COLORS.textDark, marginBottom: 4 }}>Video cargado</Text>
              <TouchableOpacity
                onPress={() => {
                  setVideoUrl('');
                  setVideoEliminado(!!videoOriginalUrl);
                }}
              >
                <Text style={styles.fotoDelete}>Eliminar video</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={handlePickVideo} style={[styles.addPhotoButton, { width: '100%', borderColor: errors.videoUrl ? COLORS.danger : COLORS.bgTeal }]}>
            <Text style={{ color: errors.videoUrl ? COLORS.danger : COLORS.bgTeal, fontWeight: '700' }}><Ionicons name="videocam" size={16}/> Subir Video Recorrido</Text>
          </TouchableOpacity>
        )}
        {errors.videoUrl && <Text style={styles.errorText}>{errors.videoUrl}</Text>}
      </FormSection>

      <Divider />

      <FormSection title="Disponibilidad para Visita" subtitle="Brinda 3 opciones de horarios (Día y hora) para tu visita de verificación. Horarios de visita disponibles: 7:00 AM a 7:00 PM.">
        <Text style={[styles.sectionLabel, { marginTop: 0 }]}>Opción 1 *</Text>
        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}><SelectInput placeholder="Día" value={horario1Dia} onPress={() => setSelectorActivo('dia1')} /></View>
          <View style={styles.halfWidth}><SelectInput placeholder="Hora" value={horario1Hora} onPress={() => setSelectorActivo('hora1')} /></View>
        </View>
        
        <Text style={[styles.sectionLabel, { marginTop: 0 }]}>Opción 2</Text>
        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}><SelectInput placeholder="Día" value={horario2Dia} onPress={() => setSelectorActivo('dia2')} /></View>
          <View style={styles.halfWidth}><SelectInput placeholder="Hora" value={horario2Hora} onPress={() => setSelectorActivo('hora2')} /></View>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 0 }]}>Opción 3</Text>
        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}><SelectInput placeholder="Día" value={horario3Dia} onPress={() => setSelectorActivo('dia3')} /></View>
          <View style={styles.halfWidth}><SelectInput placeholder="Hora" value={horario3Hora} onPress={() => setSelectorActivo('hora3')} /></View>
        </View>

        {errors.horarios && <Text style={[styles.errorText, {marginTop: -10}]}>{errors.horarios}</Text>}
      </FormSection>

      <FormSection title="Términos Finales">
        {renderCheckbox('Doy mi consentimiento para el tratamiento de la evidencia proporcionada y acepto coordinar la visita presencial a mi hogar.', consentimiento, setConsentimiento, 'consentimiento')}
      </FormSection>

      {showSubmitError && <Text style={styles.submitError}>Revisa los campos en rojo arriba.</Text>}
      <TouchableOpacity onPress={handleSubmit} disabled={isSubmitting} style={[styles.submitButton, { opacity: isSubmitting ? 0.7 : 1 }]}>
        {isSubmitting ? <ActivityIndicator color={COLORS.bgWhite} /> : <Text style={styles.submitButtonText}>Enviar Postulación</Text>}
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={[styles.outerContainer, { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any]}>
      <Toast toast={toast} translateY={translateY} />

      {isLoadingExisting ? (
        <View style={[styles.centeredContent, { maxWidth: 500 }]}>
          <View style={[styles.cardContainer, { padding: 40, alignItems: 'center', justifyContent: 'center' }]}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ marginTop: 16, color: COLORS.textLight, fontWeight: '700' }}>
              Recuperando tu información…
            </Text>
          </View>
        </View>
      ) : registroExitoso ? (
         <View style={[styles.centeredContent, { maxWidth: 500 }]}>
           <View style={[styles.cardContainer, { padding: 40, alignItems: 'center' }]}>
             <Ionicons name="checkmark-circle" size={80} color={COLORS.bgTeal} style={{ marginBottom: 20 }} />
             <Text style={{ fontSize: 24, fontWeight: '900', color: COLORS.textDark, textAlign: 'center', marginBottom: 16 }}>
               {modoReintento ? '¡Información actualizada!' : '¡Información guardada!'}
             </Text>
             <Text style={{ fontSize: 16, color: COLORS.textLight, textAlign: 'center', lineHeight: 24, marginBottom: 32 }}>
               {correccionActiva
                 ? 'Los cambios quedaron vinculados a la revisión de tu hogar. Puedes consultar el avance desde tu perfil.'
                 : modoReintento
                 ? 'Revisa tus capacidades para enviar nuevamente tu postulación.'
                 : 'Para terminar tu postulación, cuéntanos cómo puedes ayudar.'}
             </Text>
             <TouchableOpacity 
               onPress={() => {
                 if (onClose) onClose(); 
                 if (!correccionActiva) {
                   setTimeout(() => {
                     router.push('/capacidades' as any);
                   }, 150);
                 }
               }} 
               style={[styles.submitButton, { width: '100%' }]}
             >
               <Text style={styles.submitButtonText}>
                 {correccionActiva
                   ? 'Volver a mi perfil'
                   : modoReintento
                     ? 'Revisar mis capacidades'
                     : 'Completar mis capacidades'}
               </Text>
             </TouchableOpacity>
           </View>
         </View>
      ) : (
        <>
          <View style={[styles.centeredContent]}>
            <View style={styles.cardContainer}>
              {renderHeader()}
              <View style={styles.bodySection}>
                {paso === 1 && renderPaso1()}
                {paso === 2 && renderPaso2()}
                {paso === 3 && renderPaso3()}
                {paso === 4 && renderPaso4()}
              </View>
            </View>
          </View>

          {/* Modal Selectores Genérico */}
          <Modal visible={selectorActivo !== null} transparent animationType="fade" onRequestClose={() => setSelectorActivo(null)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Selecciona una opción</Text>
                <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
                  {getSelectorOptions().map((opcion) => (
                    <TouchableOpacity key={opcion} onPress={() => handleSelectorSelect(opcion)} style={styles.horaOption}>
                      <Text style={styles.horaText}>{opcion}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity onPress={() => setSelectorActivo(null)} style={styles.modalCancel}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Modal Información de Identidad */}
          <Modal visible={showInfoIdentidad} transparent animationType="fade" onRequestClose={() => setShowInfoIdentidad(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalContent}>
                <Ionicons name="shield-checkmark" size={48} color={COLORS.primary} style={{ alignSelf: 'center', marginBottom: 16 }} />
                <Text style={styles.modalTitle}>Verificación de Identidad</Text>
                
                <Text style={{ fontSize: 15, color: COLORS.textDark, marginBottom: 12, fontWeight: '700' }}>
                  Documentos válidos:
                </Text>
                <Text style={{ fontSize: 14, color: COLORS.textLight, marginBottom: 20, lineHeight: 22 }}>
                  • Credencial para votar (INE) {"\n"}
                  • Pasaporte vigente {"\n"}
                  • Cédula Profesional con fotografía
                </Text>

                <View style={{ backgroundColor: 'rgba(236, 128, 43, 0.1)', padding: 16, borderRadius: 16, marginBottom: 24 }}>
                  <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 14, lineHeight: 20 }}>
                    ¡Importante! Una vez que nuestro equipo revise y verifique tu identidad, este documento se borrará permanentemente de nuestra base de datos por tu seguridad y privacidad.
                  </Text>
                </View>

                <TouchableOpacity onPress={() => setShowInfoIdentidad(false)} style={styles.submitButton}>
                  <Text style={styles.submitButtonText}>Entendido</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal visible={showCloseConfirm} transparent animationType="fade" onRequestClose={() => setShowCloseConfirm(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.confirmModal}>
                <Text style={styles.confirmTitle}>¿Seguro que deseas salir?</Text>
                <Text style={styles.confirmMessage}>Los datos ingresados se perderán y tendrás que empezar de nuevo.</Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity onPress={() => setShowCloseConfirm(false)} style={styles.confirmButtonCancel}>
                    <Text style={styles.confirmButtonCancelText}>Me quedo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setShowCloseConfirm(false); if (onClose) onClose(); }} style={styles.confirmButtonExit}>
                    <Text style={styles.confirmButtonExitText}>Sí, salir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

// ── Componentes internos ──────
function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.formSection}>
      <Text style={styles.formSectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.formSectionSubtitle}>{subtitle}</Text>}
      {children}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ── Estilos ────────────────────────────────
const styles = StyleSheet.create({
  outerContainer: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  centeredContent: { width: '100%', maxWidth: FORM_MAX_WIDTH, maxHeight: '90%', alignSelf: 'center' },
  cardContainer: { flex: 1, backgroundColor: COLORS.bgWhite, borderRadius: 32, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 15, flexDirection: 'column' },
  headerSection: { paddingHorizontal: 32, paddingTop: 24, paddingBottom: 32, backgroundColor: COLORS.bgTeal, position: 'relative', zIndex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.bgWhite },
  headerSubtitle: { fontSize: 13, fontWeight: '600', color: COLORS.bgWhite, opacity: 0.9, marginTop: 4 },
  headerBackButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  closeButton: { backgroundColor: 'rgba(255,255,255,0.3)', padding: 8, borderRadius: 20 },
  decorationImage: { width: 120, height: 120, position: 'absolute', bottom: -10, right: 30, zIndex: 0 },
  bodySection: { flex: 1, backgroundColor: COLORS.bgWhite, borderTopLeftRadius: 40, borderTopRightRadius: 40, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 20, zIndex: 2 },
  scrollContent: { paddingBottom: 40 },
  formSection: { marginBottom: 24 },
  formSectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 },
  formSectionSubtitle: { fontSize: 13, color: COLORS.textLight, marginBottom: 16, lineHeight: 20 },
  rowContainer: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  halfWidth: { flex: 1 },
  charCounter: { textAlign: 'right', color: COLORS.textLight, fontSize: 12, marginTop: -10, marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8, marginTop: 8 },
  logoPreview: { alignSelf: 'flex-start', position: 'relative', marginBottom: 16 },
  logoImage: { width: 100, height: 100, borderRadius: 30 },
  logoDeleteButton: { position: 'absolute', top: -10, right: -10, backgroundColor: COLORS.bgWhite, padding: 6, borderRadius: 20 },
  uploadButton: { backgroundColor: COLORS.grayLight, height: 100, width: 150, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  uploadText: { color: COLORS.textLight, fontWeight: '600', marginTop: 4 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 24 },
  daysContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  dayChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  dayChipText: { fontWeight: '700', fontSize: 13 },
  timeContainer: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  timeLabel: { fontSize: 12, color: COLORS.textLight, marginBottom: 4, fontWeight: '700' },
  timeButton: { backgroundColor: COLORS.grayLight, borderRadius: 16, padding: 16 },
  timeButtonText: { fontWeight: '600' },
  animalLabel: { marginTop: 24 },
  required: { color: COLORS.danger },
  animalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  animalChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  errorText: { color: COLORS.danger, fontSize: 12, marginTop: 4, marginBottom: 16 },
  searchingText: { fontSize: 12, color: COLORS.textLight, marginTop: -8, marginBottom: 10 },
  searchResults: { backgroundColor: COLORS.bgWhite, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, marginTop: -10, marginBottom: 16, overflow: 'hidden' },
  searchResult: { padding: 14, borderBottomColor: COLORS.grayLight },
  searchResultText: { fontSize: 13, color: COLORS.textDark },
  locationButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  locationButtonText: { fontSize: 14, color: COLORS.bgTeal, fontWeight: '700', marginLeft: 4 },
  mapContainer: { borderRadius: 24, overflow: 'hidden', marginBottom: 8 },
  directionConfirm: { backgroundColor: 'rgba(102, 188, 180, 0.1)', padding: 12, borderRadius: 12, marginBottom: 16 },
  directionConfirmText: { fontSize: 13, color: COLORS.textDark },
  fotoItem: { flexDirection: 'row', gap: 16, backgroundColor: COLORS.grayLight, padding: 12, borderRadius: 20, marginBottom: 12, alignItems: 'center' },
  fotoImage: { width: 70, height: 70, borderRadius: 12 },
  fotoContent: { flex: 1, justifyContent: 'center' },
  fotoInput: { fontSize: 13, color: COLORS.textDark, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 4, marginBottom: 8 },
  fotoDelete: { color: COLORS.danger, fontWeight: '700', fontSize: 12 },
  addPhotoButton: { padding: 16, width: 200, backgroundColor: 'rgba(236, 128, 43, 0.1)', borderRadius: 20, alignItems: 'center', borderWidth: 2, borderColor: COLORS.primary, borderStyle: 'dashed' },
  addPhotoText: { color: COLORS.primary, fontWeight: '700' },
  submitError: { color: COLORS.danger, textAlign: 'center', marginBottom: 12, fontWeight: '700', fontSize: 14 },
  submitButton: { backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 24, alignItems: 'center', marginBottom: 16 },
  submitButtonText: { color: COLORS.bgWhite, fontWeight: '900', fontSize: 18 },
  
  // Estilos Modal Selectores
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: COLORS.bgWhite, width: '100%', maxWidth: 400, borderRadius: 24, padding: 32, maxHeight: '60%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', marginBottom: 20 },
  modalScroll: { marginBottom: 16 },
  horaOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  horaText: { fontSize: 16, color: COLORS.textDark, textAlign: 'center', fontWeight: '500' },
  modalCancel: { alignItems: 'center', marginTop: 20, backgroundColor: COLORS.grayLight, padding: 16, borderRadius: 20 },
  modalCancelText: { color: COLORS.textDark, fontWeight: '700' },
  
  // Custom Select Input Style
  selectInput: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 16, padding: 16, backgroundColor: COLORS.bgWhite, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  confirmModal: { backgroundColor: COLORS.bgWhite, borderRadius: 32, padding: 32, width: '100%', maxWidth: 400 },
  confirmTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', marginBottom: 12 },
  confirmMessage: { fontSize: 15, color: COLORS.textLight, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  confirmButtons: { flexDirection: 'row', gap: 12 },
  confirmButtonCancel: { flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: COLORS.grayLight, alignItems: 'center' },
  confirmButtonCancelText: { color: COLORS.textDark, fontWeight: '700' },
  confirmButtonExit: { flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: COLORS.danger, alignItems: 'center' },
  confirmButtonExitText: { color: COLORS.bgWhite, fontWeight: '700' },
});
