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
import { router } from 'expo-router';
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
import LocationPickerMap from '../LocationPickerMap';

// Misma paleta que CapacidadesFormScreen.tsx — copiada tal cual, no se
// inventa una paleta nueva para este formulario.
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

const FRECUENCIA_OPCIONES: Option[] = [
  { value: 'semana', label: 'Por semana' },
  { value: 'mes', label: 'Por mes' },
  { value: 'campana', label: 'Por campaña' },
];

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
    { key: 'fecha_caducidad', label: 'Fecha de caducidad, si corresponde', tipo: 'fecha' },
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
    { key: 'requiere_cita', label: '¿Requiere cita?', tipo: 'boolean' },
    { key: 'numero_atenciones', label: 'Número de atenciones disponibles', tipo: 'texto', numerico: true },
    { key: 'dias', label: 'Días disponibles', tipo: 'multi', opciones: DIAS_SEMANA },
    { key: 'horario', label: 'Horario', tipo: 'multi', opciones: FRANJAS_HORARIO },
    { key: 'restricciones', label: 'Restricciones', tipo: 'texto' },
  ],
  // Difusión y campañas se maneja aparte (tipo de apoyo + área condicional
  // anidada + contacto responsable con 4 campos propios) — ver bloques
  // dedicados en el paso 2. `ubicacion_alcance` se quitó por redundante:
  // el paso 3 ya captura ubicación con mapa para toda la aportación.
  difusion_campanas: [
    { key: 'capacidad_aproximada', label: 'Capacidad aproximada', tipo: 'texto', numerico: true },
  ],
};

interface Props {
  onClose?: () => void;
}

