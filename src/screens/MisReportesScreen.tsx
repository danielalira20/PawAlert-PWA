import { Feather, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import {
  addMonths,
  endOfMonth,
  format,
  isAfter,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  subDays,
  subMonths,
  eachDayOfInterval,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_URL } from '../constants/api';
import { ICON_CAT, ICON_DOG, ICON_PAW, ICON_MULTIPLE } from '../constants/mapIcons';
import { petzen } from '../constants/petzenTheme';
import { useAuth } from '../context/AuthContext';
import { Animal, getAnimales, condicionMasGrave, totalAnimales, animalMasGrave } from '../types/reporte';
import { AnimalCarousel } from '../components/common/AnimalCarousel';

interface ReporteItem {
  id: string;
  estado_reporte: string;
  municipio: string | null;
  colonia: string | null;
  calle: string | null;
  created_at: string;
  foto_url: string | null;
  fotos?: string[]; // si el backend manda varias fotos (animal_fotos), se usan aquí
  asociacion_nombre: string | null;
  estado_publico: string;
  puede_cancelar: boolean;
  animales: Animal[];
}

interface MisReportesScreenProps {
  onClose?: () => void;
}

// ─── Filtros de estado ─────────────────────────────────────────────────────
const FILTROS = ['todos', 'pendiente', 'asignado', 'en_atencion', 'cerrado'] as const;
type Filtro = typeof FILTROS[number];

const FILTRO_LABELS: Record<Filtro, string> = {
  todos: 'Todos',
  pendiente: 'Pendiente',
  asignado: 'Asignado',
  en_atencion: 'En atención',
  cerrado: 'Cerrado',
};

const ESTADO_COLORES: Record<string, string> = {
  pendiente: '#F39C12',
  asignado: petzen.colors.teal,
  en_atencion: '#9B59B6',
  rescatado: '#27AE60',
  cerrado: '#64748B',
};

// ─── Filtros rápidos de tiempo ──────────────────────────────────────────────
const RANGOS = ['hoy', 'semana', 'mes', 'todos'] as const;
type Rango = typeof RANGOS[number];

const RANGO_LABELS: Record<Rango, string> = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  todos: 'Todos',
};

// ─── Config de condición (mismo lenguaje visual que el mapa) ────────────────
const CONDICION: Record<string, { color: string; bg: string }> = {
  estable: { color: '#27AE60', bg: '#EAFAF1' },
  herido:  { color: '#F39C12', bg: '#FEF9E7' },
  grave:   { color: '#E74C3C', bg: '#FDEDEC' },
};

const getCondicion = (c: string | null) =>
  CONDICION[c?.toLowerCase() ?? ''] ?? { color: '#95A5A6', bg: '#F2F3F4' };

// ─── Ícono real (perro/gato/huella) en vez de emoji ─────────────────────────
function AnimalIcon({ tipoAnimal, condicion, size = 34, count = 1 }: { tipoAnimal: string | null; condicion: string | null; size?: number; count?: number }) {
  const cfg = getCondicion(condicion);
  const tipo = tipoAnimal?.toLowerCase();
  const iconUri = count > 1 ? ICON_MULTIPLE : (tipo === 'perro' ? ICON_DOG : tipo === 'gato' ? ICON_CAT : ICON_PAW);
  const iconSize = size * 0.7;

  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: cfg.bg,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Image
        source={{ uri: iconUri }}
        style={{ width: iconSize, height: iconSize, tintColor: cfg.color }}
        resizeMode="contain"
      />
    </View>
  );
}

