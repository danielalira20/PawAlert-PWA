import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  border: '#E5E7EB',
  cardBg: '#FFF9F1',
};

const PASOS = [
  'Tus tiempos',
  'Tu zona y movilidad',
  'Tu experiencia',
  'Equipo y bienestar',
  'Cómo contactarte',
  'Para conocerte mejor',
];

type Option = { value: string; label: string; description?: string };

const DIAS: Option[] = [
  { value: 'lun', label: 'Lunes' },
  { value: 'mar', label: 'Martes' },
  { value: 'mie', label: 'Miércoles' },
  { value: 'jue', label: 'Jueves' },
  { value: 'vie', label: 'Viernes' },
  { value: 'sab', label: 'Sábado' },
  { value: 'dom', label: 'Domingo' },
];

const FRANJAS: Option[] = [
  { value: 'matutino', label: 'Por la mañana', description: '6:00–12:00' },
  { value: 'vespertino', label: 'Por la tarde', description: '12:00–18:00' },
  { value: 'nocturno', label: 'Por la noche', description: '18:00–22:00' },
  { value: 'madrugada', label: 'De madrugada', description: '22:00–6:00' },
];

const TIEMPOS_REACCION: Option[] = [
  { value: 'inmediata', label: 'De inmediato' },
  { value: 'una_hora', label: 'En alrededor de 1 hora' },
  { value: 'tres_horas', label: 'En unas 3 horas' },
  { value: 'un_dia', label: 'Necesito aviso con un día de anticipación' },
];

const URGENCIAS: Option[] = [
  { value: 'si', label: 'Sí' },
  { value: 'ocasional', label: 'Solo en algunas ocasiones' },
  { value: 'no', label: 'No' },
];

const MEDIOS_TRANSPORTE: Option[] = [
  { value: 'automovil', label: 'Auto propio' },
  { value: 'motocicleta', label: 'Motocicleta' },
  { value: 'transporte_publico', label: 'Transporte público' },
  { value: 'bicicleta', label: 'Bicicleta' },
  { value: 'a_pie', label: 'A pie' },
  { value: 'depende_terceros', label: 'Necesito apoyo de alguien más' },
];

const TAMANIOS: Option[] = [
  { value: 'pequeno', label: 'Pequeño' },
  { value: 'mediano', label: 'Mediano' },
  { value: 'grande', label: 'Grande' },
];

const ESPECIES: Option[] = [
  { value: 'perro', label: 'Perros' },
  { value: 'gato', label: 'Gatos' },
  { value: 'otro', label: 'Otras especies' },
];

const OTRAS_ESPECIES: Option[] = [
  { value: 'aves', label: 'Aves' },
  { value: 'pequenos_mamiferos', label: 'Conejos y pequeños mamíferos' },
  { value: 'reptiles', label: 'Reptiles' },
  { value: 'granja', label: 'Animales de granja' },
  { value: 'otra', label: 'Otra' },
];

const PRIMEROS_AUXILIOS: Option[] = [
  { value: 'sin_formacion', label: 'Todavía no tengo experiencia' },
  { value: 'basico', label: 'Conozco lo básico' },
  { value: 'formal', label: 'He tomado una capacitación formal' },
];

const EXPERIENCIAS_CAMPO: Option[] = [
  { value: 'docil_estable', label: 'Animales dóciles y estables' },
  { value: 'cachorros_neonatos', label: 'Cachorros o neonatos' },
  { value: 'enfermedad_cuarentena', label: 'Animales enfermos o que necesitan estar separados' },
  { value: 'reactivo_agresivo', label: 'Animales nerviosos, defensivos o agresivos' },
  { value: 'lesion_movilidad_reducida', label: 'Animales lesionados o con dificultad para moverse' },
  { value: 'sin_experiencia', label: 'Sin experiencia en estas situaciones' },
];

const VIAS_TRATAMIENTO: Option[] = [
  { value: 'oral', label: 'Medicamentos por boca' },
  { value: 'topica', label: 'Cremas o tratamientos en la piel' },
  { value: 'inyectable_avanzado', label: 'Inyecciones o tratamientos avanzados' },
];

const TRAYECTORIAS: Option[] = [
  { value: 'mascotas_propias', label: 'Cuidando a mis propias mascotas' },
  { value: 'rescate_independiente', label: 'Ayudando en rescates por mi cuenta' },
  { value: 'casa_temporal', label: 'Ofreciendo casa temporal' },
  { value: 'refugio_asociacion', label: 'Colaborando con refugios u organizaciones' },
  { value: 'clinica_veterinaria', label: 'Trabajando en una clínica veterinaria' },
  { value: 'sin_experiencia', label: 'Aún no tengo experiencia' },
];

const ANIOS_EXPERIENCIA: Option[] = [
  { value: 'sin_experiencia', label: 'Sin experiencia' },
  { value: 'menos_1', label: 'Menos de 1 año' },
  { value: 'entre_1_3', label: 'De 1 a 3 años' },
  { value: 'mas_3', label: 'Más de 3 años' },
];

const EQUIPAMIENTO: Option[] = [
  { value: 'transportadora_chica', label: 'Transportadora chica' },
  { value: 'transportadora_grande', label: 'Transportadora grande' },
  { value: 'jaula_contencion', label: 'Jaula de contención' },
  { value: 'correas_arneses', label: 'Correas, arneses o pecheras' },
  { value: 'proteccion_vehiculo', label: 'Protección interior para vehículo' },
  { value: 'guantes_manejo', label: 'Guantes de manejo especializado' },
  { value: 'sin_equipo', label: 'Sin equipamiento propio' },
];

