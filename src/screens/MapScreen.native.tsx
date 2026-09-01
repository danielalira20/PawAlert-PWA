import { Feather, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import MapView, { Callout, Circle, Region } from 'react-native-maps';
import { TrackedMarker } from './TrackedMarker';
import AuthGateModal from '../components/AuthGateModal';
import { ReportContentMenu } from '../components/reports/ReportContentMenu';
import { ICON_CAT, ICON_CLOCK, ICON_CALENDAR, ICON_DOG, ICON_PAW, ICON_WARNING, ICON_MULTIPLE } from '../constants/mapIcons';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { Reporte, ZonaAgregada, getAnimales, condicionMasGrave, especieMasGrave, totalAnimales, animalMasGrave } from '../types/reporte';
import { AnimalCarousel } from '../components/common/AnimalCarousel';
import ReportFormScreen from './ReportFormScreen';
import { PublicEventsPanel } from '../components/events/discovery/PublicEventsPanel';
import {
  EventMapModeSwitch,
  type EventDiscoveryView,
  type MapContentMode,
} from '../components/events/discovery/EventMapModeSwitch';
import { usePublicEventMap } from '../hooks/events/usePublicEventMap';
import type { EventMapItem, EventPublicSummary } from '../types/event';
import {
  EVENT_CAPACITY_META,
  EVENT_TYPE_META,
  formatEventSchedule,
} from '../utils/eventFormatters';
import type { PublicEventFilterState } from '../components/events/discovery/PublicEventFilters';
import {
  buildEventMapQuery,
  INITIAL_PUBLIC_EVENT_FILTERS,
  type EventMapBounds,
} from '../components/events/discovery/eventDiscoveryFilters';

const { width, height } = Dimensions.get('window');

const INITIAL_REGION: Region = {
  latitude: 19.0414,
  longitude: -98.2063,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const COLORS = {
  orange: '#EC802B', orangeDark: '#D4691A',
  teal: '#66BCB4', beige: '#E8CCAD',
  bgLight: '#FFFAF6', border: '#F0E8DC',
  textDark: '#1A1A1A', textMid: '#5C4A3A', textLight: '#9B8B7A',
};

const CONDICION_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  estable: { color: '#27AE60', label: 'Estable', bg: '#EAFAF1' },
  herido:  { color: '#F39C12', label: 'Herido',  bg: '#FEF9E7' },
  grave:   { color: '#E74C3C', label: 'Grave',   bg: '#FDEDEC' },
};

const ESTADO_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  pendiente:     { color: '#7B68EE', label: 'Pendiente',    bg: '#F0EEFF' },
  asignado:      { color: '#2980B9', label: 'Asignado',     bg: '#EBF5FB' },
  en_camino:     { color: '#16A085', label: 'En camino',    bg: '#E8F8F5' },
  en_atencion:   { color: '#8E44AD', label: 'En atención',  bg: '#F5EEF8' },
  cerrado:       { color: '#7F8C8D', label: 'Cerrado',      bg: '#F2F3F4' },
  sin_cobertura: { color: '#E67E22', label: 'Sin cobertura',bg: '#FEF9E7' },
};

const getCfg = (map: Record<string, any>, key: string) =>
  map[key?.toLowerCase()] ?? { color: '#95A5A6', label: key ?? '', bg: '#F2F3F4' };

const URGENCIA: Record<string, number> = { grave: 0, herido: 1, estable: 2 };

// ─── Colores oscurecidos para borde del pin ───────────────────────────────────
const DARK: Record<string, string> = {
  '#27AE60': '#1E8449',
  '#F39C12': '#D4820E',
  '#E74C3C': '#C0392B',
  '#95A5A6': '#7F8C8D',
};

