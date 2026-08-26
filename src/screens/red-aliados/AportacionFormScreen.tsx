import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import axios from 'axios';
import { addDays } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { validarEmail, validarTelefono } from '../../utils/validators';
import { puedeOfrecerDisponibilidadAbierta } from '../../utils/aliadoPermissions';
import { Toast, useToast } from '../../components/Toast';
import {
  CategoriaSubcategoriaSelector,
  CatalogoItem,
} from '../../components/red-aliados/CategoriaSubcategoriaSelector';
import { DatePickerChip } from '../../components/red-aliados/DatePickerChip';
import { DateRangePickerChip } from '../../components/red-aliados/DateRangePickerChip';
import { AssocAvatar } from '../../components/admin-dashboard/AssocAvatar';
import LocationPickerMap from '../LocationPickerMap';
import { getFormDraft, removeFormDraft, setFormDraft } from '../../services/formDraftStorage';
import { createFormDraftEnvelope, parseFormDraftEnvelope } from '../../utils/formDraft';
import { getDeviceToken } from '../../utils/deviceToken';

const APORTACION_DRAFT_VERSION = 1;
const APORTACION_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
const APORTACION_DRAFT_SAVE_DELAY_MS = 800;
const APORTACION_DRAFT_KEY_PREFIX = '@pawalert:draft:aportacion';

interface AportacionFormDraftData {
  paso: number;
  modo: 'reactiva' | 'proactiva';
  haElegidoProactiva: boolean;
  categoria: CatalogoItem | null;
  subcategoria: CatalogoItem | null;
  especiesAplica: Especie[];
  tamanio: string | null;
  detalleValores: Record<string, string>;
  detalleFechasStr: Record<string, string | null>;
  detalleFechasNoAplica: Record<string, boolean>;
  detalleMulti: Record<string, string[]>;
  tipoApoyo: string[];
  areaServicio: string | null;
  areaOtro: string;
  contactoNombre: string;
  contactoCargo: string;
  contactoTelefono: string;
  contactoCorreo: string;
  cantidadValor: string;
  cantidadUnidad: string;
  unidadEsOtra: boolean;
  contenidoPorUnidad: string;
  fechaDisponibilidadStr: string | null;
  ubicacion: { latitud: number; longitud: number } | null;
  direccionBusqueda: string;
  direccionConfirmada: string;
  direccionEstado: string;
  direccionMunicipio: string;
  direccionCalle: string;
  direccionCodigoPostal: string;
  direccionColonia: string;
  formaEntrega: string | null;
  vigenciaStr: string | null;
  frecuencia: string | null;
  fotoUrl: string | null;
  esLote: boolean;
  tipoEmpaque: string;
  divisible: string | null;
  maxAsociaciones: string;
}

function isAportacionFormDraftData(value: unknown): value is AportacionFormDraftData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AportacionFormDraftData>;
  return typeof candidate.paso === 'number';
}

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

// Shape resumido de GET /red-aliados/necesidades/{id} — solo lo que se
// muestra en la tarjeta de resumen de solo lectura (vieneDeNecesidad).
type NecesidadDetalle = {
  categoria: string;
  subcategoria: { descripcion: string } | null;
  especies: string[];
  etapa: string | null;
  dietaEspecial: string | null;
  urgencia: string | null;
  cantidadValor: number | null;
  cantidadUnidad: string | null;
  asociacion: {
    nombre: string;
    calle: string | null;
    colonia: string | null;
    municipio: string | null;
    referencia: string | null;
    latitud: number | null;
    longitud: number | null;
  } | null;
};

// Etiquetas locales solo para el resumen de solo lectura — no se tocan
// CAMPOS_CONDICIONALES ni CategoriaSubcategoriaSelector.tsx; son los mismos
// values que ya usan esos catálogos, solo se duplica el label a mostrar.
const ETAPA_LABELS: Record<string, string> = {
  bebe: 'Bebé', cachorro: 'Cachorro', adulto: 'Adulto', senior: 'Senior', cualquier_etapa: 'Cualquier etapa',
};
const DIETA_LABELS: Record<string, string> = {
  regular: 'Regular', gastrointestinal: 'Gastrointestinal', renal: 'Renal', control_peso: 'Control de peso', otra: 'Otra',
};
const URGENCIA_LABELS: Record<string, string> = {
  critico: 'Alta', urgente: 'Media', no_urgente: 'Baja',
};
const URGENCIA_COLOR: Record<string, string> = {
  critico: COLORS.danger, urgente: COLORS.primary, no_urgente: COLORS.bgTeal,
};
type AddressSearchResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
};

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
    { key: 'etapa', label: 'Etapa', tipo: 'single', required: true, opciones: [
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
      required: true,
      opciones: [
        { value: 'regular', label: 'Regular' },
        { value: 'gastrointestinal', label: 'Gastrointestinal' },
        { value: 'renal', label: 'Renal' },
        { value: 'control_peso', label: 'Control de peso' },
        { value: 'otra', label: 'Otra' },
      ],
    },
    { key: 'producto_cerrado', label: '¿El producto está cerrado?', tipo: 'boolean', required: true},
    { key: 'marca', label: 'Marca (opcional)', tipo: 'texto' },
    { key: 'peso_por_empaque', label: 'Peso por empaque', tipo: 'texto', numerico: true, required:true},
    { key: 'numero_empaques', label: 'Número de empaques', tipo: 'texto', numerico: true, required:true},
    { key: 'fecha_caducidad', label: 'Fecha de caducidad', tipo: 'fecha', required:true },
  ],
  insumos: [
    {
      key: 'nuevo_o_usado',
      label: 'Nuevo o usado',
      tipo: 'single',
      required:true,
      opciones: [
        { value: 'nuevo', label: 'Nuevo' },
        { value: 'usado', label: 'Usado en buen estado' },
      ],
    },
    { key: 'descripcion_contenido', label: 'Descripción del contenido (solo kits) · Opcional', tipo: 'texto' },
    { key: 'fecha_caducidad', label: 'Fecha de caducidad del producto', tipo: 'fecha', required:true},
  ],
  servicios_veterinarios: [
    {
      key: 'nivel',
      label: 'Nivel que puede recibir',
      tipo: 'single',
      required:true,
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
      required:true,
      opciones: [
        { value: 'semana', label: 'Por semana' },
        { value: 'mes', label: 'Por mes' },
        { value: 'campana', label: 'Por campaña' },
      ],
    },
    // 'numero_atenciones' se quitó por redundante: el paso 3 ya pregunta
    // la cantidad ("Capacidad declarada"/"Cantidad") para cualquier
    // categoría, no hace falta preguntarla dos veces solo para este caso.
    { key: 'requiere_cita', label: '¿Requiere cita?', tipo: 'boolean', required:true},
    { key: 'dias', label: 'Días disponibles', tipo: 'multi', opciones: DIAS_SEMANA, required:true},
    { key: 'horario', label: 'Horario', tipo: 'multi', opciones: FRANJAS_HORARIO, required:true },
    { key: 'restricciones', label: 'Restricciones', tipo: 'texto', required:true},
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
  // Navegar a una necesidad puntual no equivale a cancelar el formulario:
  // algunos contenedores (como Perfil) usan onClose para restaurar el panel
  // de donaciones. Separamos ambos destinos para no reabrir ese modal encima
  // de "Cómo ayudar".
  onOpenNeeds?: () => void;
}

