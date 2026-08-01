import { Feather, Ionicons } from '@expo/vector-icons';
import { ICON_CAT, ICON_CLOCK, ICON_CALENDAR, ICON_DOG, ICON_PAW, ICON_WARNING } from '../constants/mapIcons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Image, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AuthGateModal from '../components/AuthGateModal';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { Reporte, getAnimales, condicionMasGrave, especieMasGrave, totalAnimales, animalMasGrave } from '../types/reporte';
import { AnimalCarousel } from '../components/common/AnimalCarousel';
import ReportFormScreen from './ReportFormScreen';
import type { AsociacionMapa } from './LeafletMap';
import { ReportContentMenu } from '../components/reports/ReportContentMenu';

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

type SidebarView = 'list' | 'detail' | 'form' | 'asociacion';

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MapScreen() {
  const { isLoggedIn } = useAuth();
  const params = useLocalSearchParams<{ action?: string }>();
  const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
  const [isClient, setIsClient] = useState(false);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [asociaciones, setAsociaciones] = useState<AsociacionMapa[]>([]);
  const [mostrarAsociaciones, setMostrarAsociaciones] = useState(false);
  const [aliados, setAliados] = useState<any[]>([]);
  const [mostrarAliados, setMostrarAliados] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Reporte | null>(null);
  const [highlightedReportId, setHighlightedReportId] = useState<string | null>(null);
  const [selectedAsociacion, setSelectedAsociacion] = useState<AsociacionMapa | null>(null);
  const [sidebarView, setSidebarView] = useState<SidebarView>('list');
  const [filtro, setFiltro] = useState('todos');
  const [filtroEspecie, setFiltroEspecie] = useState('todos');
  const [ordenar, setOrdenar] = useState('reciente');
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [isAuthGateVisible, setIsAuthGateVisible] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  // Imagen ampliada (modal con soporte de carrusel) — DEBE vivir dentro del componente
  const [imagenAmpliada, setImagenAmpliada] = useState<{ fotos: string[]; index: number } | null>(null);

  // Bottom sheet para mobile web
  const sheetY = useRef(new Animated.Value(300)).current;
  const reportCardRefs = useRef<Record<string, any>>({});
  const [showClockLabel, setShowClockLabel] = useState(false);

  // Animación del flotante de filtros (entra/sale suave, no de golpe)
  const filtersAnim = useRef(new Animated.Value(0)).current;
  const [filtersMounted, setFiltersMounted] = useState(false);
  useEffect(() => {
    if (showFiltersModal) {
      setFiltersMounted(true);
      Animated.spring(filtersAnim, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 220 }).start();
    } else {
      Animated.timing(filtersAnim, { toValue: 0, duration: 140, useNativeDriver: true })
        .start(() => setFiltersMounted(false));
    }
  }, [showFiltersModal]);
  const clockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile = windowWidth < 768;

  //para actualizar el animal reporte
  const [fotoIndexPorReporte, setFotoIndexPorReporte] = useState<Record<string, number>>({});
  
  // useCallback evita que fetchReportes cambie en cada render
  const fetchReportes = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/reports`);
      setReportes(res.data.filter((r: Reporte) => r.latitud && r.longitud));
      setLastUpdated(new Date());
    } catch {}
  }, []);

  const fetchAsociaciones = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/associations`);
      setAsociaciones(res.data.filter((a: AsociacionMapa) => a.latitud && a.longitud));
    } catch {}
  }, []);

  const fetchAliados = useCallback(async () => {
  try {
    const res = await axios.get(`${API_URL}/red-aliados/directorio`);
    setAliados(res.data.filter((a: any) => a.latitud && a.longitud));
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

  // Carga inicial e intervalos
  useEffect(() => {
    setIsClient(true);
    fetchReportes();
    fetchAsociaciones();
    fetchAliados();
    const fetchInterval = setInterval(fetchReportes, 600000);
    const tickInterval = setInterval(() => setTick(t => t + 1), 60000);
    return () => {
      clearInterval(fetchInterval);
      clearInterval(tickInterval);
      if (clockTimeoutRef.current) clearTimeout(clockTimeoutRef.current);
    };
  }, [fetchReportes, fetchAsociaciones, fetchAliados]);
  

  // Handle action parameter (e.g. action=create from landing CTA)
  useEffect(() => {
    if (params.action === 'create') {
      handleCrearReporte();
      router.setParams({ action: undefined });
    }
  }, [params.action]);

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
    setHighlightedReportId(r.id);
    setSelectedReport(r);
    if (isMobile) {
      showSheet();
    } else {
      setSidebarView('detail');
    }
  }, [isMobile]);

  const handleSelectAsociacion = useCallback((a: AsociacionMapa) => {
    setSelectedAsociacion(a);
    if (!isMobile) {
      setSidebarView('asociacion');
    }
  }, [isMobile]);

  // Preparado para carrusel: si el backend manda el arreglo completo (reporte.fotos)
  // se usa completo; si no, cae a la única foto_url que ya tenían.
  const abrirImagenAmpliada = (reporte: Reporte) => {
    const fotos = reporte.fotos?.length ? reporte.fotos : ([reporte.foto_url].filter(Boolean) as string[]);
    if (fotos.length === 0) return;
    setImagenAmpliada({ fotos, index: 0 });
  };

  const handleMapClick = useCallback(() => {
    setHighlightedReportId(null);
    if (selectedReport) {
      if (isMobile) hideSheet();
      else { setSelectedReport(null); setSidebarView('list'); }
    }
  }, [selectedReport, isMobile]);

  useEffect(() => {
    if (!highlightedReportId || isMobile || sidebarView !== 'list') return;

    const frame = requestAnimationFrame(() => {
      reportCardRefs.current[highlightedReportId]
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    });

    return () => cancelAnimationFrame(frame);
  }, [highlightedReportId, isMobile, sidebarView]);

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
      const animales = getAnimales(r);
      // Un caso matchea el filtro si CUALQUIERA de sus animales coincide,
      // no solo el legado — ej. filtrar "gato" debe mostrar un caso
      // perro+gato aunque el legado (más grave) sea el perro.
      if (filtro !== 'todos' && !animales.some(a => a.condicion?.toLowerCase() === filtro)) return false;
      if (filtroEspecie !== 'todos' && !animales.some(a => a.tipo_animal?.toLowerCase() === filtroEspecie)) return false;
      return true;
    })
    .sort((a, b) => {
      if (ordenar === 'reciente') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (ordenar === 'antiguo')  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (ordenar === 'urgente') {
        const ua = URGENCIA[condicionMasGrave(getAnimales(a))?.toLowerCase() ?? ''] ?? 3;
        const ub = URGENCIA[condicionMasGrave(getAnimales(b))?.toLowerCase() ?? ''] ?? 3;
        return ua - ub;
      }
      return 0;
    });

  // ── Tarjeta de reporte en lista ──────────────────────────────────────────────
  const ReportCard = ({ reporte, compact = false }: { reporte: Reporte; compact?: boolean }) => {
    const animales = getAnimales(reporte);
    const total = totalAnimales(animales);
    const condicionValor = condicionMasGrave(animales) ?? '';
    const condCfg = getCfg(CONDICION, condicionValor);
    const estCfg  = getCfg(ESTADO, reporte.estado_reporte ?? '');
    const isSelected = highlightedReportId === reporte.id || selectedReport?.id === reporte.id;
    const especie = especieMasGrave(animales);
    const tipoLabel = especie
      ? especie[0].toUpperCase() + especie.slice(1)
      : 'Animal';
    const tamanio = animales[0]?.tamanio
      ? animales[0].tamanio![0].toUpperCase() + animales[0].tamanio!.slice(1)
      : '';

    return (
      <TouchableOpacity
        ref={(node) => {
          if (node) reportCardRefs.current[reporte.id] = node;
          else delete reportCardRefs.current[reporte.id];
        }}
        onPress={() => handleSelectReport(reporte)}
        style={{
          flexDirection: 'row', gap: compact ? 8 : 10,
          padding: compact ? 8 : 10,
          borderRadius: 14, borderWidth: 1.5,
          borderColor: isSelected ? condCfg.color : C.border,
          backgroundColor: isSelected ? condCfg.bg : '#FFFFFF',
          shadowColor: isSelected ? condCfg.color : '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isSelected ? 0.15 : 0.04,
          shadowRadius: isSelected ? 8 : 3,
        }}
      >
        {isSelected && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
              borderTopLeftRadius: 12, borderBottomLeftRadius: 12,
              backgroundColor: condCfg.color,
            }}
          />
        )}
        {/* Miniatura: tocable para ampliar, sin disparar la selección de la tarjeta completa */}
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); abrirImagenAmpliada(reporte); }}
          style={{ width: compact ? 44 : 52, height: compact ? 44 : 52, borderRadius: 10, backgroundColor: condCfg.bg, overflow: 'visible', flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ width: '100%', height: '100%', borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {reporte.foto_url
              ? <Image source={{ uri: reporte.foto_url }} style={{ width: compact ? 44 : 52, height: compact ? 44 : 52 }} resizeMode="cover" />
              : <Ionicons name="paw" size={compact ? 18 : 22} color={condCfg.color} />}
          </View>
          {total > 1 && (
            <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: C.dark, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 8, fontWeight: '800', color: '#FFFFFF' }}>{total}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: compact ? 12 : 13, fontWeight: '800', color: C.dark, marginBottom: 2 }}>
            {tipoLabel}{tamanio ? ` · ${tamanio}` : ''}{total > 1 ? ` · ${total} animales` : ''}
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
        <ReportContentMenu
          reportId={reporte.id}
          compact={compact}
          onModerated={() => {
            setReportes((actuales) => actuales.filter((item) => item.id !== reporte.id));
            if (selectedReport?.id === reporte.id) {
              setSelectedReport(null);
              setSidebarView('list');
            }
          }}
        />
      </TouchableOpacity>
    );
  };

  // ── Detalle en sidebar ───────────────────────────────────────────────────────
  const renderDetail = () => {
    if (!selectedReport) return null;
    const r = selectedReport;
    const animales = getAnimales(r);
    const total = totalAnimales(animales);
    const grave = animalMasGrave(animales);
    const condCfg = getCfg(CONDICION, grave?.condicion ?? '');
    const estCfg  = getCfg(ESTADO, r.estado_reporte ?? '');
    const tipoLabel = grave?.tipo_animal
      ? grave.tipo_animal[0].toUpperCase() + grave.tipo_animal.slice(1)
      : 'Animal';

    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity onPress={() => abrirImagenAmpliada(r)} activeOpacity={0.85}>
          <View style={{ borderRadius: 14, overflow: 'hidden', height: 220, backgroundColor: condCfg.bg, marginBottom: 14 }}>
          {(animales[fotoIndexPorReporte[r.id] ?? 0]?.foto_url || r.foto_url) ? (
              <Image source={{ uri: (animales[fotoIndexPorReporte[r.id] ?? 0]?.foto_url || r.foto_url ) ?? undefined }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="paw" size={48} color={condCfg.color} /></View>
          )}
            <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: condCfg.color, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF', textTransform: 'uppercase' }}>{condCfg.label}</Text>
            </View>
            {total > 1 && (
              <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="paw" size={11} color="#FFF" />
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF' }}>{total} animales</Text>
              </View>
            )}
            {r.foto_url && (
              <View style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, padding: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="expand" size={14} color="#FFF" />
                {r.fotos && r.fotos.length > 1 && (
                  <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>{r.fotos.length}</Text>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>

        <Text style={{ fontSize: 20, fontWeight: '900', color: C.dark, marginBottom: 4 }}>
          {tipoLabel}{grave?.tamanio ? ` · ${grave.tamanio[0].toUpperCase() + grave.tamanio.slice(1)}` : ''}
        </Text>

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
          <View style={{ backgroundColor: estCfg.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: estCfg.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>{estCfg.label}</Text>
          </View>
        </View>

        {[
          { icon: 'time-outline', text: formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: es }) },
          { icon: 'location-outline', text: [r.calle, r.colonia, r.municipio].filter(Boolean).join(', ') || 'Ubicación aproximada' },
        ].map((row: any, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
            <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ionicons name={row.icon} size={13} color={C.mid} />
            </View>
            <Text style={{ fontSize: 12, color: C.mid, flex: 1, lineHeight: 18, paddingTop: 4 }}>{row.text}</Text>
          </View>
        ))}

        <View style={{ marginBottom: 14 }}>
          <AnimalCarousel key={r.id} animales={animales} onIndexChange={(i) => setFotoIndexPorReporte((prev) => ({ ...prev, [r.id]: i }))} />
        </View>

        <View style={{ backgroundColor: '#FFF5EE', borderRadius: 10, padding: 10, marginTop: 4 }}>
          <Text style={{ fontSize: 10, color: C.orange, fontStyle: 'italic' }}>📍 Ubicación exacta protegida por privacidad</Text>
        </View>
      </ScrollView>
    );
  };

  // ── Detalle de asociación ────────────────────────────────────────────────────
  const renderAsociacionDetail = () => {
    if (!selectedAsociacion) return null;
    const a = selectedAsociacion;
    const ASOC_COLOR = '#2E86DE';

    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ borderRadius: 14, height: 120, backgroundColor: `${ASOC_COLOR}15`, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Ionicons name="home" size={44} color={ASOC_COLOR} />
        </View>

        <Text style={{ fontSize: 20, fontWeight: '900', color: C.dark, marginBottom: 4 }}>{a.nombre}</Text>

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: `${ASOC_COLOR}20`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: ASOC_COLOR, textTransform: 'uppercase', letterSpacing: 0.4 }}>Asociación</Text>
          </View>
          {(a.tipos_animales ?? []).map(tipo => (
            <View key={tipo} style={{ backgroundColor: C.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: C.mid, textTransform: 'capitalize' }}>{tipo}</Text>
            </View>
          ))}
        </View>

        {[
          a.contacto_telefono && { icon: 'call-outline', text: a.contacto_telefono },
          a.contacto_email && { icon: 'mail-outline', text: a.contacto_email },
          a.horario_atencion && { icon: 'time-outline', text: a.horario_atencion },
          a.radio_km != null && { icon: 'navigate-outline', text: `Atiende en un radio de ${a.radio_km} km` },
        ].filter(Boolean).map((row: any, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
            <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ionicons name={row.icon} size={13} color={C.mid} />
            </View>
            <Text style={{ fontSize: 12, color: C.mid, flex: 1, lineHeight: 18, paddingTop: 4 }}>{row.text}</Text>
          </View>
        ))}
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
          <TouchableOpacity onPress={() => { setSidebarView('list'); setSelectedReport(null); setSelectedAsociacion(null); }} style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: 6 }}>
            <Feather name="arrow-left" size={16} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
        {sidebarView === 'list' ? 'Mapa de rescate · Puebla'
          : sidebarView === 'detail' ? 'Detalle del reporte'
          : sidebarView === 'asociacion' ? 'Detalle de la asociación'
          : 'Nuevo reporte'}
      </Text>
    </View>
  );

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const filtrosExtraActivos = filtroEspecie !== 'todos' || ordenar !== 'reciente' || mostrarAsociaciones || mostrarAliados;
  // "Más" se ve seleccionado mientras el flotante está abierto, o si ya se
  // dejó algún filtro no-default activo al cerrarlo — nunca los dos rellenos
  // a la vez, para que quede claro cuál está activo.
  const masSeleccionado = showFiltersModal || filtrosExtraActivos;

  const renderFiltros = () => (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, flexShrink: 0, flexDirection: 'row' }}>
      {/* Columna 1: Gravedad */}
      <View style={{ flex: 1, padding: 12, borderRightWidth: 1, borderRightColor: C.border }}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: C.light, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
          Gravedad
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {['todos', 'estable', 'herido', 'grave'].map(f => {
            const isActive = filtro === f;
            const cfg = f !== 'todos' ? getCfg(CONDICION, f) : null;
            const activeColor = cfg?.color ?? C.orange;
            return (
              <TouchableOpacity key={f} onPress={() => setFiltro(f)}
                style={{ paddingHorizontal: 11, paddingVertical: 4, borderRadius: 20, borderWidth: 1.5,
                  backgroundColor: isActive ? activeColor : 'transparent', borderColor: activeColor,
                  height: 26, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? '#FFF' : activeColor, lineHeight: 13 }}>
                  {f === 'todos' ? 'Todos' : cfg?.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Columna 2: Filtros (especie, orden, capas — vive en el flotante) */}
      <View style={{ flex: 1, padding: 12 }}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: C.light, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
          Filtros
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <TouchableOpacity
            onPress={() => {
              setFiltroEspecie('todos'); setOrdenar('reciente'); setMostrarAsociaciones(false);
              setMostrarAliados(false);
              setShowFiltersModal(false);
            }}
            style={{ paddingHorizontal: 11, paddingVertical: 4, borderRadius: 20, borderWidth: 1.5,
              backgroundColor: !masSeleccionado ? C.orange : 'transparent', borderColor: C.orange,
              height: 26, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: !masSeleccionado ? '#FFF' : C.orange, lineHeight: 13 }}>
              Todos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowFiltersModal(v => !v)}
            style={{ paddingHorizontal: 11, paddingVertical: 4, borderRadius: 20, borderWidth: 1.5,
              backgroundColor: masSeleccionado ? C.orange : 'transparent', borderColor: C.orange,
              height: 26, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: masSeleccionado ? '#FFF' : C.orange, lineHeight: 13 }}>
              Más...
            </Text>
            <Ionicons name={showFiltersModal ? 'chevron-up' : 'chevron-down'} size={11} color={masSeleccionado ? '#FFF' : C.orange} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ── Flotante de filtros — vive SOBRE el mapa, no tapa la pantalla ────────────
  const renderFiltersDropdown = () => {
    if (!filtersMounted) return null;
    return (
      <>
        {/* Capa transparente para cerrar al tocar afuera — sin oscurecer el mapa */}
        <Pressable
          onPress={() => setShowFiltersModal(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
        />
        <Animated.View style={{
          position: 'absolute', top: 76, left: 12, width: 280, zIndex: 1000,
          backgroundColor: '#FFF', borderRadius: 18, padding: 18,
          shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 12,
          opacity: filtersAnim,
          transform: [
            { translateY: filtersAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
            { scale: filtersAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: C.light, textTransform: 'uppercase', marginBottom: 8 }}>Especie</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {[
              { key: 'todos', icon: ICON_PAW,  label: 'Todos'  },
              { key: 'perro', icon: ICON_DOG,  label: 'Perros' },
              { key: 'gato',  icon: ICON_CAT,  label: 'Gatos'  },
            ].map(({ key, icon, label }) => (
              <TouchableOpacity key={key} onPress={() => setFiltroEspecie(key)}
                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1.5,
                  borderColor: C.teal, flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: filtroEspecie === key ? C.teal : 'transparent' }}>
                <Image source={{ uri: icon }} style={{ width: 13, height: 13, tintColor: filtroEspecie === key ? '#FFF' : C.teal }} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: filtroEspecie === key ? '#FFF' : C.teal }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 10, fontWeight: '800', color: C.light, textTransform: 'uppercase', marginBottom: 8 }}>Ordenar por</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {[
              { key: 'reciente', icon: ICON_CLOCK,    label: 'Reciente' },
              { key: 'urgente',  icon: ICON_WARNING,  label: 'Urgente'  },
              { key: 'antiguo',  icon: ICON_CALENDAR, label: 'Antiguo'  },
            ].map(({ key, icon, label }) => (
              <TouchableOpacity key={key} onPress={() => setOrdenar(key)}
                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1.5,
                  borderColor: '#B0A090', flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: ordenar === key ? '#B0A090' : 'transparent' }}>
                <Image source={{ uri: icon }} style={{ width: 13, height: 13, tintColor: ordenar === key ? '#FFF' : '#B0A090' }} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: ordenar === key ? '#FFF' : '#B0A090' }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{
            backgroundColor: '#FBF7F2',
            borderWidth: 1,
            borderColor: '#EEE2D5',
            borderRadius: 14,
            padding: 12,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: C.dark, marginBottom: 2 }}>Explorar en el mapa</Text>
            <Text style={{ fontSize: 9, color: C.light, lineHeight: 13, marginBottom: 10 }}>
              Muestra organizaciones y puntos de apoyo cercanos.
            </Text>
            <TouchableOpacity onPress={() => setMostrarAsociaciones(v => !v)}
              style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, borderWidth: 1.5,
                borderColor: '#2E86DE', flexDirection: 'row', alignItems: 'center', gap: 9,
                backgroundColor: mostrarAsociaciones ? '#2E86DE' : '#FFF', marginBottom: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: mostrarAsociaciones ? 'rgba(255,255,255,0.2)' : '#EAF4FF', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="home" size={15} color={mostrarAsociaciones ? '#FFF' : '#2E86DE'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: mostrarAsociaciones ? '#FFF' : '#2E86DE' }}>Asociaciones</Text>
                <Text style={{ fontSize: 8, color: mostrarAsociaciones ? 'rgba(255,255,255,0.82)' : C.light }}>Refugios y organizaciones</Text>
              </View>
              <Ionicons name={mostrarAsociaciones ? 'checkmark-circle' : 'eye-outline'} size={16} color={mostrarAsociaciones ? '#FFF' : '#2E86DE'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMostrarAliados(v => !v)}
              style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, borderWidth: 1.5,
                borderColor: '#E67E22', flexDirection: 'row', alignItems: 'center', gap: 9,
                backgroundColor: mostrarAliados ? '#E67E22' : '#FFF' }}>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: mostrarAliados ? 'rgba(255,255,255,0.2)' : '#FFF0E2', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="storefront" size={15} color={mostrarAliados ? '#FFF' : '#E67E22'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: mostrarAliados ? '#FFF' : '#E67E22' }}>Red de aliados</Text>
                <Text style={{ fontSize: 8, color: mostrarAliados ? 'rgba(255,255,255,0.82)' : C.light }}>Veterinarias y comercios</Text>
              </View>
              <Ionicons name={mostrarAliados ? 'checkmark-circle' : 'eye-outline'} size={16} color={mostrarAliados ? '#FFF' : '#E67E22'} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </>
    );
  };

  // ── Mapa ─────────────────────────────────────────────────────────────────────
  const renderMap = () => (
    <View style={{ flex: 1, position: 'relative' }}>
      {renderFiltersDropdown()}
      {isClient ? (
        <Suspense fallback={<View style={{ flex: 1, backgroundColor: '#EAE0D0' }} />}>
          <LeafletMap
            reportes={(mostrarAsociaciones || mostrarAliados) ? [] : reportesFiltrados}
            asociaciones={mostrarAsociaciones ? asociaciones : []}
            aliados={mostrarAliados ? aliados : []}
            selectedReportId={selectedReport?.id ?? highlightedReportId}
            showReportMenuInPopup={isMobile}
            onSelectReport={handleSelectReport}
            onHighlightReport={(reporte) => setHighlightedReportId(reporte.id)}
            onReportModerated={(reporteId) => {
              setReportes((actuales) => actuales.filter((item) => item.id !== reporteId));
              if (selectedReport?.id === reporteId) {
                setSelectedReport(null);
                setSidebarView('list');
              }
            }}
            onSelectAsociacion={handleSelectAsociacion}
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
                const animalesR = getAnimales(r);
                if (filtroEspecie !== 'todos' && !animalesR.some(a => a.tipo_animal?.toLowerCase() === filtroEspecie)) return false;
                return true;
              });
              const count = key === 'todos'
                ? base.length
                : base.filter(r => getAnimales(r).some(a => a.condicion?.toLowerCase() === key)).length;
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
          {/* Fila 3: capas destacadas */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 7, gap: 7, borderTopWidth: 1, borderTopColor: '#F0E8DC' }}>
            <TouchableOpacity onPress={() => setMostrarAsociaciones(v => !v)}
              style={{ flex: 1, minHeight: 34, borderRadius: 11, borderWidth: 1.5,
                borderColor: '#2E86DE', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 6,
                backgroundColor: mostrarAsociaciones ? '#2E86DE' : '#F4F9FF' }}>
              <Ionicons name="home" size={14} color={mostrarAsociaciones ? '#FFF' : '#2E86DE'} />
              <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '800', color: mostrarAsociaciones ? '#FFF' : '#2E86DE' }}>
                Asociaciones
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMostrarAliados(v => !v)}
              style={{ flex: 1, minHeight: 34, borderRadius: 11, borderWidth: 1.5,
                borderColor: '#E67E22', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 6,
                backgroundColor: mostrarAliados ? '#E67E22' : '#FFF7EF' }}>
              <Ionicons name="storefront" size={14} color={mostrarAliados ? '#FFF' : '#E67E22'} />
              <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '800', color: mostrarAliados ? '#FFF' : '#E67E22' }}>
                Red de aliados
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  // ─── Bottom sheet para mobile web ─────────────────────────────────────────
  const renderMobileBottomSheet = () => {
    if (!selectedReport) return null;
    const r = selectedReport;
    const animales = getAnimales(r);
    const total = totalAnimales(animales);
    const grave = animalMasGrave(animales);
    const condCfg = getCfg(CONDICION, grave?.condicion ?? '');
    const estCfg  = getCfg(ESTADO, r.estado_reporte ?? '');
    const tipoLabel = grave?.tipo_animal
      ? grave.tipo_animal[0].toUpperCase() + grave.tipo_animal.slice(1)
      : 'Animal';

    return (
      <Animated.View style={{
        position: 'absolute', bottom: TAB_BAR_CLEARANCE, left: 0, right: 0,
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
            <TouchableOpacity onPress={() => abrirImagenAmpliada(r)} activeOpacity={0.85}>
              <View style={{ width: 72, height: 72, borderRadius: 12, overflow: 'visible', backgroundColor: condCfg.bg, flexShrink: 0 }}>
                <View style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden' }}>
                  {(animales[fotoIndexPorReporte[r.id] ?? 0]?.foto_url || r.foto_url) ? (
                    <Image
                      source={{ uri: (animales[fotoIndexPorReporte[r.id] ?? 0]?.foto_url || r.foto_url) ?? undefined }}
                      style={{ width: 72, height: 72 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="paw" size={28} color={condCfg.color} />
                    </View>
                  )}
                  {r.foto_url && (
                    <View style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, padding: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="expand" size={14} color="#FFF" />
                      {r.fotos && r.fotos.length > 1 && (
                        <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>{r.fotos.length}</Text>
                      )}
                    </View>
                  )}
                </View>
                {total > 1 && (
                  <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: C.dark, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>{total}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: C.dark, marginBottom: 4 }}>
                {tipoLabel}{grave?.tamanio ? ` · ${grave.tamanio[0].toUpperCase() + grave.tamanio.slice(1)}` : ''}{total > 1 ? ` · ${total} animales` : ''}
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
          {/* Detalles adicionales — navegable si el caso trae más de uno */}
          {animales.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <AnimalCarousel key={r.id} animales={animales} compact  onIndexChange={(i) => setFotoIndexPorReporte((prev) => ({ ...prev, [r.id]: i }))}/>
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

  // ─── Modal de imagen ampliada (con soporte de carrusel) ──────────────────────
  const renderImagenAmpliada = () => {
    if (!imagenAmpliada) return null;
    const { fotos, index } = imagenAmpliada;
    const hayVarias = fotos.length > 1;

    return (
      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,8,6,0.92)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' } as any}>
        {/* Cerrar */}
        <TouchableOpacity
          onPress={() => setImagenAmpliada(null)}
          style={{ position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
        >
          <Feather name="x" size={22} color="#FFF" />
        </TouchableOpacity>

        {/* Contador (solo si hay varias) */}
        {hayVarias && (
          <View style={{ position: 'absolute', top: 24, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 }}>
            <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>{index + 1} / {fotos.length}</Text>
          </View>
        )}

        {/* Flecha izquierda */}
        {hayVarias && index > 0 && (
          <TouchableOpacity
            onPress={() => setImagenAmpliada({ fotos, index: index - 1 })}
            style={{ position: 'absolute', left: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="chevron-left" size={24} color="#FFF" />
          </TouchableOpacity>
        )}

        {/* Imagen */}
        <Image
          source={{ uri: fotos[index] }}
          style={{ width: '90%', height: '75%', borderRadius: 12 }}
          resizeMode="contain"
        />

        {/* Flecha derecha */}
        {hayVarias && index < fotos.length - 1 && (
          <TouchableOpacity
            onPress={() => setImagenAmpliada({ fotos, index: index + 1 })}
            style={{ position: 'absolute', right: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="chevron-right" size={24} color="#FFF" />
          </TouchableOpacity>
        )}

        {/* Miniaturas (solo si hay varias) */}
        {hayVarias && (
          <View style={{ position: 'absolute', bottom: 24, flexDirection: 'row', gap: 8 }}>
            {fotos.map((f, i) => (
              <TouchableOpacity key={i} onPress={() => setImagenAmpliada({ fotos, index: i })}>
                <Image
                  source={{ uri: f }}
                  style={{ width: 44, height: 44, borderRadius: 8, borderWidth: i === index ? 2 : 0, borderColor: C.orange, opacity: i === index ? 1 : 0.5 }}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  // ─── LAYOUT MOBILE WEB ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <View style={{ flex: 1 }}>
        {renderMap()}
        {renderMobileBottomSheet()}
        {renderFormModal()}
        {renderImagenAmpliada()}
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
          {sidebarView === 'asociacion' && renderAsociacionDetail()}
          {sidebarView === 'form' && (
            <ReportFormScreen onClose={() => { setSidebarView('list'); setTimeout(fetchReportes, 400); }} />
          )}
        </View>
      </View>

      {/* Mapa */}
      {renderMap()}

      {renderImagenAmpliada()}
      <AuthGateModal visible={isAuthGateVisible} onClose={() => setIsAuthGateVisible(false)} onGuest={() => setSidebarView('form')} />

    </View>
  );
}