// ─── Marcador personalizado con íconos reales ─────────────────────────────────
function AnimalMarker({ condicion, tipoAnimal, selected, count = 1 }: {
  condicion: string; tipoAnimal: string; selected: boolean; count?: number;
}) {
  const cfg = getCfg(CONDICION_CONFIG, condicion);
  const dark = DARK[cfg.color] ?? cfg.color;
  const tipo = tipoAnimal?.toLowerCase();
  const size = selected ? 52 : 44;
  const iconSize = size * 0.72;
  const innerSize = size - 8;

  const iconUri = count > 1 ? ICON_MULTIPLE : (tipo === 'perro' ? ICON_DOG : tipo === 'gato' ? ICON_CAT : ICON_PAW);

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Círculo de color con ícono */}
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: cfg.color,
        borderWidth: selected ? 3.5 : 2.5,
        borderColor: dark,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: selected ? cfg.color : '#000',
        shadowOffset: { width: 0, height: selected ? 5 : 2 },
        shadowOpacity: selected ? 0.45 : 0.2,
        shadowRadius: selected ? 12 : 5,
        elevation: selected ? 10 : 4,
        transform: [{ scale: selected ? 1.1 : 1 }],
      }}>
        {/* Círculo blanco interior */}
        <View style={{
          width: innerSize, height: innerSize, borderRadius: innerSize / 2,
          backgroundColor: 'rgba(255,255,255,0.88)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Image
            source={{ uri: iconUri }}
            style={{ width: iconSize, height: iconSize }}
            resizeMode="contain"
          />
        </View>
        {/* Badge de conteo — solo si el caso trae más de un animal */}
        {count > 1 && (
          <View style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 18, height: 18, paddingHorizontal: 3, borderRadius: 9,
            backgroundColor: '#2C3E50', borderWidth: 2, borderColor: '#FFFFFF',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>{count}</Text>
          </View>
        )}
      </View>
      {/* Flecha */}
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
        borderStyle: 'solid',
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderTopColor: dark,
        marginTop: -1,
      }} />
      {/* Punto anclaje */}
      <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: dark, opacity: 0.7 }} />
    </View>
  );
}

// ─── Marcador de zona agregada (visitantes sin sesión: densidad, no reportes) ─
const NIVEL_URGENCIA_CONFIG: Record<string, { color: string; bg: string }> = {
  rojo:     { color: '#E74C3C', bg: '#FDEDEC' },
  amarillo: { color: '#F39C12', bg: '#FEF9E7' },
  verde:    { color: '#27AE60', bg: '#EAFAF1' },
};

// Anillos concéntricos con opacidad decreciente — react-native-maps no
// soporta un fillColor con degradado radial nativo, así que se simula
// apilando varios círculos (mismo criterio que LeafletMap.tsx en web).
const ANILLOS_GLOW = [
  { factor: 1, opacity: 0.05 },
  { factor: 0.7, opacity: 0.09 },
  { factor: 0.45, opacity: 0.16 },
  { factor: 0.22, opacity: 0.3 },
];

const alphaHex = (opacity: number) =>
  Math.round(opacity * 255).toString(16).padStart(2, '0');

function ZonaGlow({ zona }: { zona: { latitud: number; longitud: number; cantidad: number; nivel_urgencia_max: string | null } }) {
  const color = NIVEL_URGENCIA_CONFIG[zona.nivel_urgencia_max ?? '']?.color ?? '#95A5A6';
  const radioBase = 500 + zona.cantidad * 180;
  return (
    <>
      {ANILLOS_GLOW.map((anillo) => (
        <Circle
          key={anillo.factor}
          center={{ latitude: zona.latitud, longitude: zona.longitud }}
          radius={radioBase * anillo.factor}
          strokeWidth={0}
          fillColor={`${color}${alphaHex(anillo.opacity)}`}
        />
      ))}
    </>
  );
}

function ZonaMarker({ cantidad, nivel }: { cantidad: number; nivel: string | null }) {
  const cfg = NIVEL_URGENCIA_CONFIG[nivel ?? ''] ?? { color: '#95A5A6', bg: '#F2F3F4' };
  const size = 40;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: cfg.bg,
      borderWidth: 2, borderColor: cfg.color,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 4,
    }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: cfg.color }}>{cantidad}</Text>
    </View>
  );
}

interface AsociacionMapa {
  id: string;
  nombre: string;
  latitud: number;
  longitud: number;
  contacto_telefono?: string | null;
}

const ASOC_COLOR = '#2E86DE';
const ASOC_DARK = '#1B4F91';

// ─── Marcador de asociación (casita azul) ─────────────────────────────────────
function AssocMarker({ selected }: { selected: boolean }) {
  const size = selected ? 52 : 44;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: ASOC_COLOR,
        borderWidth: selected ? 3.5 : 2.5,
        borderColor: ASOC_DARK,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: selected ? ASOC_COLOR : '#000',
        shadowOffset: { width: 0, height: selected ? 5 : 2 },
        shadowOpacity: selected ? 0.45 : 0.2,
        shadowRadius: selected ? 12 : 5,
        elevation: selected ? 10 : 4,
        transform: [{ scale: selected ? 1.1 : 1 }],
      }}>
        <Ionicons name="home" size={size * 0.5} color="#FFFFFF" />
      </View>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
        borderStyle: 'solid',
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderTopColor: ASOC_DARK,
        marginTop: -1,
      }} />
      <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: ASOC_DARK, opacity: 0.7 }} />
    </View>
  );
}