export default function AportacionFormScreen({ onClose, onOpenNeeds }: Props) {
  const { token, user } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const { width: viewportWidth } = useWindowDimensions();
  const mostrarPresentacionEnColumnas = viewportWidth >= 900;
  const permiteDisponibilidadProactiva = puedeOfrecerDisponibilidadAbierta(
    user?.tipo_perfil_apoyo,
  );
  
  // ─── AQUÍ ATRAPAMOS EL PARÁMETRO QUE MANDASTE ───
  const { necesidad_id } = useLocalSearchParams<{ necesidad_id?: string }>();
  // Fijado UNA SOLA VEZ con el valor del primer render — no un const derivado
  // directo de useLocalSearchParams(), porque el useEffect de abajo limpia
  // el param de la URL con router.setParams(), lo que dispara un re-render
  // donde necesidad_id ya viene undefined. Si esto fuera un const recalculado
  // en cada render, vieneDeNecesidad pasaría de true a false apenas se monta
  // el componente, ANTES de que el usuario toque la categoría — anulando el
  // guard de onChangeCategoria de abajo.
  const [vieneDeNecesidad] = useState(() => Boolean(necesidad_id));
  const [haElegidoProactiva, setHaElegidoProactiva] = useState(false);
  const [paso, setPaso] = useState(1);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [mostrarPostEnvio, setMostrarPostEnvio] = useState(false);
  const [isLoadingGps, setIsLoadingGps] = useState(false);

  const [modo, setModo] = useState<Modo>('reactiva');
  // ─── AQUÍ LO INYECTAMOS EN EL ESTADO ───
  const [necesidadId, setNecesidadId] = useState(necesidad_id || '');

  // Mismo patrón que (tabs)/profile.tsx con abrirFormularioAliado — limpia
  // el param de la URL una vez leído, para que no se quede visible
  // indefinidamente. El estado necesidadId ya quedó capturado arriba, así
  // que esto es solo higiene de la barra de direcciones.
  useEffect(() => {
    if (draftInitializationStartedRef.current) return;
    draftInitializationStartedRef.current = true;
    let active = true;

    (async () => {
      // Diferenciamos si es una oferta abierta o respondiendo a una necesidad específica
      const idPart = vieneDeNecesidad ? (necesidadId || 'reactiva') : 'proactiva';
      const storageKey = `${APORTACION_DRAFT_KEY_PREFIX}:${user?.id || await getDeviceToken()}:${idPart}:v${APORTACION_DRAFT_VERSION}`;
      
      if (!active) return;
      setDraftStorageKey(storageKey);

      const raw = await getFormDraft(storageKey);
      if (!active || !raw) {
        if (active) setIsDraftReady(true);
        return;
      }

      const parsed = parseFormDraftEnvelope<AportacionFormDraftData>(raw, APORTACION_DRAFT_VERSION);
      if (parsed.status !== 'valid' || !isAportacionFormDraftData(parsed.draft.data)) {
        await removeFormDraft(storageKey);
        if (active) setIsDraftReady(true);
        return;
      }

      const d = parsed.draft.data;
      
      setPaso(d.paso || 1);
      setModo(d.modo || 'reactiva');
      setHaElegidoProactiva(!!d.haElegidoProactiva);
      
      // Si viene de una necesidad (solo lectura), no sobreescribimos la categoría/subcategoría local 
      // porque el API de backend ya nos mandó la data oficial en otro useEffect.
      if (!vieneDeNecesidad) {
        setCategoria(d.categoria || null);
        setSubcategoria(d.subcategoria || null);
        setEspeciesAplica(d.especiesAplica || []);
        setCantidadValor(d.cantidadValor || '');
        setCantidadUnidad(d.cantidadUnidad || '');
        if (d.fechaDisponibilidadStr) setFechaDisponibilidad(new Date(d.fechaDisponibilidadStr));
      }
      
      setTamanio(d.tamanio || null);
      setDetalleValores(d.detalleValores || {});
      
      // Reconstruir fechas serializadas
      const rebuiltFechas: Record<string, Date | null> = {};
      if (d.detalleFechasStr) {
        Object.keys(d.detalleFechasStr).forEach(k => {
          const val = d.detalleFechasStr[k];
          rebuiltFechas[k] = val ? new Date(val) : null;
        });
      }
      setDetalleFechas(rebuiltFechas);
      setDetalleFechasNoAplica(d.detalleFechasNoAplica || {});
      setDetalleMulti(d.detalleMulti || {});
      setTipoApoyo(d.tipoApoyo || []);
      setAreaServicio(d.areaServicio || null);
      setAreaOtro(d.areaOtro || '');
      setContactoNombre(d.contactoNombre || '');
      setContactoCargo(d.contactoCargo || '');
      setContactoTelefono(d.contactoTelefono || '');
      setContactoCorreo(d.contactoCorreo || '');
      
      setUnidadEsOtra(!!d.unidadEsOtra);
      setContenidoPorUnidad(d.contenidoPorUnidad || '');
      setUbicacion(d.ubicacion || null);
      setDireccionBusqueda(d.direccionBusqueda || '');
      setDireccionConfirmada(d.direccionConfirmada || '');
      setDireccionEstado(d.direccionEstado || '');
      setDireccionMunicipio(d.direccionMunicipio || '');
      setDireccionCalle(d.direccionCalle || '');
      setDireccionCodigoPostal(d.direccionCodigoPostal || '');
      setDireccionColonia(d.direccionColonia || '');
      setFormaEntrega(d.formaEntrega || null);
      if (d.vigenciaStr) setVigencia(new Date(d.vigenciaStr));
      setFrecuencia(d.frecuencia || null);
      setFotoUrl(d.fotoUrl || null);
      setEsLote(!!d.esLote);
      setTipoEmpaque(d.tipoEmpaque || '');
      setDivisible(d.divisible || null);
      setMaxAsociaciones(d.maxAsociaciones || '1');
      
      setShowDraftNotice(true);
      setIsDraftReady(true);
    })().catch(() => {
      if (active) setIsDraftReady(true);
    });

    return () => { active = false; };
  }, [vieneDeNecesidad, necesidadId, user?.id]);

  const [categoria, setCategoria] = useState<CatalogoItem | null>(null);
  const [subcategoria, setSubcategoria] = useState<CatalogoItem | null>(null);
  const [especiesAplica, setEspeciesAplica] = useState<Especie[]>([]);
  const [tamanio, setTamanio] = useState<string | null>(null);

  const [necesidadDetalle, setNecesidadDetalle] = useState<NecesidadDetalle | null>(null);
  const [isLoadingNecesidad, setIsLoadingNecesidad] = useState(false);

  // Cuando se llega desde una necesidad puntual, categoría/subcategoría/
  // especies ya las fijó la asociación al publicarla — se traen aquí y se
  // muestran de solo lectura (Paso 1), en vez de dejar que el aliado las
  // vuelva a elegir con el selector interactivo normal.
  useEffect(() => {
    if (!vieneDeNecesidad || !necesidadId) return;
    let vigente = true;
    (async () => {
      setIsLoadingNecesidad(true);
      try {
        const res = await axios.get(`${API_URL}/red-aliados/necesidades/${necesidadId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!vigente) return;
        const data = res.data;
        const sub = data.subcategoria_recurso;
        const detalle = data.detalle || {};
        const especies: string[] = detalle.especies_aplica || [];

        // categoria/subcategoria sí se setean (aunque no se rendericen de
        // forma interactiva) porque el resto del wizard los sigue
        // necesitando tal cual: camposCondicionalesBase,
        // subcategoria?.requiere_tamanio en Paso 2, y
        // categoria!.clave/subcategoria!.id en el payload final.
        setCategoria({ id: data.categoria, clave: data.categoria, descripcion: data.categoria });
        if (sub) {
          setSubcategoria({ id: sub.id, clave: sub.clave, descripcion: sub.descripcion, requiere_tamanio: sub.requiere_tamanio });
        }
        // especiesAplica también se precarga (silenciosa, no editable): es
        // un campo de nivel superior del payload (no vive dentro de
        // `detalle`), así que si no se setea aquí la contribución se
        // mandaría con especies_aplica: [] pese a que la necesidad sí las pedía.
        setEspeciesAplica(especies as Especie[]);

        // Mismo criterio: `ubicacion` alimenta lugar_entrega en el payload
        // final — sin esto quedaría null (nunca se toca en este modo) y se
        // perdería el dato pese a que la dirección real ya se conoce.
        const asoc = data.asociaciones;
        if (asoc?.latitud != null && asoc?.longitud != null) {
          setUbicacion({ latitud: asoc.latitud, longitud: asoc.longitud });
        }

        // cantidadValor/cantidadUnidad también se precargan (y quedan
        // bloqueados en el render, ver Paso 3) con lo que pidió la
        // necesidad — no tiene caso volver a preguntarlos.
        if (data.cantidad_valor != null) setCantidadValor(String(data.cantidad_valor));
        if (data.cantidad_unidad) setCantidadUnidad(data.cantidad_unidad);

        setNecesidadDetalle({
          categoria: data.categoria,
          subcategoria: sub ? { descripcion: sub.descripcion } : null,
          especies,
          etapa: detalle.etapa || null,
          dietaEspecial: detalle.dieta_especial || null,
          urgencia: data.urgencia || null,
          cantidadValor: data.cantidad_valor ?? null,
          cantidadUnidad: data.cantidad_unidad || null,
          asociacion: asoc
            ? {
                nombre: asoc.nombre,
                calle: asoc.calle || null,
                colonia: asoc.colonia || null,
                municipio: asoc.municipio || null,
                referencia: asoc.referencia || null,
                latitud: asoc.latitud ?? null,
                longitud: asoc.longitud ?? null,
              }
            : null,
        });
      } catch {
        showToast({ type: 'error', title: 'Error', message: 'No pudimos cargar el detalle de esta necesidad.' });
      } finally {
        if (vigente) setIsLoadingNecesidad(false);
      }
    })();
    return () => { vigente = false; };
  }, [vieneDeNecesidad, necesidadId, token]);

  // Sugerencia de fecha de entrega: hoy + 7 días, editable — el aliado
  // puede adelantarla si puede entregar antes. `vieneDeNecesidad` nunca
  // cambia después del montaje, así que este efecto corre una sola vez.
  useEffect(() => {
    if (vieneDeNecesidad) setFechaDisponibilidad(addDays(new Date(), 7));
  }, [vieneDeNecesidad]);

  const [detalleValores, setDetalleValores] = useState<Record<string, string>>({});
  const [detalleFechas, setDetalleFechas] = useState<Record<string, Date | null>>({});
  const [detalleFechasNoAplica, setDetalleFechasNoAplica] = useState<Record<string, boolean>>({});
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
  const [unidadMenuAbierto, setUnidadMenuAbierto] = useState(false);
  const [contenidoPorUnidad, setContenidoPorUnidad] = useState('');
  const [fechaDisponibilidad, setFechaDisponibilidad] = useState<Date | null>(null);
  const [ubicacion, setUbicacion] = useState<{ latitud: number; longitud: number } | null>(null);
  const [direccionBusqueda, setDireccionBusqueda] = useState('');
  const [direccionResultados, setDireccionResultados] = useState<AddressSearchResult[]>([]);
  const [direccionConfirmada, setDireccionConfirmada] = useState('');
  const [isBuscandoDireccion, setIsBuscandoDireccion] = useState(false);
  const [direccionBusquedaMensaje, setDireccionBusquedaMensaje] = useState('');
  const direccionBusquedaIdRef = useRef(0);
  const ultimaBusquedaAutomaticaRef = useRef('');
  const [direccionEstado, setDireccionEstado] = useState('');
  const [direccionMunicipio, setDireccionMunicipio] = useState('');
  const [direccionCalle, setDireccionCalle] = useState('');
  const [direccionCodigoPostal, setDireccionCodigoPostal] = useState('');
  const [direccionColonia, setDireccionColonia] = useState('');
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
  const [maxAsociacionesMenuAbierto, setMaxAsociacionesMenuAbierto] = useState(false);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [mostrarInvitar, setMostrarInvitar] = useState(false);
  const [asociacionesCompatibles, setAsociacionesCompatibles] = useState<{ id: string; nombre: string; distancia_km: number }[]>([]);
  const [asociacionesSeleccionadas, setAsociacionesSeleccionadas] = useState<string[]>([]);
  const [isLoadingAsociaciones, setIsLoadingAsociaciones] = useState(false);
  const [isInvitando, setIsInvitando] = useState(false);
  const [invitacionesEnviadas, setInvitacionesEnviadas] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formScrollRef = useRef<ScrollView>(null);

  // ─── Borrador (guardar progreso al recargar) ───
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [draftStorageKey, setDraftStorageKey] = useState<string | null>(null);
  const [showDraftNotice, setShowDraftNotice] = useState(false);
  const draftInitializationStartedRef = useRef(false);
  const draftPersistenceDisabledRef = useRef(false);

  useEffect(() => {
    formScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [paso]);

  const especiesDisponibles: Especie[] =
    (subcategoria?.especies_aplicables as Especie[] | undefined) || ['perro', 'gato'];
  const camposCondicionalesBase = categoria ? CAMPOS_CONDICIONALES[categoria.clave] || [] : [];
  // Para un lote, "peso por empaque" y "número de empaques" ya quedan
  // cubiertos por "¿Cómo viene empacado?" + la cantidad total del paso 3
  // — no tiene caso preguntarlos dos veces con otras palabras.
  const camposCondicionalesSinLote = esLote
    ? camposCondicionalesBase.filter((c) => c.key !== 'peso_por_empaque' && c.key !== 'numero_empaques')
    : camposCondicionalesBase;
  // etapa/dieta_especial describen lo que la necesidad pide (ya se
  // muestran en la tarjeta de resumen de solo lectura del Paso 1) — no
  // tiene caso volver a preguntarlas aquí cuando vieneDeNecesidad. El
  // resto de campos condicionales (producto_cerrado, marca, etc.) sí
  // siguen siendo del ítem propio del aliado, se quedan igual.
  const camposCondicionales = vieneDeNecesidad
    ? camposCondicionalesSinLote.filter((c) => c.key !== 'etapa' && c.key !== 'dieta_especial')
    : camposCondicionalesSinLote;
  const esDifusion = categoria?.clave === 'difusion_campanas';
  // Un lote es una donación grande "suelta" que luego se reparte entre
  // varias asociaciones — no tiene sentido si ya se está aportando a una
  // necesidad puntual de una asociación específica.
  const esLoteAplicable = !vieneDeNecesidad && (categoria?.clave === 'alimentos' || categoria?.clave === 'insumos');
  // Servicios (veterinarios/difusión) no son un bien físico — no tiene
  // sentido preguntarles zona de entrega/recolección ni forma de entrega,
  // eso es logística de un objeto que se transporta.
  const esServicio = categoria?.clave === 'servicios_veterinarios' || categoria?.clave === 'difusion_campanas';

  // Solo se usa cuando vieneDeNecesidad (stepper +/- en vez de texto
  // libre) — nunca baja de 1.
  const stepCantidadValor = (delta: number) => {
    const actual = Number(cantidadValor) || 0;
    setCantidadValor(String(Math.max(1, actual + delta)));
  };

  const completarCamposDireccion = (address: Record<string, string> = {}) => {
    const calle = address.road || address.pedestrian || address.square || address.footway || address.path || '';
    const numero = address.house_number || '';
    setDireccionCalle([calle, numero].filter(Boolean).join(' '));
    setDireccionColonia(
      address.suburb ||
      address.neighbourhood ||
      address.colonia ||
      address.city_district ||
      address.quarter ||
      address.residential ||
      address.village ||
      ''
    );
    setDireccionMunicipio(address.city || address.town || address.municipality || address.county || '');
    setDireccionEstado(address.state || '');
    setDireccionCodigoPostal((address.postcode || '').replace(/\D/g, '').slice(0, 5));
  };

  const buscarDireccion = async (params: Record<string, string>) => {
    const requestId = ++direccionBusquedaIdRef.current;
    setIsBuscandoDireccion(true);
    setDireccionBusquedaMensaje('');
    setDireccionResultados([]);
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          ...params,
          format: 'jsonv2',
          addressdetails: 1,
          limit: 6,
          countrycodes: 'mx',
          'accept-language': 'es',
        },
      });
      const resultados = (res.data || []) as AddressSearchResult[];
      if (requestId !== direccionBusquedaIdRef.current) return;
      setDireccionResultados(resultados);
      if (resultados.length && params.q) {
        const primeraCoincidencia = resultados[0];
        const latitud = Number(primeraCoincidencia.lat);
        const longitud = Number(primeraCoincidencia.lon);
        ultimaBusquedaAutomaticaRef.current = String(params.q).trim();
        setUbicacion({ latitud, longitud });
        setDireccionConfirmada(primeraCoincidencia.display_name);
        completarCamposDireccion(primeraCoincidencia.address);
      } else if (!resultados.length) {
        setDireccionBusquedaMensaje(
          'No encontramos una coincidencia exacta. Completa los campos y usa “Ubicar estos datos”, o marca el punto directamente en el mapa.'
        );
      }
    } catch {
      if (requestId !== direccionBusquedaIdRef.current) return;
      setDireccionBusquedaMensaje(
        'El servicio de direcciones no respondió. Puedes usar tu ubicación actual o marcar el punto en el mapa.'
      );
    } finally {
      if (requestId === direccionBusquedaIdRef.current) {
        setIsBuscandoDireccion(false);
      }
    }
  };

  useEffect(() => {
    const query = direccionBusqueda.trim();
    if (
      query.length < 4 ||
      query === direccionConfirmada.trim() ||
      query === ultimaBusquedaAutomaticaRef.current
    ) {
      if (query.length < 4) {
        direccionBusquedaIdRef.current += 1;
        ultimaBusquedaAutomaticaRef.current = '';
        setIsBuscandoDireccion(false);
        setDireccionResultados([]);
      }
      return;
    }

    const timeoutId = setTimeout(() => {
      void buscarDireccion({ q: query });
    }, 650);

    return () => clearTimeout(timeoutId);
  }, [direccionBusqueda, direccionConfirmada]);

  const buscarDireccionEstructurada = () => {
    const street = direccionCalle.trim();
    const city = direccionMunicipio.trim();
    const state = direccionEstado.trim();
    const postalcode = direccionCodigoPostal.trim();
    if (!street && !city && !state && !postalcode) {
      setDireccionBusquedaMensaje('Completa al menos calle, municipio, estado o código postal.');
      return;
    }
    buscarDireccion({
      ...(street ? { street } : {}),
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
      ...(postalcode ? { postalcode } : {}),
    });
  };

  const reverseGeocode = async (latitud: number, longitud: number) => {
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: { lat: latitud, lon: longitud, format: 'json', addressdetails: 1 },
      });
      const direccion = res.data?.display_name || '';
      completarCamposDireccion(res.data?.address || {});
      setDireccionConfirmada(direccion);
      setDireccionBusqueda(direccion);
      setDireccionResultados([]);
    } catch {
      setDireccionConfirmada('');
    }
  };

  const seleccionarDireccion = (resultado: AddressSearchResult) => {
    direccionBusquedaIdRef.current += 1;
    const latitud = Number(resultado.lat);
    const longitud = Number(resultado.lon);
    setUbicacion({ latitud, longitud });
    setDireccionBusqueda(resultado.display_name);
    setDireccionConfirmada(resultado.display_name);
    completarCamposDireccion(resultado.address);
    setDireccionResultados([]);
    setDireccionBusquedaMensaje('');
  };

  const seleccionarUbicacionMapa = (latitud: number, longitud: number) => {
    setUbicacion({ latitud, longitud });
    reverseGeocode(latitud, longitud);
  };

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
    if (value) setDetalleFechasNoAplica((prev) => ({ ...prev, [key]: false }));
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
      reverseGeocode(current.coords.latitude, current.coords.longitude);
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
        else if (detalleFechasNoAplica[c.key]) detalle[c.key] = 'no_aplica';
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

  // Mismo patrón que SeguimientoAliadoCard.tsx (staff-dashboard) para el
  // botón "Cómo llegar" — se duplica la lógica en vez de importar ese
  // componente porque toma props distintas (contacto/ubicación de un
  // aliado veterinario, no de una asociación).
  const direccionAsociacionTexto = necesidadDetalle?.asociacion
    ? [necesidadDetalle.asociacion.calle, necesidadDetalle.asociacion.colonia, necesidadDetalle.asociacion.municipio]
        .filter(Boolean)
        .join(', ')
    : '';

  const abrirComoLlegar = () => {
    const asoc = necesidadDetalle?.asociacion;
    if (!asoc) return;
    const url =
      asoc.latitud != null && asoc.longitud != null
        ? `https://www.google.com/maps/search/?api=1&query=${asoc.latitud},${asoc.longitud}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionAsociacionTexto)}`;
    Linking.openURL(url);
  };
  const direccionEntregaTexto =
    direccionConfirmada.trim() ||
    [
      direccionCalle.trim(),
      direccionColonia.trim(),
      direccionMunicipio.trim(),
      direccionEstado.trim(),
      direccionCodigoPostal.trim(),
    ]
      .filter(Boolean)
      .join(', ');

    const validarPaso = (numero: number, silencioso: boolean = false): boolean => {
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
          
          if (!detalleFechas[c.key] && !detalleFechasNoAplica[c.key]) nuevos[c.key] = 'Este campo es obligatorio.';
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
      // Por seguridad de los animales, un alimento abierto no se puede
      // procesar como donación — bloquea el avance, no solo advierte.
      if (categoria?.clave === 'alimentos' && detalleValores.producto_cerrado === 'no') {
        nuevos.producto_cerrado = 'Por seguridad de los animales, no podemos procesar donaciones de alimento abierto.';
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

      if (!esLote) {
        if (!fechaDisponibilidad) nuevos.fechaDisponibilidad = 'Selecciona una fecha.';
        if (!vieneDeNecesidad && !vigencia) nuevos.vigencia = 'Selecciona la fecha final de disponibilidad.';
        if (!vieneDeNecesidad && !esServicio && !ubicacion) {
          nuevos.ubicacion = 'Selecciona una ubicación en el mapa.';
        }
      }

      if (esLote) {
        if (!tipoEmpaque.trim()) nuevos.tipoEmpaque = 'Describe cómo viene empacado.';
        if (!divisible) nuevos.divisible = 'Selecciona una opción.';
        if (
          divisible
          && divisible !== 'no'
          && (!maxAsociaciones.trim() || Number(maxAsociaciones) < 1 || Number(maxAsociaciones) > 10)
        ) {
          nuevos.maxAsociaciones = 'Selecciona entre 1 y 10 asociaciones.';
        }
        if (!formaEntrega) nuevos.formaEntrega = 'Selecciona una forma de entrega.';
        if (!ubicacion) {
          nuevos.ubicacion = 'Selecciona una sugerencia, usa tu ubicación o ajusta el pin.';
        }
        if (!direccionEstado.trim()) nuevos.direccionEstado = 'Indica el estado.';
        if (!direccionMunicipio.trim()) nuevos.direccionMunicipio = 'Indica el municipio.';
        if (!direccionCalle.trim()) nuevos.direccionCalle = 'Indica la calle.';
        if (!/^\d{5}$/.test(direccionCodigoPostal)) nuevos.direccionCodigoPostal = 'Ingresa un CP de 5 dígitos.';
        if (!direccionColonia.trim()) nuevos.direccionColonia = 'Indica la colonia.';
      }
    }

    setErrors(nuevos);
    if (Object.keys(nuevos).length) {
      if (!silencioso) {
        showToast({ type: 'warning', title: 'Falta información', message: 'Revisa las preguntas marcadas antes de continuar.' });
      }
      return false;
    }
    return true;
  };


useEffect(() => {
  validarPaso(paso, true);
}, [
  paso, categoria, subcategoria, tamanio, detalleValores, detalleFechas, detalleMulti,
  contactoNombre, contactoTelefono, contactoCorreo, cantidadValor, cantidadUnidad,
  contenidoPorUnidad, esLote, tipoEmpaque, divisible, maxAsociaciones, formaEntrega,
  ubicacion, direccionEstado, direccionMunicipio, direccionCalle, direccionCodigoPostal,
  direccionColonia, fechaDisponibilidad, vigencia,
]);

  // ─── Lógica de Auto-Guardado ───
  const aportacionDraftData = React.useMemo<AportacionFormDraftData>(() => {
    const detalleFechasStr: Record<string, string | null> = {};
    Object.keys(detalleFechas).forEach(k => {
      detalleFechasStr[k] = detalleFechas[k] ? detalleFechas[k]!.toISOString() : null;
    });

    return {
      paso, modo, haElegidoProactiva,
      categoria, subcategoria, especiesAplica, tamanio,
      detalleValores, detalleFechasStr, detalleFechasNoAplica, detalleMulti,
      tipoApoyo, areaServicio, areaOtro,
      contactoNombre, contactoCargo, contactoTelefono, contactoCorreo,
      cantidadValor, cantidadUnidad, unidadEsOtra, contenidoPorUnidad,
      fechaDisponibilidadStr: fechaDisponibilidad ? fechaDisponibilidad.toISOString() : null,
      ubicacion, direccionBusqueda, direccionConfirmada,
      direccionEstado, direccionMunicipio, direccionCalle, direccionCodigoPostal, direccionColonia,
      formaEntrega, vigenciaStr: vigencia ? vigencia.toISOString() : null, frecuencia,
      fotoUrl, esLote, tipoEmpaque, divisible, maxAsociaciones,
    };
  }, [
    paso, modo, haElegidoProactiva, categoria, subcategoria, especiesAplica, tamanio,
    detalleValores, detalleFechas, detalleFechasNoAplica, detalleMulti,
    tipoApoyo, areaServicio, areaOtro, contactoNombre, contactoCargo, contactoTelefono, contactoCorreo,
    cantidadValor, cantidadUnidad, unidadEsOtra, contenidoPorUnidad,
    fechaDisponibilidad, ubicacion, direccionBusqueda, direccionConfirmada,
    direccionEstado, direccionMunicipio, direccionCalle, direccionCodigoPostal, direccionColonia,
    formaEntrega, vigencia, frecuencia, fotoUrl, esLote, tipoEmpaque, divisible, maxAsociaciones
  ]);

  const hasMeaningfulDraft = paso > 1 
    || haElegidoProactiva 
    || categoria !== null 
    || cantidadValor.trim() !== '' 
    || ubicacion !== null;

  useEffect(() => {
    if (!isDraftReady || !draftStorageKey || !hasMeaningfulDraft || draftPersistenceDisabledRef.current || mostrarPostEnvio) {
      return;
    }

    const timeout = setTimeout(() => {
      if (draftPersistenceDisabledRef.current) return;
      const envelope = createFormDraftEnvelope(
        aportacionDraftData,
        APORTACION_DRAFT_VERSION,
        APORTACION_DRAFT_TTL_MS,
      );
      void setFormDraft(draftStorageKey, JSON.stringify(envelope));
    }, APORTACION_DRAFT_SAVE_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [aportacionDraftData, draftStorageKey, hasMeaningfulDraft, isDraftReady, mostrarPostEnvio]);

  const clearAportacionDraft = () => {
    draftPersistenceDisabledRef.current = true;
    if (draftStorageKey) void removeFormDraft(draftStorageKey);
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
    setDetalleFechasNoAplica({});
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
    setDireccionBusqueda('');
    setDireccionResultados([]);
    setDireccionConfirmada('');
    setDireccionBusquedaMensaje('');
    setDireccionEstado('');
    setDireccionMunicipio('');
    setDireccionCalle('');
    setDireccionCodigoPostal('');
    setDireccionColonia('');
    setFormaEntrega(null);
    setVigencia(null);
    setFrecuencia(null);
    setFotoUrl(null);
    setFotoAspectRatio(null);
    setEsLote(false);
    setTipoEmpaque('');
    setDivisible(null);
    setMaxAsociaciones('1');
    setMaxAsociacionesMenuAbierto(false);
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
    setDetalleFechasNoAplica({});
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
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      const limite = Number(maxAsociaciones) || 1;
      if (prev.length >= limite) {
        showToast({
          type: 'warning',
          title: 'Límite alcanzado',
          message: `Este lote admite hasta ${limite} asociación(es).`,
        });
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleInvitar = async () => {
    if (!loteId || !asociacionesSeleccionadas.length) return;
    const cantidadObjetivo = divisible === 'no' ? 1 : Number(maxAsociaciones);
    if (asociacionesSeleccionadas.length !== cantidadObjetivo) {
      showToast({
        type: 'warning',
        title: 'Completa tu selección',
        message: cantidadObjetivo === 1
          ? 'Selecciona la asociación que recibirá el lote.'
          : `Selecciona ${cantidadObjetivo} asociaciones antes de enviar.`,
      });
      return;
    }
    const asociacionIds = asociacionesSeleccionadas;
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
            descripcion: detalleValores.descripcion_contenido?.trim() || undefined,
            fecha_disponibilidad: fechaDisponibilidad ? fechaDisponibilidad.toISOString().slice(0, 10) : undefined,
            vigencia: vigencia ? vigencia.toISOString().slice(0, 10) : undefined,
            lugar_entrega: lugarEntregaTexto,
            direccion_entrega: direccionEntregaTexto || undefined,
            direccion_detalle: {
              estado: direccionEstado.trim(),
              municipio: direccionMunicipio.trim(),
              calle: direccionCalle.trim(),
              codigo_postal: direccionCodigoPostal,
              colonia: direccionColonia.trim(),
            },
            detalle: construirDetalle(),
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setLoteId(res.data.id);
        showToast({ type: 'success', title: 'Lote registrado', message: 'Ahora invita a las asociaciones que quieras.' });
        cargarAsociacionesCompatibles(res.data.id);
        setMostrarInvitar(true);
        clearAportacionDraft();
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
      clearAportacionDraft();
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
        <View key={campo.key} style={styles.dateConditionalField}>
          <DatePickerChip
            label={campo.label}
            required={campo.required}
            value={detalleFechas[campo.key] || null}
            onChange={(d) => setCampoFecha(campo.key, d)}
            allowNotApplicable={campo.key === 'fecha_caducidad'}
            notApplicable={!!detalleFechasNoAplica[campo.key]}
            onNotApplicableChange={(value) =>
              setDetalleFechasNoAplica((prev) => ({ ...prev, [campo.key]: value }))
            }
            error={errors[campo.key]}
          />
        </View>
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
          placeholder={campo.key === 'descripcion_contenido' ? 'Opcional: describe qué incluye el kit' : undefined}
          keyboardType={campo.numerico ? 'numeric' : 'default'}
        />
        {campo.numerico && <Text style={styles.helperText}>Solo números</Text>}
        {errors[campo.key] && <ErrorText text={errors[campo.key]} />}
      </View>
    );
  };

  const renderPaso = () => {
    if (paso === 1) {
      if (vieneDeNecesidad) {
        return (
          <FormSection title="Necesidad seleccionada" subtitle="Esto ya lo definió la asociación — no se puede editar aquí.">
            {isLoadingNecesidad ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : necesidadDetalle ? (
              <View>
                <Text style={styles.necesidadNombre}>
                  {necesidadDetalle.subcategoria?.descripcion ||
                    (necesidadDetalle.categoria.charAt(0).toUpperCase() + necesidadDetalle.categoria.slice(1))}
                </Text>
                {necesidadDetalle.subcategoria && (
                  <Text style={styles.necesidadDato}>
                    Categoría: {necesidadDetalle.categoria.charAt(0).toUpperCase() + necesidadDetalle.categoria.slice(1)}
                  </Text>
                )}
                {necesidadDetalle.especies.length > 0 && (
                  <Text style={styles.necesidadDato}>
                    Para: {necesidadDetalle.especies.map((e) => (e === 'perro' ? 'Perros' : e === 'gato' ? 'Gatos' : e)).join(', ')}
                  </Text>
                )}
                {necesidadDetalle.etapa && (
                  <Text style={styles.necesidadDato}>Etapa: {ETAPA_LABELS[necesidadDetalle.etapa] || necesidadDetalle.etapa}</Text>
                )}
                {necesidadDetalle.dietaEspecial && (
                  <Text style={styles.necesidadDato}>Dieta especial: {DIETA_LABELS[necesidadDetalle.dietaEspecial] || necesidadDetalle.dietaEspecial}</Text>
                )}
                {necesidadDetalle.urgencia && (
                  <Text style={[styles.necesidadDato, { color: URGENCIA_COLOR[necesidadDetalle.urgencia] || COLORS.textDark, fontWeight: '800' }]}>
                    Urgencia: {URGENCIA_LABELS[necesidadDetalle.urgencia] || necesidadDetalle.urgencia}
                  </Text>
                )}
                {(necesidadDetalle.cantidadValor != null || necesidadDetalle.cantidadUnidad) && (
                  <Text style={styles.necesidadDato}>
                    Cantidad pedida: {necesidadDetalle.cantidadValor ?? ''} {necesidadDetalle.cantidadUnidad || ''}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.sectionSubtitle}>No pudimos cargar el detalle de esta necesidad.</Text>
            )}
          </FormSection>
        );
      }

  if (!vieneDeNecesidad && !haElegidoProactiva) {
  return(
    <FormSection title="¿Qué quieres hacer?" subtitle="Elige cómo quieres ayudar.">
      <TouchableOpacity
        onPress={() => {
          if (onOpenNeeds) {
            onOpenNeeds();
            return;
          }
          router.push('/como-ayudar');
        }}
        style={styles.optionCard}
      >
        <Text style={styles.optionCardTitle}>Responder a una necesidad puntual</Text>
        <Text style={styles.optionCardSubtitle}>
          Te llevamos a "Cómo ayudar" para que elijas exactamente qué necesidad quieres cubrir.
        </Text>
      </TouchableOpacity>
      {permiteDisponibilidadProactiva && (
        <TouchableOpacity
          onPress={() => setHaElegidoProactiva(true)}
          style={styles.optionCard}
        >
          <Text style={styles.optionCardTitle}>Dejar mi disponibilidad abierta</Text>
          <Text style={styles.optionCardSubtitle}>
            Ofrece algo que las asociaciones podrán encontrar y usar cuando lo necesiten.
          </Text>
        </TouchableOpacity>
      )}
    </FormSection>
  );
}

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
                setDetalleFechasNoAplica({});
                setDetalleMulti({});
                setTipoApoyo([]);
                setAreaServicio(null);
                setContactoNombre('');
                setContactoCargo('');
                setContactoTelefono('');
                setContactoCorreo('');
                setEsLote(false);
                if (!vieneDeNecesidad) {
                  setModo('proactiva');
                  setNecesidadId('');
                }
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
            {!vieneDeNecesidad && (
              <>
                <Text style={styles.sectionSubtitle}>¿Para qué animales aplica?</Text>
                <MultiOptions
                  options={especiesDisponibles.map((e) => ({ value: e, label: e === 'perro' ? 'Perros' : 'Gatos' }))}
                  selected={especiesAplica}
                  onToggle={toggleEspecie}
                />
              </>
            )}

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
        <FormSection
          title={esLote ? 'Cantidad y presentación del lote' : modo === 'reactiva' ? 'Cantidad' : 'Capacidad declarada'}
          subtitle={esLote ? 'Indica cuánto tienes y cómo viene empacado.' : undefined}
        >
          <View style={esLote && mostrarPresentacionEnColumnas ? styles.presentationColumns : undefined}>
            <View style={esLote && mostrarPresentacionEnColumnas ? styles.presentationColumn : undefined}>
              {esLote && <Text style={styles.presentationColumnTitle}>Cantidad total</Text>}
              {vieneDeNecesidad ? (
                <View style={styles.stepperRow}>
                  <TouchableOpacity onPress={() => stepCantidadValor(-1)} style={styles.stepperBtn}>
                    <Ionicons name="remove" size={18} color={COLORS.bgWhite} />
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>{cantidadValor || '0'}</Text>
                  <TouchableOpacity onPress={() => stepCantidadValor(1)} style={styles.stepperBtn}>
                    <Ionicons name="add" size={18} color={COLORS.bgWhite} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TextInputField
                  value={cantidadValor}
                  onChangeText={(v) => setCantidadValor(v.replace(/[^0-9.]/g, ''))}
                  placeholder="Ej. 10"
                  placeholderTextColor="rgba(140, 122, 107, 0.55)"
                  keyboardType="numeric"
                />
              )}
              {errors.cantidadValor && <ErrorText text={errors.cantidadValor} />}
              <Text style={[styles.sectionSubtitle, { marginTop: 12 }]}>Unidad</Text>
              {vieneDeNecesidad ? (
                <Text style={styles.necesidadNombre}>{cantidadUnidad}</Text>
              ) : (
                <>
                  <View style={styles.unitSelectContainer}>
                    <TouchableOpacity
                      style={[
                        styles.unitSelectTrigger,
                        unidadMenuAbierto && styles.unitSelectTriggerOpen,
                        errors.cantidadUnidad && styles.unitSelectTriggerError,
                      ]}
                      onPress={() => setUnidadMenuAbierto((abierto) => !abierto)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.unitSelectValue,
                          !cantidadUnidad && !unidadEsOtra && styles.unitSelectPlaceholder,
                        ]}
                      >
                        {unidadEsOtra
                          ? 'Otra'
                          : (UNIDADES_POR_CATEGORIA[categoria?.clave || ''] || []).find(
                              (unidad) => unidad.value === cantidadUnidad,
                            )?.label || 'Selecciona una unidad'}
                      </Text>
                      <Ionicons
                        name={unidadMenuAbierto ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={COLORS.textLight}
                      />
                    </TouchableOpacity>

                    {unidadMenuAbierto && (
                      <View style={styles.unitSelectMenu}>
                        {[
                          ...(UNIDADES_POR_CATEGORIA[categoria?.clave || ''] || []),
                          { value: UNIDAD_OTRA, label: 'Otra' },
                        ].map((unidad, index, opciones) => {
                          const seleccionada = unidadEsOtra
                            ? unidad.value === UNIDAD_OTRA
                            : unidad.value === cantidadUnidad;
                          return (
                            <TouchableOpacity
                              key={unidad.value}
                              style={[
                                styles.unitSelectOption,
                                index < opciones.length - 1 && styles.unitSelectOptionDivider,
                                seleccionada && styles.unitSelectOptionSelected,
                              ]}
                              onPress={() => {
                                if (unidad.value === UNIDAD_OTRA) {
                                  setUnidadEsOtra(true);
                                  setCantidadUnidad('');
                                  setContenidoPorUnidad('');
                                } else {
                                  setUnidadEsOtra(false);
                                  setCantidadUnidad(unidad.value);
                                  if (!UNIDADES_CONTENEDOR.has(unidad.value)) {
                                    setContenidoPorUnidad('');
                                  }
                                }
                                setUnidadMenuAbierto(false);
                              }}
                            >
                              <Text
                                style={[
                                  styles.unitSelectOptionText,
                                  seleccionada && styles.unitSelectOptionTextSelected,
                                ]}
                              >
                                {unidad.label}
                              </Text>
                              {seleccionada && (
                                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                  {unidadEsOtra && (
                    <View style={{ marginTop: 10 }}>
                      <TextInputField value={cantidadUnidad} onChangeText={setCantidadUnidad} placeholder="Escribe la unidad" />
                    </View>
                  )}
                </>
              )}
              {errors.cantidadUnidad && <ErrorText text={errors.cantidadUnidad} />}

              {!esLote && UNIDADES_CONTENEDOR.has(cantidadUnidad) && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.sectionSubtitle}>¿De cuánto es cada {cantidadUnidad === 'kits' ? 'kit' : cantidadUnidad.slice(0, -1)}?</Text>
                  <TextInputField value={contenidoPorUnidad} onChangeText={setContenidoPorUnidad} placeholder="Ej. 25kg, 12 piezas, 5 litros" />
                  {errors.contenidoPorUnidad && <ErrorText text={errors.contenidoPorUnidad} />}
                </View>
              )}
            </View>
            {esLote && (
              <View
                style={[
                  styles.packageQuestion,
                  mostrarPresentacionEnColumnas && styles.packageQuestionColumn,
                ]}
              >
                <Text style={styles.packageQuestionTitle}>¿Cómo viene empacado?</Text>
                <Text style={styles.packageQuestionHelper}>
                  Por ejemplo: “Costales de 25 kg” o “Cajas de 12 piezas”.
                </Text>
                <TextInputField
                  value={tipoEmpaque}
                  onChangeText={setTipoEmpaque}
                  placeholder="Describe el empaque"
                />
                {errors.tipoEmpaque && <ErrorText text={errors.tipoEmpaque} />}
              </View>
            )}
          </View>
        </FormSection>

        {esLote && (
          <>
            <FormSection title="¿Se puede repartir entre varias asociaciones?">
              <SingleOptions
                options={DIVISIBLE_OPCIONES}
                selected={divisible || ''}
                onSelect={(opcion) => {
                  setDivisible(opcion);
                  setAsociacionesSeleccionadas([]);
                  setMaxAsociacionesMenuAbierto(false);
                  if (opcion === 'no') setMaxAsociaciones('1');
                }}
                error={errors.divisible}
              />
            </FormSection>

            {divisible && divisible !== 'no' && (
              <FormSection
                title="¿Entre cuántas asociaciones quieres repartirlo?"
                subtitle="Define cuántas asociaciones recibirán una parte de este lote."
              >
                <View style={styles.unitSelectContainer}>
                  <TouchableOpacity
                    style={[
                      styles.unitSelectTrigger,
                      maxAsociacionesMenuAbierto && styles.unitSelectTriggerOpen,
                      errors.maxAsociaciones && styles.unitSelectTriggerError,
                    ]}
                    onPress={() => setMaxAsociacionesMenuAbierto((abierto) => !abierto)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.unitSelectValue}>
                      {maxAsociaciones} {Number(maxAsociaciones) === 1 ? 'asociación' : 'asociaciones'}
                    </Text>
                    <Ionicons
                      name={maxAsociacionesMenuAbierto ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={COLORS.textLight}
                    />
                  </TouchableOpacity>

                  {maxAsociacionesMenuAbierto && (
                    <View style={styles.unitSelectMenu}>
                      {Array.from({ length: 10 }, (_, index) => String(index + 1)).map((cantidad, index) => {
                        const seleccionada = cantidad === maxAsociaciones;
                        return (
                          <TouchableOpacity
                            key={cantidad}
                            style={[
                              styles.unitSelectOption,
                              index < 9 && styles.unitSelectOptionDivider,
                              seleccionada && styles.unitSelectOptionSelected,
                            ]}
                            onPress={() => {
                              setMaxAsociaciones(cantidad);
                              setAsociacionesSeleccionadas([]);
                              setMaxAsociacionesMenuAbierto(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.unitSelectOptionText,
                                seleccionada && styles.unitSelectOptionTextSelected,
                              ]}
                            >
                              {cantidad} {cantidad === '1' ? 'asociación' : 'asociaciones'}
                            </Text>
                            {seleccionada && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
                {errors.maxAsociaciones && <ErrorText text={errors.maxAsociaciones} />}
              </FormSection>
            )}
          </>
        )}

        {!esLote && (
          vieneDeNecesidad ? (
            <FormSection title="¿Cuándo puedes entregarlo?">
              <DatePickerChip label="" value={fechaDisponibilidad} onChange={setFechaDisponibilidad} minDate={new Date()} />
            </FormSection>
          ) : (
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
          )
        )}

        {!esServicio &&(
          vieneDeNecesidad ? (
            <FormSection
              title="¿Dónde entregas?"
              subtitle="Lugar de entrega: una vez que se le dé aviso a la asociación, en MIS DONACIONES podrás ver la ubicación e indicaciones necesarias para completar tu donación, que deberá ser llevada a la asociación."
            >
              {necesidadDetalle?.asociacion && (
                <>
                  <Text style={styles.necesidadNombre}>{necesidadDetalle.asociacion.nombre}</Text>
                  {direccionAsociacionTexto ? <Text style={styles.necesidadDato}>{direccionAsociacionTexto}</Text> : null}
                  {necesidadDetalle.asociacion.referencia ? (
                    <Text style={styles.necesidadDato}>{necesidadDetalle.asociacion.referencia}</Text>
                  ) : null}
                  <TouchableOpacity onPress={abrirComoLlegar} style={[styles.locationButton, { marginTop: 12 }]}>
                    <Ionicons name="navigate-outline" size={16} color={COLORS.bgTeal} />
                    <Text style={styles.locationButtonText}>Cómo llegar</Text>
                  </TouchableOpacity>
                </>
              )}
            </FormSection>
          ) : (
            <FormSection title="¿Dónde se entrega o recolecta?" subtitle="Solo compartimos una zona aproximada.">
              <TextInputField
              value={direccionBusqueda}
              onChangeText={(value) => {
                setDireccionBusqueda(value);
                if (value.trim() !== ultimaBusquedaAutomaticaRef.current) {
                  ultimaBusquedaAutomaticaRef.current = '';
                }
                if (value !== direccionConfirmada) setDireccionConfirmada('');
                setDireccionResultados([]);
                setDireccionBusquedaMensaje('');
              }}
              placeholder="Buscar dirección, ej. Avenida Reforma, Puebla"
            />
            {isBuscandoDireccion && (
              <View style={styles.addressSearching}>
                <ActivityIndicator size="small" color={COLORS.bgTeal} />
                <Text style={styles.addressSearchingText}>Buscando dirección…</Text>
              </View>
            )}
            {!!direccionBusquedaMensaje && (
              <Text style={styles.addressSearchMessage}>{direccionBusquedaMensaje}</Text>
            )}
            {direccionResultados.length > 0 && (
              <View style={styles.addressResults}>
                {direccionResultados.map((resultado, index) => (
                  <TouchableOpacity
                    key={`${resultado.lat}-${resultado.lon}-${index}`}
                    onPress={() => seleccionarDireccion(resultado)}
                    style={[
                      styles.addressResult,
                      index === direccionResultados.length - 1 && styles.addressResultLast,
                    ]}
                  >
                    <Ionicons name="location-outline" size={16} color={COLORS.bgTeal} />
                    <Text style={styles.addressResultText}>{resultado.display_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {errors.ubicacion && <ErrorText text={errors.ubicacion} />}
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
                  onLocationSelect={seleccionarUbicacionMapa}
                />
              </View>
              {!!direccionConfirmada && (
              <View style={styles.confirmedAddress}>
                <Ionicons name="location" size={16} color={COLORS.bgTeal} />
                <Text style={styles.confirmedAddressText}>
                  Ubicación seleccionada: <Text style={{ fontWeight: '700' }}>{direccionConfirmada}</Text>
                </Text>
              </View>
            )}
            {esLote && (
              <View style={styles.structuredAddress}>
                <View style={styles.addressFieldRow}>
                  <View style={styles.addressField}>
                    <Text style={styles.sectionSubtitle}>Estado *</Text>
                    <TextInputField
                      value={direccionEstado}
                      onChangeText={setDireccionEstado}
                      placeholder="Ej. Puebla"
                    />
                    {errors.direccionEstado && <ErrorText text={errors.direccionEstado} />}
                  </View>
                  <View style={styles.addressField}>
                    <Text style={styles.sectionSubtitle}>Municipio *</Text>
                    <TextInputField
                      value={direccionMunicipio}
                      onChangeText={setDireccionMunicipio}
                      placeholder="Ej. Puebla"
                    />
                    {errors.direccionMunicipio && <ErrorText text={errors.direccionMunicipio} />}
                  </View>
                </View>
                <Text style={styles.sectionSubtitle}>Calle *</Text>
                <TextInputField
                  value={direccionCalle}
                  onChangeText={setDireccionCalle}
                  placeholder="Ej. Avenida Reforma 123"
                />
                {errors.direccionCalle && <ErrorText text={errors.direccionCalle} />}
                <View style={styles.addressFieldRow}>
                  <View style={styles.addressField}>
                    <Text style={styles.sectionSubtitle}>Código postal *</Text>
                    <TextInputField
                      value={direccionCodigoPostal}
                      onChangeText={(value) => setDireccionCodigoPostal(value.replace(/\D/g, '').slice(0, 5))}
                      placeholder="Ej. 72000"
                      keyboardType="numeric"
                    />
                    {errors.direccionCodigoPostal && <ErrorText text={errors.direccionCodigoPostal} />}
                  </View>
                  <View style={styles.addressField}>
                    <Text style={styles.sectionSubtitle}>Colonia *</Text>
                    <TextInputField
                      value={direccionColonia}
                      onChangeText={setDireccionColonia}
                      placeholder="Ej. Centro"
                    />
                    {errors.direccionColonia && <ErrorText text={errors.direccionColonia} />}
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.structuredSearchButton, isBuscandoDireccion && { opacity: 0.7 }]}
                  onPress={buscarDireccionEstructurada}
                  disabled={isBuscandoDireccion}
                >
                  <Ionicons name="navigate-outline" size={16} color={COLORS.bgTeal} />
                  <Text style={styles.structuredSearchButtonText}>Ubicar estos datos en el mapa</Text>
                </TouchableOpacity>
              </View>
            )}
          </FormSection>
          )
        )}

        {!esServicio && !vieneDeNecesidad && (
          <FormSection title="Forma de entrega">
            <SingleOptions options={FORMA_ENTREGA_OPCIONES} selected={formaEntrega || ''} onSelect={setFormaEntrega} error={esLote ? errors.formaEntrega : undefined} />
          </FormSection>
        )}

        {!esLote && modo === 'proactiva' && (
          <FormSection title="Frecuencia">
            <SingleOptions options={FRECUENCIA_OPCIONES} selected={frecuencia || ''} onSelect={setFrecuencia} />
          </FormSection>
        )}

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
      </>
    );
  };

  const renderInvitar = () => (
    <FormSection
      title={
        divisible === 'no' || Number(maxAsociaciones) === 1
          ? 'Escoge la asociación que recibirá tu lote'
          : `Escoge tus ${maxAsociaciones} asociaciones`
      }
      subtitle={
        divisible === 'no'
          ? 'Este lote se entregará completo a la asociación seleccionada.'
          : `Selecciona exactamente ${maxAsociaciones} asociación(es). Están ordenadas por cercanía.`
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
      {(!isDraftReady) ? (
        <View style={[styles.centeredContent, { maxWidth: 500 }]}>
          <View style={[styles.card, { padding: 40, alignItems: 'center', justifyContent: 'center' }]}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ marginTop: 16, color: COLORS.textLight, fontWeight: '700' }}>
              Recuperando tu información…
            </Text>
          </View>
        </View>
      ) : (
      <>
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
            vieneDeNecesidad ? (
              <>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                  <FormSection title="¡Gracias por tu apoyo!" subtitle="La asociación ya puede ver tu aportación.">
                    <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                      <Ionicons name="checkmark-circle" size={56} color={COLORS.bgTeal} />
                    </View>
                  </FormSection>
                </ScrollView>
                <View style={styles.fixedFooter}>
                  <TouchableOpacity style={styles.primaryButton} onPress={terminarFlujo}>
                    <Text style={styles.primaryButtonText}>Cerrar</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
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
            )
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
                      style={[
                        styles.primaryButton,
                        {
                          flex: 1,
                          opacity: asociacionesSeleccionadas.length === (divisible === 'no' ? 1 : Number(maxAsociaciones))
                            ? 1
                            : 0.5,
                        },
                      ]}
                      onPress={handleInvitar}
                      disabled={
                        asociacionesSeleccionadas.length !== (divisible === 'no' ? 1 : Number(maxAsociaciones))
                        || isInvitando
                      }
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
              <ScrollView ref={formScrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {showDraftNotice && estadoPantalla === 'paso' && paso === 1 && (
                  <View style={{
                    backgroundColor: '#EAF6FF',
                    borderWidth: 1,
                    borderColor: '#C9E6FF',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <Text style={{ color: COLORS.textDark, fontSize: 13, flex: 1, marginRight: 10 }}>
                      Recuperamos tu progreso guardado para que continúes donde te quedaste.
                    </Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => setShowDraftNotice(false)}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="close" size={16} color={COLORS.textDark} />
                    </TouchableOpacity>
                  </View>
                )}
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
                  clearAportacionDraft();
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
      </>
      )}
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
  placeholderTextColor?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
}) {
  return (
    <TextInput
      style={styles.input}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={props.placeholderTextColor || COLORS.textLight}
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
  // Jerarquía nombre/dato de SugerenciaAliadoCard.tsx (staff-dashboard),
  // adaptada a los COLORS propios de este archivo — ver tarjeta "Necesidad
  // seleccionada" y el bloque de dirección de la asociación en Paso 3.
  necesidadNombre: { fontSize: 13, fontWeight: '800', color: COLORS.textDark },
  necesidadDato: { fontSize: 13, fontWeight: '600', color: COLORS.textLight, marginTop: 8 },
  // Stepper +/- de cantidadValor (solo vieneDeNecesidad, ver Paso 3).
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  stepperValue: { fontSize: 20, fontWeight: '800', color: COLORS.textDark, minWidth: 40, textAlign: 'center' },
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
  addressResults: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 6,
    backgroundColor: COLORS.bgWhite,
  },
  addressResult: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  addressResultLast: { borderBottomWidth: 0 },
  addressResultText: { flex: 1, color: COLORS.textDark, fontSize: 12, lineHeight: 18 },
  confirmedAddress: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: COLORS.bgTealLight,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  confirmedAddressText: { flex: 1, color: COLORS.textDark, fontSize: 12, lineHeight: 18 },
  addressSearching: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  addressSearchingText: { color: COLORS.textLight, fontSize: 12, fontWeight: '600' },
  addressSearchMessage: { color: COLORS.textLight, fontSize: 12, lineHeight: 18, marginTop: 8 },
  structuredAddress: { marginTop: 16, gap: 10 },
  addressFieldRow: { flexDirection: 'row', gap: 10 },
  addressField: { flex: 1 },
  structuredSearchButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORS.bgTeal,
    borderRadius: 12,
    backgroundColor: COLORS.bgWhite,
  },
  structuredSearchButtonText: { color: COLORS.bgTeal, fontSize: 12, fontWeight: '700' },
  dateConditionalField: { marginTop: 14 },
  presentationColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  presentationColumn: {
    flex: 1,
    minWidth: 0,
  },
  presentationColumnTitle: {
    color: COLORS.textDark,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  unitSelectContainer: {
    position: 'relative',
    zIndex: 5,
  },
  unitSelectTrigger: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.grayLight,
  },
  unitSelectTriggerOpen: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.bgWhite,
  },
  unitSelectTriggerError: {
    borderColor: COLORS.danger,
  },
  unitSelectValue: {
    flex: 1,
    color: COLORS.textDark,
    fontSize: 14,
    fontWeight: '700',
  },
  unitSelectPlaceholder: {
    color: 'rgba(140, 122, 107, 0.62)',
    fontWeight: '500',
  },
  unitSelectMenu: {
    marginTop: 7,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.bgWhite,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  unitSelectOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 11,
    backgroundColor: COLORS.bgWhite,
  },
  unitSelectOptionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  unitSelectOptionSelected: {
    backgroundColor: COLORS.cardBg,
  },
  unitSelectOptionText: {
    color: COLORS.textDark,
    fontSize: 13,
    fontWeight: '600',
  },
  unitSelectOptionTextSelected: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  packageQuestion: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  packageQuestionColumn: {
    flex: 1,
    minWidth: 0,
    marginTop: 0,
    paddingTop: 0,
    paddingLeft: 20,
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  packageQuestionTitle: { color: COLORS.textDark, fontSize: 15, fontWeight: '700', marginBottom: 5 },
  packageQuestionHelper: { color: COLORS.textLight, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  optionCard: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
  },
  optionCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  optionCardSubtitle: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 19,
  },
});