const RESTRICCIONES: Option[] = [
  { value: 'ninguna', label: 'Ninguna' },
  { value: 'evitar_carga_mayor_5kg', label: 'Evitar cargas mayores a 5 kg' },
  { value: 'evitar_carga_mayor_15kg', label: 'Evitar cargas mayores a 15 kg' },
  { value: 'evitar_escaleras', label: 'Evitar escaleras' },
  { value: 'evitar_caminatas_prolongadas', label: 'Evitar caminatas prolongadas' },
  { value: 'evitar_pie_prolongado', label: 'Evitar permanecer de pie por mucho tiempo' },
  { value: 'prefiere_comentarlo', label: 'Prefiero comentarlo con la asociación' },
];

const CAPACITACION: Option[] = [
  { value: 'si', label: 'Sí' },
  { value: 'solo_virtual', label: 'Solo si es virtual' },
  { value: 'no', label: 'No por el momento' },
];

const CANALES: Option[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'llamada', label: 'Llamada telefónica' },
  { value: 'plataforma', label: 'Notificación en PawAlert' },
];

const PROYECCIONES: Option[] = [
  { value: 'ocasional', label: 'De vez en cuando' },
  { value: 'uno_tres_meses', label: 'De 1 a 3 meses' },
  { value: 'tres_seis_meses', label: 'De 3 a 6 meses' },
  { value: 'mas_seis_meses', label: 'Más de 6 meses' },
  { value: 'continua', label: 'De forma continua' },
];

const MOTIVACIONES: Option[] = [
  { value: 'salvar_animales', label: 'Ayudar a animales en peligro' },
  { value: 'apoyar_colectivos', label: 'Apoyar a asociaciones de mi comunidad' },
  { value: 'aplicar_conocimientos', label: 'Compartir lo que ya sé' },
  { value: 'adquirir_experiencia', label: 'Aprender y adquirir experiencia' },
  { value: 'impacto_social', label: 'Generar un cambio positivo' },
  { value: 'apoyar_recuperacion', label: 'Acompañar la recuperación de los animales' },
];

interface Props {
  onClose?: () => void;
  fromProfile?: boolean;
  esPostulacionNueva?: boolean;
}

function labels(values: string[], options: Option[]) {
  return values.map((value) => options.find((option) => option.value === value)?.label || value);
}

function franjasDesdeHorarioLegado(horarios: Array<{ de?: string; a?: string }>) {
  if (!horarios?.length) return [];
  const seleccionadas = new Set<string>();
  horarios.forEach(({ de = '00:00', a = '23:59' }) => {
    const inicio = Number(de.split(':')[0]);
    const fin = Number(a.split(':')[0]);
    if (inicio < 12 && fin >= 6) seleccionadas.add('matutino');
    if (inicio < 18 && fin >= 12) seleccionadas.add('vespertino');
    if (inicio < 22 && fin >= 18) seleccionadas.add('nocturno');
    if (inicio >= 22 || fin <= 6) seleccionadas.add('madrugada');
  });
  return [...seleccionadas];
}

