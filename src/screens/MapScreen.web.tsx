import { Feather, Ionicons } from '@expo/vector-icons';
import { ICON_CAT, ICON_CLOCK, ICON_CALENDAR, ICON_DOG, ICON_PAW, ICON_WARNING } from '../constants/mapIcons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import AuthGateModal from '../components/AuthGateModal';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { Reporte } from '../types/reporte';
import ReportFormScreen from './ReportFormScreen';

const LeafletMap = lazy(() => import('./LeafletMap'));

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  orange: '#EC802B', orangeDark: '#D4691A',
  teal: '#66BCB4', beige: '#E8CCAD',
  bg: '#FFFAF6', border: '#F0E8DC',
  dark: '#1A1A1A', mid: '#5C4A3A', light: '#9B8B7A',
};

const CONDICION: Record<string, { color: string; label: string; bg: string }> = {
  estable: { color: '#27AE60', label: 'Estable', bg: '#EAFAF1' },
  herido:  { color: '#F39C12', label: 'Herido',  bg: '#FEF9E7' },
  grave:   { color: '#E74C3C', label: 'Grave',   bg: '#FDEDEC' },
};

const ESTADO: Record<string, { color: string; label: string; bg: string }> = {
  pendiente:     { color: '#7B68EE', label: 'Pendiente',    bg: '#F0EEFF' },
  asignado:      { color: '#2980B9', label: 'Asignado',     bg: '#EBF5FB' },
  en_camino:     { color: '#16A085', label: 'En camino',    bg: '#E8F8F5' },
  en_atencion:   { color: '#8E44AD', label: 'En atención',  bg: '#F5EEF8' },
  cerrado:       { color: '#7F8C8D', label: 'Cerrado',      bg: '#F2F3F4' },
  sin_cobertura: { color: '#E67E22', label: 'Sin cobertura',bg: '#FEF9E7' },
};
const TAB_BAR_CLEARANCE = 18 + 68 + 12;

const getCfg = (map: Record<string, any>, key: string) =>
  map[key?.toLowerCase()] ?? { color: '#95A5A6', label: key ?? '', bg: '#F2F3F4' };

