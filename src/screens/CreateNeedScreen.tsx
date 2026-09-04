import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Modal, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast, Toast } from '../components/Toast';
import axios from 'axios';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { getAnimales, animalMasGrave } from '../types/reporte';
import { normalizarDecimal } from '../utils/validators';

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

// Claves reales del CHECK necesidades_urgencia_check (migrations/
// 0006_red_aliados.sql) — 'Baja'/'Media'/'Alta' son solo etiquetas de UI,
// nunca se mandan al backend.
type NivelUrgencia = 'critico' | 'urgente' | 'no_urgente';

const URGENCIA_OPCIONES: { value: NivelUrgencia; label: string; color: string }[] = [
  { value: 'no_urgente', label: 'Baja', color: '#2ECC71' },
  { value: 'urgente', label: 'Media', color: '#F1C40F' },
  { value: 'critico', label: 'Alta', color: '#E74C3C' },
];

type Option = { value: string; label: string };

// Copiadas tal cual de AportacionFormScreen.tsx (mismo patrón de unidades
// por categoría) — ese archivo no las exporta, así que cada formulario
// mantiene su propia copia en vez de importarlas.
const UNIDAD_OTRA = '__otra__';

const UNIDADES_CONTENEDOR = new Set(['costales', 'cajas', 'kits']);

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

// Copiadas tal cual de CAMPOS_CONDICIONALES.alimentos en
// AportacionFormScreen.tsx (mismo catálogo de opciones) — ese archivo no
// las exporta, así que se duplican aquí en vez de importarlas.
const ETAPA_OPCIONES: Option[] = [
  { value: 'bebe', label: 'Bebé' },
  { value: 'cachorro', label: 'Cachorro' },
  { value: 'adulto', label: 'Adulto' },
  { value: 'senior', label: 'Senior' },
  { value: 'cualquier_etapa', label: 'Cualquier etapa' },
];

const DIETA_ESPECIAL_OPCIONES: Option[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'gastrointestinal', label: 'Gastrointestinal' },
  { value: 'renal', label: 'Renal' },
  { value: 'control_peso', label: 'Control de peso' },
  { value: 'otra', label: 'Otra' },
];

// Mapeo confirmado: match exacto sugiere, 'joven'/'desconocido' (valores
// reales de animal.edad_aproximada, EdadEnum en report.py) no tienen
// equivalente en las opciones de etapa de arriba — no sugieren nada, campo
// vacío para que la asociación decida. Solo aplica aquí al sugerir;
// AportacionFormScreen no remapea nada, solo lee detalle.etapa tal cual.
const SUGERENCIA_ETAPA_POR_EDAD: Record<string, string> = {
  cachorro: 'cachorro',
  adulto: 'adulto',
  senior: 'senior',
};

// tipo_evento -> texto legible, para el "último hito" del detalle de caso.
// Mismos valores reales que TIPOS_HITO_TIMELINE en associations.py.
const HITO_LABELS: Record<string, string> = {
  reporte_creado: 'Reporte creado',
  llegada_zona_reporte: 'Voluntario en la zona',
  hito_llegada_zona_reporte: 'Voluntario en la zona',
  animal_encontrado: 'Encontraron al animal',
  hito_encontre_animal: 'Encontraron al animal',
  animal_no_localizado: 'Búsqueda sin localizar al animal',
  animal_bajo_resguardo: 'Animal bajo resguardo',
  hito_animal_no_localizado: 'Búsqueda sin localizar al animal',
  llegada_veterinaria: 'Llegó a la veterinaria',
  hito_llegue_refugio: 'Llegó al refugio',
  hito_llego_veterinaria: 'Llegó a la veterinaria',
  llegada_hogar_temporal: 'Animal bajo resguardo',
  seguimiento_inicial: 'Seguimiento inicial',
  seguimiento_resguardo: 'Seguimiento de resguardo',
  seguimiento_validado: 'Seguimiento validado',
  alerta_bienestar: 'Alerta de bienestar',
  extension_resguardo: 'Extensión de resguardo',
  relevo_solicitado: 'Relevo solicitado',
  traslado_programado: 'Traslado programado',
  entrega_confirmada: 'Entrega confirmada',
  custodia_finalizada: 'Custodia finalizada',
  caso_cerrado: 'Caso cerrado',
  necesidad_cubierta: 'Necesidad cubierta',
};

