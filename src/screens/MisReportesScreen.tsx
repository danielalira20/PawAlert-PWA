import { Feather, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { isSameDay, format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');

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
  asignado: '#3498DB',
  en_atencion: '#9B59B6',
  rescatado: '#27AE60',
  cerrado: '#64748B',
};

const CONDICION_EMOJI: Record<string, string> = {
  estable: '🟢',
  herido: '🟡',
  grave: '🔴',
};

const TIPO_EMOJI: Record<string, string> = {
  perro: '🐕',
  gato: '🐈',
  otro: '🐾',
};

export default function MisReportesScreen({ onClose }: MisReportesScreenProps) {
  const { token, user } = useAuth();
  const [reportes, setReportes] = useState<ReporteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Generar los últimos 14 días
  const dias = Array.from({ length: 14 }, (_, i) => subDays(new Date(), 13 - i));

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

  // Días que tienen reportes
  const diasConReportes = new Set(
    reportes.map((r) => format(new Date(r.created_at), 'yyyy-MM-dd'))
  );

  // Filtrado
  const reportesFiltrados = reportes.filter((r) => {
    const pasaFiltroEstado = filtro === 'todos' || r.estado_reporte === filtro;
    const pasaFiltroDia = !selectedDay || isSameDay(new Date(r.created_at), selectedDay);
    return pasaFiltroEstado && pasaFiltroDia;
  });

  const getEstadoColor = (estado: string) => ESTADO_COLORES[estado] || '#64748B';

  const formatFecha = (fechaStr: string) => {
    const fecha = new Date(fechaStr);
    return format(fecha, "d 'de' MMM, HH:mm", { locale: es });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  // ─── Card con piquito ───
  const renderCard = (reporte: ReporteItem) => {
    const isExpanded = expandedId === reporte.id;
    const estadoColor = getEstadoColor(reporte.estado_reporte);
    const tipoEmoji = TIPO_EMOJI[reporte.animal?.tipo_animal || ''] || '🐾';
    const condicionEmoji = CONDICION_EMOJI[reporte.animal?.condicion || ''] || '';

    return (
      <View key={reporte.id} style={{ marginBottom: 24 }}>
        <TouchableOpacity
          onPress={() => toggleExpand(reporte.id)}
          activeOpacity={0.85}
        >
          {/* Card principal con glass */}
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.13)',
            borderRadius: 18,
            overflow: 'hidden',
            ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px)' } as any : {}),
          }}>
            {/* Barra de color del estado arriba */}
            <View style={{ height: 3, backgroundColor: estadoColor }} />

            <View style={{ flexDirection: 'row', padding: 14, gap: 12 }}>
              {/* Foto */}
              <View style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' }}>
                {reporte.foto_url ? (
                  <Image source={{ uri: reporte.foto_url }} style={{ width: 80, height: 80 }} resizeMode="cover" />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 32 }}>{tipoEmoji}</Text>
                  </View>
                )}
              </View>

              {/* Info */}
              <View style={{ flex: 1, justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF', textTransform: 'capitalize' }}>
                      {tipoEmoji} {reporte.animal?.tipo_animal || 'Animal'} {condicionEmoji}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                      {reporte.colonia || reporte.municipio || 'Sin ubicación'}
                    </Text>
                  </View>
                  <Feather
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color="#64748B"
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  {/* Badge estado */}
                  <View style={{ backgroundColor: estadoColor + '25', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, borderWidth: 1, borderColor: estadoColor + '50' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: estadoColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {FILTRO_LABELS[reporte.estado_reporte as Filtro] || reporte.estado_reporte}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#475569' }}>
                    {formatFecha(reporte.created_at)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Sección expandida */}
            {isExpanded && (
              <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', padding: 14, gap: 10 }}>
                {/* Foto grande */}
                {reporte.foto_url && (
                  <View style={{ borderRadius: 12, overflow: 'hidden', height: 160 }}>
                    <Image source={{ uri: reporte.foto_url }} style={{ width: '100%', height: 160 }} resizeMode="cover" />
                  </View>
                )}

                {/* Detalles */}
                <View style={{ gap: 8 }}>
                  {reporte.asociacion_nombre && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#3498DB25', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="business-outline" size={14} color="#3498DB" />
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Asociación asignada</Text>
                        <Text style={{ fontSize: 13, color: '#E2E8F0', fontWeight: '600' }}>{reporte.asociacion_nombre}</Text>
                      </View>
                    </View>
                  )}

                  {(reporte.calle || reporte.colonia || reporte.municipio) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#F39C1225', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="location-outline" size={14} color="#F39C12" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ubicación</Text>
                        <Text style={{ fontSize: 13, color: '#E2E8F0' }}>
                          {[reporte.calle, reporte.colonia, reporte.municipio].filter(Boolean).join(', ')}
                        </Text>
                      </View>
                    </View>
                  )}

                  {reporte.animal?.descripcion && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#9B59B625', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="document-text-outline" size={14} color="#9B59B6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Descripción</Text>
                        <Text style={{ fontSize: 13, color: '#94A3B8', lineHeight: 18 }}>{reporte.animal.descripcion}</Text>
                      </View>
                    </View>
                  )}

                  {reporte.animal && (
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {[
                        reporte.animal.sexo,
                        reporte.animal.edad_aproximada,
                        reporte.animal.tamanio,
                      ].filter(Boolean).map((dato, i) => (
                        <View key={i} style={{ backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                          <Text style={{ fontSize: 11, color: '#94A3B8', textTransform: 'capitalize' }}>{dato}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Piquito triangular */}
          <View style={{
            alignSelf: 'center',
            width: 0,
            height: 0,
            borderLeftWidth: 12,
            borderRightWidth: 12,
            borderTopWidth: 11,
            borderStyle: 'solid',
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: 'rgba(255,255,255,0.08)',
            marginTop: -1,
          }} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <LinearGradient
      colors={['#0F172A', '#1E293B', '#0F172A']}
      style={{ flex: 1 }}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Header */}
      <View style={{ paddingTop: 20, paddingHorizontal: 24, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 }}>
              Mis Reportes
            </Text>
            <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
              {user?.nombre} {user?.apellido_paterno}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {/* Badge con conteo */}
            <View style={{ backgroundColor: '#3498DB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                {reportes.length} {reportes.length === 1 ? 'reporte' : 'reportes'}
              </Text>
            </View>
            {onClose && (
              <TouchableOpacity onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="x" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#3498DB" />
          <Text style={{ color: '#64748B', marginTop: 12, fontSize: 14 }}>Cargando tus reportes...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Tira de días */}
          <View style={{ marginBottom: 16 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
            >
              {dias.map((dia, i) => {
                const fechaKey = format(dia, 'yyyy-MM-dd');
                const tieneReportes = diasConReportes.has(fechaKey);
                const isSelected = selectedDay ? isSameDay(dia, selectedDay) : false;
                const esHoy = isSameDay(dia, new Date());

                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setSelectedDay(isSelected ? null : dia)}
                    style={{
                      alignItems: 'center',
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 14,
                      backgroundColor: isSelected ? '#3498DB' : 'rgba(255,255,255,0.06)',
                      borderWidth: 1,
                      borderColor: isSelected ? '#3498DB' : esHoy ? 'rgba(52,152,219,0.4)' : 'rgba(255,255,255,0.08)',
                      minWidth: 48,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.8)' : '#64748B', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {format(dia, 'EEE', { locale: es })}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: isSelected ? '#FFFFFF' : esHoy ? '#3498DB' : '#E2E8F0', marginTop: 2 }}>
                      {format(dia, 'd')}
                    </Text>
                    {/* Puntito si tiene reportes */}
                    <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 4, backgroundColor: tieneReportes ? (isSelected ? '#FFFFFF' : getEstadoColor(reportes.find(r => isSameDay(new Date(r.created_at), dia))?.estado_reporte || 'pendiente')) : 'transparent' }} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Pills de filtro */}
          <View style={{ marginBottom: 20 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
            >
              {FILTROS.map((f) => {
                const isActive = filtro === f;
                const color = f === 'todos' ? '#3498DB' : ESTADO_COLORES[f] || '#64748B';
                return (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setFiltro(f)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 100,
                      backgroundColor: isActive ? color : 'rgba(255,255,255,0.06)',
                      borderWidth: 1,
                      borderColor: isActive ? color : 'rgba(255,255,255,0.10)',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: isActive ? '#FFFFFF' : '#64748B' }}>
                      {FILTRO_LABELS[f]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Lista de reportes */}
          <View style={{ paddingHorizontal: 24 }}>
            {reportesFiltrados.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>🐾</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#E2E8F0', marginBottom: 8 }}>
                  {selectedDay ? 'Sin reportes ese día' : 'Sin reportes aún'}
                </Text>
                <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center' }}>
                  {selectedDay
                    ? 'No hiciste ningún reporte ese día.'
                    : 'Cuando reportes un animal aparecerá aquí.'}
                </Text>
                {selectedDay && (
                  <TouchableOpacity onPress={() => setSelectedDay(null)} style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)' }}>
                    <Text style={{ color: '#3498DB', fontWeight: '600' }}>Ver todos los días</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              reportesFiltrados.map(renderCard)
            )}
          </View>

        </ScrollView>
      )}
    </LinearGradient>
  );
}