export default function AportacionFormScreen({ onClose }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [paso, setPaso] = useState(1);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isLoadingGps, setIsLoadingGps] = useState(false);

  const [modo, setModo] = useState<Modo>('reactiva');
  const [necesidadId, setNecesidadId] = useState('');

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
  const [fechaDisponibilidad, setFechaDisponibilidad] = useState<Date | null>(null);
  const [ubicacion, setUbicacion] = useState<{ latitud: number; longitud: number } | null>(null);
  const [formaEntrega, setFormaEntrega] = useState<string | null>(null);
  const [vigencia, setVigencia] = useState<Date | null>(null);
  const [frecuencia, setFrecuencia] = useState<string | null>(null);

  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [isUploadingFoto, setIsUploadingFoto] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const especiesDisponibles: Especie[] =
    (subcategoria?.especies_aplicables as Especie[] | undefined) || ['perro', 'gato'];
  const camposCondicionales = categoria ? CAMPOS_CONDICIONALES[categoria.clave] || [] : [];
  const esDifusion = categoria?.clave === 'difusion_campanas';

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
        showToast({ type: 'error', title: 'Permiso denegado', message: 'No pudimos acceder a tu ubicación.' });
        return;
      }
      const current = await Location.getCurrentPositionAsync({});
      setUbicacion({ latitud: current.coords.latitude, longitud: current.coords.longitude });
    } catch {
      showToast({ type: 'error', title: 'Ubicación no disponible', message: 'Ajusta manualmente el marcador en el mapa.' });
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

    setIsUploadingFoto(true);
    const url = await subirFoto(resultado.assets[0].uri);
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
    return detalle;
  };

  const lugarEntregaTexto = ubicacion ? `${ubicacion.latitud.toFixed(5)}, ${ubicacion.longitud.toFixed(5)}` : undefined;

  const validarPaso = (numero: number): boolean => {
    const nuevos: Record<string, string> = {};

    if (numero === 1) {
      if (modo === 'reactiva' && !necesidadId.trim()) nuevos.necesidadId = 'Indica a qué necesidad respondes.';
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
    setNecesidadId('');
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
    setFechaDisponibilidad(null);
    setUbicacion(null);
    setFormaEntrega(null);
    setVigencia(null);
    setFrecuencia(null);
    setFotoUrl(null);
    setErrors({});
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
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
      resetForm();
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
          <FormSection title="¿Cómo quieres aportar?">
            <SingleOptions
              options={[
                { value: 'reactiva', label: 'Responder a una necesidad', description: 'Una asociación ya pidió algo y tú lo cubres.' },
                { value: 'proactiva', label: 'Dejar disponibilidad', description: 'Configuras de antemano lo que puedes ofrecer.' },
              ]}
              selected={modo}
              onSelect={(v) => setModo(v as Modo)}
            />
          </FormSection>

          {modo === 'reactiva' && (
            <FormSection title="¿A qué necesidad respondes?">
              <TextInputField value={necesidadId} onChangeText={setNecesidadId} placeholder="UUID de la necesidad" />
              {errors.necesidadId && <ErrorText text={errors.necesidadId} />}
            </FormSection>
          )}

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
        <FormSection title={modo === 'reactiva' ? 'Cantidad' : 'Capacidad declarada'}>
          <TextInputField
            value={cantidadValor}
            onChangeText={(v) => setCantidadValor(v.replace(/[^0-9.]/g, ''))}
            placeholder="10"
            keyboardType="numeric"
          />
          {errors.cantidadValor && <ErrorText text={errors.cantidadValor} />}
          <Text style={[styles.sectionSubtitle, { marginTop: 12 }]}>Unidad</Text>
          <TextInputField value={cantidadUnidad} onChangeText={setCantidadUnidad} placeholder="kg, piezas, citas..." />
          {errors.cantidadUnidad && <ErrorText text={errors.cantidadUnidad} />}
        </FormSection>

        <FormSection title="Fecha de disponibilidad">
          <DatePickerChip label="" value={fechaDisponibilidad} onChange={setFechaDisponibilidad} />
        </FormSection>

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

        <FormSection title="Forma de entrega">
          <SingleOptions options={FORMA_ENTREGA_OPCIONES} selected={formaEntrega || ''} onSelect={setFormaEntrega} />
        </FormSection>

        {modo === 'proactiva' && (
          <FormSection title="Frecuencia">
            <SingleOptions options={FRECUENCIA_OPCIONES} selected={frecuencia || ''} onSelect={setFrecuencia} />
          </FormSection>
        )}

        <FormSection title="Vigencia de la oferta">
          <DatePickerChip label="" value={vigencia} onChange={setVigencia} />
        </FormSection>

        <FormSection title="Evidencia fotográfica" subtitle="Opcional.">
          <TouchableOpacity onPress={handlePickFoto} style={styles.fotoBoton} disabled={isUploadingFoto}>
            {isUploadingFoto ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : fotoUrl ? (
              <Image source={{ uri: fotoUrl }} style={styles.fotoPreview} resizeMode="cover" />
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

  return (
    <View style={styles.outerContainer}>
      <Toast toast={toast} translateY={translateY} />
      <View style={styles.centeredContent}>
        <View style={styles.card}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerButton} onPress={retroceder}>
              <Ionicons name="chevron-back" size={22} color={COLORS.bgWhite} />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.title}>Registrar una aportación</Text>
              <Text style={styles.subtitle}>
                Paso {paso} de {PASOS.length}: {PASOS[paso - 1]}
              </Text>
            </View>
            <TouchableOpacity style={styles.headerButton} onPress={() => setShowCloseConfirm(true)}>
              <Ionicons name="close" size={22} color={COLORS.bgWhite} />
            </TouchableOpacity>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(paso / PASOS.length) * 100}%` }]} />
            </View>
          </View>

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
                      ? modo === 'reactiva'
                        ? 'Registrar aportación'
                        : 'Registrar disponibilidad'
                      : 'Continuar'}
                  </Text>
                  {paso !== PASOS.length && <Ionicons name="arrow-forward" size={18} color={COLORS.bgWhite} />}
                </>
              )}
            </TouchableOpacity>
          </View>
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

// ─── Helpers locales — mismo patrón que CapacidadesFormScreen.tsx ─────────

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
    height: 96,
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
  },
  fotoPreview: { width: '100%', height: '100%' },
});
