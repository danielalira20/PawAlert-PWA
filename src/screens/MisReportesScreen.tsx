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
  Image,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_URL } from '../constants/api';
import { ICON_CAT, ICON_DOG, ICON_PAW } from '../constants/mapIcons';
import { petzen } from '../constants/petzenTheme';
import { useAuth } from '../context/AuthContext';

interface ReporteItem {
  id: string;
  estado_reporte: string;
  municipio: string | null;
  colonia: string | null;
  calle: string | null;
  created_at: string;
  foto_url: string | null;
  asociacion_nombre: string | null;
  animal: {
    tipo_animal: string | null;
    condicion: string | null;
    tamanio: string | null;
    sexo: string | null;
    edad_aproximada: string | null;
    descripcion: string | null;
  } | null;
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
function AnimalIcon({ tipoAnimal, condicion, size = 34 }: { tipoAnimal: string | null; condicion: string | null; size?: number }) {
  const cfg = getCondicion(condicion);
  const tipo = tipoAnimal?.toLowerCase();
  const iconUri = tipo === 'perro' ? ICON_DOG : tipo === 'gato' ? ICON_CAT : ICON_PAW;
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

export default function MisReportesScreen({ onClose }: MisReportesScreenProps) {
  const { token, user } = useAuth();
  const [reportes, setReportes] = useState<ReporteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [rango, setRango] = useState<Rango>('todos');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isWeb = Platform.OS === 'web';

  const cargarReportes = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/reports/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReportes(res.data);
    } catch {
      // Si falla, mostramos lista vacía
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
      diasConReportes.set(key, getCondicion(r.animal?.condicion ?? null).color);
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

  // ─── Card de un reporte ──────────────────────────────────────────────────
  const renderCard = (reporte: ReporteItem, isLast: boolean) => {
    const isExpanded = expandedId === reporte.id;
    const estadoColor = getEstadoColor(reporte.estado_reporte);
    const condCfg = getCondicion(reporte.animal?.condicion ?? null);
    const tipoLabel = reporte.animal?.tipo_animal
      ? reporte.animal.tipo_animal[0].toUpperCase() + reporte.animal.tipo_animal.slice(1)
      : 'Animal';

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
              borderWidth: 1,
              borderColor: isExpanded ? condCfg.color + '55' : '#EFEAE2',
              borderRadius: 16,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isExpanded ? 0.08 : 0.04,
              shadowRadius: isExpanded ? 10 : 5,
              elevation: isExpanded ? 3 : 1,
            }}>
              <View style={{ flexDirection: 'row', padding: 12, gap: 11, alignItems: 'center' }}>
                {/* Foto o ícono */}
                <View style={{ width: 68, height: 68, borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
                  {reporte.foto_url ? (
                    <Image source={{ uri: reporte.foto_url }} style={{ width: 68, height: 68 }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: 68, height: 68, backgroundColor: condCfg.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <AnimalIcon tipoAnimal={reporte.animal?.tipo_animal ?? null} condicion={reporte.animal?.condicion ?? null} size={54} />
                    </View>
                  )}
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <AnimalIcon tipoAnimal={reporte.animal?.tipo_animal ?? null} condicion={reporte.animal?.condicion ?? null} size={30} />
                    <Text style={{ fontSize: 14, fontFamily: petzen.fonts.bold, color: petzen.colors.textDark }}>
                      {tipoLabel}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: petzen.colors.textSecondary, marginBottom: 7 }}>
                    {reporte.colonia || reporte.municipio || 'Sin ubicación'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ backgroundColor: estadoColor + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 }}>
                      <Text style={{ fontSize: 9, fontFamily: petzen.fonts.bold, color: estadoColor, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        {FILTRO_LABELS[reporte.estado_reporte as Filtro] || reporte.estado_reporte}
                      </Text>
                    </View>
                  </View>
                </View>

                <Feather
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={petzen.colors.textSecondary}
                />
              </View>

              {/* Sección expandida */}
              {isExpanded && (
                <View style={{ borderTopWidth: 1, borderTopColor: '#F0EBE3', padding: 13 }}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {/* Foto lateral (en vez de banner ancho — evita distorsión en fotos verticales) */}
                    {reporte.foto_url && (
                      <View style={{ width: 128, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
                        <Image source={{ uri: reporte.foto_url }} style={{ width: 128, height: 158 }} resizeMode="cover" />
                      </View>
                    )}

                    {/* Detalles */}
                    <View style={{ flex: 1, gap: 9 }}>
                      {reporte.asociacion_nombre && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: petzen.colors.teal + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Ionicons name="business-outline" size={13} color={petzen.colors.tealDark} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 9, color: petzen.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Asociación</Text>
                            <Text style={{ fontSize: 12, color: petzen.colors.textDark, fontWeight: '600' }}>{reporte.asociacion_nombre}</Text>
                          </View>
                        </View>
                      )}

                      {(reporte.calle || reporte.colonia || reporte.municipio) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#F39C1220', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Ionicons name="location-outline" size={13} color="#D68910" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 9, color: petzen.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Ubicación</Text>
                            <Text style={{ fontSize: 12, color: petzen.colors.textDark }}>
                              {[reporte.calle, reporte.colonia, reporte.municipio].filter(Boolean).join(', ')}
                            </Text>
                          </View>
                        </View>
                      )}

                      {reporte.animal && (
                        <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
                          {[reporte.animal.sexo, reporte.animal.edad_aproximada, reporte.animal.tamanio]
                            .filter(Boolean)
                            .map((dato, i) => (
                              <View key={i} style={{ backgroundColor: petzen.colors.peach + '40', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 }}>
                                <Text style={{ fontSize: 9, color: petzen.colors.textDark, textTransform: 'capitalize' }}>{dato}</Text>
                              </View>
                            ))}
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Descripción a todo el ancho, debajo de la fila foto+detalles */}
                  {reporte.animal?.descripcion && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F5F0E8' }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#9B59B620', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Ionicons name="document-text-outline" size={13} color="#9B59B6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 9, color: petzen.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Descripción</Text>
                        <Text style={{ fontSize: 12, color: petzen.colors.textSecondary, lineHeight: 17 }}>{reporte.animal.descripcion}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Contenido interno (header + filtros + timeline) ─────────────────────
  const content = (
    <View style={{ flex: 1, backgroundColor: petzen.colors.background, borderRadius: isWeb ? 20 : 0, overflow: 'hidden' }}>
      {/* Header */}
      <LinearGradient
        colors={[petzen.colors.teal, petzen.colors.tealDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: isWeb ? 20 : 28,
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
          <View style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 8 }}>
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
                width: 32, height: 32, borderRadius: 100,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: selectedDay ? petzen.colors.tealDark : petzen.colors.white,
                borderWidth: 1, borderColor: selectedDay ? petzen.colors.tealDark : '#EFEAE2',
              }}
            >
              <Ionicons name="calendar-outline" size={16} color={selectedDay ? '#FFFFFF' : petzen.colors.textSecondary} />
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

  // ─── Web: modal centrado con overlay ──────────────────────────────────────
  if (isWeb) {
    return (
      <View
        style={{
          position: 'fixed' as any,
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(20,15,10,0.45)',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 2000,
          padding: 20,
        }}
      >
        {/* Click fuera del modal cierra */}
        <TouchableOpacity
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={{
            width: '100%',
            maxWidth: 640,
            maxHeight: '85vh' as any,
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
    );
  }

  // ─── Mobile: pantalla completa (se presenta como Modal desde el padre) ────
  return content;
}