// ─── Carrusel de fotos (para la sección expandida) ──────────────────────────
function PhotoCarousel({
  fotos,
  width,
  height,
}: {
  fotos: string[];
  width: number | `${number}%`;
  height: number;
}) {
  const [index, setIndex] = useState(0);
  if (fotos.length === 0) return null;

  const goPrev = () => setIndex((i) => (i === 0 ? fotos.length - 1 : i - 1));
  const goNext = () => setIndex((i) => (i === fotos.length - 1 ? 0 : i + 1));

  return (
    <View style={{ width, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
      <View style={{ width, height }}>
        <Image source={{ uri: fotos[index] }} style={{ width, height }} resizeMode="cover" />

        {fotos.length > 1 && (
          <>
            {/* Flechas de navegación */}
            <TouchableOpacity
              onPress={goPrev}
              style={{
                position: 'absolute', left: 4, top: '50%', marginTop: -13,
                width: 26, height: 26, borderRadius: 13,
                backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Feather name="chevron-left" size={15} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={goNext}
              style={{
                position: 'absolute', right: 4, top: '50%', marginTop: -13,
                width: 26, height: 26, borderRadius: 13,
                backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Feather name="chevron-right" size={15} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Puntos indicadores */}
            <View style={{
              position: 'absolute', bottom: 8, left: 0, right: 0,
              flexDirection: 'row', justifyContent: 'center', gap: 5,
            }}>
              {fotos.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === index ? 14 : 6, height: 6, borderRadius: 3,
                    backgroundColor: i === index ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
                  }}
                />
              ))}
            </View>

            {/* Contador */}
            <View style={{
              position: 'absolute', top: 6, right: 6,
              backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 100,
              paddingHorizontal: 7, paddingVertical: 2,
            }}>
              <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: '700' }}>{index + 1}/{fotos.length}</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export default function MisReportesScreen({ onClose }: MisReportesScreenProps) {
  const { token, user, isLoggedIn } = useAuth();
  const [reportes, setReportes] = useState<ReporteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [rango, setRango] = useState<Rango>('todos');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isWeb = Platform.OS === 'web';

  // El modal centrado solo tiene sentido en web CON pantalla ancha (desktop).
  // En web con viewport angosto (navegador de celular) o en app nativa,
  // usamos pantalla completa — igual que hicimos en MapScreen.web.tsx.
  const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setWindowWidth(window.width));
    return () => sub.remove();
  }, []);
  const showAsCenteredModal = isWeb && windowWidth >= 640;

  // Si la sesión termina mientras esta pantalla está abierta (ej. el refresh_token
  // también expiró y el interceptor global hizo logout), nos cerramos solos en vez
  // de quedarnos mostrando un spinner o una lista vacía sin contexto.
  useEffect(() => {
    if (!isLoggedIn) {
      onClose?.();
    }
  }, [isLoggedIn]);

  const cargarReportes = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/reports/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReportes(res.data);
    } catch {
      // Si falla, mostramos lista vacía (el efecto de arriba se encarga de
      // cerrar la pantalla si la causa fue que la sesión terminó)
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarReportes();
  }, []);

  // ─── Filtrado: un día específico (del calendario) tiene prioridad ─────────
  const cumpleFecha = (fecha: Date): boolean => {
    if (selectedDay) return isSameDay(fecha, selectedDay);
    const ahora = new Date();
    if (rango === 'hoy') return isSameDay(fecha, ahora);
    if (rango === 'semana') return isAfter(fecha, startOfWeek(ahora, { weekStartsOn: 1 }));
    if (rango === 'mes') return isAfter(fecha, startOfMonth(ahora));
    return true; // todos
  };

  // Mapa de días con reportes (para pintar el puntito en el calendario)
  const diasConReportes = new Map<string, string>(); // yyyy-MM-dd -> color del punto
  reportes.forEach((r) => {
    const key = format(new Date(r.created_at), 'yyyy-MM-dd');
    if (!diasConReportes.has(key)) {
      diasConReportes.set(key, getCondicion(condicionMasGrave(getAnimales(r))).color);
    }
  });

  const handlePickDay = (dia: Date) => {
    setSelectedDay(dia);
    setCalendarOpen(false);
  };

  const handleSelectRango = (r: Rango) => {
    setSelectedDay(null);
    setRango(r);
  };

  const reportesFiltrados = reportes
    .filter((r) => {
      const pasaEstado = filtro === 'todos' || r.estado_reporte === filtro;
      const pasaFecha = cumpleFecha(new Date(r.created_at));
      return pasaEstado && pasaFecha;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // ─── Agrupar el timeline por fecha (Hoy / Ayer / fecha) ────────────────────
  // El timeline se conserva: cada grupo tiene su propio punto+línea que
  // reinicia visualmente debajo de cada encabezado de fecha.
  const getDayLabel = (fecha: Date): string => {
    const hoy = new Date();
    const ayer = subDays(hoy, 1);
    if (isSameDay(fecha, hoy)) return 'Hoy';
    if (isSameDay(fecha, ayer)) return 'Ayer';
    const label = format(fecha, "d 'de' MMMM", { locale: es });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  type TimelineRow =
    | { type: 'header'; key: string; label: string }
    | { type: 'item'; key: string; reporte: ReporteItem; isLastInGroup: boolean };

  const timelineRows: TimelineRow[] = [];
  {
    let prevDayKey: string | null = null;
    reportesFiltrados.forEach((r) => {
      const fecha = new Date(r.created_at);
      const dayKey = format(fecha, 'yyyy-MM-dd');
      if (dayKey !== prevDayKey) {
        timelineRows.push({ type: 'header', key: `h-${dayKey}`, label: getDayLabel(fecha) });
        prevDayKey = dayKey;
      }
      timelineRows.push({ type: 'item', key: r.id, reporte: r, isLastInGroup: false });
    });
    // Marcar el último item de cada grupo (el que precede al siguiente header, o el final de la lista)
    for (let i = 0; i < timelineRows.length; i++) {
      const row = timelineRows[i];
      if (row.type === 'item') {
        const next = timelineRows[i + 1];
        if (!next || next.type === 'header') {
          row.isLastInGroup = true;
        }
      }
    }
  }

  const getEstadoColor = (estado: string) => ESTADO_COLORES[estado] || '#64748B';

  const formatFecha = (fechaStr: string) => {
    const fecha = new Date(fechaStr);
    return format(fecha, "d 'de' MMM, HH:mm", { locale: es });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const cancelarReporte = (reporte: ReporteItem) => {
    Alert.alert(
      '¿Cancelar este reporte?',
      'Si ya hay una persona en camino, la asociación recibirá un aviso y el caso continuará abierto por seguridad.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Solicitar cancelación',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await axios.post(
                `${API_URL}/reports/${reporte.id}/cancel`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
              );
              Alert.alert(
                response.data.cancelado ? 'Reporte cancelado' : 'Asociación avisada',
                response.data.mensaje || 'La actualización quedó registrada.',
              );
              await cargarReportes();
            } catch (error: any) {
              Alert.alert(
                'No pudimos cancelar',
                error?.response?.data?.detail || 'Inténtalo nuevamente.',
              );
            }
          },
        },
      ],
    );
  };

  // ─── Card de un reporte ──────────────────────────────────────────────────
  const renderCard = (reporte: ReporteItem, isLast: boolean) => {
    const isExpanded = expandedId === reporte.id;
    const estadoColor = getEstadoColor(reporte.estado_reporte);
    const animales = getAnimales(reporte);
    const grave = animalMasGrave(animales);
    const totalCaso = totalAnimales(animales);
    const condCfg = getCondicion(grave?.condicion ?? null);
    const condicionLabel = grave?.condicion
      ? grave.condicion[0].toUpperCase() + grave.condicion.slice(1)
      : null;
    const tipoLabel = grave?.tipo_animal
      ? grave.tipo_animal[0].toUpperCase() + grave.tipo_animal.slice(1)
      : 'Animal';
    const fotos = reporte.fotos && reporte.fotos.length > 0
      ? reporte.fotos
      : reporte.foto_url ? [reporte.foto_url] : [];

    return (
      <View key={reporte.id} style={{ flexDirection: 'row' }}>
        {/* Columna del timeline: punto + línea */}
        <View style={{ width: 22, alignItems: 'center' }}>
          <View style={{
            width: 11, height: 11, borderRadius: 5.5,
            backgroundColor: condCfg.color,
            borderWidth: 2, borderColor: '#FFFFFF',
            marginTop: 6,
            shadowColor: condCfg.color, shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4, shadowRadius: 4,
          }} />
          {!isLast && (
            <View style={{ flex: 1, width: 2, backgroundColor: '#EAE2D6', marginTop: 4, marginBottom: 4 }} />
          )}
        </View>

        {/* Contenido: fecha + card */}
        <View style={{ flex: 1, paddingBottom: isLast ? 4 : 20, paddingLeft: 4 }}>
          <Text style={{ fontSize: 11, color: petzen.colors.textSecondary, marginBottom: 6, fontWeight: '600' }}>
            {formatFecha(reporte.created_at)}
          </Text>

          <TouchableOpacity onPress={() => toggleExpand(reporte.id)} activeOpacity={0.85}>
            <View style={{
              backgroundColor: petzen.colors.white,
              borderWidth: isExpanded ? 2 : 1.5,
              borderColor: isExpanded ? condCfg.color : condCfg.color + '80',
              borderRadius: 16,
              overflow: 'hidden',
              shadowColor: condCfg.color,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isExpanded ? 0.3 : 0.16,
              shadowRadius: isExpanded ? 12 : 6,
              elevation: isExpanded ? 4 : 2,
            }}>
              {/* Franja superior de color — refuerza el estado de salud de un vistazo */}
              <View style={{ height: 4, backgroundColor: condCfg.color }} />

              <View style={{ flexDirection: 'row', padding: 13, gap: 12, alignItems: 'center' }}>
                {/* Foto o ícono */}
                <View style={{ width: 72, height: 72, borderRadius: 14, overflow: 'visible', flexShrink: 0, borderWidth: 1, borderColor: condCfg.color + '30' }}>
                  <View style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden' }}>
                    {fotos.length > 0 ? (
                      <Image source={{ uri: fotos[0] }} style={{ width: 72, height: 72 }} resizeMode="cover" />
                    ) : (
                      <View style={{ width: 72, height: 72, backgroundColor: condCfg.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <AnimalIcon tipoAnimal={grave?.tipo_animal ?? null} condicion={grave?.condicion ?? null} size={56} count={totalCaso} />
                      </View>
                    )}
                  </View>
                  {totalCaso > 1 && (
                    <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: petzen.colors.textDark, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>{totalCaso}</Text>
                    </View>
                  )}
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <AnimalIcon tipoAnimal={grave?.tipo_animal ?? null} condicion={grave?.condicion ?? null} size={28} count={totalCaso} />
                    <Text style={{ fontSize: 15, fontFamily: petzen.fonts.bold, color: petzen.colors.textDark }}>
                      {tipoLabel}{totalCaso > 1 ? ` · ${totalCaso} animales` : ''}
                    </Text>
                    {grave?.tamanio && (
                      <Text style={{ fontSize: 12, color: petzen.colors.textSecondary }}>
                        · {grave.tamanio[0].toUpperCase() + grave.tamanio.slice(1)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <Ionicons name="location-outline" size={11} color={petzen.colors.textSecondary} />
                    <Text style={{ fontSize: 11, color: petzen.colors.textSecondary, flexShrink: 1 }} numberOfLines={1}>
                      {reporte.colonia || reporte.municipio || 'Sin ubicación'}
                    </Text>
                  </View>
                  {/* Badges: estado de salud + estado del reporte */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {condicionLabel && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: condCfg.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, borderWidth: 1, borderColor: condCfg.color + '40' }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: condCfg.color }} />
                        <Text style={{ fontSize: 9, fontFamily: petzen.fonts.bold, color: condCfg.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {condicionLabel}
                        </Text>
                      </View>
                    )}
                    <View style={{ backgroundColor: estadoColor + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 }}>
                      <Text style={{ fontSize: 9, fontFamily: petzen.fonts.bold, color: estadoColor, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        {FILTRO_LABELS[reporte.estado_reporte as Filtro] || reporte.estado_reporte}
                      </Text>
                    </View>
                    {fotos.length > 1 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="images-outline" size={11} color={petzen.colors.textSecondary} />
                        <Text style={{ fontSize: 9, color: petzen.colors.textSecondary, fontWeight: '600' }}>{fotos.length}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <Feather
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={petzen.colors.textSecondary}
                />
              </View>

              {/* Sección expandida */}
              {isExpanded && (() => {
                // En pantallas angostas de verdad el layout foto+texto lado a lado
                // no cabe (el texto se corta o se parte). Ahí apilamos: foto arriba
                // a todo el ancho, detalles abajo también a todo el ancho.
                const stacked = windowWidth < 420;

                const detailRows = (
                  <>
                    {reporte.asociacion_nombre && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: petzen.colors.teal + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ionicons name="business-outline" size={14} color={petzen.colors.tealDark} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 10, color: petzen.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Asociación</Text>
                          <Text style={{ fontSize: 14, color: petzen.colors.textDark, fontWeight: '700' }}>{reporte.asociacion_nombre}</Text>
                        </View>
                      </View>
                    )}

                    {(reporte.calle || reporte.colonia || reporte.municipio) && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: '#F39C1220', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ionicons name="location-outline" size={14} color="#D68910" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 10, color: petzen.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Ubicación</Text>
                          <Text style={{ fontSize: 13, color: petzen.colors.textDark }}>
                            {[reporte.calle, reporte.colonia, reporte.municipio].filter(Boolean).join(', ')}
                          </Text>
                        </View>
                      </View>
                    )}

                    {reporte.puede_cancelar && (
                      <TouchableOpacity
                        onPress={() => cancelarReporte(reporte)}
                        style={{
                          alignSelf: 'flex-start',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          borderWidth: 1,
                          borderColor: '#C85A4A55',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <Ionicons name="close-circle-outline" size={15} color="#A84335" />
                        <Text style={{ color: '#A84335', fontSize: 11, fontWeight: '800' }}>
                          Cancelar reporte
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Datos del animal — navegable si el caso trae más de uno.
                    No-compact: incluye la descripción del animal actual, para
                    que quede sincronizada con el índice del carrusel (antes
                    era un bloque aparte que solo mostraba la del más grave). */}
                    {animales.length > 0 && (
                      <AnimalCarousel animales={animales} />
                    )}
                  </>
                );

                return (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#F0EBE3', padding: 13 }}>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 9,
                      padding: 11,
                      borderRadius: 12,
                      backgroundColor: petzen.colors.teal + '12',
                      marginBottom: 12,
                    }}>
                      <Ionicons name="pulse-outline" size={17} color={petzen.colors.tealDark} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 9, color: petzen.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase' }}>
                          Avance del rescate
                        </Text>
                        <Text style={{ fontSize: 13, color: petzen.colors.textDark, fontWeight: '800', marginTop: 2 }}>
                          {reporte.estado_publico}
                        </Text>
                      </View>
                    </View>
                    {stacked ? (
                      <View style={{ gap: 12 }}>
                        {fotos.length > 0 && (
                          <PhotoCarousel fotos={fotos} width="100%" height={170} />
                        )}
                        <View style={{ gap: 11 }}>{detailRows}</View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        {fotos.length > 0 && (
                          <PhotoCarousel fotos={fotos} width={128} height={158} />
                        )}
                        <View style={{ flex: 1, gap: 11, minWidth: 0 }}>{detailRows}</View>
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Contenido interno (header + filtros + timeline) ─────────────────────
  const content = (
    <View style={{ flex: 1, backgroundColor: petzen.colors.background, borderRadius: showAsCenteredModal ? 20 : 0, overflow: 'hidden' }}>
      {/* Header */}
      <LinearGradient
        colors={[petzen.colors.teal, petzen.colors.tealDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: showAsCenteredModal ? 20 : 28,
          paddingHorizontal: 22,
          paddingBottom: 22,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
              <Ionicons name="paw" size={19} color="#FFFFFF" />
            </View>
            <View>
              <Text style={{ fontSize: 19, fontFamily: petzen.fonts.extraBold, color: '#FFFFFF', letterSpacing: -0.4 }}>
                Mis Reportes
              </Text>
              <Text style={{ fontSize: 12, fontFamily: petzen.fonts.medium, color: 'rgba(255,255,255,0.85)', marginTop: 1 }}>
                {user?.nombre} {user?.apellido_paterno}
              </Text>
            </View>
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="x" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
        <View style={{ alignSelf: 'flex-start', backgroundColor: petzen.colors.orange, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 100, marginTop: 12 }}>
          <Text style={{ fontSize: 12, fontFamily: petzen.fonts.bold, color: '#FFFFFF' }}>
            {reportes.length} {reportes.length === 1 ? 'reporte' : 'reportes'}
          </Text>
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
          <ActivityIndicator size="large" color={petzen.colors.orange} />
          <Text style={{ color: petzen.colors.textSecondary, marginTop: 12, fontSize: 13 }}>Cargando tus reportes...</Text>
        </View>
      ) : (
        <>
          {/* Filtros pinneados (no scrollean con el timeline) */}
          <View style={{ marginTop: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }} style={{ flex: 1 }}>
              {RANGOS.map((r) => {
                const isActive = !selectedDay && rango === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => handleSelectRango(r)}
                    style={{
                      paddingHorizontal: 13, paddingVertical: 6, borderRadius: 100,
                      backgroundColor: isActive ? petzen.colors.tealDark : petzen.colors.white,
                      borderWidth: 1, borderColor: isActive ? petzen.colors.tealDark : '#EFEAE2',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: petzen.fonts.semiBold, color: isActive ? '#FFFFFF' : petzen.colors.textSecondary }}>
                      {RANGO_LABELS[r]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Botón de calendario — el popover se renderiza como overlay independiente más abajo */}
            <TouchableOpacity
              onPress={() => setCalendarOpen((v) => !v)}
              style={{
                width: 42, height: 42, borderRadius: 100,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: selectedDay ? petzen.colors.tealDark : petzen.colors.white,
                borderWidth: 1, borderColor: selectedDay ? petzen.colors.tealDark : '#EFEAE2',
              }}
            >
              <Ionicons name="calendar-outline" size={22} color={selectedDay ? '#FFFFFF' : petzen.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Chip informativo cuando hay un día específico seleccionado */}
          {selectedDay && (
            <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: petzen.colors.tealDark + '15', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 100 }}>
                <Ionicons name="calendar" size={12} color={petzen.colors.tealDark} />
                <Text style={{ fontSize: 11, fontFamily: petzen.fonts.semiBold, color: petzen.colors.tealDark }}>
                  {format(selectedDay, "d 'de' MMMM", { locale: es })}
                </Text>
                <TouchableOpacity onPress={() => setSelectedDay(null)}>
                  <Feather name="x" size={12} color={petzen.colors.tealDark} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Pills de filtro por estado */}
          <View style={{ marginBottom: 14 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 7 }}>
              {FILTROS.map((f) => {
                const isActive = filtro === f;
                const color = f === 'todos' ? petzen.colors.orange : ESTADO_COLORES[f] || petzen.colors.textSecondary;
                return (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setFiltro(f)}
                    style={{
                      paddingHorizontal: 13, paddingVertical: 6, borderRadius: 100,
                      backgroundColor: isActive ? color : petzen.colors.white,
                      borderWidth: 1, borderColor: isActive ? color : '#EFEAE2',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: petzen.fonts.semiBold, color: isActive ? '#FFFFFF' : petzen.colors.textSecondary }}>
                      {FILTRO_LABELS[f]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Timeline: única parte que scrollea */}
          <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>

                    {/* Timeline de reportes */}
          <View style={{ paddingHorizontal: 20 }}>
            {reportesFiltrados.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 50 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: petzen.colors.peach + '30', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Image source={{ uri: ICON_PAW }} style={{ width: 32, height: 32, tintColor: petzen.colors.orange }} resizeMode="contain" />
                </View>
                <Text style={{ fontSize: 16, fontFamily: petzen.fonts.bold, color: petzen.colors.textDark, marginBottom: 6 }}>
                  {selectedDay
                    ? `Sin reportes el ${format(selectedDay, "d 'de' MMMM", { locale: es })}`
                    : `Sin reportes ${rango !== 'todos' ? `en ${RANGO_LABELS[rango].toLowerCase()}` : 'aún'}`}
                </Text>
                <Text style={{ fontSize: 13, color: petzen.colors.textSecondary, textAlign: 'center' }}>
                  {selectedDay || rango !== 'todos'
                    ? 'Prueba con otra fecha.'
                    : 'Cuando reportes un animal aparecerá aquí.'}
                </Text>
              </View>
            ) : (
              timelineRows.map((row) =>
                row.type === 'header' ? (
                  <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 }}>
                    <Text style={{ fontSize: 12, fontFamily: petzen.fonts.extraBold, color: petzen.colors.tealDark, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      {row.label}
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: '#E9E1D4' }} />
                  </View>
                ) : (
                  renderCard(row.reporte, row.isLastInGroup)
                )
              )
            )}
          </View>

        </ScrollView>
        </>
      )}

      {/* Popover del calendario — overlay independiente, no lo recorta el ScrollView interno */}
      {calendarOpen && (
        <>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }}
            activeOpacity={1}
            onPress={() => setCalendarOpen(false)}
          />
          <View style={{
            position: 'absolute', top: 148, right: 20,
            width: 240, backgroundColor: petzen.colors.white,
            borderRadius: 16, padding: 14,
            shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 24,
            elevation: 14, zIndex: 50,
            borderWidth: 1, borderColor: '#F0EBE3',
          }}>
            {/* Navegación de mes */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <TouchableOpacity onPress={() => setCalendarMonth((m) => subMonths(m, 1))} style={{ padding: 4 }}>
                <Feather name="chevron-left" size={16} color={petzen.colors.textDark} />
              </TouchableOpacity>
              <Text style={{ fontSize: 12, fontFamily: petzen.fonts.bold, color: petzen.colors.textDark, textTransform: 'capitalize' }}>
                {format(calendarMonth, 'MMMM yyyy', { locale: es })}
              </Text>
              <TouchableOpacity onPress={() => setCalendarMonth((m) => addMonths(m, 1))} style={{ padding: 4 }}>
                <Feather name="chevron-right" size={16} color={petzen.colors.textDark} />
              </TouchableOpacity>
            </View>

            {/* Encabezado de días de la semana */}
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 9, color: petzen.colors.textSecondary, fontWeight: '700' }}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Grid de bolitas por día — cualquier día es seleccionable */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {eachDayOfInterval({
                start: startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 }),
                end: endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 }),
              }).map((dia, i) => {
                const fechaKey = format(dia, 'yyyy-MM-dd');
                const dotColor = diasConReportes.get(fechaKey);
                const enEsteMes = isSameMonth(dia, calendarMonth);
                const esSeleccionado = selectedDay ? isSameDay(dia, selectedDay) : false;
                const esHoy = isSameDay(dia, new Date());
                const tieneReportes = !!dotColor;

                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => handlePickDay(dia)}
                    style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 }}
                  >
                    <View style={{
                      width: 26, height: 26, borderRadius: 13,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: esSeleccionado ? petzen.colors.tealDark : 'transparent',
                      borderWidth: esHoy && !esSeleccionado ? 1.5 : 0,
                      borderColor: petzen.colors.teal,
                    }}>
                      <Text style={{
                        fontSize: 11,
                        fontWeight: esSeleccionado ? '800' : '500',
                        color: !enEsteMes ? '#D8D0C4' : esSeleccionado ? '#FFFFFF' : tieneReportes ? petzen.colors.textDark : petzen.colors.textSecondary,
                      }}>
                        {format(dia, 'd')}
                      </Text>
                    </View>
                    <View style={{
                      width: 4, height: 4, borderRadius: 2, marginTop: 1,
                      backgroundColor: tieneReportes ? (esSeleccionado ? '#FFFFFF' : dotColor) : 'transparent',
                    }} />
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedDay && (
              <TouchableOpacity
                onPress={() => { setSelectedDay(null); setCalendarOpen(false); }}
                style={{ marginTop: 8, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: petzen.colors.peach + '30' }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: petzen.colors.orangeDark }}>Quitar filtro de fecha</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );

  // ─── Modal de React Native para TODO caso ──────────────────────────────────
  // Antes usábamos `position:'fixed'` a mano en web. El problema: si algún
  // ancestro (el wrapper de React Navigation/Expo Router, animaciones de
  // transición entre tabs, etc.) tiene un `transform` aplicado, ese ancestro
  // se vuelve el "contenedor" real de cualquier hijo `fixed` — y entonces
  // ningún z-index, por alto que sea, logra que quede por encima del navbar.
  //
  // <Modal> de React Native se renderiza vía portal directo al <body> (en
  // web) o a la capa nativa de modales (en iOS/Android), completamente FUERA
  // del árbol de la app — así se escapa de raíz cualquier stacking context
  // problemático, sin depender de números de z-index.
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {showAsCenteredModal ? (
        // Desktop / web ancho: tarjeta centrada con fondo oscuro
        <View style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20, paddingBottom: 90 }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={onClose}
          />
          <View
            style={{
              width: '100%',
              maxWidth: 640,
              minHeight: 520,
              maxHeight: '75vh' as any,
              borderRadius: 20,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 20 },
              shadowOpacity: 0.25,
              shadowRadius: 40,
            }}
          >
            {content}
          </View>
        </View>
      ) : (
        // Móvil (nativo o navegador angosto): pantalla completa sin fondo oscuro
        <View style={{ flex: 1, backgroundColor: petzen.colors.background }}>
          {content}
        </View>
      )}
    </Modal>
  );
}