interface CategoriaRecursoApi {
  id: string;
  clave: string;
  descripcion: string;
}

interface SubcategoriaRecursoApi {
  id: string;
  clave: string;
  descripcion: string;
}

interface CasoCerrado {
  id: string;
  titulo: string;
  foto_url: string | null;
  closed_at: string | null;
  condicion: string | null;
  tipo_animal: string | null;
  edad_aproximada: string | null;
}

interface UltimoHito {
  tipo_evento: string;
  created_at: string;
}

// Ícono por clave real de categoria_recurso — fallback genérico si el
// catálogo llega a tener una categoría sin ícono asignado aquí.
const ICONO_POR_CLAVE: Record<string, keyof typeof Ionicons.glyphMap> = {
  alimentos: 'nutrition-outline',
  insumos: 'medkit-outline',
  servicios_veterinarios: 'pulse-outline',
  difusion_campanas: 'megaphone-outline',
};
const ICONO_DEFAULT: keyof typeof Ionicons.glyphMap = 'cube-outline';

const formatearHaceDias = (fechaIso: string | null): string => {
  if (!fechaIso) return '';
  const dias = Math.floor((Date.now() - new Date(fechaIso).getTime()) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Hace 1 día';
  return `Hace ${dias} días`;
};

export default function CreateNeedScreen() {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [tipoNecesidad, setTipoNecesidad] = useState<'general' | 'especifica'>('general');
  const [reporteId, setReporteId] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [subcategoriaId, setSubcategoriaId] = useState<string | null>(null);
  const [urgencia, setUrgencia] = useState<NivelUrgencia | null>(null);

  const [tiposAnimalesAsociacion, setTiposAnimalesAsociacion] = useState<string[]>([]);
  const [especiesSeleccionadas, setEspeciesSeleccionadas] = useState<string[]>([]);

  const [etapa, setEtapa] = useState<string | null>(null);
  const [dietaEspecial, setDietaEspecial] = useState<string | null>(null);

  const [cantidadValor, setCantidadValor] = useState('');
  const [cantidadUnidad, setCantidadUnidad] = useState('');
  const [unidadEsOtra, setUnidadEsOtra] = useState(false);
  const [contenidoPorUnidad, setContenidoPorUnidad] = useState('');
  const [notasAdicionales, setNotasAdicionales] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Ahora guardamos closed_at/condicion/tipo_animal además de foto_url,
  // para poder ordenar por fecha de cierre y mostrar el detalle del caso.
  const [reportesActivos, setReportesActivos] = useState<CasoCerrado[]>([]);
  const [isLoadingReportes, setIsLoadingReportes] = useState(false);
  const [necesidadesActivasIds, setNecesidadesActivasIds] = useState<Set<string>>(new Set());
  const [filtroNecesidad, setFiltroNecesidad] = useState<'todos' | 'con' | 'sin'>('todos');

  const [detalleHito, setDetalleHito] = useState<UltimoHito | null>(null);
  const [isLoadingDetalleHito, setIsLoadingDetalleHito] = useState(false);

  const [categoriasData, setCategoriasData] = useState<CategoriaRecursoApi[]>([]);
  const [subcategoriasData, setSubcategoriasData] = useState<SubcategoriaRecursoApi[]>([]);
  const [isLoadingSubcategorias, setIsLoadingSubcategorias] = useState(false);

  useEffect(() => {
    const cargarCategorias = async () => {
      try {
        const res = await axios.get(`${API_URL}/red-aliados/categorias`);
        setCategoriasData(res.data);
      } catch (error) {
        console.error("Error al cargar categorías:", error);
      }
    };
    cargarCategorias();
  }, []);

  useEffect(() => {
    if (!categoria) {
      setSubcategoriasData([]);
      return;
    }
    let vigente = true;
    const cargarSubcategorias = async () => {
      setIsLoadingSubcategorias(true);
      try {
        const res = await axios.get(`${API_URL}/red-aliados/subcategorias/${categoria}`);
        if (vigente) setSubcategoriasData(res.data);
      } catch (error) {
        console.error("Error al cargar subcategorías:", error);
        if (vigente) setSubcategoriasData([]);
      } finally {
        if (vigente) setIsLoadingSubcategorias(false);
      }
    };
    cargarSubcategorias();
    return () => { vigente = false; };
  }, [categoria]);

  useEffect(() => {
    const cargarCasosCerrados = async () => {
      setIsLoadingReportes(true);
      try {
        const res = await axios.get(`${API_URL}/associations/me/reportes`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        // Filtramos para mostrar estrictamente los casos que ya fueron cerrados/rescatados
        const casosCerrados = res.data.filter((r: any) => r.estado_reporte === 'cerrado');

        const casosMapeados: CasoCerrado[] = casosCerrados.map((reporte: any) => {
          const animales = getAnimales(reporte);
          const grave = animalMasGrave(animales);

          const tipo = grave?.tipo_animal || 'Animal';
          const tituloCase = tipo.charAt(0).toUpperCase() + tipo.slice(1);

          return {
            id: reporte.reporte_id,
            titulo: `${tituloCase} · ${grave?.condicion || 'desconocido'}`,
            foto_url: reporte.foto_url || null,
            closed_at: reporte.closed_at || null,
            condicion: grave?.condicion || null,
            tipo_animal: grave?.tipo_animal || null,
            edad_aproximada: grave?.edad_aproximada || null,
          };
        });

        // Más reciente cerrado primero. Un caso 'cerrado' siempre debería
        // traer closed_at, pero por si acaso los sin fecha van al final.
        casosMapeados.sort((a, b) => {
          if (!a.closed_at) return 1;
          if (!b.closed_at) return -1;
          return new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime();
        });

        setReportesActivos(casosMapeados);
      } catch (error) {
        console.error("Error al cargar los casos:", error);
      } finally {
        setIsLoadingReportes(false);
      }
    };

    if (token) {
      cargarCasosCerrados();
    }
  }, [token]);

  useEffect(() => {
    const cargarNecesidadesActivas = async () => {
      try {
        const res = await axios.get(`${API_URL}/associations/me/reportes/necesidades-activas`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setNecesidadesActivasIds(new Set<string>(res.data?.reporte_ids || []));
      } catch (error) {
        console.error("Error al cargar necesidades activas:", error);
      }
    };
    if (token) cargarNecesidadesActivas();
  }, [token]);

  useEffect(() => {
    const cargarAsociacion = async () => {
      try {
        const res = await axios.get(`${API_URL}/associations/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setTiposAnimalesAsociacion(res.data?.tipos_animales || []);
      } catch (error) {
        console.error("Error al cargar tipos de animales de la asociación:", error);
      }
    };
    if (token) cargarAsociacion();
  }, [token]);

  const toggleEspecie = (especie: string) => {
    setEspeciesSeleccionadas((prev) =>
      prev.includes(especie) ? prev.filter((e) => e !== especie) : [...prev, especie]
    );
  };

  const seleccionarReporte = async (reporte: CasoCerrado) => {
    setReporteId(reporte.id);
    setErrors((p) => ({ ...p, reporte: '' }));
    setDetalleHito(null);
    setIsLoadingDetalleHito(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/reportes/${reporte.id}/historial`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const eventos = res.data?.eventos || [];
      setDetalleHito(eventos.length ? eventos[eventos.length - 1] : null);
    } catch (error) {
      console.error("Error al cargar el historial del caso:", error);
      setDetalleHito(null);
    } finally {
      setIsLoadingDetalleHito(false);
    }
  };

  const reportesFiltrados = reportesActivos.filter((r) => {
    if (filtroNecesidad === 'con') return necesidadesActivasIds.has(r.id);
    if (filtroNecesidad === 'sin') return !necesidadesActivasIds.has(r.id);
    return true;
  });

  const casoSeleccionado = reporteId ? reportesActivos.find((r) => r.id === reporteId) || null : null;

  // Sugerencia de etapa a partir de la edad del caso seleccionado — solo en
  // modo 'especifica' y solo si no pisa una elección manual ya hecha
  // (etapa !== null). En modo 'general' este efecto nunca corre: ambos
  // campos quedan opcionales y sin sugerencia.
  useEffect(() => {
    if (tipoNecesidad !== 'especifica' || categoria !== 'alimentos' || !casoSeleccionado) return;
    if (etapa !== null) return;
    const sugerida = casoSeleccionado.edad_aproximada
      ? SUGERENCIA_ETAPA_POR_EDAD[casoSeleccionado.edad_aproximada]
      : undefined;
    if (sugerida) setEtapa(sugerida);
  }, [tipoNecesidad, categoria, casoSeleccionado, etapa]);

  const handleGuardarNecesidad = async () => {
    const newErrors: Record<string, string> = {};
    if (tipoNecesidad === 'especifica' && !reporteId) {
      newErrors.reporte = 'Debes seleccionar un caso rescatado.';
    }
    if (!categoria) {
      newErrors.categoria = 'Debes seleccionar una categoría.';
    }
    if (categoria === 'servicios_veterinarios' && !urgencia) {
      newErrors.urgencia = 'Indica la urgencia médica.';
    }
    if (cantidadValor && !cantidadUnidad) {
      newErrors.cantidad_unidad = 'Indica la unidad (Ej. kg, piezas).';
    }
    if (cantidadUnidad && !cantidadValor) {
      newErrors.cantidad_valor = 'Indica la cantidad numérica.';
    }
    if (UNIDADES_CONTENEDOR.has(cantidadUnidad) && !contenidoPorUnidad.trim()) {
      newErrors.contenidoPorUnidad = 'Indica de cuánto es cada unidad.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast({ type: 'warning', title: 'Faltan datos', message: 'Revisa los campos requeridos.' });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const detalle: Record<string, any> = {};
      if (notasAdicionales.trim()) detalle.notas = notasAdicionales.trim();
      if (especiesSeleccionadas.length) detalle.especies_aplica = especiesSeleccionadas;
      if (UNIDADES_CONTENEDOR.has(cantidadUnidad) && contenidoPorUnidad.trim()) {
        detalle.contenido_por_unidad = contenidoPorUnidad.trim();
      }
      if (categoria === 'alimentos' && etapa) detalle.etapa = etapa;
      if (categoria === 'alimentos' && dietaEspecial) detalle.dieta_especial = dietaEspecial;

      const payload = {
        reporte_id: reporteId,
        categoria: categoria,
        urgencia: urgencia,
        subcategoria_id: subcategoriaId,
        cantidad_valor: cantidadValor ? parseFloat(cantidadValor) : null,
        cantidad_unidad: cantidadUnidad || null,
        detalle,
      };

      await axios.post(`${API_URL}/associations/me/necesidades`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setMostrarConfirmacion(true);
    } catch (error: any) {
      let errorMsg = 'No se pudo publicar la necesidad.';
      if (error?.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          errorMsg = `Error en ${detail[0].loc[1]}: ${detail[0].msg}`;
        } else if (typeof detail === 'string') {
          errorMsg = detail;
        }
      }
      showToast({ type: 'error', title: 'Error', message: errorMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const unidadesDisponibles: Option[] = [
    ...(UNIDADES_POR_CATEGORIA[categoria || ''] || []),
    { value: UNIDAD_OTRA, label: 'Otra' },
  ];

  const filtrosNecesidad: { value: 'todos' | 'con' | 'sin'; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'con', label: 'Con necesidad activa' },
    { value: 'sin', label: 'Sin necesidad activa' },
  ];

  return (
    <Modal visible={true} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Toast toast={toast} translateY={translateY} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%', maxWidth: 650, maxHeight: '90%' }}
        >
          <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 32, paddingTop: 40, flexShrink: 1, overflow: 'hidden' }}>

            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={8}
              style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={20} color={COLORS.textDark} />
            </TouchableOpacity>

            <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textDark, marginBottom: 24 }}>
              {mostrarConfirmacion ? '¡Listo!' : 'Crear Necesidad'}
            </Text>

            {mostrarConfirmacion ? (
              <View style={{ alignItems: 'center', paddingVertical: 20, paddingBottom: 8 }}>
                <Ionicons name="checkmark-circle" size={64} color={COLORS.accent} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textDark, marginTop: 16, textAlign: 'center' }}>
                  Necesidad registrada.
                </Text>
                <Text style={{ fontSize: 14, color: COLORS.textLight, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
                  Te avisaremos cuando un aliado de nuestra comunidad quiera cubrirla.
                </Text>
                <View style={{ marginTop: 24, width: '100%' }}>
                  <Button label="Entendido" onPress={() => router.back()} />
                </View>
              </View>
            ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>

              {/* ── TIPO Y REPORTE ── */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 12 }}>¿Para qué es esta necesidad?</Text>
                <View style={{ flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 16, padding: 4, ...SHADOW_SM }}>
                  <TouchableOpacity onPress={() => { setTipoNecesidad('general'); setReporteId(null); setDetalleHito(null); setErrors({}); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: tipoNecesidad === 'general' ? COLORS.primary : 'transparent' }}>
                    <Text style={{ fontWeight: '700', fontSize: 13, color: tipoNecesidad === 'general' ? COLORS.white : COLORS.textLight }}>Fondo general</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setTipoNecesidad('especifica'); setErrors({}); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: tipoNecesidad === 'especifica' ? COLORS.primary : 'transparent' }}>
                    <Text style={{ fontWeight: '700', fontSize: 13, color: tipoNecesidad === 'especifica' ? COLORS.white : COLORS.textLight }}>Caso específico</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 8, lineHeight: 17 }}>
                  {tipoNecesidad === 'general'
                    ? 'Se publica para cualquier aliado, sin ligarla a un caso puntual.'
                    : 'Se liga a un caso ya cerrado y solo la ven aliados compatibles con ese caso.'}
                </Text>
              </View>

              {tipoNecesidad === 'especifica' && (
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 12 }}>Selecciona el caso</Text>

                  {reportesActivos.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {filtrosNecesidad.map((opcion) => {
                        const isSelected = filtroNecesidad === opcion.value;
                        return (
                          <TouchableOpacity
                            key={opcion.value}
                            onPress={() => setFiltroNecesidad(opcion.value)}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: isSelected ? COLORS.accent : COLORS.white, borderWidth: 1, borderColor: isSelected ? COLORS.accent : '#E5E7EB' }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: isSelected ? COLORS.white : COLORS.textLight }}>{opcion.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {isLoadingReportes ? (
                    <View style={{ padding: 20, alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16, ...SHADOW_SM }}>
                      <ActivityIndicator color={COLORS.primary} />
                      <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 8 }}>Buscando casos rescatados...</Text>
                    </View>
                  ) : reportesFiltrados.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16, ...SHADOW_SM }}>
                      <Text style={{ fontSize: 13, color: COLORS.textLight }}>
                        {reportesActivos.length === 0 ? 'No tienes casos cerrados en este momento.' : 'No hay casos que coincidan con este filtro.'}
                      </Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                      {reportesFiltrados.map((reporte) => {
                        const tieneNecesidadActiva = necesidadesActivasIds.has(reporte.id);
                        return (
                          <TouchableOpacity
                            key={reporte.id}
                            onPress={() => seleccionarReporte(reporte)}
                            style={{ width: 140, padding: 10, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 2, borderColor: reporteId === reporte.id ? COLORS.accent : 'transparent', ...SHADOW_SM }}
                          >
                            <View>
                              {reporte.foto_url ? (
                                <Image source={{ uri: reporte.foto_url }} style={{ width: '100%', height: 90, borderRadius: 10, backgroundColor: '#2E2A26', marginBottom: 8 }} resizeMode="cover" />
                              ) : (
                                <View style={{ width: '100%', height: 90, borderRadius: 10, backgroundColor: 'rgba(236,128,43,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                                  <Ionicons name="paw" size={32} color={COLORS.primary} />
                                </View>
                              )}
                              {tieneNecesidadActiva && (
                                <View style={{ position: 'absolute', top: 4, left: 4, backgroundColor: COLORS.secondary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: COLORS.textDark }}>Necesidad activa</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textDark, textAlign: 'center' }} numberOfLines={2}>{reporte.titulo}</Text>
                            {reporte.closed_at && (
                              <Text style={{ fontSize: 10, color: COLORS.textLight, textAlign: 'center', marginTop: 2 }}>{formatearHaceDias(reporte.closed_at)}</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                  {errors.reporte && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>{errors.reporte}</Text>}

                  {casoSeleccionado && (
                    <View style={{ marginTop: 12, padding: 14, backgroundColor: COLORS.white, borderRadius: 16, ...SHADOW_SM }}>
                      <Text style={{ fontSize: 12, color: COLORS.textDark, marginBottom: 4 }}>
                        <Text style={{ fontWeight: '700' }}>Condición: </Text>{casoSeleccionado.condicion || 'Desconocido'}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.textDark, marginBottom: 4 }}>
                        <Text style={{ fontWeight: '700' }}>Tipo de animal: </Text>{casoSeleccionado.tipo_animal || 'Desconocido'}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.textDark, marginBottom: 4 }}>
                        <Text style={{ fontWeight: '700' }}>Rescatado: </Text>
                        {casoSeleccionado.closed_at ? formatearHaceDias(casoSeleccionado.closed_at) : 'Sin fecha registrada'}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.textDark }}>
                        <Text style={{ fontWeight: '700' }}>Último hito: </Text>
                        {isLoadingDetalleHito ? 'Cargando...' : detalleHito ? (HITO_LABELS[detalleHito.tipo_evento] || detalleHito.tipo_evento) : 'Sin hitos registrados'}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* ── CATEGORÍA Y SUBCATEGORÍA ── */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 12 }}>Categoría del recurso</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {categoriasData.map((cat) => {
                    const isSelected = categoria === cat.clave;
                    return (
                      <TouchableOpacity
                        key={cat.clave}
                        onPress={() => {
                          setCategoria(cat.clave);
                          setSubcategoriaId(null);
                          setUrgencia(null);
                          setEtapa(null);
                          setDietaEspecial(null);
                          setCantidadUnidad('');
                          setUnidadEsOtra(false);
                          setContenidoPorUnidad('');
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: isSelected ? COLORS.secondary : COLORS.white, borderWidth: 1, borderColor: isSelected ? COLORS.secondary : 'rgba(0,0,0,0.05)', ...SHADOW_SM }}
                      >
                        <Ionicons name={ICONO_POR_CLAVE[cat.clave] || ICONO_DEFAULT} size={16} color={isSelected ? COLORS.textDark : COLORS.textLight} style={{ marginRight: 6 }} />
                        <Text style={{ fontWeight: '700', fontSize: 13, color: isSelected ? COLORS.textDark : COLORS.textLight }}>{cat.descripcion}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                {errors.categoria && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>{errors.categoria}</Text>}
              </View>

              {/* Subcategoría Opcional */}
              {categoria && (isLoadingSubcategorias || subcategoriasData.length > 0) && (
                <View style={{ marginBottom: 24, padding: 16, backgroundColor: 'rgba(236,128,43,0.08)', borderRadius: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 10 }}>Específica lo que necesitas (Opcional)</Text>
                  {isLoadingSubcategorias ? (
                    <ActivityIndicator color={COLORS.primary} />
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {subcategoriasData.map((sub) => (
                        <TouchableOpacity
                          key={sub.id}
                          onPress={() => setSubcategoriaId(sub.id === subcategoriaId ? null : sub.id)}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: subcategoriaId === sub.id ? COLORS.primary : COLORS.white, borderWidth: 1, borderColor: subcategoriaId === sub.id ? COLORS.primary : '#E5E7EB' }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: subcategoriaId === sub.id ? COLORS.white : COLORS.textDark }}>{sub.descripcion}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* ── ESPECIE ── */}
              {categoria && tiposAnimalesAsociacion.length > 0 && (
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 12 }}>¿Para qué especies aplica? (Opcional)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {tiposAnimalesAsociacion.map((especie) => {
                      const isSelected = especiesSeleccionadas.includes(especie);
                      const label = especie.charAt(0).toUpperCase() + especie.slice(1);
                      return (
                        <TouchableOpacity
                          key={especie}
                          onPress={() => toggleEspecie(especie)}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: isSelected ? COLORS.accent : COLORS.white, borderWidth: 1, borderColor: isSelected ? COLORS.accent : '#E5E7EB' }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? COLORS.white : COLORS.textDark }}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ── ETAPA Y DIETA ESPECIAL (solo alimentos) ── */}
              {categoria === 'alimentos' && (
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 12 }}>Etapa (Opcional)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {ETAPA_OPCIONES.map((o) => {
                      const isSelected = etapa === o.value;
                      return (
                        <TouchableOpacity
                          key={o.value}
                          onPress={() => setEtapa(o.value === etapa ? null : o.value)}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: isSelected ? COLORS.accent : COLORS.white, borderWidth: 1, borderColor: isSelected ? COLORS.accent : '#E5E7EB' }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? COLORS.white : COLORS.textDark }}>{o.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginTop: 16, marginBottom: 12 }}>Dieta especial (Opcional)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {DIETA_ESPECIAL_OPCIONES.map((o) => {
                      const isSelected = dietaEspecial === o.value;
                      return (
                        <TouchableOpacity
                          key={o.value}
                          onPress={() => setDietaEspecial(o.value === dietaEspecial ? null : o.value)}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: isSelected ? COLORS.accent : COLORS.white, borderWidth: 1, borderColor: isSelected ? COLORS.accent : '#E5E7EB' }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? COLORS.white : COLORS.textDark }}>{o.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ── URGENCIA VETERINARIA ── */}
              {categoria === 'servicios_veterinarios' && (
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 12 }}>Nivel de Urgencia</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {URGENCIA_OPCIONES.map((opcion) => {
                      const isSelected = urgencia === opcion.value;
                      return (
                        <TouchableOpacity
                          key={opcion.value} onPress={() => setUrgencia(opcion.value)}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: isSelected ? COLORS.white : 'transparent', borderWidth: 2, borderColor: isSelected ? opcion.color : '#D1D5DB' }}
                        >
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: opcion.color, marginRight: 6 }} />
                          <Text style={{ fontWeight: '700', fontSize: 13, color: isSelected ? COLORS.textDark : COLORS.textLight }}>{opcion.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {errors.urgencia && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>{errors.urgencia}</Text>}
                </View>
              )}

              {/* ── CANTIDAD Y UNIDAD ── */}
              <View style={{ marginBottom: 28 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Cantidad (solo numero)</Text>
                <Input
                  placeholder="Ej. 15"
                  value={cantidadValor}
                  onChangeText={(val) => { setCantidadValor(normalizarDecimal(val)); setErrors(p => ({ ...p, cantidad_valor: '' })); }}
                  keyboardType="numeric"
                  error={errors.cantidad_valor}
                />

                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Unidad (Opcional)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {unidadesDisponibles.map((u) => {
                    const isSelected = unidadEsOtra ? u.value === UNIDAD_OTRA : cantidadUnidad === u.value;
                    return (
                      <TouchableOpacity
                        key={u.value}
                        onPress={() => {
                          if (u.value === UNIDAD_OTRA) {
                            setUnidadEsOtra(true);
                            setCantidadUnidad('');
                            setContenidoPorUnidad('');
                          } else {
                            setUnidadEsOtra(false);
                            setCantidadUnidad(u.value);
                            if (!UNIDADES_CONTENEDOR.has(u.value)) setContenidoPorUnidad('');
                          }
                          setErrors(p => ({ ...p, cantidad_unidad: '' }));
                        }}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: isSelected ? COLORS.primary : COLORS.white, borderWidth: 1, borderColor: isSelected ? COLORS.primary : '#E5E7EB' }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? COLORS.white : COLORS.textDark }}>{u.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {errors.cantidad_unidad && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>{errors.cantidad_unidad}</Text>}

                {unidadEsOtra && (
                  <View style={{ marginTop: 10 }}>
                    <Input placeholder="Escribe la unidad" value={cantidadUnidad} onChangeText={setCantidadUnidad} />
                  </View>
                )}

                {UNIDADES_CONTENEDOR.has(cantidadUnidad) && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, marginBottom: 6 }}>
                      ¿De cuánto es cada {cantidadUnidad === 'kits' ? 'kit' : cantidadUnidad.slice(0, -1)}?
                    </Text>
                    <Input
                      value={contenidoPorUnidad}
                      onChangeText={setContenidoPorUnidad}
                      placeholder="Ej. 25kg, 12 piezas, 5 litros"
                      error={errors.contenidoPorUnidad}
                    />
                  </View>
                )}
              </View>

              {/* Campo JSON (Se guarda en la columna "detalle") */}
              <View style={{ marginBottom: 28 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Detalles o Especificaciones (Opcional)</Text>
                <Input
                  placeholder={categoria === 'alimentos' ? "Ej. Para cachorro etapa 1, marca recomendada..." : "Añade notas para los aliados..."}
                  value={notasAdicionales}
                  onChangeText={setNotasAdicionales}
                />
              </View>

              {/* ── BOTONES FINALES ── */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                <TouchableOpacity onPress={() => router.back()} style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 18, backgroundColor: '#E5E7EB' }}>
                  <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}>Cancelar</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Button label="Publicar" onPress={handleGuardarNecesidad} isLoading={isSubmitting} />
                </View>
              </View>

            </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