type SidebarView = 'list' | 'detail' | 'form';

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MapScreen() {
  const { isLoggedIn } = useAuth();
  const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
  const [isClient, setIsClient] = useState(false);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [selectedReport, setSelectedReport] = useState<Reporte | null>(null);
  const [sidebarView, setSidebarView] = useState<SidebarView>('list');
  const [filtro, setFiltro] = useState('todos');
  const [filtroEspecie, setFiltroEspecie] = useState('todos');
  const [ordenar, setOrdenar] = useState('reciente');
  const [isAuthGateVisible, setIsAuthGateVisible] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  // Bottom sheet para mobile web
  const sheetY = useRef(new Animated.Value(300)).current;
  const [showClockLabel, setShowClockLabel] = useState(false);
  const clockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile = windowWidth < 768;

  // useCallback evita que fetchReportes cambie en cada render
  const fetchReportes = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/reports`);
      setReportes(res.data.filter((r: Reporte) => r.latitud && r.longitud));
      setLastUpdated(new Date());
    } catch {}
  }, []);

    const handleClockPress = () => {
    if (!isMobile) return;
    setShowClockLabel(true);

    // Si ya había un timer corriendo (toques repetidos), lo cancelamos
    // para que siempre sean 7 segundos completos desde el ÚLTIMO toque.
    if (clockTimeoutRef.current) clearTimeout(clockTimeoutRef.current);
    clockTimeoutRef.current = setTimeout(() => {
      setShowClockLabel(false);
    }, 7000);
  };

  useEffect(() => {
  setIsClient(true);
  fetchReportes();
  const fetchInterval = setInterval(fetchReportes, 600000);
  const tickInterval = setInterval(() => setTick(t => t + 1), 60000);
  return () => {
    clearInterval(fetchInterval);
    clearInterval(tickInterval);
    if (clockTimeoutRef.current) clearTimeout(clockTimeoutRef.current);
  };
}, [fetchReportes]);


  // Carga inicial e intervalos
  useEffect(() => {
    setIsClient(true);
    fetchReportes();
    const fetchInterval = setInterval(fetchReportes, 600000);
    const tickInterval = setInterval(() => setTick(t => t + 1), 60000);
    return () => { clearInterval(fetchInterval); clearInterval(tickInterval); };
  }, [fetchReportes]);

  // Listener de dimensiones separado para evitar re-renders en cascada
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setWindowWidth(window.width);
    });
    return () => sub.remove();
  }, []);

  const showSheet = () =>
    Animated.spring(sheetY, { toValue: 0, useNativeDriver: false, damping: 18, stiffness: 200 }).start();

  const hideSheet = () =>
    Animated.timing(sheetY, { toValue: 300, duration: 200, useNativeDriver: false }).start(() => setSelectedReport(null));

  const handleSelectReport = useCallback((r: Reporte) => {
    setSelectedReport(r);
    if (isMobile) {
      showSheet();
    } else {
      setSidebarView('detail');
    }
  }, [isMobile]);

  const handleMapClick = useCallback(() => {
    if (selectedReport) {
      if (isMobile) hideSheet();
      else { setSelectedReport(null); setSidebarView('list'); }
    }
  }, [selectedReport, isMobile]);

  const handleCrearReporte = () => {
    if (isLoggedIn) {
      if (isMobile) {
        // En mobile web abrimos en modal (como native)
        setSidebarView('form');
      } else {
        setSidebarView('form');
      }
    } else {
      setIsAuthGateVisible(true);
    }
  };

  const URGENCIA: Record<string, number> = { grave: 0, herido: 1, estable: 2 };

  const reportesFiltrados = reportes
    .filter(r => {
      if (r.estado_reporte === 'cerrado') return false;
      if (filtro !== 'todos' && r.animal?.condicion?.toLowerCase() !== filtro) return false;
      if (filtroEspecie !== 'todos' && r.animal?.tipo_animal?.toLowerCase() !== filtroEspecie) return false;
      return true;
    })
    .sort((a, b) => {
      if (ordenar === 'reciente') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (ordenar === 'antiguo')  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (ordenar === 'urgente') {
        const ua = URGENCIA[a.animal?.condicion?.toLowerCase() ?? ''] ?? 3;
        const ub = URGENCIA[b.animal?.condicion?.toLowerCase() ?? ''] ?? 3;
        return ua - ub;
      }
      return 0;
    });

  // ── Tarjeta de reporte en lista ──────────────────────────────────────────────
  const ReportCard = ({ reporte, compact = false }: { reporte: Reporte; compact?: boolean }) => {
    const condCfg = getCfg(CONDICION, reporte.animal?.condicion ?? '');
    const estCfg  = getCfg(ESTADO, reporte.estado_reporte ?? '');
    const isSelected = selectedReport?.id === reporte.id;
    const tipoLabel = reporte.animal?.tipo_animal
      ? reporte.animal.tipo_animal[0].toUpperCase() + reporte.animal.tipo_animal.slice(1)
      : 'Animal';
    const tamanio = reporte.animal?.tamanio
      ? reporte.animal.tamanio[0].toUpperCase() + reporte.animal.tamanio.slice(1)
      : '';

    return (
      <TouchableOpacity
        onPress={() => handleSelectReport(reporte)}
        style={{
          flexDirection: 'row', gap: compact ? 8 : 10,
          padding: compact ? 8 : 10,
          borderRadius: 14, borderWidth: 1.5,
          borderColor: isSelected ? C.orange : C.border,
          backgroundColor: isSelected ? '#FFF5EE' : '#FFFFFF',
          shadowColor: isSelected ? C.orange : '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isSelected ? 0.15 : 0.04,
          shadowRadius: isSelected ? 8 : 3,
        }}
      >
        <View style={{ width: compact ? 44 : 52, height: compact ? 44 : 52, borderRadius: 10, backgroundColor: condCfg.bg, overflow: 'hidden', flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
          {reporte.foto_url
            ? <Image source={{ uri: reporte.foto_url }} style={{ width: compact ? 44 : 52, height: compact ? 44 : 52 }} resizeMode="cover" />
            : <Ionicons name="paw" size={compact ? 18 : 22} color={condCfg.color} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: compact ? 12 : 13, fontWeight: '800', color: C.dark, marginBottom: 2 }}>
            {tipoLabel}{tamanio ? ` · ${tamanio}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 }}>
            <Ionicons name="location-sharp" size={9} color={C.light} />
            <Text style={{ fontSize: 9, color: C.light }}>
              {reporte.colonia ?? reporte.municipio ?? 'Sin ubicación'} · {formatDistanceToNow(new Date(reporte.created_at), { addSuffix: true, locale: es })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <View style={{ backgroundColor: condCfg.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ fontSize: 8, fontWeight: '800', color: condCfg.color, textTransform: 'uppercase', letterSpacing: 0.3 }}>{condCfg.label}</Text>
            </View>
            <View style={{ backgroundColor: estCfg.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ fontSize: 8, fontWeight: '700', color: estCfg.color, textTransform: 'uppercase', letterSpacing: 0.3 }}>{estCfg.label}</Text>
            </View>
          </View>
        </View>
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: condCfg.color, marginTop: 3, flexShrink: 0 }} />
      </TouchableOpacity>
    );
  };

  // ── Detalle en sidebar ───────────────────────────────────────────────────────
  const renderDetail = () => {
    if (!selectedReport) return null;
    const r = selectedReport;
    const condCfg = getCfg(CONDICION, r.animal?.condicion ?? '');
    const estCfg  = getCfg(ESTADO, r.estado_reporte ?? '');
    const tipoLabel = r.animal?.tipo_animal
      ? r.animal.tipo_animal[0].toUpperCase() + r.animal.tipo_animal.slice(1)
      : 'Animal';

    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ borderRadius: 14, overflow: 'hidden', height: 150, backgroundColor: condCfg.bg, marginBottom: 14 }}>
          {r.foto_url
            ? <Image source={{ uri: r.foto_url }} style={{ width: '100%', height: 150 }} resizeMode="cover" />
            : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="paw" size={48} color={condCfg.color} /></View>}
          <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: condCfg.color, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF', textTransform: 'uppercase' }}>{condCfg.label}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 20, fontWeight: '900', color: C.dark, marginBottom: 4 }}>
          {tipoLabel}{r.animal?.tamanio ? ` · ${r.animal.tamanio[0].toUpperCase() + r.animal.tamanio.slice(1)}` : ''}
        </Text>

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
          <View style={{ backgroundColor: estCfg.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: estCfg.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>{estCfg.label}</Text>
          </View>
        </View>

        {[
          { icon: 'time-outline', text: formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: es }) },
          { icon: 'location-outline', text: [r.calle, r.colonia, r.municipio].filter(Boolean).join(', ') || 'Ubicación aproximada' },
          r.animal?.sexo ? { icon: 'information-circle-outline', text: `Sexo: ${r.animal.sexo}` } : null,
          r.animal?.edad_aproximada ? { icon: 'calendar-outline', text: `Edad: ${r.animal.edad_aproximada}` } : null,
          r.animal?.descripcion ? { icon: 'document-text-outline', text: r.animal.descripcion } : null,
        ].filter(Boolean).map((row: any, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
            <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ionicons name={row.icon} size={13} color={C.mid} />
            </View>
            <Text style={{ fontSize: 12, color: C.mid, flex: 1, lineHeight: 18, paddingTop: 4 }}>{row.text}</Text>
          </View>
        ))}

        <View style={{ backgroundColor: '#FFF5EE', borderRadius: 10, padding: 10, marginTop: 4 }}>
          <Text style={{ fontSize: 10, color: C.orange, fontStyle: 'italic' }}>📍 Ubicación exacta protegida por privacidad</Text>
        </View>
      </ScrollView>
    );
  };

  // ── Sidebar header ───────────────────────────────────────────────────────────
  const renderSidebarHeader = () => (
    <View style={{ backgroundColor: C.orange, paddingTop: 20, paddingBottom: 14, paddingHorizontal: 18 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: -0.5 }}>PawAlert</Text>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>
              {reportesFiltrados.length} {reportesFiltrados.length === 1 ? 'reporte activo' : 'reportes activos'}
            </Text>
          </View>
        </View>
        {(sidebarView !== 'list') && (
          <TouchableOpacity onPress={() => { setSidebarView('list'); setSelectedReport(null); }} style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: 6 }}>
            <Feather name="arrow-left" size={16} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
        {sidebarView === 'list' ? 'Mapa de rescate · Puebla' : sidebarView === 'detail' ? 'Detalle del reporte' : 'Nuevo reporte'}
      </Text>
    </View>
  );

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const renderFiltros = () => (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, flexShrink: 0 }}>
      {/* Fila 1: condición */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, alignItems: 'center' }}>
        {['todos', 'estable', 'herido', 'grave'].map(f => {
          const isActive = filtro === f;
          const cfg = f !== 'todos' ? getCfg(CONDICION, f) : null;
          const activeColor = cfg?.color ?? C.orange;
          return (
            <TouchableOpacity key={f} onPress={() => setFiltro(f)}
              style={{ paddingHorizontal: 11, paddingVertical: 4, borderRadius: 20, borderWidth: 1.5,
                backgroundColor: isActive ? activeColor : 'transparent', borderColor: activeColor,
                height: 28, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? '#FFF' : activeColor, lineHeight: 13 }}>
                {f === 'todos' ? 'Todos' : cfg?.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {/* Fila 2: especie + orden */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10, alignItems: 'center' }}>
        {[
          { key: 'todos', icon: ICON_PAW,  label: 'Todos'  },
          { key: 'perro', icon: ICON_DOG,  label: 'Perros' },
          { key: 'gato',  icon: ICON_CAT,  label: 'Gatos'  },
        ].map(({ key, icon, label }) => (
          <TouchableOpacity key={key} onPress={() => setFiltroEspecie(key)}
            style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1.5,
              borderColor: C.teal, height: 26, alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', gap: 4,
              backgroundColor: filtroEspecie === key ? C.teal : 'transparent' }}>
            <Image source={{ uri: icon }} style={{ width: 13, height: 13, tintColor: filtroEspecie === key ? '#FFF' : C.teal }} />
            <Text style={{ fontSize: 9, fontWeight: '700', color: filtroEspecie === key ? '#FFF' : C.teal }}>{label}</Text>
          </TouchableOpacity>
        ))}
        <View style={{ width: 1, height: 16, backgroundColor: C.border, marginHorizontal: 2 }} />
        {[
          { key: 'reciente', icon: ICON_CLOCK,    label: 'Reciente' },
          { key: 'urgente',  icon: ICON_WARNING,  label: 'Urgente'  },
          { key: 'antiguo',  icon: ICON_CALENDAR, label: 'Antiguo'  },
        ].map(({ key, icon, label }) => (
          <TouchableOpacity key={key} onPress={() => setOrdenar(key)}
            style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1.5,
              borderColor: '#B0A090', height: 26, alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', gap: 4,
              backgroundColor: ordenar === key ? '#B0A090' : 'transparent' }}>
            <Image source={{ uri: icon }} style={{ width: 13, height: 13, tintColor: ordenar === key ? '#FFF' : '#B0A090' }} />
            <Text style={{ fontSize: 9, fontWeight: '700', color: ordenar === key ? '#FFF' : '#B0A090' }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // ── Mapa ─────────────────────────────────────────────────────────────────────
  const renderMap = () => (
    <View style={{ flex: 1, position: 'relative' }}>
      {isClient ? (
        <Suspense fallback={<View style={{ flex: 1, backgroundColor: '#EAE0D0' }} />}>
          <LeafletMap
            reportes={reportesFiltrados}
            selectedReportId={selectedReport?.id ?? null}
            onSelectReport={handleSelectReport}
            onMapClick={handleMapClick}
          />
        </Suspense>
      ) : (
        <View style={{ flex: 1, backgroundColor: '#EAE0D0' }} />
      )}

      {/* Leyenda */}
      <View style={{ position: 'absolute', top: 16, right: 16, backgroundColor: '#FFF', borderRadius: 12, padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, zIndex: 999, elevation: 9 }}>
        <Text style={{ fontSize: 9, fontWeight: '800', color: C.dark, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Condición</Text>
        {Object.entries(CONDICION).map(([key, cfg]) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: cfg.color }} />
            <Text style={{ fontSize: 9, color: C.mid, fontWeight: '600' }}>{cfg.label}</Text>
          </View>
        ))}
      </View>

    {/* Clock */}
    {lastUpdated && (
      <TouchableOpacity
        onPress={handleClockPress}
        activeOpacity={isMobile ? 0.7 : 1}
        style={{
          position: 'absolute', bottom: TAB_BAR_CLEARANCE, left: 16,
          backgroundColor: isMobile ? 'rgba(30,20,10,0.35)' : 'rgba(30,20,10,0.6)',
          borderRadius: 20,
          paddingVertical: 6,
          paddingHorizontal: isMobile && !showClockLabel ? 8 : 12,
          flexDirection: 'row', alignItems: 'center', gap: 6,
          zIndex: 999, elevation: 9,
        }}
      >
        <Ionicons name="time-outline" size={13} color="#FFF" />
        {(!isMobile || showClockLabel) && (
          <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '600' }}>
            {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: es })}
          </Text>
        )}
      </TouchableOpacity>
    )}

      {/* FAB */}
      <TouchableOpacity
        onPress={handleCrearReporte}
        style={{ position: 'absolute', bottom: TAB_BAR_CLEARANCE, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, zIndex: 1000, elevation: 10 }}
      >
        <Ionicons name="add" size={26} color="#FFF" />
      </TouchableOpacity>

      {/* Barra de filtros interactivos (solo mobile) */}
      {isMobile && (
        <View style={{
          position: 'absolute', top: 14, left: 12, right: 12,
          backgroundColor: 'rgba(255,255,255,0.97)',
          borderRadius: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08, shadowRadius: 8,
          overflow: 'hidden',
          zIndex: 1200,
          elevation: 12,
        }}>
          {/* Fila 1: condición */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F0E8DC' }}>
            {[
              { key: 'todos',   label: 'Todos',   color: C.orange },
              { key: 'estable', label: 'Estable', color: '#27AE60' },
              { key: 'herido',  label: 'Herido',  color: '#F39C12' },
              { key: 'grave',   label: 'Grave',   color: '#E74C3C' },
            ].map(({ key, label, color }, idx, arr) => {
              const isActive = filtro === key;
              // Contar desde el total (respetando especie) sin aplicar filtro de condición activo
              const base = reportes.filter(r => {
                if (r.estado_reporte === 'cerrado') return false;
                if (filtroEspecie !== 'todos' && r.animal?.tipo_animal?.toLowerCase() !== filtroEspecie) return false;
                return true;
              });
              const count = key === 'todos'
                ? base.length
                : base.filter(r => r.animal?.condicion?.toLowerCase() === key).length;
              return (
                <TouchableOpacity key={key} onPress={() => setFiltro(key)}
                  style={{ flex: 1, paddingVertical: 8, alignItems: 'center',
                    backgroundColor: isActive ? color : 'transparent',
                    borderRightWidth: idx < arr.length - 1 ? 1 : 0, borderRightColor: '#F0E8DC' }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: isActive ? '#FFF' : color, lineHeight: 12 }}>{label}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: isActive ? 'rgba(255,255,255,0.9)' : C.dark, marginTop: 1 }}>{count}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Fila 2: especie + orden */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 7, gap: 6 }}>
            {[
              { key: 'todos', icon: ICON_PAW, label: 'Todos'  },
              { key: 'perro', icon: ICON_DOG, label: 'Perros' },
              { key: 'gato',  icon: ICON_CAT, label: 'Gatos'  },
            ].map(({ key, icon, label }) => (
              <TouchableOpacity key={key} onPress={() => setFiltroEspecie(key)}
                style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1.5,
                  borderColor: C.teal, backgroundColor: filtroEspecie === key ? C.teal : 'transparent',
                  flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Image source={{ uri: icon }} style={{ width: 14, height: 14, tintColor: filtroEspecie === key ? '#FFF' : C.teal }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: filtroEspecie === key ? '#FFF' : C.teal }}>{label}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ flex: 1 }} />
            {[
              { key: 'reciente', icon: ICON_CLOCK    },
              { key: 'urgente',  icon: ICON_WARNING  },
              { key: 'antiguo',  icon: ICON_CALENDAR },
            ].map(({ key, icon }) => (
              <TouchableOpacity key={key} onPress={() => setOrdenar(key)}
                style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5,
                  borderColor: '#B0A090', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: ordenar === key ? '#B0A090' : 'transparent' }}>
                <Image source={{ uri: icon }} style={{ width: 16, height: 16, tintColor: ordenar === key ? '#FFF' : '#B0A090' }} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  // ─── Bottom sheet para mobile web ─────────────────────────────────────────
  const renderMobileBottomSheet = () => {
    if (!selectedReport) return null;
    const r = selectedReport;
    const condCfg = getCfg(CONDICION, r.animal?.condicion ?? '');
    const estCfg  = getCfg(ESTADO, r.estado_reporte ?? '');
    const tipoLabel = r.animal?.tipo_animal
      ? r.animal.tipo_animal[0].toUpperCase() + r.animal.tipo_animal.slice(1)
      : 'Animal';

    return (
      <Animated.View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        transform: [{ translateY: sheetY }],
        backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16,
        zIndex: 1100, elevation: 16,
        paddingBottom: 28,
      }}>
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#E0D5C8' }} />
        </View>
        <TouchableOpacity onPress={hideSheet} style={{ position: 'absolute', top: 12, right: 16 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#F5F0E8', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="x" size={14} color={C.mid} />
          </View>
        </TouchableOpacity>
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: condCfg.bg, flexShrink: 0 }}>
              {r.foto_url
                ? <Image source={{ uri: r.foto_url }} style={{ width: 72, height: 72 }} resizeMode="cover" />
                : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="paw" size={28} color={condCfg.color} /></View>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: C.dark, marginBottom: 4 }}>
                {tipoLabel}{r.animal?.tamanio ? ` · ${r.animal.tamanio[0].toUpperCase() + r.animal.tamanio.slice(1)}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 }}>
                <Ionicons name="location-sharp" size={10} color={C.light} />
                <Text style={{ fontSize: 10, color: C.light }}>
                  {r.colonia ?? r.municipio ?? 'Sin ubicación'} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: es })}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                <View style={{ backgroundColor: condCfg.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: condCfg.color, textTransform: 'uppercase' }}>{condCfg.label}</Text>
                </View>
                <View style={{ backgroundColor: estCfg.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: estCfg.color, textTransform: 'uppercase' }}>{estCfg.label}</Text>
                </View>
              </View>
            </View>
          </View>
          {/* Detalles adicionales */}
          {(r.animal?.sexo || r.animal?.edad_aproximada || r.animal?.descripcion) && (
            <View style={{ marginTop: 12, gap: 7 }}>
              {r.animal?.sexo && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="information-circle-outline" size={13} color={C.mid} />
                  </View>
                  <Text style={{ fontSize: 12, color: C.mid }}>Sexo: {r.animal.sexo}</Text>
                </View>
              )}
              {r.animal?.edad_aproximada && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="calendar-outline" size={13} color={C.mid} />
                  </View>
                  <Text style={{ fontSize: 12, color: C.mid }}>Edad: {r.animal.edad_aproximada}</Text>
                </View>
              )}
              {r.animal?.descripcion && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="document-text-outline" size={13} color={C.mid} />
                  </View>
                  <Text style={{ fontSize: 12, color: C.mid, flex: 1, lineHeight: 18, paddingTop: 3 }}>{r.animal.descripcion}</Text>
                </View>
              )}
            </View>
          )}
          <View style={{ backgroundColor: '#FFF5EE', borderRadius: 10, padding: 8, marginTop: 12 }}>
            <Text style={{ fontSize: 10, color: C.orange, fontStyle: 'italic' }}>📍 Ubicación exacta protegida por privacidad</Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  // ─── Modal de formulario (mobile web) ────────────────────────────────────────
  const renderFormModal = () => (
    sidebarView === 'form' && isMobile ? (
      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999 } as any}>
        <View style={{ flex: 1, margin: 16, marginTop: 60, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
          <ReportFormScreen onClose={() => { setSidebarView('list'); setTimeout(fetchReportes, 400); }} />
        </View>
      </View>
    ) : null
  );

  // ─── LAYOUT MOBILE WEB ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <View style={{ flex: 1 }}>
        {renderMap()}
        {renderMobileBottomSheet()}
        {renderFormModal()}
        <AuthGateModal visible={isAuthGateVisible} onClose={() => setIsAuthGateVisible(false)} onGuest={() => setSidebarView('form')} />
      </View>
    );
  }

  // ─── LAYOUT DESKTOP ───────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>

      {/* Sidebar */}
      <View style={{ width: 340, flexShrink: 0, flexDirection: 'column', backgroundColor: C.bg, borderRightWidth: 1, borderRightColor: C.border, display: 'flex' as any }}>
        {renderSidebarHeader()}

        <View style={{ flex: 1, overflow: 'hidden' as any }}>
          {sidebarView === 'list' && (
            <View style={{ flex: 1 }}>
              {renderFiltros()}
              <ScrollView contentContainerStyle={{ padding: 10, gap: 8 }} showsVerticalScrollIndicator={false}>
                {reportesFiltrados.length === 0
                  ? <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <Text style={{ fontSize: 32, marginBottom: 10 }}>🐾</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.dark }}>Sin reportes activos</Text>
                    </View>
                  : reportesFiltrados.map(r => <ReportCard key={r.id} reporte={r} />)
                }
              </ScrollView>
            </View>
          )}
          {sidebarView === 'detail' && renderDetail()}
          {sidebarView === 'form' && (
            <ReportFormScreen onClose={() => { setSidebarView('list'); setTimeout(fetchReportes, 400); }} />
          )}
        </View>
      </View>

      {/* Mapa */}
      {renderMap()}

      <AuthGateModal visible={isAuthGateVisible} onClose={() => setIsAuthGateVisible(false)} onGuest={() => setSidebarView('form')} />
    </View>
  );
}