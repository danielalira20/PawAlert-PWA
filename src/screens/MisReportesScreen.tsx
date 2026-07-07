import { Feather, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { isSameDay, format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_URL } from '../constants/api';
import { petzen } from '../constants/petzenTheme';
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
  asignado: petzen.colors.teal,
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
          {/* Card principal */}
          <View style={{
            backgroundColor: petzen.colors.white,
            borderWidth: 1,
            borderColor: '#EFEAE2',
            borderRadius: 18,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 2,
          }}>
            {/* Barra de color del estado arriba */}
            <View style={{ height: 3, backgroundColor: estadoColor }} />

            <View style={{ flexDirection: 'row', padding: 14, gap: 12 }}>
              {/* Foto */}
              <View style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: petzen.colors.peach + '40' }}>
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
                    <Text style={{ fontSize: 16, fontFamily: petzen.fonts.bold, color: petzen.colors.textDark, textTransform: 'capitalize' }}>
                      {tipoEmoji} {reporte.animal?.tipo_animal || 'Animal'} {condicionEmoji}
                    </Text>
                    <Text style={{ fontSize: 12, color: petzen.colors.textSecondary, marginTop: 2 }}>
                      {reporte.colonia || reporte.municipio || 'Sin ubicación'}
                    </Text>
                  </View>
                  <Feather
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={petzen.colors.textSecondary}
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  {/* Badge estado */}
                  <View style={{ backgroundColor: estadoColor + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, borderWidth: 1, borderColor: estadoColor + '50' }}>
                    <Text style={{ fontSize: 10, fontFamily: petzen.fonts.bold, color: estadoColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {FILTRO_LABELS[reporte.estado_reporte as Filtro] || reporte.estado_reporte}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: petzen.colors.textSecondary }}>
                    {formatFecha(reporte.created_at)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Sección expandida */}
            {isExpanded && (
              <View style={{ borderTopWidth: 1, borderTopColor: '#F0EBE3', padding: 14, gap: 10 }}>
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
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: petzen.colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="business-outline" size={14} color={petzen.colors.tealDark} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, color: petzen.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Asociación asignada</Text>
                        <Text style={{ fontSize: 13, color: petzen.colors.textDark, fontWeight: '600' }}>{reporte.asociacion_nombre}</Text>
                      </View>
                    </View>
                  )}

                  {(reporte.calle || reporte.colonia || reporte.municipio) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#F39C1220', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="location-outline" size={14} color="#D68910" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, color: petzen.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ubicación</Text>
                        <Text style={{ fontSize: 13, color: petzen.colors.textDark }}>
                          {[reporte.calle, reporte.colonia, reporte.municipio].filter(Boolean).join(', ')}
                        </Text>
                      </View>
                    </View>
                  )}

                  {reporte.animal?.descripcion && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#9B59B620', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="document-text-outline" size={14} color="#9B59B6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, color: petzen.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Descripción</Text>
                        <Text style={{ fontSize: 13, color: petzen.colors.textSecondary, lineHeight: 18 }}>{reporte.animal.descripcion}</Text>
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
                        <View key={i} style={{ backgroundColor: petzen.colors.peach + '40', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                          <Text style={{ fontSize: 11, color: petzen.colors.textDark, textTransform: 'capitalize' }}>{dato}</Text>
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
            borderTopColor: petzen.colors.white,
            marginTop: -1,
          }} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: petzen.colors.background }}>
      {/* Header curvo */}
      <LinearGradient
        colors={[petzen.colors.teal, petzen.colors.tealDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: 28,
          paddingHorizontal: 24,
          paddingBottom: 40,
          borderBottomLeftRadius: petzen.radii.headerCurve,
          borderBottomRightRadius: petzen.radii.headerCurve,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Ionicons name="paw" size={22} color="#FFFFFF" />
            </View>
            <View>
              <Text style={{ fontSize: 22, fontFamily: petzen.fonts.extraBold, color: '#FFFFFF', letterSpacing: -0.5 }}>
                Mis Reportes
              </Text>
              <Text style={{ fontSize: 13, fontFamily: petzen.fonts.medium, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                {user?.nombre} {user?.apellido_paterno}
              </Text>
            </View>
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="x" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
        {/* Badge con conteo */}
        <View style={{ alignSelf: 'flex-start', backgroundColor: petzen.colors.orange, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, marginTop: 16 }}>
          <Text style={{ fontSize: 13, fontFamily: petzen.fonts.bold, color: '#FFFFFF' }}>
            {reportes.length} {reportes.length === 1 ? 'reporte' : 'reportes'}
          </Text>
        </View>
      </LinearGradient>

      <View style={{ flex: 1, marginTop: -28, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: petzen.colors.background }}>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={petzen.colors.orange} />
            <Text style={{ color: petzen.colors.textSecondary, marginTop: 12, fontSize: 14 }}>Cargando tus reportes...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

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
                        backgroundColor: isSelected ? petzen.colors.teal : petzen.colors.white,
                        borderWidth: 1,
                        borderColor: isSelected ? petzen.colors.teal : esHoy ? petzen.colors.teal : '#EFEAE2',
                        minWidth: 48,
                      }}
                    >
                      <Text style={{ fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.85)' : petzen.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {format(dia, 'EEE', { locale: es })}
                      </Text>
                      <Text style={{ fontSize: 16, fontFamily: petzen.fonts.extraBold, color: isSelected ? '#FFFFFF' : esHoy ? petzen.colors.tealDark : petzen.colors.textDark, marginTop: 2 }}>
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
                  const color = f === 'todos' ? petzen.colors.orange : ESTADO_COLORES[f] || petzen.colors.textSecondary;
                  return (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setFiltro(f)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 100,
                        backgroundColor: isActive ? color : petzen.colors.white,
                        borderWidth: 1,
                        borderColor: isActive ? color : '#EFEAE2',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: petzen.fonts.semiBold, color: isActive ? '#FFFFFF' : petzen.colors.textSecondary }}>
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
                  <Text style={{ fontSize: 18, fontFamily: petzen.fonts.bold, color: petzen.colors.textDark, marginBottom: 8 }}>
                    {selectedDay ? 'Sin reportes ese día' : 'Sin reportes aún'}
                  </Text>
                  <Text style={{ fontSize: 14, color: petzen.colors.textSecondary, textAlign: 'center' }}>
                    {selectedDay
                      ? 'No hiciste ningún reporte ese día.'
                      : 'Cuando reportes un animal aparecerá aquí.'}
                  </Text>
                  {selectedDay && (
                    <TouchableOpacity onPress={() => setSelectedDay(null)} style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 100, backgroundColor: petzen.colors.peach + '40' }}>
                      <Text style={{ color: petzen.colors.orangeDark, fontFamily: petzen.fonts.semiBold }}>Ver todos los días</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                reportesFiltrados.map(renderCard)
              )}
            </View>

          </ScrollView>
        )}
      </View>
    </View>
  );
}