function EventMarker({ event, selected }: { event: EventMapItem; selected: boolean }) {
  const meta = EVENT_TYPE_META[event.tipo];
  const size = selected ? 50 : 42;

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: meta.backgroundColor,
        borderWidth: selected ? 3.5 : 2.5,
        borderColor: meta.color,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: selected ? meta.color : '#000',
        shadowOffset: { width: 0, height: selected ? 5 : 2 },
        shadowOpacity: selected ? 0.42 : 0.2,
        shadowRadius: selected ? 10 : 5,
        elevation: selected ? 10 : 4,
      }}>
        <Ionicons name="calendar-outline" size={size * 0.5} color={meta.color} />
      </View>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
        borderStyle: 'solid',
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderTopColor: meta.color,
        marginTop: -1,
      }} />
    </View>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MapScreen() {
  const { isLoggedIn, token } = useAuth();
  const params = useLocalSearchParams<{ action?: string }>();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [zonasAgregadas, setZonasAgregadas] = useState<ZonaAgregada[]>([]);
  // Zona seleccionada (visitantes sin sesión): al tocar un pin de zona se
  // muestra un círculo difuminado alrededor, solo esa.
  const [zonaSeleccionada, setZonaSeleccionada] = useState<string | null>(null);
  const [asociaciones, setAsociaciones] = useState<AsociacionMapa[]>([]);
  const [mostrarAsociaciones, setMostrarAsociaciones] = useState(false);
  const [contentMode, setContentMode] = useState<MapContentMode>('rescues');
  const [eventView, setEventView] = useState<EventDiscoveryView>('list');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventFilters, setEventFilters] = useState<PublicEventFilterState>(INITIAL_PUBLIC_EVENT_FILTERS);
  const [eventMapBounds, setEventMapBounds] = useState<EventMapBounds | null>(null);
  const [pendingEventMapBounds, setPendingEventMapBounds] = useState<EventMapBounds | null>(null);
  const [selectedReport, setSelectedReport] = useState<Reporte | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isAuthGateVisible, setIsAuthGateVisible] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);
  const mapRef = useRef<MapView | null>(null);
  const eventMapGestureRef = useRef(false);
  const eventMapQuery = useMemo(
    () => buildEventMapQuery(eventFilters, eventMapBounds),
    [eventFilters, eventMapBounds],
  );
  const {
    events: mapEvents,
    isLoading: isEventMapLoading,
    error: eventMapError,
    refresh: refreshEventMap,
  } = usePublicEventMap(
    contentMode === 'events' && eventView === 'map',
    eventMapQuery,
  );

  useEffect(() => {
    if (!selectedEventId || eventView !== 'map') return;
    const event = mapEvents.find((item) => item.id === selectedEventId);
    if (!event) return;
    mapRef.current?.animateToRegion(
      {
        latitude: event.latitud,
        longitude: event.longitud,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      },
      350,
    );
  }, [eventView, mapEvents, selectedEventId]);

  // ── Filtros — portados de MapScreen.web.tsx ──────────────────────────────
  const [filtro, setFiltro] = useState('todos');
  const [filtroEspecie, setFiltroEspecie] = useState('todos');
  const [ordenar, setOrdenar] = useState('reciente');

  // Exclusión mutua: capa de asociaciones vs filtros de reporte
  // (gravedad/especie), mismo patrón que MapScreen.web.tsx. Cualquier
  // clic explícito en gravedad/especie (incluyendo "todos") apaga
  // Asociaciones.
  const handleSetFiltro = (f: string) => {
    setFiltro(f);
    setMostrarAsociaciones(false);
  };

  const handleSetFiltroEspecie = (key: string) => {
    setFiltroEspecie(key);
    setMostrarAsociaciones(false);
  };

  const handleToggleAsociaciones = () => {
    setMostrarAsociaciones(v => {
      const next = !v;
      if (next) {
        setFiltro('todos');
        setFiltroEspecie('todos');
      }
      return next;
    });
  };

  const handleContentModeChange = (mode: MapContentMode) => {
    setContentMode(mode);
    hideSheetImmediate();
    setZonaSeleccionada(null);
    setSelectedEventId(null);
    if (mode === 'events') setMostrarAsociaciones(false);
  };

  const handleLocatePublicEvent = (event: EventPublicSummary) => {
    setEventMapBounds(null);
    setPendingEventMapBounds(null);
    setSelectedEventId(event.id);
    setEventView('map');
  };

  const handleEventFiltersChange = (filters: PublicEventFilterState) => {
    setEventFilters(filters);
    setEventMapBounds(null);
    setPendingEventMapBounds(null);
    setSelectedEventId(null);
  };

  const handleEventRegionChange = (region: Region) => {
    if (contentMode !== 'events' || eventView !== 'map' || !eventMapGestureRef.current) return;
    eventMapGestureRef.current = false;
    setPendingEventMapBounds({
      latitudeMin: region.latitude - region.latitudeDelta / 2,
      latitudeMax: region.latitude + region.latitudeDelta / 2,
      longitudeMin: region.longitude - region.longitudeDelta / 2,
      longitudeMax: region.longitude + region.longitudeDelta / 2,
    });
  };

  const sheetY = useRef(new Animated.Value(300)).current;

  const showSheet = () =>
    Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 200 }).start();

  const hideSheet = () =>
    Animated.timing(sheetY, { toValue: 300, duration: 220, useNativeDriver: true }).start(() => setSelectedReport(null));

  const hideSheetImmediate = () => {
    sheetY.setValue(300);
    setSelectedReport(null);
  };

  // Cierra el bottom sheet de detalle antes de abrir el formulario — evita
  // que ambos queden visibles a la vez (el Modal del formulario es
  // transparent, así que el bottom sheet de atrás se alcanzaba a ver).
  const handleCrearReporte = () => {
    if (isLoggedIn) {
      hideSheetImmediate();
      setIsFormVisible(true);
    } else {
      setIsAuthGateVisible(true);
    }
  };

  // Al salir de la pestaña "Mapa" (blur), limpia cualquier overlay que se
  // haya quedado abierto — bottom sheet de reporte, auth gate — para que
  // al regresar la pantalla arranque limpia. El formulario "Nuevo reporte"
  // es la única excepción: si el usuario lo dejó a medias, se conserva.
  useFocusEffect(
    useCallback(() => {
      return () => {
        hideSheetImmediate();
        setIsAuthGateVisible(false);
        // isFormVisible NO se toca aquí a propósito: si el usuario lo dejó
        // a medias, se conserva tal cual al regresar a esta pantalla.
      };
    }, [])
  );

  const fetchReportes = useCallback(async () => {
    try {
      const response = await axios.get(
        `${API_URL}/reports`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      );
      if (response.data.modo === 'agregado') {
        setReportes([]);
        setZonasAgregadas(response.data.zonas.filter((z: ZonaAgregada) => z.latitud && z.longitud));
      } else {
        setReportes(response.data.reportes.filter((r: Reporte) => r.latitud && r.longitud));
        setZonasAgregadas([]);
      }
      setLastUpdated(new Date());
    } catch {}
  }, [token]);

  const fetchAsociaciones = async () => {
    try {
      const response = await axios.get(`${API_URL}/associations`);
      setAsociaciones(response.data.filter((a: AsociacionMapa) => a.latitud && a.longitud));
    } catch {}
  };

  useEffect(() => {
    fetchReportes();
    fetchAsociaciones();
    const fetchInterval = setInterval(fetchReportes, 600000);
    const tickInterval = setInterval(() => setTick(t => t + 1), 60000);
    return () => { clearInterval(fetchInterval); clearInterval(tickInterval); };
  }, [fetchReportes]);

  useEffect(() => {
    if (params.action === 'create') {
      handleCrearReporte();
      router.setParams({ action: undefined });
    }
  }, [params.action, isLoggedIn]);

  const handleSelectReport = (reporte: Reporte) => {
    setSelectedReport(reporte);
    showSheet();
  };

  // ── Mismo filtrado + orden que la versión web ────────────────────────────
  const reportesFiltrados = reportes
    .filter(r => {
      if (r.estado_reporte === 'cerrado') return false;
      const animalesR = getAnimales(r);
      if (filtro !== 'todos' && !animalesR.some(a => a.condicion?.toLowerCase() === filtro)) return false;
      if (filtroEspecie !== 'todos' && !animalesR.some(a => a.tipo_animal?.toLowerCase() === filtroEspecie)) return false;
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

  if (contentMode === 'events' && eventView === 'list') {
    return (
      <View style={{ flex: 1 }}>
        <PublicEventsPanel
          filters={eventFilters}
          onFiltersChange={handleEventFiltersChange}
          onLocate={handleLocatePublicEvent}
          topInset={62}
        />
        <EventMapModeSwitch
          contentMode={contentMode}
          eventView={eventView}
          floating
          showEventView
          onContentModeChange={handleContentModeChange}
          onEventViewChange={setEventView}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ width, height }}
        initialRegion={INITIAL_REGION}
        onPress={() => { if (selectedReport) hideSheet(); }}
        onPanDrag={() => {
          if (contentMode === 'events') eventMapGestureRef.current = true;
        }}
        onRegionChangeComplete={handleEventRegionChange}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {(contentMode === 'rescues' && !mostrarAsociaciones ? reportesFiltrados : []).map(reporte => {
          const animales = getAnimales(reporte);
          const total = totalAnimales(animales);
          const tipo = especieMasGrave(animales) ?? '';
          const tipoLabel = tipo ? tipo[0].toUpperCase() + tipo.slice(1) : 'Animal';
          const tamanio = animales[0]?.tamanio ?? '';
          const tamanioLabel = tamanio ? tamanio[0].toUpperCase() + tamanio.slice(1) : '';
          const condicionValor = condicionMasGrave(animales) ?? '';
          const condCfg = getCfg(CONDICION_CONFIG, condicionValor);
          const estCfg  = getCfg(ESTADO_CONFIG, reporte.estado_reporte ?? '');
          const loc = reporte.colonia ?? reporte.municipio ?? '';

          return (
            <TrackedMarker
              key={reporte.id}
              coordinate={{ latitude: reporte.latitud as number, longitude: reporte.longitud as number }}
            >
              <AnimalMarker
                condicion={condicionValor}
                tipoAnimal={tipo}
                selected={selectedReport?.id === reporte.id}
                count={total}
              />
              <Callout onPress={() => handleSelectReport(reporte)} tooltip={false}>
                <View style={{ minWidth: 170, maxWidth: 220, padding: 12, borderRadius: 12 }}>
                  {/* Título */}
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#1A1A1A', marginBottom: 7 }}>
                    {tipoLabel}{tamanioLabel ? ` · ${tamanioLabel}` : ''}
                  </Text>
                  {/* Badges */}
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 7 }}>
                    <View style={{ backgroundColor: condCfg.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: condCfg.color, textTransform: 'uppercase' }}>
                        {condCfg.label}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: estCfg.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: estCfg.color, textTransform: 'uppercase' }}>
                        {estCfg.label}
                      </Text>
                    </View>
                  </View>
                  {/* Ubicación */}
                  {!!loc && (
                    <Text style={{ fontSize: 10, color: '#9B8B7A', marginBottom: 9 }}>📍 {loc}</Text>
                  )}
                  {/* CTA */}
                  <View style={{ backgroundColor: '#EC802B', borderRadius: 8, paddingVertical: 7, alignItems: 'center' }}>
                    <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>Ver detalle →</Text>
                  </View>
                </View>
              </Callout>
            </TrackedMarker>
          );
        })}
        {contentMode === 'rescues' && mostrarAsociaciones && asociaciones.map(asociacion => (
          <TrackedMarker
            key={`asoc-${asociacion.id}`}
            coordinate={{ latitude: asociacion.latitud, longitude: asociacion.longitud }}
          >
            <AssocMarker selected={false} />
            <Callout tooltip={false}>
              <View style={{ minWidth: 170, maxWidth: 220, padding: 12, borderRadius: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#1A1A1A', marginBottom: 7 }}>
                  {asociacion.nombre}
                </Text>
                <View style={{ backgroundColor: `${ASOC_COLOR}20`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: ASOC_DARK, textTransform: 'uppercase' }}>
                    Asociación
                  </Text>
                </View>
                {!!asociacion.contacto_telefono && (
                  <Text style={{ fontSize: 10, color: '#9B8B7A', marginTop: 9 }}>{asociacion.contacto_telefono}</Text>
                )}
              </View>
            </Callout>
          </TrackedMarker>
        ))}
        {contentMode === 'events' && mapEvents.map(event => {
          const typeMeta = EVENT_TYPE_META[event.tipo];
          const capacityMeta = EVENT_CAPACITY_META[event.cupo_estado];
          return (
            <TrackedMarker
              key={`event-${event.id}`}
              coordinate={{ latitude: event.latitud, longitude: event.longitud }}
              onPress={() => setSelectedEventId(event.id)}
            >
              <EventMarker event={event} selected={selectedEventId === event.id} />
              <Callout tooltip={false}>
                <View style={{ minWidth: 210, maxWidth: 260, padding: 12, borderRadius: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.textDark, marginBottom: 7 }}>
                    {event.titulo}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <View style={{ backgroundColor: typeMeta.backgroundColor, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: typeMeta.color }}>
                        {typeMeta.label}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: capacityMeta.backgroundColor, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: capacityMeta.color }}>
                        {capacityMeta.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 10, color: COLORS.textMid, marginBottom: 6 }}>
                    {formatEventSchedule(event.inicia_at, event.termina_at, event.zona_horaria)}
                  </Text>
                  <Text style={{ fontSize: 10, color: COLORS.textLight }}>
                    {event.asociacion.nombre}
                  </Text>
                </View>
              </Callout>
            </TrackedMarker>
          );
        })}
        {(() => {
          const zonasVisibles = contentMode === 'rescues' && !mostrarAsociaciones ? zonasAgregadas : [];
          const zonaActiva = zonasVisibles.find(
            (z) => `${z.latitud}-${z.longitud}` === zonaSeleccionada,
          );
          return (
            <>
              {zonaActiva && <ZonaGlow zona={zonaActiva} />}
              {zonasVisibles.map((zona, index) => {
                const clave = `${zona.latitud}-${zona.longitud}`;
                return (
                  <TrackedMarker
                    key={`zona-${index}-${clave}`}
                    coordinate={{ latitude: zona.latitud, longitude: zona.longitud }}
                    onPress={() =>
                      setZonaSeleccionada((actual) => (actual === clave ? null : clave))
                    }
                  >
                    <ZonaMarker cantidad={zona.cantidad} nivel={zona.nivel_urgencia_max} />
                    <Callout tooltip={false}>
                      <View style={{ minWidth: 170, maxWidth: 220, padding: 12, borderRadius: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '900', color: '#1A1A1A', marginBottom: 4 }}>
                          {zona.cantidad} {zona.cantidad === 1 ? 'reporte' : 'reportes'} en esta zona
                        </Text>
                        <Text style={{ fontSize: 10, color: '#9B8B7A' }}>
                          Inicia sesión para ver el detalle de cada reporte
                        </Text>
                      </View>
                    </Callout>
                  </TrackedMarker>
                );
              })}
            </>
          );
        })()}
      </MapView>

      <EventMapModeSwitch
        contentMode={contentMode}
        eventView={eventView}
        floating
        showEventView
        onContentModeChange={handleContentModeChange}
        onEventViewChange={setEventView}
      />

      {contentMode === 'events' && eventView === 'map' && isEventMapLoading && (
        <View style={{
          position: 'absolute', top: 72, alignSelf: 'center', zIndex: 1400,
          backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 18,
          paddingHorizontal: 14, paddingVertical: 8, elevation: 6,
        }}>
          <Text style={{ color: COLORS.textMid, fontSize: 12, fontWeight: '700' }}>
            Cargando eventos…
          </Text>
        </View>
      )}

      {contentMode === 'events' && eventView === 'map' && !!eventMapError && !isEventMapLoading && (
        <TouchableOpacity
          onPress={() => void refreshEventMap()}
          style={{
            position: 'absolute', top: 72, left: 18, right: 18, zIndex: 1400,
            backgroundColor: '#FFF4EE', borderColor: COLORS.orange,
            borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
            elevation: 6,
          }}
        >
          <Text style={{ color: COLORS.orangeDark, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>
            No se pudo cargar la capa de eventos. Toca para reintentar.
          </Text>
        </TouchableOpacity>
      )}

      {contentMode === 'events' && eventView === 'map' && pendingEventMapBounds && !isEventMapLoading && (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            setEventMapBounds(pendingEventMapBounds);
            setPendingEventMapBounds(null);
            setSelectedEventId(null);
          }}
          style={{
            position: 'absolute', top: 72, alignSelf: 'center', zIndex: 1400,
            backgroundColor: COLORS.orange, borderRadius: 18,
            paddingHorizontal: 16, paddingVertical: 10, elevation: 7,
          }}
        >
          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>
            Buscar en esta zona
          </Text>
        </TouchableOpacity>
      )}

      {contentMode === 'events' && eventView === 'map' && eventMapBounds && !pendingEventMapBounds && !isEventMapLoading && (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setEventMapBounds(null)}
          style={{
            position: 'absolute', top: 72, alignSelf: 'center', zIndex: 1400,
            backgroundColor: '#FFF', borderColor: COLORS.orange, borderWidth: 1,
            borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9, elevation: 7,
          }}
        >
          <Text style={{ color: COLORS.orangeDark, fontSize: 11, fontWeight: '800' }}>
            Ver todos los eventos
          </Text>
        </TouchableOpacity>
      )}

      {/* Barra de filtros interactivos — portada de MapScreen.web.tsx.
          Reemplaza al chip simple de "X reportes activos" que había antes
          (ese conteo ya lo muestra el pill "Todos" de aquí abajo). */}
      {contentMode === 'rescues' && <View style={{
        position: 'absolute', top: 64, left: 12, right: 12,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderRadius: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 8,
        overflow: 'hidden',
        zIndex: 1200,
        elevation: 12,
      }}>
        {/* Fila 1: condición, con conteo por categoría */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F0E8DC' }}>
          {[
            { key: 'todos',   label: 'Todos',   color: COLORS.orange },
            { key: 'estable', label: 'Estable', color: '#27AE60' },
            { key: 'herido',  label: 'Herido',  color: '#F39C12' },
            { key: 'grave',   label: 'Grave',   color: '#E74C3C' },
          ].map(({ key, label, color }, idx, arr) => {
            const isActive = filtro === key && !mostrarAsociaciones;
            // Cuenta desde el total (respetando especie) sin aplicar el
            // filtro de condición activo — así el número no "desaparece"
            // al elegir esa misma pestaña.
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
              <TouchableOpacity key={key} onPress={() => handleSetFiltro(key)}
                style={{ flex: 1, paddingVertical: 8, alignItems: 'center',
                  backgroundColor: isActive ? color : 'transparent',
                  borderRightWidth: idx < arr.length - 1 ? 1 : 0, borderRightColor: '#F0E8DC' }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: isActive ? '#FFF' : color, lineHeight: 12 }}>{label}</Text>
                <Text style={{ fontSize: 11, fontWeight: '900', color: isActive ? 'rgba(255,255,255,0.9)' : COLORS.textDark, marginTop: 1 }}>{count}</Text>
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
          ].map(({ key, icon, label }) => {
            const especieActiva = filtroEspecie === key && !mostrarAsociaciones;
            return (
            <TouchableOpacity key={key} onPress={() => handleSetFiltroEspecie(key)}
              style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1.5,
                borderColor: COLORS.teal, backgroundColor: especieActiva ? COLORS.teal : 'transparent',
                flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Image source={{ uri: icon }} style={{ width: 14, height: 14, tintColor: especieActiva ? '#FFF' : COLORS.teal }} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: especieActiva ? '#FFF' : COLORS.teal }}>{label}</Text>
            </TouchableOpacity>
            );
          })}
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
          <TouchableOpacity onPress={handleToggleAsociaciones}
            style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5,
              borderColor: ASOC_COLOR, alignItems: 'center', justifyContent: 'center',
              backgroundColor: mostrarAsociaciones ? ASOC_COLOR : 'transparent' }}>
            <Ionicons name="home" size={14} color={mostrarAsociaciones ? '#FFF' : ASOC_COLOR} />
          </TouchableOpacity>
        </View>
      </View>
      }

      {/* Leyenda — bajada de top:50 a top:145 para no chocar con la nueva
          barra de filtros (que ahora ocupa esa esquina superior) */}
      {contentMode === 'rescues' && <View style={{
        position: 'absolute', top: 214, right: 16,
        backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, padding: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6,
      }}>
        <Text style={{ fontSize: 9, fontWeight: '800', color: COLORS.textDark, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Condición
        </Text>
        {Object.entries(CONDICION_CONFIG).map(([key, cfg]) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: cfg.color }} />
            <Text style={{ fontSize: 9, color: COLORS.textMid, fontWeight: '600' }}>{cfg.label}</Text>
          </View>
        ))}
      </View>
      }

      {/* Clock badge */}
      {contentMode === 'rescues' && lastUpdated && (
        <View style={{
          position: 'absolute', bottom: selectedReport ? 230 : 110, left: 16,
          backgroundColor: 'rgba(30,20,10,0.6)', borderRadius: 20,
          paddingVertical: 6, paddingHorizontal: 12,
          flexDirection: 'row', alignItems: 'center', gap: 6,
        }}>
          <Ionicons name="time-outline" size={13} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '600' }}>
            {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: es })}
          </Text>
        </View>
      )}

      {/* FAB */}
      {contentMode === 'rescues' && <TouchableOpacity
        onPress={handleCrearReporte}
        style={{
          position: 'absolute', bottom: selectedReport ? 230 : 100, right: 20,
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: COLORS.orange, alignItems: 'center', justifyContent: 'center',
          shadowColor: COLORS.orange, shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.45, shadowRadius: 12, elevation: 8,
        }}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
      }

      {/* Bottom Sheet */}
      {contentMode === 'rescues' && selectedReport && (() => {
        const r = selectedReport;
        const animalesSel = getAnimales(r);
        const totalSel = totalAnimales(animalesSel);
        const grave = animalMasGrave(animalesSel);
        const condCfg = getCfg(CONDICION_CONFIG, grave?.condicion ?? '');
        const estCfg  = getCfg(ESTADO_CONFIG, r.estado_reporte ?? '');
        const tipoLabel = grave?.tipo_animal
          ? grave.tipo_animal[0].toUpperCase() + grave.tipo_animal.slice(1)
          : 'Animal';

        return (
          <Animated.View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            transform: [{ translateY: sheetY }],
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.12, shadowRadius: 16, elevation: 12,
            paddingBottom: 32,
          }}>
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#E0D5C8' }} />
            </View>
            <TouchableOpacity onPress={hideSheet} style={{ position: 'absolute', top: 12, right: 16 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#F5F0E8', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="x" size={14} color={COLORS.textMid} />
              </View>
            </TouchableOpacity>
            <View style={{ position: 'absolute', top: 11, right: 54, zIndex: 5 }}>
              <ReportContentMenu
                reportId={r.id}
                compact
                onModerated={() => {
                  setReportes((actuales) => actuales.filter((item) => item.id !== r.id));
                  hideSheet();
                }}
              />
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View style={{ width: 80, height: 80, borderRadius: 14, overflow: 'visible', backgroundColor: condCfg.bg, flexShrink: 0 }}>
                  <View style={{ width: 80, height: 80, borderRadius: 14, overflow: 'hidden' }}>
                    {r.foto_url
                      ? <Image source={{ uri: r.foto_url }} style={{ width: 80, height: 80 }} resizeMode="cover" />
                      : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="paw" size={32} color={condCfg.color} />
                        </View>
                    }
                  </View>
                  {totalSel > 1 && (
                    <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: COLORS.textDark, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>{totalSel}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: COLORS.textDark, marginBottom: 4 }}>
                    {tipoLabel}{grave?.tamanio ? ` · ${grave.tamanio[0].toUpperCase() + grave.tamanio.slice(1)}` : ''}{totalSel > 1 ? ` · ${totalSel} animales` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <Ionicons name="location-sharp" size={11} color={COLORS.textLight} />
                    <Text style={{ fontSize: 11, color: COLORS.textLight }}>
                      {r.colonia ?? r.municipio ?? 'Sin ubicación'} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: es })}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={{ backgroundColor: condCfg.bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: condCfg.color, textTransform: 'uppercase', letterSpacing: 0.3 }}>{condCfg.label}</Text>
                    </View>
                    <View style={{ backgroundColor: estCfg.bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: estCfg.color, textTransform: 'uppercase', letterSpacing: 0.3 }}>{estCfg.label}</Text>
                    </View>
                  </View>
                </View>
              </View>
              {/* Detalles adicionales — navegable si el caso trae más de uno */}
              {animalesSel.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <AnimalCarousel key={r.id} animales={animalesSel} compact />
                </View>
              )}
              <View style={{ backgroundColor: '#FFF5EE', borderRadius: 10, padding: 8, marginTop: 12 }}>
                <Text style={{ fontSize: 10, color: COLORS.orange, fontStyle: 'italic' }}>
                  📍 Ubicación exacta protegida por privacidad
                </Text>
              </View>
            </View>
          </Animated.View>
        );
      })()}

      <AuthGateModal
        visible={isAuthGateVisible}
        onClose={() => setIsAuthGateVisible(false)}
        onGuest={() => { hideSheetImmediate(); setIsFormVisible(true); }}
      />

      <Modal visible={isFormVisible} animationType="slide" transparent onRequestClose={() => setIsFormVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
            <ReportFormScreen onClose={() => { setIsFormVisible(false); setTimeout(fetchReportes, 400); }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