export default function CapacidadesFormScreen({
  onClose,
  fromProfile = false,
  esPostulacionNueva = false,
}: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const formScrollRef = useRef<ScrollView>(null);

  const [paso, setPaso] = useState(1);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [postulacionCompletada, setPostulacionCompletada] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [dias, setDias] = useState<string[]>([]);
  const [franjas, setFranjas] = useState<string[]>([]);
  const [tiempoReaccion, setTiempoReaccion] = useState('');
  const [urgencias, setUrgencias] = useState('');
  const [maxCasos, setMaxCasos] = useState(1);

  const [ubicacion, setUbicacion] = useState({ latitud: 19.0414, longitud: -98.2063 });
  const [ubicacionConfirmada, setUbicacionConfirmada] = useState(false);
  const [isLoadingGps, setIsLoadingGps] = useState(false);
  const [radioMaxKm, setRadioMaxKm] = useState<number | null>(null);
  const [mediosTransporte, setMediosTransporte] = useState<string[]>([]);
  const [vehiculoApto, setVehiculoApto] = useState<boolean | null>(null);
  const [tamaniosTraslado, setTamaniosTraslado] = useState<string[]>([]);

  const [especiesManejo, setEspeciesManejo] = useState<string[]>([]);
  const [otrasEspecies, setOtrasEspecies] = useState<string[]>([]);
  const [tamaniosManejo, setTamaniosManejo] = useState<string[]>([]);
  const [primerosAuxilios, setPrimerosAuxilios] = useState('');
  const [experienciasCampo, setExperienciasCampo] = useState<string[]>([]);
  const [viasTratamiento, setViasTratamiento] = useState<string[]>([]);
  const [sinTratamientos, setSinTratamientos] = useState(false);
  const [trayectorias, setTrayectorias] = useState<string[]>([]);
  const [experienciaAnios, setExperienciaAnios] = useState('');

  const [equipamiento, setEquipamiento] = useState<string[]>([]);
  const [restricciones, setRestricciones] = useState<string[]>([]);
  const [aceptaCapacitacion, setAceptaCapacitacion] = useState('');

  const [canalContacto, setCanalContacto] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoTelefono, setContactoTelefono] = useState('');
  const [compromisoComunicacion, setCompromisoComunicacion] = useState(false);
  const [compromisoNotificar, setCompromisoNotificar] = useState(false);
  const [proyeccion, setProyeccion] = useState('');

  const [motivaciones, setMotivaciones] = useState<string[]>([]);
  const [comentarios, setComentarios] = useState('');
  const [aceptoTerminos, setAceptoTerminos] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      formScrollRef.current?.scrollTo({ y: 0, animated: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [paso, mostrarConfirmacion]);

  useEffect(() => {
    const cargar = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const { data } = await axios.get(`${API_URL}/voluntarios/me/capacidades`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const disponibilidad = data?.disponibilidad || {};
        const tieneDatosV2 =
          data?.radio_max_km != null ||
          data?.tiempo_reaccion != null ||
          (data?.especies_manejo?.length ?? 0) > 0;

        setDias(disponibilidad.dias || []);
        setFranjas(
          disponibilidad.franjas?.length
            ? disponibilidad.franjas
            : franjasDesdeHorarioLegado(disponibilidad.horarios || [])
        );
        setTiempoReaccion(data?.tiempo_reaccion || '');
        setUrgencias(data?.disponibilidad_urgencias || '');
        setMaxCasos(data?.max_casos_simultaneos || 1);

        if (data?.latitud != null && data?.longitud != null) {
          setUbicacion({
            latitud: Number(data.latitud),
            longitud: Number(data.longitud),
          });
          setUbicacionConfirmada(true);
        }
        setRadioMaxKm(data?.radio_max_km ?? null);
        setMediosTransporte(data?.medios_transporte || []);
        setVehiculoApto(
          tieneDatosV2
            ? Boolean(data?.vehiculo_apto_traslado)
            : data?.tiene_vehiculo == null
              ? null
              : Boolean(data.tiene_vehiculo)
        );
        setTamaniosTraslado(data?.tamanios_traslado || []);

        setEspeciesManejo(
          data?.especies_manejo?.length ? data.especies_manejo : data?.especies || []
        );
        setOtrasEspecies(data?.otras_especies_manejo || []);
        setTamaniosManejo(
          data?.tamanios_manejo?.length ? data.tamanios_manejo : data?.tamanios || []
        );
        setPrimerosAuxilios(data?.primeros_auxilios_nivel || '');
        setExperienciasCampo(data?.experiencias_campo || []);
        setViasTratamiento(data?.vias_tratamiento || []);
        setSinTratamientos(
          tieneDatosV2 && (data?.vias_tratamiento?.length ?? 0) === 0
        );
        setTrayectorias(data?.trayectoria_tipos || []);
        setExperienciaAnios(data?.experiencia_anios || '');

        setEquipamiento(data?.equipamiento || []);
        setRestricciones(data?.restricciones_fisicas || []);
        setAceptaCapacitacion(data?.acepta_capacitacion || '');

        setCanalContacto(data?.canal_contacto || '');
        setContactoNombre(data?.contacto_emergencia_nombre || '');
        setContactoTelefono(data?.contacto_emergencia_telefono || '');
        setCompromisoComunicacion(Boolean(data?.compromiso_comunicacion));
        setCompromisoNotificar(Boolean(data?.compromiso_notificar));
        setProyeccion(data?.proyeccion_colaboracion || '');
        setMotivaciones(data?.motivaciones || []);
        setComentarios(data?.comentarios_adicionales || '');
        setAceptoTerminos(Boolean(data?.acepto_terminos));
      } catch (error) {
        console.error('Error cargando capacidades:', error);
      } finally {
        setIsLoading(false);
      }
    };
    cargar();
  }, [token]);

  const toggle = (
    value: string,
    selected: string[],
    setter: (next: string[]) => void,
    exclusiveValue?: string
  ) => {
    if (value === exclusiveValue) {
      setter(selected.includes(value) ? [] : [value]);
      return;
    }
    const withoutExclusive = exclusiveValue
      ? selected.filter((item) => item !== exclusiveValue)
      : selected;
    setter(
      withoutExclusive.includes(value)
        ? withoutExclusive.filter((item) => item !== value)
        : [...withoutExclusive, value]
    );
  };

  const handleGetLocation = async () => {
    setIsLoadingGps(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        showToast({
          type: 'error',
          title: 'Permiso denegado',
          message: 'No pudimos acceder a tu ubicación.',
        });
        return;
      }
      const current = await Location.getCurrentPositionAsync({});
      setUbicacion({
        latitud: current.coords.latitude,
        longitud: current.coords.longitude,
      });
      setUbicacionConfirmada(true);
    } catch {
      showToast({
        type: 'error',
        title: 'Ubicación no disponible',
        message: 'Ajusta manualmente el marcador en el mapa.',
      });
    } finally {
      setIsLoadingGps(false);
    }
  };

  const validarPaso = (numero: number) => {
    const nuevos: Record<string, string> = {};
    if (numero === 1) {
      if (!dias.length) nuevos.dias = 'Selecciona al menos un día.';
      if (!franjas.length) nuevos.franjas = 'Selecciona al menos una franja.';
      if (!tiempoReaccion) nuevos.tiempoReaccion = 'Selecciona una opción.';
      if (!urgencias) nuevos.urgencias = 'Selecciona una opción.';
    }
    if (numero === 2) {
      if (!ubicacionConfirmada) nuevos.ubicacion = 'Confirma tu zona en el mapa.';
      if (!radioMaxKm) nuevos.radio = 'Selecciona una distancia máxima.';
      if (!mediosTransporte.length) nuevos.medios = 'Selecciona al menos un medio.';
      if (vehiculoApto === null) nuevos.vehiculo = 'Selecciona sí o no.';
      if (vehiculoApto && !tamaniosTraslado.length) {
        nuevos.tamaniosTraslado = 'Selecciona al menos un tamaño.';
      }
    }
    if (numero === 3) {
      if (!especiesManejo.length) nuevos.especies = 'Selecciona al menos una especie.';
      if (especiesManejo.includes('otro') && !otrasEspecies.length) {
        nuevos.otrasEspecies = 'Detalla al menos una categoría.';
      }
      if (!tamaniosManejo.length) nuevos.tamaniosManejo = 'Selecciona al menos un tamaño.';
      if (!primerosAuxilios) nuevos.primerosAuxilios = 'Selecciona una opción.';
      if (!experienciasCampo.length) nuevos.experienciasCampo = 'Selecciona al menos una opción.';
      if (!viasTratamiento.length && !sinTratamientos) {
        nuevos.tratamientos = 'Indica una habilidad o selecciona “Ninguna”.';
      }
      if (!trayectorias.length) nuevos.trayectorias = 'Selecciona al menos una opción.';
      if (!experienciaAnios) nuevos.experienciaAnios = 'Selecciona una opción.';
    }
    if (numero === 4) {
      if (!equipamiento.length) nuevos.equipamiento = 'Selecciona al menos una opción.';
      if (!restricciones.length) nuevos.restricciones = 'Selecciona al menos una opción.';
      if (!aceptaCapacitacion) nuevos.capacitacion = 'Selecciona una opción.';
    }
    if (numero === 5) {
      if (!canalContacto) nuevos.canal = 'Selecciona un canal.';
      if (contactoNombre.trim().length < 3) nuevos.contactoNombre = 'Ingresa el nombre completo.';
      if (!/^\d{10}$/.test(contactoTelefono)) nuevos.contactoTelefono = 'Ingresa 10 dígitos.';
      if (!compromisoComunicacion) nuevos.compromisoComunicacion = 'Debes aceptar este compromiso.';
      if (!compromisoNotificar) nuevos.compromisoNotificar = 'Debes aceptar este compromiso.';
      if (!proyeccion) nuevos.proyeccion = 'Selecciona una opción.';
    }
    if (numero === 6) {
      if (!motivaciones.length) nuevos.motivaciones = 'Selecciona al menos una motivación.';
      if (comentarios.length > 250) nuevos.comentarios = 'Máximo 250 caracteres.';
      if (!aceptoTerminos) nuevos.terminos = 'Debes aceptar los términos.';
    }
    setErrors(nuevos);
    if (Object.keys(nuevos).length) {
      showToast({
        type: 'warning',
        title: 'Falta información',
        message: 'Revisa las preguntas marcadas antes de continuar.',
      });
      return false;
    }
    return true;
  };

  const avanzar = () => {
    if (!validarPaso(paso)) return;
    if (paso === PASOS.length) {
      setMostrarConfirmacion(true);
      return;
    }
    setPaso((actual) => actual + 1);
    setErrors({});
  };

  const retroceder = () => {
    if (paso === 1) {
      setShowCloseConfirm(true);
      return;
    }
    setPaso((actual) => actual - 1);
    setErrors({});
  };

  const payload = useMemo(
    () => ({
      disponibilidad: { dias, franjas },
      tiempo_reaccion: tiempoReaccion,
      disponibilidad_urgencias: urgencias,
      max_casos_simultaneos: maxCasos,
      radio_max_km: radioMaxKm,
      medios_transporte: mediosTransporte,
      vehiculo_apto_traslado: Boolean(vehiculoApto),
      tamanios_traslado: vehiculoApto ? tamaniosTraslado : [],
      especies_manejo: especiesManejo,
      otras_especies_manejo: especiesManejo.includes('otro') ? otrasEspecies : [],
      tamanios_manejo: tamaniosManejo,
      primeros_auxilios_nivel: primerosAuxilios,
      experiencias_campo: experienciasCampo,
      vias_tratamiento: sinTratamientos ? [] : viasTratamiento,
      trayectoria_tipos: trayectorias,
      experiencia_anios: experienciaAnios,
      equipamiento,
      restricciones_fisicas: restricciones,
      acepta_capacitacion: aceptaCapacitacion,
      canal_contacto: canalContacto,
      contacto_emergencia_nombre: contactoNombre.trim(),
      contacto_emergencia_telefono: contactoTelefono,
      compromiso_comunicacion: compromisoComunicacion,
      compromiso_notificar: compromisoNotificar,
      proyeccion_colaboracion: proyeccion,
      motivaciones,
      comentarios_adicionales: comentarios.trim() || null,
      latitud: ubicacion.latitud,
      longitud: ubicacion.longitud,
      acepto_terminos: aceptoTerminos,
    }),
    [
      dias, franjas, tiempoReaccion, urgencias, maxCasos, radioMaxKm,
      mediosTransporte, vehiculoApto, tamaniosTraslado, especiesManejo,
      otrasEspecies, tamaniosManejo, primerosAuxilios, experienciasCampo,
      sinTratamientos, viasTratamiento, trayectorias, experienciaAnios,
      equipamiento, restricciones, aceptaCapacitacion, canalContacto,
      contactoNombre, contactoTelefono, compromisoComunicacion,
      compromisoNotificar, proyeccion, motivaciones, comentarios,
      ubicacion, aceptoTerminos,
    ]
  );

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await axios.put(`${API_URL}/voluntarios/me/capacidades`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (esPostulacionNueva) {
        setMostrarConfirmacion(false);
        setPostulacionCompletada(true);
        return;
      }
      showToast({
        type: 'success',
        title: '¡Listo!',
        message: 'Tus capacidades fueron actualizadas.',
      });
      if (fromProfile && onClose) {
        onClose();
      } else {
        router.replace('/(tabs)/profile');
      }
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos guardar',
        message:
          error?.response?.data?.detail ||
          'Verifica tu conexión e intenta nuevamente.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPaso = () => {
    if (paso === 1) {
      return (
        <>
          <FormSection title="¿Qué días sueles estar disponible?" subtitle="Elige todos los días en los que normalmente podrías ayudar.">
            <MultiOptions options={DIAS} selected={dias} onToggle={(value) => toggle(value, dias, setDias)} error={errors.dias} />
          </FormSection>
          <FormSection title="¿En qué horarios te queda más fácil ayudar?" subtitle="Puedes elegir más de un horario.">
            <MultiOptions options={FRANJAS} selected={franjas} onToggle={(value) => toggle(value, franjas, setFranjas)} error={errors.franjas} />
          </FormSection>
          <FormSection title="Si recibes una alerta, ¿cuánto tardarías en responder?">
            <SingleOptions options={TIEMPOS_REACCION} selected={tiempoReaccion} onSelect={setTiempoReaccion} error={errors.tiempoReaccion} />
          </FormSection>
          <FormSection title="¿Podrías ayudar en una emergencia?">
            <SingleOptions options={URGENCIAS} selected={urgencias} onSelect={setUrgencias} error={errors.urgencias} />
          </FormSection>
          <FormSection title="¿Cuántos casos podrías atender al mismo tiempo?">
            <SingleOptions
              options={[1, 2, 3].map((value) => ({ value: String(value), label: `${value} caso${value > 1 ? 's' : ''}` }))}
              selected={String(maxCasos)}
              onSelect={(value) => setMaxCasos(Number(value))}
            />
          </FormSection>
        </>
      );
    }

    if (paso === 2) {
      return (
        <>
          <FormSection title="¿Desde qué zona podrías apoyar?" subtitle="Solo compartiremos una zona aproximada, no la dirección de tu casa.">
            <TouchableOpacity style={styles.locationButton} onPress={handleGetLocation} disabled={isLoadingGps}>
              <Ionicons name="locate" size={18} color={COLORS.bgTeal} />
              <Text style={styles.locationButtonText}>
                {isLoadingGps ? 'Obteniendo ubicación…' : 'Usar mi ubicación actual'}
              </Text>
            </TouchableOpacity>
            <View style={[styles.mapContainer, errors.ubicacion && styles.errorBorder]}>
              <LocationPickerMap
                selectedPosition={ubicacion}
                instructionText="Toca el mapa para marcar la zona desde la que ayudarías"
                helperText="Puedes mover el pin para ajustar la zona"
                onLocationSelect={(latitud, longitud) => {
                  setUbicacion({ latitud, longitud });
                  setUbicacionConfirmada(true);
                }}
              />
            </View>
            {errors.ubicacion && <ErrorText text={errors.ubicacion} />}
          </FormSection>
          <FormSection title="¿Qué tan lejos podrías desplazarte?">
            <SingleOptions
              options={[5, 10, 20, 30].map((km) => ({ value: String(km), label: `Hasta ${km} km` }))}
              selected={radioMaxKm ? String(radioMaxKm) : ''}
              onSelect={(value) => setRadioMaxKm(Number(value))}
              error={errors.radio}
            />
          </FormSection>
          <FormSection title="¿Cómo sueles trasladarte?">
            <MultiOptions options={MEDIOS_TRANSPORTE} selected={mediosTransporte} onToggle={(value) => toggle(value, mediosTransporte, setMediosTransporte)} error={errors.medios} />
          </FormSection>
          <FormSection title="¿Tienes un vehículo donde puedas llevar animales?">
            <BooleanOptions value={vehiculoApto} onChange={(value) => {
              setVehiculoApto(value);
              if (!value) setTamaniosTraslado([]);
            }} error={errors.vehiculo} />
          </FormSection>
          {vehiculoApto && (
            <FormSection title="¿Qué tamaños podrías trasladar en tu vehículo?">
              <MultiOptions options={TAMANIOS} selected={tamaniosTraslado} onToggle={(value) => toggle(value, tamaniosTraslado, setTamaniosTraslado)} error={errors.tamaniosTraslado} />
            </FormSection>
          )}
        </>
      );
    }

    if (paso === 3) {
      const todasSeleccionadas = ESPECIES.every((option) => especiesManejo.includes(option.value));
      return (
        <>
          <FormSection title="¿Con qué animales te sientes cómodo ayudando?">
            <TouchableOpacity
              style={[styles.allButton, todasSeleccionadas && styles.allButtonSelected]}
              onPress={() => setEspeciesManejo(todasSeleccionadas ? [] : ESPECIES.map((option) => option.value))}
            >
              <Text style={[styles.allButtonText, todasSeleccionadas && styles.selectedText]}>Todas las anteriores</Text>
            </TouchableOpacity>
            <MultiOptions options={ESPECIES} selected={especiesManejo} onToggle={(value) => {
              toggle(value, especiesManejo, setEspeciesManejo);
              if (value === 'otro' && especiesManejo.includes('otro')) setOtrasEspecies([]);
            }} error={errors.especies} />
          </FormSection>
          {especiesManejo.includes('otro') && (
            <FormSection title="¿Con qué otros animales?">
              <MultiOptions options={OTRAS_ESPECIES} selected={otrasEspecies} onToggle={(value) => toggle(value, otrasEspecies, setOtrasEspecies)} error={errors.otrasEspecies} />
            </FormSection>
          )}
          <FormSection title="¿Qué tamaños puedes manejar de forma segura?">
            <MultiOptions options={TAMANIOS} selected={tamaniosManejo} onToggle={(value) => toggle(value, tamaniosManejo, setTamaniosManejo)} error={errors.tamaniosManejo} />
          </FormSection>
          <FormSection title="¿Qué tanto sabes de primeros auxilios para animales?">
            <SingleOptions options={PRIMEROS_AUXILIOS} selected={primerosAuxilios} onSelect={setPrimerosAuxilios} error={errors.primerosAuxilios} />
          </FormSection>
          <FormSection title="¿En qué situaciones has ayudado antes?">
            <MultiOptions options={EXPERIENCIAS_CAMPO} selected={experienciasCampo} onToggle={(value) => toggle(value, experienciasCampo, setExperienciasCampo, 'sin_experiencia')} error={errors.experienciasCampo} />
          </FormSection>
          <FormSection title="¿Has dado alguno de estos tratamientos?" subtitle="Elige solo los que ya hayas realizado.">
            <TouchableOpacity
              style={[styles.allButton, sinTratamientos && styles.allButtonSelected]}
              onPress={() => {
                setSinTratamientos(!sinTratamientos);
                setViasTratamiento([]);
              }}
            >
              <Text style={[styles.allButtonText, sinTratamientos && styles.selectedText]}>Ninguna</Text>
            </TouchableOpacity>
            <MultiOptions options={VIAS_TRATAMIENTO} selected={viasTratamiento} onToggle={(value) => {
              setSinTratamientos(false);
              toggle(value, viasTratamiento, setViasTratamiento);
            }} error={errors.tratamientos} />
          </FormSection>
          <FormSection title="¿Dónde has adquirido experiencia?">
            <MultiOptions options={TRAYECTORIAS} selected={trayectorias} onToggle={(value) => {
              toggle(value, trayectorias, setTrayectorias, 'sin_experiencia');
              if (value === 'sin_experiencia') setExperienciaAnios('sin_experiencia');
              if (value !== 'sin_experiencia' && experienciaAnios === 'sin_experiencia') {
                setExperienciaAnios('');
              }
            }} error={errors.trayectorias} />
          </FormSection>
          <FormSection title="¿Cuánto tiempo llevas cuidando o ayudando animales?">
            <SingleOptions options={ANIOS_EXPERIENCIA} selected={experienciaAnios} onSelect={(value) => {
              setExperienciaAnios(value);
              if (value === 'sin_experiencia') {
                setTrayectorias(['sin_experiencia']);
                setExperienciasCampo(['sin_experiencia']);
              } else {
                setTrayectorias((current) => current.filter((item) => item !== 'sin_experiencia'));
                setExperienciasCampo((current) => current.filter((item) => item !== 'sin_experiencia'));
              }
            }} error={errors.experienciaAnios} />
          </FormSection>
        </>
      );
    }

    if (paso === 4) {
      return (
        <>
          <FormSection title="¿Con qué equipo cuentas actualmente?">
            <MultiOptions options={EQUIPAMIENTO} selected={equipamiento} onToggle={(value) => toggle(value, equipamiento, setEquipamiento, 'sin_equipo')} error={errors.equipamiento} />
          </FormSection>
          <FormSection title="¿Hay algún esfuerzo físico que prefieras evitar?" subtitle="Esto nos ayuda a proponerte actividades cómodas y seguras para ti.">
            <MultiOptions options={RESTRICCIONES} selected={restricciones} onToggle={(value) => toggle(value, restricciones, setRestricciones, 'ninguna')} error={errors.restricciones} />
          </FormSection>
          <FormSection title="¿Te gustaría recibir capacitación?">
            <SingleOptions options={CAPACITACION} selected={aceptaCapacitacion} onSelect={setAceptaCapacitacion} error={errors.capacitacion} />
          </FormSection>
        </>
      );
    }

    if (paso === 5) {
      return (
        <>
          <FormSection title="¿Cómo prefieres recibir avisos?">
            <SingleOptions options={CANALES} selected={canalContacto} onSelect={setCanalContacto} error={errors.canal} />
          </FormSection>
          <FormSection title="¿A quién podemos llamar en una emergencia?" subtitle="Solo usaremos este contacto para cuidarte durante una actividad.">
            <TextInput
              style={[styles.input, errors.contactoNombre && styles.errorBorder]}
              value={contactoNombre}
              onChangeText={setContactoNombre}
              placeholder="Nombre completo"
              placeholderTextColor={COLORS.textLight}
              maxLength={120}
            />
            {errors.contactoNombre && <ErrorText text={errors.contactoNombre} />}
            <TextInput
              style={[styles.input, errors.contactoTelefono && styles.errorBorder]}
              value={contactoTelefono}
              onChangeText={(value) => setContactoTelefono(value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Teléfono de 10 dígitos"
              placeholderTextColor={COLORS.textLight}
              keyboardType="phone-pad"
              maxLength={10}
            />
            {errors.contactoTelefono && <ErrorText text={errors.contactoTelefono} />}
          </FormSection>
          <FormSection title="Acuerdos para trabajar en equipo">
            <ConsentOption
              selected={compromisoComunicacion}
              onPress={() => setCompromisoComunicacion(!compromisoComunicacion)}
              label="Mantendré comunicación mientras esté ayudando en un caso."
              error={errors.compromisoComunicacion}
            />
            <ConsentOption
              selected={compromisoNotificar}
              onPress={() => setCompromisoNotificar(!compromisoNotificar)}
              label="Avisaré con tiempo si no puedo continuar con un caso."
              error={errors.compromisoNotificar}
            />
          </FormSection>
          <FormSection title="¿Por cuánto tiempo te gustaría participar?">
            <SingleOptions options={PROYECCIONES} selected={proyeccion} onSelect={setProyeccion} error={errors.proyeccion} />
          </FormSection>
        </>
      );
    }

    return (
      <>
        <FormSection title="¿Qué te motiva a participar?">
          <MultiOptions options={MOTIVACIONES} selected={motivaciones} onToggle={(value) => toggle(value, motivaciones, setMotivaciones)} error={errors.motivaciones} />
        </FormSection>
        <FormSection title="¿Quieres contarnos algo más?" subtitle="Es opcional y la asociación podrá leerlo al revisar tu perfil.">
          <TextInput
            style={[styles.textArea, errors.comentarios && styles.errorBorder]}
            value={comentarios}
            onChangeText={(value) => setComentarios(value.slice(0, 250))}
            placeholder="¿Hay algo más que la asociación deba saber?"
            placeholderTextColor={COLORS.textLight}
            multiline
            maxLength={250}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>{comentarios.length}/250</Text>
          {errors.comentarios && <ErrorText text={errors.comentarios} />}
        </FormSection>
        <FormSection title="Antes de terminar">
          <ConsentOption
            selected={aceptoTerminos}
            onPress={() => setAceptoTerminos(!aceptoTerminos)}
            label="Confirmo que mis respuestas son verdaderas y que seguiré las medidas de seguridad y bienestar animal."
            error={errors.terminos}
          />
        </FormSection>
      </>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Preparando tu formulario…</Text>
      </View>
    );
  }

  if (postulacionCompletada) {
    return (
      <View style={styles.outerContainer}>
        <View style={styles.successContainer}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={54} color={COLORS.bgWhite} />
            </View>
            <Text style={styles.successTitle}>¡Postulación enviada!</Text>
            <Text style={styles.successText}>
              Recibimos tu información y tus capacidades. Podrás consultar el avance desde tu perfil.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, styles.successButton]}
              onPress={() => {
                if (onClose) onClose();
                else router.replace('/');
              }}
            >
              <Text style={styles.primaryButtonText}>Volver al inicio</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.outerContainer}>
      <Toast toast={toast} translateY={translateY} />
      <View style={styles.centeredContent}>
        <View style={styles.card}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => mostrarConfirmacion ? setMostrarConfirmacion(false) : retroceder()}
            >
              <Ionicons name="chevron-back" size={22} color={COLORS.bgWhite} />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {mostrarConfirmacion ? 'Revisa tus respuestas' : 'Cuéntanos cómo puedes ayudar'}
              </Text>
              <Text style={styles.subtitle}>
                {mostrarConfirmacion
                  ? 'Si todo se ve bien, ya puedes terminar'
                  : `Paso ${paso} de ${PASOS.length}: ${PASOS[paso - 1]}`}
              </Text>
            </View>
            <TouchableOpacity style={styles.headerButton} onPress={() => setShowCloseConfirm(true)}>
              <Ionicons name="close" size={22} color={COLORS.bgWhite} />
            </TouchableOpacity>
            {!mostrarConfirmacion && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(paso / PASOS.length) * 100}%` }]} />
              </View>
            )}
          </View>

          {mostrarConfirmacion ? (
            <ScrollView ref={formScrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <ReviewRow label="Cuándo puedes ayudar" value={`${labels(dias, DIAS).join(', ')} · ${labels(franjas, FRANJAS).join(', ')}`} />
              <ReviewRow label="Tiempo para responder" value={TIEMPOS_REACCION.find((item) => item.value === tiempoReaccion)?.label || '—'} />
              <ReviewRow label="Ayuda en emergencias" value={URGENCIAS.find((item) => item.value === urgencias)?.label || '—'} />
              <ReviewRow label="Casos al mismo tiempo" value={`${maxCasos} caso${maxCasos > 1 ? 's' : ''}`} />
              <ReviewRow label="Qué tan lejos" value={`${radioMaxKm} km`} />
              <ReviewRow label="Cómo te trasladas" value={labels(mediosTransporte, MEDIOS_TRANSPORTE).join(', ')} />
              <ReviewRow label="Animales con los que puedes ayudar" value={labels(especiesManejo, ESPECIES).join(', ')} />
              <ReviewRow label="Tamaños que puedes manejar" value={labels(tamaniosManejo, TAMANIOS).join(', ')} />
              <ReviewRow label="Primeros auxilios" value={PRIMEROS_AUXILIOS.find((item) => item.value === primerosAuxilios)?.label || '—'} />
              <ReviewRow label="Equipo disponible" value={labels(equipamiento, EQUIPAMIENTO).join(', ')} />
              <ReviewRow label="Cómo prefieres recibir avisos" value={CANALES.find((item) => item.value === canalContacto)?.label || '—'} />
              <ReviewRow label="Tiempo de colaboración" value={PROYECCIONES.find((item) => item.value === proyeccion)?.label || '—'} />
              <View style={[styles.footerButtons, compact && styles.footerButtonsCompact]}>
                <TouchableOpacity style={[styles.secondaryButton, compact && styles.fullButton]} onPress={() => setMostrarConfirmacion(false)} disabled={isSubmitting}>
                  <Text style={styles.secondaryButtonText}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryButton, compact && styles.fullButton]} onPress={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <ActivityIndicator color={COLORS.bgWhite} />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {esPostulacionNueva ? 'Enviar postulación' : 'Guardar capacidades'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <>
              <ScrollView ref={formScrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {renderPaso()}
              </ScrollView>
              <View style={styles.fixedFooter}>
                <TouchableOpacity style={styles.primaryButton} onPress={avanzar}>
                  <Text style={styles.primaryButtonText}>
                    {paso === PASOS.length ? 'Revisar información' : 'Continuar'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={COLORS.bgWhite} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      <Modal visible={showCloseConfirm} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>¿Salir del formulario?</Text>
            <Text style={styles.confirmText}>Los cambios que no hayas guardado se perderán.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowCloseConfirm(false)}>
                <Text style={styles.secondaryButtonText}>Continuar llenando</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: COLORS.danger }]}
                onPress={() => {
                  setShowCloseConfirm(false);
                  if (onClose) onClose();
                  else router.back();
                }}
              >
                <Text style={styles.primaryButtonText}>Salir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FormSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function MultiOptions({
  options,
  selected,
  onToggle,
  error,
}: {
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  error?: string;
}) {
  return (
    <>
      <View style={styles.optionsWrap}>
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.optionChip, active && styles.optionChipSelected]}
              onPress={() => onToggle(option.value)}
            >
              <Ionicons
                name={active ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={active ? COLORS.bgWhite : COLORS.textLight}
              />
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.optionText, active && styles.selectedText]}>{option.label}</Text>
                {option.description ? (
                  <Text style={[styles.optionDescription, active && styles.selectedDescription]}>{option.description}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {error ? <ErrorText text={error} /> : null}
    </>
  );
}

function SingleOptions({
  options,
  selected,
  onSelect,
  error,
}: {
  options: Option[];
  selected: string;
  onSelect: (value: string) => void;
  error?: string;
}) {
  return (
    <>
      <View style={styles.optionsWrap}>
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.optionChip, active && styles.optionChipSelected]}
              onPress={() => onSelect(option.value)}
            >
              <Ionicons
                name={active ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={active ? COLORS.bgWhite : COLORS.textLight}
              />
              <Text style={[styles.optionText, active && styles.selectedText]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {error ? <ErrorText text={error} /> : null}
    </>
  );
}

function BooleanOptions({
  value,
  onChange,
  error,
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
  error?: string;
}) {
  return (
    <SingleOptions
      options={[
        { value: 'si', label: 'Sí' },
        { value: 'no', label: 'No' },
      ]}
      selected={value === null ? '' : value ? 'si' : 'no'}
      onSelect={(selected) => onChange(selected === 'si')}
      error={error}
    />
  );
}

function ConsentOption({
  selected,
  onPress,
  label,
  error,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  error?: string;
}) {
  return (
    <>
      <TouchableOpacity style={[styles.consent, selected && styles.consentSelected]} onPress={onPress}>
        <Ionicons
          name={selected ? 'checkbox' : 'square-outline'}
          size={23}
          color={selected ? COLORS.primary : COLORS.textLight}
        />
        <Text style={styles.consentText}>{label}</Text>
      </TouchableOpacity>
      {error ? <ErrorText text={error} /> : null}
    </>
  );
}

function ErrorText({ text }: { text: string }) {
  return <Text style={styles.errorText}>{text}</Text>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 24 : 0,
    backgroundColor: 'rgba(28, 20, 14, 0.52)',
  },
  centeredContent: {
    width: '100%',
    maxWidth: 820,
    maxHeight: Platform.OS === 'web' ? '94%' : '100%',
  },
  successContainer: {
    width: '100%',
    maxWidth: 620,
    padding: 24,
  },
  successCard: {
    alignItems: 'center',
    paddingHorizontal: 42,
    paddingVertical: 54,
    borderRadius: 30,
    backgroundColor: COLORS.bgWhite,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  successIcon: {
    width: 96,
    height: 96,
    marginBottom: 26,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgTeal,
  },
  successTitle: {
    marginBottom: 14,
    color: COLORS.textDark,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  successText: {
    maxWidth: 460,
    color: COLORS.textLight,
    fontSize: 16,
    lineHeight: 25,
    textAlign: 'center',
  },
  successButton: {
    width: '100%',
    marginTop: 32,
  },
  card: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: COLORS.bgWhite,
    borderRadius: Platform.OS === 'web' ? 30 : 0,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 28,
    backgroundColor: COLORS.bgTeal,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerText: { flex: 1 },
  title: { color: COLORS.bgWhite, fontSize: 23, fontWeight: '900' },
  subtitle: { color: COLORS.bgWhite, fontSize: 13, fontWeight: '600', opacity: 0.9, marginTop: 3 },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressFill: { height: 5, backgroundColor: COLORS.secondary },
  scrollContent: { padding: 28, paddingBottom: 36 },
  section: {
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    backgroundColor: COLORS.bgWhite,
  },
  sectionTitle: { color: COLORS.textDark, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  sectionSubtitle: { color: COLORS.textLight, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  optionChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: COLORS.grayLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  optionText: { color: COLORS.textDark, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  optionDescription: { color: COLORS.textLight, fontSize: 11, marginTop: 2 },
  selectedText: { color: COLORS.bgWhite },
  selectedDescription: { color: 'rgba(255,255,255,0.82)' },
  allButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    marginTop: 8,
  },
  allButtonSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  allButtonText: { color: COLORS.textDark, fontSize: 13, fontWeight: '800' },
  locationButton: { flexDirection: 'row', alignItems: 'center', gap: 7, marginVertical: 10 },
  locationButtonText: { color: COLORS.bgTeal, fontSize: 14, fontWeight: '800' },
  mapContainer: { height: 260, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 10,
    color: COLORS.textDark,
    fontSize: 14,
    backgroundColor: COLORS.grayLight,
  },
  textArea: {
    minHeight: 115,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    color: COLORS.textDark,
    fontSize: 14,
    backgroundColor: COLORS.grayLight,
  },
  counter: { textAlign: 'right', color: COLORS.textLight, fontSize: 12, marginTop: 6 },
  consent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.grayLight,
  },
  consentSelected: { borderColor: COLORS.primary, backgroundColor: '#FFF4E9' },
  consentText: { flex: 1, color: COLORS.textDark, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  errorText: { color: COLORS.danger, fontSize: 12, fontWeight: '700', marginTop: 8 },
  errorBorder: { borderColor: COLORS.danger, borderWidth: 2 },
  fixedFooter: {
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bgWhite,
  },
  primaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: { color: COLORS.bgWhite, fontSize: 15, fontWeight: '900' },
  secondaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    borderRadius: 18,
    backgroundColor: COLORS.grayLight,
  },
  secondaryButtonText: { color: COLORS.textDark, fontSize: 14, fontWeight: '800' },
  reviewRow: {
    padding: 17,
    marginBottom: 10,
    borderRadius: 17,
    backgroundColor: COLORS.cardBg,
  },
  reviewLabel: { color: COLORS.textLight, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  reviewValue: { color: COLORS.textDark, fontSize: 14, fontWeight: '700', lineHeight: 21, marginTop: 5 },
  footerButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  footerButtonsCompact: { flexDirection: 'column' },
  fullButton: { width: '100%' },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  confirmCard: { width: '100%', maxWidth: 440, padding: 28, borderRadius: 25, backgroundColor: COLORS.bgWhite },
  confirmTitle: { color: COLORS.textDark, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  confirmText: { color: COLORS.textLight, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bgWhite },
  loadingText: { color: COLORS.textLight, fontSize: 14, fontWeight: '700', marginTop: 12 },
});
