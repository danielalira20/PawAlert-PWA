import React, { useState } from 'react';
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
} from 'react-native';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { validarEmail, validarTelefono } from '../../utils/validators';
import { Toast, useToast } from '../../components/Toast';
import {
  CategoriaSubcategoriaSelector,
  CatalogoItem,
} from '../../components/red-aliados/CategoriaSubcategoriaSelector';
import { DatePickerChip } from '../../components/red-aliados/DatePickerChip';
import { DateRangePickerChip } from '../../components/red-aliados/DateRangePickerChip';
import { AssocAvatar } from '../../components/admin-dashboard/AssocAvatar';
import LocationPickerMap from '../LocationPickerMap';

// Misma paleta que CapacidadesFormScreen.tsx
const COLORS = {
  bgTeal: '#66BCB4',
  bgTealLight: '#EDF8F7',
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

const PASOS = ['Qué vas a aportar', 'Detalles del recurso', 'Logística y entrega'];

type Modo = 'reactiva' | 'proactiva';
type Especie = 'perro' | 'gato';
type Option = { value: string; label: string; description?: string };

type CampoCondicional =
  | { key: string; label: string; tipo: 'texto'; required?: boolean; numerico?: boolean }
  | { key: string; label: string; tipo: 'single'; opciones: Option[]; required?: boolean }
  | { key: string; label: string; tipo: 'multi'; opciones: Option[]; required?: boolean }
  | { key: string; label: string; tipo: 'boolean'; required?: boolean }
  | { key: string; label: string; tipo: 'fecha'; required?: boolean };

// Copiados tal cual de CapacidadesFormScreen.tsx (DIAS/FRANJAS) — no se
// importan, cada formulario mantiene su propia copia.
const DIAS_SEMANA: Option[] = [
  { value: 'lun', label: 'Lunes' },
  { value: 'mar', label: 'Martes' },
  { value: 'mie', label: 'Miércoles' },
  { value: 'jue', label: 'Jueves' },
  { value: 'vie', label: 'Viernes' },
  { value: 'sab', label: 'Sábado' },
  { value: 'dom', label: 'Domingo' },
];

const FRANJAS_HORARIO: Option[] = [
  { value: 'matutino', label: 'Por la mañana', description: '6:00–12:00' },
  { value: 'vespertino', label: 'Por la tarde', description: '12:00–18:00' },
  { value: 'nocturno', label: 'Por la noche', description: '18:00–22:00' },
  { value: 'madrugada', label: 'De madrugada', description: '22:00–6:00' },
];

const TAMANIOS: Option[] = [
  { value: 'pequeno', label: 'Chico' },
  { value: 'mediano', label: 'Mediano' },
  { value: 'grande', label: 'Grande' },
];

const FORMA_ENTREGA_OPCIONES: Option[] = [
  { value: 'institucion_lleva', label: 'La institución la lleva' },
  { value: 'asociacion_recoge', label: 'La asociación debe recogerla' },
  { value: 'ambas', label: 'Cualquiera de las dos' },
  { value: 'punto_acordado', label: 'Punto acordado' },
];

// FRONT13 — un lote es la variante "donación grande" de alimentos/insumos
// que se puede repartir entre varias asociaciones (FRONT14/15/16 + BACK07).
const DIVISIBLE_OPCIONES: Option[] = [
  { value: 'no', label: 'No se reparte', description: 'Va completo a una sola asociación.' },
  { value: 'solo_empaques_completos', label: 'Solo empaques completos', description: 'Se puede repartir, pero sin abrir empaques.' },
  { value: 'aliado_prepara_lotes', label: 'Yo preparo los lotes', description: 'Tú divides el total en partes para cada asociación.' },
];

const FRECUENCIA_OPCIONES: Option[] = [
  { value: 'semana', label: 'Por semana' },
  { value: 'mes', label: 'Por mes' },
  { value: 'campana', label: 'Por campaña' },
];

const UNIDAD_OTRA = '__otra__';

// Unidades "contenedor" — no dicen por sí solas cuánto traen, por eso
// piden un campo extra ("¿de cuánto es cada uno?": 25kg, 5 litros...).
// kg/gramos/litros/piezas ya son una medida directa, no lo necesitan.
const UNIDADES_CONTENEDOR = new Set(['costales', 'cajas', 'kits']);

// Unidades típicas por categoría — evita texto libre para que el dato
// quede consistente (no "Kg", "kilos", "KG" mezclados). "Otra" abre un
// campo de texto para casos que no calzan en la lista.
const UNIDADES_POR_CATEGORIA: Record<string, Option[]> = {
  alimentos: [
    { value: 'kg', label: 'kg' },
    { value: 'gramos', label: 'Gramos' },
    { value: 'piezas', label: 'Piezas' },
    { value: 'costales', label: 'Costales' },
    { value: 'cajas', label: 'Cajas' },
    { value: 'litros', label: 'Litros' },
  ],
  insumos: [
    { value: 'kg', label: 'kg' },
    { value: 'gramos', label: 'Gramos' },
    { value: 'piezas', label: 'Piezas' },
    { value: 'kits', label: 'Kits' },
    { value: 'costales', label: 'Costales' },
    { value: 'cajas', label: 'Cajas' },
    { value: 'litros', label: 'Litros' },
  ],
  servicios_veterinarios: [
    { value: 'consultas', label: 'Consultas' },
    { value: 'citas', label: 'Citas' },
    { value: 'atenciones', label: 'Atenciones' },
  ],
  difusion_campanas: [
    { value: 'eventos', label: 'Eventos' },
    { value: 'publicaciones', label: 'Publicaciones' },
    { value: 'piezas', label: 'Piezas' },
  ],
};

const TIPO_APOYO_OPCIONES: Option[] = [
  { value: 'vacunacion', label: 'Jornada de vacunación' },
  { value: 'esterilizacion', label: 'Jornada de esterilización' },
  { value: 'adopcion', label: 'Jornada de adopción' },
  { value: 'espacio_evento', label: 'Espacio para evento' },
  { value: 'publicidad', label: 'Publicidad' },
  { value: 'servicio_profesional', label: 'Servicio profesional o tecnológico' },
];

const AREA_SERVICIO_OPCIONES: Option[] = [
  { value: 'tecnologia', label: 'Tecnología e Ingeniería' },
  { value: 'marketing', label: 'Marketing y Comunicación' },
  { value: 'diseno', label: 'Diseño' },
  { value: 'legal', label: 'Legal' },
  { value: 'salud', label: 'Salud' },
  { value: 'educacion', label: 'Educación' },
  { value: 'otro', label: 'Otro' },
];

// Campos condicionales por categoría — Formulario 3, sección "Condicional"
// (formularios-red-aliados-pawalert.md). Es código, no catálogo dinámico.
// `cantidad_piezas` (insumos) y `tipo_servicio` (veterinarios) se quitaron
// por redundantes: ya los cubren cantidad/unidad (paso 3) y la subcategoría
// elegida (paso 1), respectivamente.
const CAMPOS_CONDICIONALES: Record<string, CampoCondicional[]> = {
  alimentos: [
    {
      key: 'etapa',
      label: 'Etapa',
      tipo: 'single',
      opciones: [
        { value: 'bebe', label: 'Bebé' },
        { value: 'cachorro', label: 'Cachorro' },
        { value: 'adulto', label: 'Adulto' },
        { value: 'senior', label: 'Senior' },
        { value: 'cualquier_etapa', label: 'Cualquier etapa' },
      ],
    },
    {
      key: 'dieta_especial',
      label: 'Dieta especial',
      tipo: 'single',
      opciones: [
        { value: 'regular', label: 'Regular' },
        { value: 'gastrointestinal', label: 'Gastrointestinal' },
        { value: 'renal', label: 'Renal' },
        { value: 'control_peso', label: 'Control de peso' },
        { value: 'otra', label: 'Otra' },
      ],
    },
    { key: 'producto_cerrado', label: '¿El producto está cerrado?', tipo: 'boolean' },
    { key: 'marca', label: 'Marca (opcional)', tipo: 'texto' },
    { key: 'peso_por_empaque', label: 'Peso por empaque', tipo: 'texto', numerico: true },
    { key: 'numero_empaques', label: 'Número de empaques', tipo: 'texto', numerico: true },
    { key: 'fecha_caducidad', label: 'Fecha de caducidad', tipo: 'fecha' },
  ],
  insumos: [
    {
      key: 'nuevo_o_usado',
      label: 'Nuevo o usado',
      tipo: 'single',
      opciones: [
        { value: 'nuevo', label: 'Nuevo' },
        { value: 'usado', label: 'Usado en buen estado' },
      ],
    },
    { key: 'descripcion_contenido', label: 'Descripción del contenido (solo kits)', tipo: 'texto' },
    { key: 'fecha_caducidad', label: 'Fecha de caducidad del producto, si corresponde', tipo: 'fecha' },
  ],
  servicios_veterinarios: [
    {
      key: 'nivel',
      label: 'Nivel que puede recibir',
      tipo: 'single',
      opciones: [
        { value: 'critico', label: 'Crítico' },
        { value: 'urgente', label: 'Urgente' },
        { value: 'programable', label: 'Programable' },
      ],
    },
    {
      key: 'periodo',
      label: 'Periodo',
      tipo: 'single',
      opciones: [
        { value: 'semana', label: 'Por semana' },
        { value: 'mes', label: 'Por mes' },
        { value: 'campana', label: 'Por campaña' },
      ],
    },
    // 'numero_atenciones' se quitó por redundante: el paso 3 ya pregunta
    // la cantidad ("Capacidad declarada"/"Cantidad") para cualquier
    // categoría, no hace falta preguntarla dos veces solo para este caso.
    { key: 'requiere_cita', label: '¿Requiere cita?', tipo: 'boolean' },
    { key: 'dias', label: 'Días disponibles', tipo: 'multi', opciones: DIAS_SEMANA },
    { key: 'horario', label: 'Horario', tipo: 'multi', opciones: FRANJAS_HORARIO },
    { key: 'restricciones', label: 'Restricciones', tipo: 'texto' },
  ],
  // Difusión y campañas se maneja aparte (tipo de apoyo + área condicional
  // anidada + contacto responsable con 4 campos propios) — ver bloques
  // dedicados en el paso 2. `ubicacion_alcance` se quitó por redundante:
  // el paso 3 ya captura ubicación con mapa para toda la aportación.
  // 'capacidad_aproximada' también se quitó por lo mismo: duplicaba la
  // cantidad que ya se pregunta en el paso 3.
  difusion_campanas: [],
};

interface Props {
  onClose?: () => void;
}

export default function AportacionFormScreen({ onClose }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  
  // ─── AQUÍ ATRAPAMOS EL PARÁMETRO QUE MANDASTE ───
  const { necesidad_id } = useLocalSearchParams<{ necesidad_id?: string }>();

  const [paso, setPaso] = useState(1);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [mostrarPostEnvio, setMostrarPostEnvio] = useState(false);
  const [isLoadingGps, setIsLoadingGps] = useState(false);

  const [modo, setModo] = useState<Modo>('reactiva');
  // ─── AQUÍ LO INYECTAMOS EN EL ESTADO ───
  const [necesidadId, setNecesidadId] = useState(necesidad_id || '');

  const [categoria, setCategoria] = useState<CatalogoItem | null>(null);
  const [subcategoria, setSubcategoria] = useState<CatalogoItem | null>(null);
  const [especiesAplica, setEspeciesAplica] = useState<Especie[]>([]);
  const [tamanio, setTamanio] = useState<string | null>(null);

  const [detalleValores, setDetalleValores] = useState<Record<string, string>>({});
  const [detalleFechas, setDetalleFechas] = useState<Record<string, Date | null>>({});
  const [detalleMulti, setDetalleMulti] = useState<Record<string, string[]>>({});
  const [tipoApoyo, setTipoApoyo] = useState<string[]>([]);
  const [areaServicio, setAreaServicio] = useState<string | null>(null);
  const [areaOtro, setAreaOtro] = useState('');

  // Contacto responsable de campaña — 4 campos propios (antes era un solo
  // texto libre "nombre y cargo"). Solo aplica a difusion_campanas.
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoCargo, setContactoCargo] = useState('');
  const [contactoTelefono, setContactoTelefono] = useState('');
  const [contactoCorreo, setContactoCorreo] = useState('');

  const [cantidadValor, setCantidadValor] = useState('');
  const [cantidadUnidad, setCantidadUnidad] = useState('');
  const [unidadEsOtra, setUnidadEsOtra] = useState(false);
  const [contenidoPorUnidad, setContenidoPorUnidad] = useState('');
  const [fechaDisponibilidad, setFechaDisponibilidad] = useState<Date | null>(null);
  const [ubicacion, setUbicacion] = useState<{ latitud: number; longitud: number } | null>(null);
  const [formaEntrega, setFormaEntrega] = useState<string | null>(null);
  const [vigencia, setVigencia] = useState<Date | null>(null);
  const [frecuencia, setFrecuencia] = useState<string | null>(null);

  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [fotoAspectRatio, setFotoAspectRatio] = useState<number | null>(null);
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);

  // FRONT13 — "es un lote grande": extiende este mismo formulario con los
  // campos de logística (empaque/divisible/entrega) en vez de una pantalla
  // aparte, y al enviar pasa a invitar asociaciones (FRONT14) en lugar del
  // post-envío normal.
  const [esLote, setEsLote] = useState(false);
  const [tipoEmpaque, setTipoEmpaque] = useState('');
  const [divisible, setDivisible] = useState<string | null>(null);
  const [maxAsociaciones, setMaxAsociaciones] = useState('1');
  const [loteId, setLoteId] = useState<string | null>(null);
  const [mostrarInvitar, setMostrarInvitar] = useState(false);
  const [asociacionesCompatibles, setAsociacionesCompatibles] = useState<{ id: string; nombre: string; distancia_km: number }[]>([]);
  const [asociacionesSeleccionadas, setAsociacionesSeleccionadas] = useState<string[]>([]);
  const [isLoadingAsociaciones, setIsLoadingAsociaciones] = useState(false);
  const [isInvitando, setIsInvitando] = useState(false);
  const [invitacionesEnviadas, setInvitacionesEnviadas] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const especiesDisponibles: Especie[] =
    (subcategoria?.especies_aplicables as Especie[] | undefined) || ['perro', 'gato'];
  const camposCondicionalesBase = categoria ? CAMPOS_CONDICIONALES[categoria.clave] || [] : [];
  // Para un lote, "peso por empaque" y "número de empaques" ya quedan
  // cubiertos por "¿Cómo viene empacado?" + la cantidad total del paso 3
  // — no tiene caso preguntarlos dos veces con otras palabras.
  const camposCondicionales = esLote
    ? camposCondicionalesBase.filter((c) => c.key !== 'peso_por_empaque' && c.key !== 'numero_empaques')
    : camposCondicionalesBase;
  const esDifusion = categoria?.clave === 'difusion_campanas';
  const esLoteAplicable = categoria?.clave === 'alimentos' || categoria?.clave === 'insumos';
  // Servicios (veterinarios/difusión) no son un bien físico — no tiene
  // sentido preguntarles zona de entrega/recolección ni forma de entrega,
  // eso es logística de un objeto que se transporta.
  const esServicio = categoria?.clave === 'servicios_veterinarios' || categoria?.clave === 'difusion_campanas';

  const toggleEspecie = (value: string) => {
    const especie = value as Especie;
    setEspeciesAplica((prev) =>
      prev.includes(especie) ? prev.filter((e) => e !== especie) : [...prev, especie]
    );
  };

  const toggleTipoApoyo = (value: string) => {
    setTipoApoyo((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const setCampoDetalle = (key: string, value: string) => {
    setDetalleValores((prev) => ({ ...prev, [key]: value }));
  };

  const toggleCampoMulti = (key: string, value: string) => {
    setDetalleMulti((prev) => {
      const actuales = prev[key] || [];
      const siguientes = actuales.includes(value) ? actuales.filter((v) => v !== value) : [...actuales, value];
      return { ...prev, [key]: siguientes };
    });
  };

  const setCampoFecha = (key: string, value: Date | null) => {
    setDetalleFechas((prev) => ({ ...prev, [key]: value }));
  };

  const handleGetLocation = async () => {
    setIsLoadingGps(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        showToast({
          type: 'error',
          title: 'Permiso de ubicación bloqueado',
          message:
            Platform.OS === 'web'
              ? 'Tu navegador bloqueó la ubicación. Habilítala desde el candado del sitio o ajusta el pin manualmente.'
              : 'No pudimos acceder a tu ubicación. Ajusta el pin manualmente en el mapa.',
        });
        return;
      }
      const current = await Location.getCurrentPositionAsync({});
      setUbicacion({ latitud: current.coords.latitude, longitud: current.coords.longitude });
    } catch {
      showToast({
        type: 'error',
        title: 'Ubicación no disponible',
        message:
          Platform.OS === 'web'
            ? 'No fue posible leer tu GPS en el navegador. Ajusta el pin manualmente en el mapa.'
            : 'Ajusta manualmente el marcador en el mapa.',
      });
    } finally {
      setIsLoadingGps(false);
    }
  };

  // Mismo patrón que subirFotoHito en useStaffReports.ts — incluyendo el
  // manejo de blob URI en web (fetch() + new File() antes de mandarla).
  const subirFoto = async (uri: string): Promise<string | null> => {
    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const res = await fetch(uri);
        const blob = await res.blob();
        const file = new File([blob], `recurso_${Date.now()}.jpg`, { type: 'image/jpeg' });
        formData.append('foto', file);
      } else {
        formData.append('foto', { uri, name: `recurso_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
      }
      const res = await axios.post(`${API_URL}/red-aliados/foto`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      return res.data.foto_url;
    } catch {
      return null;
    }
  };

  const handlePickFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) return;
    const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (resultado.canceled) return;

    const asset = resultado.assets[0];
    if (asset?.width && asset?.height) {
      setFotoAspectRatio(asset.width / asset.height);
    } else {
      setFotoAspectRatio(null);
    }

    setIsUploadingFoto(true);
    const url = await subirFoto(asset.uri);
    setIsUploadingFoto(false);

    if (url) setFotoUrl(url);
    else showToast({ type: 'error', title: 'Error', message: 'No pudimos subir la foto. Intenta de nuevo.' });
  };

  const construirDetalle = (): Record<string, string> => {
    const detalle: Record<string, string> = {};
    camposCondicionales.forEach((c) => {
      if (c.tipo === 'fecha') {
        const fecha = detalleFechas[c.key];
        if (fecha) detalle[c.key] = fecha.toISOString().slice(0, 10);
      } else if (c.tipo === 'multi') {
        const valores = detalleMulti[c.key];
        if (valores?.length) detalle[c.key] = valores.join(',');
      } else {
        const valor = detalleValores[c.key]?.trim();
        if (valor) detalle[c.key] = valor;
      }
    });
    if (esDifusion) {
      if (tipoApoyo.length) detalle.tipo_apoyo = tipoApoyo.join(',');
      if (areaServicio) detalle.area_servicio = areaServicio === 'otro' ? areaOtro.trim() : areaServicio;
      detalle.contacto_nombre = contactoNombre.trim();
      if (contactoCargo.trim()) detalle.contacto_cargo = contactoCargo.trim();
      detalle.contacto_telefono = contactoTelefono;
      detalle.contacto_correo = contactoCorreo.trim();
    }
    if (tamanio) detalle.tamanio = tamanio;
    if (fotoUrl) detalle.foto_url = fotoUrl;
    if (UNIDADES_CONTENEDOR.has(cantidadUnidad) && contenidoPorUnidad.trim()) {
      detalle.contenido_por_unidad = contenidoPorUnidad.trim();
    }
    return detalle;
  };

  const lugarEntregaTexto = ubicacion ? `${ubicacion.latitud.toFixed(5)}, ${ubicacion.longitud.toFixed(5)}` : undefined;

  const validarPaso = (numero: number): boolean => {
    const nuevos: Record<string, string> = {};

    if (numero === 1) {
      if (!categoria) nuevos.categoria = 'Selecciona una categoría.';
      if (!subcategoria) nuevos.subcategoria = 'Selecciona una subcategoría.';
    }

    if (numero === 2) {
      if (subcategoria?.requiere_tamanio && !tamanio) nuevos.tamanio = 'Selecciona un tamaño.';
      camposCondicionales.forEach((c) => {
        if (!c.required) return;
        if (c.tipo === 'fecha') {
          if (!detalleFechas[c.key]) nuevos[c.key] = 'Este campo es obligatorio.';
        } else if (c.tipo === 'multi') {
          if (!detalleMulti[c.key]?.length) nuevos[c.key] = 'Selecciona al menos una opción.';
        } else if (!detalleValores[c.key]?.trim()) {
          nuevos[c.key] = 'Este campo es obligatorio.';
        }
      });
      if (esDifusion) {
        if (!contactoNombre.trim()) nuevos.contactoNombre = 'Ingresa el nombre completo.';
        if (!validarTelefono(contactoTelefono)) nuevos.contactoTelefono = 'Ingresa 10 dígitos.';
        if (!validarEmail(contactoCorreo)) nuevos.contactoCorreo = 'Ingresa un correo válido.';
      }
    }

    if (numero === 3) {
      if (!cantidadValor.trim() || isNaN(Number(cantidadValor)) || Number(cantidadValor) <= 0) {
        nuevos.cantidadValor = 'Ingresa una cantidad válida.';
      }
      if (!cantidadUnidad.trim()) nuevos.cantidadUnidad = 'Indica la unidad (kg, piezas, citas...).';
      if (!esLote && UNIDADES_CONTENEDOR.has(cantidadUnidad) && !contenidoPorUnidad.trim()) {
        nuevos.contenidoPorUnidad = 'Indica de cuánto es cada unidad.';
      }

      if (esLote) {
        if (!tipoEmpaque.trim()) nuevos.tipoEmpaque = 'Describe cómo viene empacado.';
        if (!divisible) nuevos.divisible = 'Selecciona una opción.';
        if (divisible && divisible !== 'no' && (!maxAsociaciones.trim() || Number(maxAsociaciones) < 1)) {
          nuevos.maxAsociaciones = 'Indica a cuántas asociaciones se puede repartir.';
        }
        if (!formaEntrega) nuevos.formaEntrega = 'Selecciona una forma de entrega.';
      }
    }

    setErrors(nuevos);
    if (Object.keys(nuevos).length) {
      showToast({ type: 'warning', title: 'Falta información', message: 'Revisa las preguntas marcadas antes de continuar.' });
      return false;
    }
    return true;
  };

  const resetForm = () => {
    setPaso(1);
    setNecesidadId(necesidad_id || '');
    setCategoria(null);
    setSubcategoria(null);
    setEspeciesAplica([]);
    setTamanio(null);
    setDetalleValores({});
    setDetalleFechas({});
    setDetalleMulti({});
    setTipoApoyo([]);
    setAreaServicio(null);
    setAreaOtro('');
    setContactoNombre('');
    setContactoCargo('');
    setContactoTelefono('');
    setContactoCorreo('');
    setCantidadValor('');
    setCantidadUnidad('');
    setUnidadEsOtra(false);
    setContenidoPorUnidad('');
    setFechaDisponibilidad(null);
    setUbicacion(null);
    setFormaEntrega(null);
    setVigencia(null);
    setFrecuencia(null);
    setFotoUrl(null);
    setFotoAspectRatio(null);
    setEsLote(false);
    setTipoEmpaque('');
    setDivisible(null);
    setMaxAsociaciones('1');
    setLoteId(null);
    setMostrarInvitar(false);
    setAsociacionesCompatibles([]);
    setAsociacionesSeleccionadas([]);
    setInvitacionesEnviadas(false);
    setErrors({});
  };

  // Tras un envío exitoso: reinicia el wizard al paso 1 pero conserva lo
  // que tiene sentido reutilizar entre recursos (modo, necesidad, ubicación,
  // fecha de disponibilidad, forma de entrega) — todo lo específico del
  // recurso anterior (categoría, subcategoría, condicionales, cantidad,
  // foto) se limpia para el nuevo.
  const reiniciarParcial = () => {
    setPaso(1);
    setCategoria(null);
    setSubcategoria(null);
    setEspeciesAplica([]);
    setTamanio(null);
    setDetalleValores({});
    setDetalleFechas({});
    setDetalleMulti({});
    setTipoApoyo([]);
    setAreaServicio(null);
    setAreaOtro('');
    setContactoNombre('');
    setContactoCargo('');
    setContactoTelefono('');
    setContactoCorreo('');
    setCantidadValor('');
    setCantidadUnidad('');
    setUnidadEsOtra(false);
    setContenidoPorUnidad('');
    setVigencia(null);
    setFrecuencia(null);
    setFotoUrl(null);
    setFotoAspectRatio(null);
    setEsLote(false);
    setTipoEmpaque('');
    setDivisible(null);
    setMaxAsociaciones('1');
    setLoteId(null);
    setAsociacionesCompatibles([]);
    setAsociacionesSeleccionadas([]);
    setErrors({});
    setMostrarPostEnvio(false);
    setMostrarInvitar(false);
    setInvitacionesEnviadas(false);
  };

  const terminarFlujo = () => {
    resetForm();
    setMostrarPostEnvio(false);
    if (onClose) onClose();
    else router.back();
  };

  const cargarAsociacionesCompatibles = async (id: string) => {
    setIsLoadingAsociaciones(true);
    try {
      const res = await axios.get(`${API_URL}/red-aliados/lotes/${id}/asociaciones-compatibles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAsociacionesCompatibles(res.data);
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos cargar asociaciones cercanas.' });
    } finally {
      setIsLoadingAsociaciones(false);
    }
  };

  const toggleAsociacionSeleccionada = (id: string) => {
    setAsociacionesSeleccionadas((prev) => {
      if (divisible === 'no') {
        return prev.includes(id) ? [] : [id];
      }
      return prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
    });
  };

  const handleInvitar = async () => {
    if (!loteId || !asociacionesSeleccionadas.length) return;
    const asociacionIds = divisible === 'no' ? asociacionesSeleccionadas.slice(0, 1) : asociacionesSeleccionadas;
    setIsInvitando(true);
    try {
      await axios.post(
        `${API_URL}/red-aliados/lotes/${loteId}/invitar`,
        { asociacion_ids: asociacionIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInvitacionesEnviadas(true);
      showToast({ type: 'success', title: 'Invitaciones enviadas', message: 'Las asociaciones ya pueden responder.' });
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: error?.response?.data?.detail || 'No pudimos enviar las invitaciones.',
      });
    } finally {
      setIsInvitando(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (esLote) {
        const res = await axios.post(
          `${API_URL}/red-aliados/lotes`,
          {
            categoria: categoria!.clave,
            subcategoria_id: subcategoria!.id,
            especies_aplica: especiesAplica,
            cantidad_valor: Number(cantidadValor),
            cantidad_unidad: cantidadUnidad.trim(),
            tipo_empaque: tipoEmpaque.trim(),
            divisible,
            max_asociaciones: divisible === 'no' ? 1 : Number(maxAsociaciones),
            forma_entrega: formaEntrega,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setLoteId(res.data.id);
        showToast({ type: 'success', title: 'Lote registrado', message: 'Ahora invita a las asociaciones que quieras.' });
        cargarAsociacionesCompatibles(res.data.id);
        setMostrarInvitar(true);
        return;
      }

      const basePayload = {
        categoria: categoria!.clave,
        subcategoria_id: subcategoria!.id,
        especies_aplica: especiesAplica,
        fecha_disponibilidad: fechaDisponibilidad ? fechaDisponibilidad.toISOString().slice(0, 10) : undefined,
        lugar_entrega: lugarEntregaTexto,
        forma_entrega: formaEntrega || undefined,
        vigencia: vigencia ? vigencia.toISOString().slice(0, 10) : undefined,
        detalle: construirDetalle(),
      };

      if (modo === 'reactiva') {
        await axios.post(
          `${API_URL}/red-aliados/contribuciones`,
          {
            ...basePayload,
            necesidad_id: necesidadId.trim(),
            cantidad_valor: Number(cantidadValor),
            cantidad_unidad: cantidadUnidad.trim(),
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${API_URL}/red-aliados/ofertas-proactivas`,
          {
            ...basePayload,
            capacidad_declarada: Number(cantidadValor),
            unidad: cantidadUnidad.trim(),
            frecuencia: frecuencia || undefined,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      showToast({
        type: 'success',
        title: modo === 'reactiva' ? 'Aportación registrada' : 'Oferta registrada',
        message: 'Gracias por tu apoyo a la Red de Aliados.',
      });
      setMostrarPostEnvio(true);
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: error?.response?.data?.detail || 'No pudimos registrar tu aportación.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const avanzar = () => {
    if (!validarPaso(paso)) return;
    if (paso === PASOS.length) {
      handleSubmit();
      return;
    }
    setPaso((p) => p + 1);
    setErrors({});
  };

  const retroceder = () => {
    if (paso === 1) {
      setShowCloseConfirm(true);
      return;
    }
    setPaso((p) => p - 1);
    setErrors({});
  };

  const renderCampoCondicional = (campo: CampoCondicional) => {
    if (campo.tipo === 'single') {
      return (
        <View key={campo.key} style={{ marginBottom: 4 }}>
          <Text style={styles.sectionSubtitle}>
            {campo.label} {campo.required && <Text style={styles.errorText}>*</Text>}
          </Text>
          <SingleOptions
            options={campo.opciones}
            selected={detalleValores[campo.key] || ''}
            onSelect={(v) => setCampoDetalle(campo.key, v)}
            error={errors[campo.key]}
          />
        </View>
      );
    }
    if (campo.tipo === 'multi') {
      return (
        <View key={campo.key} style={{ marginBottom: 4 }}>
          <Text style={styles.sectionSubtitle}>
            {campo.label} {campo.required && <Text style={styles.errorText}>*</Text>}
          </Text>
          <MultiOptions
            options={campo.opciones}
            selected={detalleMulti[campo.key] || []}
            onToggle={(v) => toggleCampoMulti(campo.key, v)}
            error={errors[campo.key]}
          />
        </View>
      );
    }
    if (campo.tipo === 'boolean') {
      return (
        <View key={campo.key} style={{ marginBottom: 4 }}>
          <Text style={styles.sectionSubtitle}>{campo.label}</Text>
          <BooleanOptions
            value={detalleValores[campo.key] === 'si' ? true : detalleValores[campo.key] === 'no' ? false : null}
            onChange={(v) => setCampoDetalle(campo.key, v ? 'si' : 'no')}
            error={errors[campo.key]}
          />
        </View>
      );
    }
    if (campo.tipo === 'fecha') {
      return (
        <DatePickerChip
          key={campo.key}
          label={campo.label}
          required={campo.required}
          value={detalleFechas[campo.key] || null}
          onChange={(d) => setCampoFecha(campo.key, d)}
          error={errors[campo.key]}
        />
      );
    }
    return (
      <View key={campo.key} style={styles.inputGroup}>
        <Text style={styles.sectionSubtitle}>
          {campo.label} {campo.required && <Text style={styles.errorText}>*</Text>}
        </Text>
        <TextInputField
          value={detalleValores[campo.key] || ''}
          onChangeText={(v) => setCampoDetalle(campo.key, campo.numerico ? v.replace(/[^0-9.]/g, '') : v)}
          keyboardType={campo.numerico ? 'numeric' : 'default'}
        />
        {errors[campo.key] && <ErrorText text={errors[campo.key]} />}
      </View>
    );
  };

  const renderPaso = () => {
    if (paso === 1) {
      return (
        <>
          <FormSection title="Categoría y subcategoría" subtitle="Elige qué tipo de recurso vas a aportar.">
            <CategoriaSubcategoriaSelector
              categoria={categoria}
              subcategoria={subcategoria}
              onChangeCategoria={(c) => {
                setCategoria(c);
                setSubcategoria(null);
                setEspeciesAplica([]);
                setTamanio(null);
                setDetalleValores({});
                setDetalleFechas({});
                setDetalleMulti({});
                setTipoApoyo([]);
                setAreaServicio(null);
                setContactoNombre('');
                setContactoCargo('');
                setContactoTelefono('');
                setContactoCorreo('');
                setEsLote(false);
                setModo('proactiva');
                setNecesidadId('');
                setCantidadUnidad('');
                setUnidadEsOtra(false);
                setContenidoPorUnidad('');
              }}
              onChangeSubcategoria={(s) => {
                setSubcategoria(s);
                setEspeciesAplica([]);
                setTamanio(null);
              }}
              errorCategoria={errors.categoria}
              errorSubcategoria={errors.subcategoria}
            />
          </FormSection>

          {esLoteAplicable && (
            <FormSection title="¿Es una donación grande?" subtitle="Por ejemplo, 50kg de croquetas que se puedan repartir entre varias asociaciones.">
              <SingleOptions
                options={[
                  { value: 'si', label: 'Sí, es un lote grande', description: 'Vas a poder definir empaque, si se puede dividir, y luego invitar a las asociaciones que quieras.' },
                ]}
                selected={esLote ? 'si' : ''}
                onSelect={() => setEsLote(true)}
              />
            </FormSection>
          )}

        </>
      );
    }

    if (paso === 2) {
      return (
        <>
          <FormSection title={`Detalles de ${subcategoria?.descripcion?.toLowerCase() || 'tu aportación'}`}>
            <Text style={styles.sectionSubtitle}>¿Para qué animales aplica?</Text>
            <MultiOptions
              options={especiesDisponibles.map((e) => ({ value: e, label: e === 'perro' ? 'Perros' : 'Gatos' }))}
              selected={especiesAplica}
              onToggle={toggleEspecie}
            />

            {subcategoria?.requiere_tamanio && (
              <>
                <Text style={styles.sectionSubtitle}>Tamaño *</Text>
                <SingleOptions options={TAMANIOS} selected={tamanio || ''} onSelect={setTamanio} error={errors.tamanio} />
              </>
            )}
          </FormSection>

          {esDifusion && (
            <FormSection title="Tipo de apoyo">
              <MultiOptions options={TIPO_APOYO_OPCIONES} selected={tipoApoyo} onToggle={toggleTipoApoyo} />
              {tipoApoyo.includes('servicio_profesional') && (
                <>
                  <Text style={styles.sectionSubtitle}>Área</Text>
                  <SingleOptions options={AREA_SERVICIO_OPCIONES} selected={areaServicio || ''} onSelect={setAreaServicio} />
                  {areaServicio === 'otro' && (
                    <View style={styles.inputGroup}>
                      <Text style={styles.sectionSubtitle}>¿Cuál?</Text>
                      <TextInputField value={areaOtro} onChangeText={setAreaOtro} />
                    </View>
                  )}
                </>
              )}
            </FormSection>
          )}

          {esDifusion && (
            <FormSection title="Contacto responsable" subtitle="Obligatorio para cualquier campaña.">
              <Text style={styles.sectionSubtitle}>Nombre completo *</Text>
              <TextInputField value={contactoNombre} onChangeText={setContactoNombre} placeholder="Nombre completo" />
              {errors.contactoNombre && <ErrorText text={errors.contactoNombre} />}

              <View style={styles.inputGroup}>
                <Text style={styles.sectionSubtitle}>Cargo (opcional)</Text>
                <TextInputField value={contactoCargo} onChangeText={setContactoCargo} placeholder="Cargo" />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionSubtitle}>Teléfono *</Text>
                <TextInputField
                  value={contactoTelefono}
                  onChangeText={(v) => setContactoTelefono(v.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10 dígitos"
                  keyboardType="phone-pad"
                />
                {errors.contactoTelefono && <ErrorText text={errors.contactoTelefono} />}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionSubtitle}>Correo *</Text>
                <TextInputField value={contactoCorreo} onChangeText={setContactoCorreo} placeholder="correo@ejemplo.com" />
                {errors.contactoCorreo && <ErrorText text={errors.contactoCorreo} />}
              </View>
            </FormSection>
          )}

          {camposCondicionales.length > 0 && (
            <FormSection title="Más sobre el recurso">
              {camposCondicionales.map(renderCampoCondicional)}
            </FormSection>
          )}
        </>
      );
    }

    return (
      <>
        <FormSection title={esLote ? 'Cantidad total del lote' : modo === 'reactiva' ? 'Cantidad' : 'Capacidad declarada'}>
          <TextInputField
            value={cantidadValor}
            onChangeText={(v) => setCantidadValor(v.replace(/[^0-9.]/g, ''))}
            placeholder="10"
            keyboardType="numeric"
          />
          {errors.cantidadValor && <ErrorText text={errors.cantidadValor} />}
          <Text style={[styles.sectionSubtitle, { marginTop: 12 }]}>Unidad</Text>
          <SingleOptions
            options={[
              ...(UNIDADES_POR_CATEGORIA[categoria?.clave || ''] || []),
              { value: UNIDAD_OTRA, label: 'Otra' },
            ]}
            selected={unidadEsOtra ? UNIDAD_OTRA : cantidadUnidad}
            onSelect={(v) => {
              if (v === UNIDAD_OTRA) {
                setUnidadEsOtra(true);
                setCantidadUnidad('');
                setContenidoPorUnidad('');
              } else {
                setUnidadEsOtra(false);
                setCantidadUnidad(v);
                if (!UNIDADES_CONTENEDOR.has(v)) setContenidoPorUnidad('');
              }
            }}
          />
          {unidadEsOtra && (
            <View style={{ marginTop: 10 }}>
              <TextInputField value={cantidadUnidad} onChangeText={setCantidadUnidad} placeholder="Escribe la unidad" />
            </View>
          )}
          {errors.cantidadUnidad && <ErrorText text={errors.cantidadUnidad} />}

          {!esLote && UNIDADES_CONTENEDOR.has(cantidadUnidad) && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.sectionSubtitle}>¿De cuánto es cada {cantidadUnidad === 'kits' ? 'kit' : cantidadUnidad.slice(0, -1)}?</Text>
              <TextInputField value={contenidoPorUnidad} onChangeText={setContenidoPorUnidad} placeholder="Ej. 25kg, 12 piezas, 5 litros" />
              {errors.contenidoPorUnidad && <ErrorText text={errors.contenidoPorUnidad} />}
            </View>
          )}
        </FormSection>

        {esLote && (
          <>
            <FormSection title="¿Cómo viene empacado?" subtitle="Por ejemplo: 'Costales de 25kg' o 'Cajas de 12 piezas'.">
              <TextInputField value={tipoEmpaque} onChangeText={setTipoEmpaque} placeholder="Describe el empaque" />
              {errors.tipoEmpaque && <ErrorText text={errors.tipoEmpaque} />}
            </FormSection>

            <FormSection title="¿Se puede repartir entre varias asociaciones?">
              <SingleOptions options={DIVISIBLE_OPCIONES} selected={divisible || ''} onSelect={setDivisible} error={errors.divisible} />
            </FormSection>

            {divisible && divisible !== 'no' && (
              <FormSection title="¿Entre cuántas asociaciones como máximo?">
                <TextInputField
                  value={maxAsociaciones}
                  onChangeText={(v) => setMaxAsociaciones(v.replace(/[^0-9]/g, ''))}
                  placeholder="3"
                  keyboardType="numeric"
                />
                {errors.maxAsociaciones && <ErrorText text={errors.maxAsociaciones} />}
              </FormSection>
            )}
          </>
        )}

        {!esLote && (
          <FormSection title="¿Desde cuándo y hasta cuándo está disponible?" subtitle="Toca el día de inicio y luego el día final.">
            <DateRangePickerChip
              label=""
              startDate={fechaDisponibilidad}
              endDate={vigencia}
              onChange={(start, end) => {
                setFechaDisponibilidad(start);
                setVigencia(end);
              }}
            />
          </FormSection>
        )}

        {!esLote && !esServicio && (
          <FormSection title="¿Dónde se entrega o recolecta?" subtitle="Solo compartimos una zona aproximada.">
            <TouchableOpacity style={styles.locationButton} onPress={handleGetLocation} disabled={isLoadingGps}>
              <Ionicons name="locate" size={18} color={COLORS.bgTeal} />
              <Text style={styles.locationButtonText}>
                {isLoadingGps ? 'Obteniendo ubicación…' : 'Usar mi ubicación actual'}
              </Text>
            </TouchableOpacity>
            <View style={styles.mapContainer}>
              <LocationPickerMap
                selectedPosition={ubicacion}
                instructionText="Toca el mapa para marcar el punto de entrega o recolección"
                helperText="Puedes mover el pin para ajustar el punto"
                onLocationSelect={(latitud, longitud) => setUbicacion({ latitud, longitud })}
              />
            </View>
          </FormSection>
        )}

        {!esServicio && (
          <FormSection title="Forma de entrega">
            <SingleOptions options={FORMA_ENTREGA_OPCIONES} selected={formaEntrega || ''} onSelect={setFormaEntrega} error={esLote ? errors.formaEntrega : undefined} />
          </FormSection>
        )}

        {!esLote && modo === 'proactiva' && (
          <FormSection title="Frecuencia">
            <SingleOptions options={FRECUENCIA_OPCIONES} selected={frecuencia || ''} onSelect={setFrecuencia} />
          </FormSection>
        )}

        {!esLote && (
          <FormSection title="Evidencia fotográfica" subtitle="Opcional.">
            <TouchableOpacity onPress={handlePickFoto} style={styles.fotoBoton} disabled={isUploadingFoto}>
              {isUploadingFoto ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : fotoUrl ? (
                <Image
                  source={{ uri: fotoUrl }}
                  style={[styles.fotoPreview, fotoAspectRatio ? { aspectRatio: fotoAspectRatio } : null]}
                  resizeMode="contain"
                />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={20} color={COLORS.bgTeal} />
                  <Text style={styles.locationButtonText}>Subir foto</Text>
                </>
              )}
            </TouchableOpacity>
          </FormSection>
        )}
      </>
    );
  };

  const renderInvitar = () => (
    <FormSection
      title="Asociaciones cercanas compatibles"
      subtitle={
        divisible === 'no'
          ? 'Este lote no se reparte: elige solo una asociación destino.'
          : 'Ordenadas por cercanía a tu zona de cobertura. Toca las que quieras invitar.'
      }
    >
      {isLoadingAsociaciones ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
      ) : asociacionesCompatibles.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Ionicons name="location-outline" size={32} color={COLORS.textLight} style={{ marginBottom: 8 }} />
          <Text style={[styles.sectionSubtitle, { textAlign: 'center', marginBottom: 0 }]}>
            No encontramos asociaciones verificadas cerca de tu zona por ahora.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {asociacionesCompatibles.map((a) => {
            const active = asociacionesSeleccionadas.includes(a.id);
            return (
              <TouchableOpacity
                key={a.id}
                onPress={() => toggleAsociacionSeleccionada(a.id)}
                activeOpacity={0.7}
                style={[styles.asocRow, active && styles.asocRowActive]}
              >
                <AssocAvatar nombre={a.nombre} logoUrl={null} size="sm" colors={[COLORS.bgTeal, COLORS.primary, COLORS.secondary]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.asocNombre}>{a.nombre}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Ionicons name="location-outline" size={11} color={COLORS.textLight} />
                    <Text style={styles.asocDistancia}>{a.distancia_km.toFixed(1)} km de distancia</Text>
                  </View>
                </View>
                <View style={[styles.asocCheck, active && styles.asocCheckActive]}>
                  {active && <Ionicons name="checkmark" size={14} color={COLORS.bgWhite} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </FormSection>
  );

  const estadoPantalla: 'invitar' | 'postEnvio' | 'paso' = mostrarInvitar ? 'invitar' : mostrarPostEnvio ? 'postEnvio' : 'paso';

  return (
    <View style={styles.outerContainer}>
      <Toast toast={toast} translateY={translateY} />
      <View style={styles.centeredContent}>
        <View style={styles.card}>
          <View style={styles.header}>
            {estadoPantalla === 'paso' && (
              <TouchableOpacity style={styles.headerButton} onPress={retroceder}>
                <Ionicons name="chevron-back" size={22} color={COLORS.bgWhite} />
              </TouchableOpacity>
            )}
            <View style={styles.headerText}>
              <Text style={styles.title}>{esLote ? 'Registrar un lote' : 'Registrar una aportación'}</Text>
              <Text style={styles.subtitle}>
                {estadoPantalla === 'invitar'
                  ? '¿A quién quieres invitar?'
                  : estadoPantalla === 'postEnvio'
                  ? '¡Listo! Tu aportación fue registrada'
                  : `Paso ${paso} de ${PASOS.length}: ${PASOS[paso - 1]}`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => (estadoPantalla === 'paso' ? setShowCloseConfirm(true) : terminarFlujo())}
            >
              <Ionicons name="close" size={22} color={COLORS.bgWhite} />
            </TouchableOpacity>
            {estadoPantalla === 'paso' && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(paso / PASOS.length) * 100}%` }]} />
              </View>
            )}
          </View>

          {estadoPantalla === 'postEnvio' ? (
            <>
              <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <FormSection
                  title="¿Quieres agregar otro recurso?"
                  subtitle="Puedes registrar otra aportación ahora mismo, o terminar aquí."
                >
                  <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                    <Ionicons name="checkmark-circle" size={56} color={COLORS.bgTeal} />
                  </View>
                </FormSection>
              </ScrollView>
              <View style={styles.fixedFooter}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={terminarFlujo}>
                    <Text style={styles.secondaryButtonText}>No, terminar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryButton, { flex: 1 }]} onPress={reiniciarParcial}>
                    <Text style={styles.primaryButtonText}>Sí, agregar otro</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : estadoPantalla === 'invitar' ? (
            invitacionesEnviadas ? (
              <>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                  <FormSection title="¡Listo!">
                    <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                      <Ionicons name="checkmark-circle" size={56} color={COLORS.bgTeal} />
                      <Text style={[styles.sectionSubtitle, { textAlign: 'center', marginTop: 12 }]}>
                        Invitamos a {asociacionesSeleccionadas.length} asociación(es). Te avisamos cuando respondan.
                      </Text>
                    </View>
                  </FormSection>
                </ScrollView>
                <View style={styles.fixedFooter}>
                  <TouchableOpacity style={styles.primaryButton} onPress={terminarFlujo}>
                    <Text style={styles.primaryButtonText}>Terminar</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                  {renderInvitar()}
                </ScrollView>
                <View style={styles.fixedFooter}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={terminarFlujo}>
                      <Text style={styles.secondaryButtonText}>Invitar después</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryButton, { flex: 1, opacity: asociacionesSeleccionadas.length ? 1 : 0.5 }]}
                      onPress={handleInvitar}
                      disabled={!asociacionesSeleccionadas.length || isInvitando}
                    >
                      {isInvitando ? (
                        <ActivityIndicator color={COLORS.bgWhite} />
                      ) : (
                        <Text style={styles.primaryButtonText}>Invitar ({asociacionesSeleccionadas.length})</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )
          ) : (
            <>
              <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {renderPaso()}
              </ScrollView>
              <View style={styles.fixedFooter}>
                <TouchableOpacity style={styles.primaryButton} onPress={avanzar} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <ActivityIndicator color={COLORS.bgWhite} />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>
                        {paso === PASOS.length
                          ? esLote
                            ? 'Registrar lote y elegir asociaciones'
                            : modo === 'reactiva'
                            ? 'Registrar aportación'
                            : 'Registrar disponibilidad'
                          : 'Continuar'}
                      </Text>
                      {paso !== PASOS.length && <Ionicons name="arrow-forward" size={18} color={COLORS.bgWhite} />}
                    </>
                  )}
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

// ─── Helpers locales ─────────

function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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
              <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={active ? COLORS.bgWhite : COLORS.textLight} />
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
              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? COLORS.bgWhite : COLORS.textLight} />
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

function ErrorText({ text }: { text: string }) {
  return <Text style={styles.errorText}>{text}</Text>;
}

// TextInput mínimo con el mismo estilo `input` de CapacidadesFormScreen —
// no se reusa src/components/ui/Input porque ese componente trae su propio
// look (NativeWind) distinto al de este patrón.
function TextInputField(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
}) {
  return (
    <TextInput
      style={styles.input}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={COLORS.textLight}
      keyboardType={props.keyboardType}
    />
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
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, backgroundColor: 'rgba(255,255,255,0.25)' },
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
  locationButton: { flexDirection: 'row', alignItems: 'center', gap: 7, marginVertical: 10 },
  locationButtonText: { color: COLORS.bgTeal, fontSize: 14, fontWeight: '800' },
  mapContainer: { height: 260, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  inputGroup: { marginTop: 12 },
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
  errorText: { color: COLORS.danger, fontSize: 12, fontWeight: '700', marginTop: 8 },
  helperText: { color: COLORS.textLight, fontSize: 12, lineHeight: 18, marginTop: 10 },
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
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.58)' },
  confirmCard: { width: '100%', maxWidth: 440, padding: 28, borderRadius: 25, backgroundColor: COLORS.bgWhite },
  confirmTitle: { color: COLORS.textDark, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  confirmText: { color: COLORS.textLight, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  fotoBoton: {
    minHeight: 96,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.bgTeal,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.grayLight,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  fotoPreview: { width: '100%', maxHeight: 260, alignSelf: 'center' },
  asocRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgWhite,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  asocRowActive: { borderColor: COLORS.bgTeal, backgroundColor: `${COLORS.bgTeal}0D` },
  asocNombre: { color: COLORS.textDark, fontSize: 14, fontWeight: '800' },
  asocDistancia: { color: COLORS.textLight, fontSize: 12 },
  asocCheck: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bgWhite,
  },
  asocCheckActive: { backgroundColor: COLORS.bgTeal, borderColor: COLORS.bgTeal },
});