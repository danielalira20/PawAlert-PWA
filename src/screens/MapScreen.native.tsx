import { Feather, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Callout, Region } from 'react-native-maps';
import { TrackedMarker } from './TrackedMarker';
import AuthGateModal from '../components/AuthGateModal';
import { ICON_CAT, ICON_CLOCK, ICON_CALENDAR, ICON_DOG, ICON_PAW, ICON_WARNING } from '../constants/mapIcons';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { Reporte, getAnimales, condicionMasGrave, especieMasGrave, totalAnimales, animalMasGrave } from '../types/reporte';
import ReportFormScreen from './ReportFormScreen';

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

  const iconUri = tipo === 'perro' ? ICON_DOG : tipo === 'gato' ? ICON_CAT : ICON_PAW;

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

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MapScreen() {
  const { isLoggedIn } = useAuth();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [selectedReport, setSelectedReport] = useState<Reporte | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isAuthGateVisible, setIsAuthGateVisible] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  // ── Filtros — portados de MapScreen.web.tsx ──────────────────────────────
  const [filtro, setFiltro] = useState('todos');
  const [filtroEspecie, setFiltroEspecie] = useState('todos');
  const [ordenar, setOrdenar] = useState('reciente');

  const sheetY = useRef(new Animated.Value(300)).current;

  const showSheet = () =>
    Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 200 }).start();

  const hideSheet = () =>
    Animated.timing(sheetY, { toValue: 300, duration: 220, useNativeDriver: true }).start(() => setSelectedReport(null));

  const fetchReportes = async () => {
    try {
      const response = await axios.get(`${API_URL}/reports`);
      const validReports = response.data.filter((r: Reporte) => r.latitud && r.longitud);
      setReportes(validReports);
      setLastUpdated(new Date());
    } catch {}
  };

  useEffect(() => {
    fetchReportes();
    const fetchInterval = setInterval(fetchReportes, 600000);
    const tickInterval = setInterval(() => setTick(t => t + 1), 60000);
    return () => { clearInterval(fetchInterval); clearInterval(tickInterval); };
  }, []);

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

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ width, height }}
        initialRegion={INITIAL_REGION}
        onPress={() => { if (selectedReport) hideSheet(); }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {reportesFiltrados.map(reporte => {
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
      </MapView>

      {/* Barra de filtros interactivos — portada de MapScreen.web.tsx.
          Reemplaza al chip simple de "X reportes activos" que había antes
          (ese conteo ya lo muestra el pill "Todos" de aquí abajo). */}
      <View style={{
        position: 'absolute', top: 50, left: 12, right: 12,
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
            const isActive = filtro === key;
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
              <TouchableOpacity key={key} onPress={() => setFiltro(key)}
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
          ].map(({ key, icon, label }) => (
            <TouchableOpacity key={key} onPress={() => setFiltroEspecie(key)}
              style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1.5,
                borderColor: COLORS.teal, backgroundColor: filtroEspecie === key ? COLORS.teal : 'transparent',
                flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Image source={{ uri: icon }} style={{ width: 14, height: 14, tintColor: filtroEspecie === key ? '#FFF' : COLORS.teal }} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: filtroEspecie === key ? '#FFF' : COLORS.teal }}>{label}</Text>
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

      {/* Leyenda — bajada de top:50 a top:145 para no chocar con la nueva
          barra de filtros (que ahora ocupa esa esquina superior) */}
      <View style={{
        position: 'absolute', top: 145, right: 16,
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

      {/* Clock badge */}
      {lastUpdated && (
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
      <TouchableOpacity
        onPress={() => isLoggedIn ? setIsFormVisible(true) : setIsAuthGateVisible(true)}
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

      {/* Bottom Sheet */}
      {selectedReport && (() => {
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
              {/* Detalles adicionales */}
              {(grave?.sexo || grave?.edad_aproximada || grave?.descripcion) && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {grave?.sexo && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#FFFAF6', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="information-circle-outline" size={14} color="#5C4A3A" />
                      </View>
                      <Text style={{ fontSize: 12, color: '#5C4A3A' }}>Sexo: {grave.sexo}</Text>
                    </View>
                  )}
                  {grave?.edad_aproximada && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#FFFAF6', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="calendar-outline" size={14} color="#5C4A3A" />
                      </View>
                      <Text style={{ fontSize: 12, color: '#5C4A3A' }}>Edad: {grave.edad_aproximada}</Text>
                    </View>
                  )}
                  {grave?.descripcion && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#FFFAF6', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Ionicons name="document-text-outline" size={14} color="#5C4A3A" />
                      </View>
                      <Text style={{ fontSize: 12, color: '#5C4A3A', flex: 1, lineHeight: 18, paddingTop: 4 }}>{grave.descripcion}</Text>
                    </View>
                  )}
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
        onGuest={() => setIsFormVisible(true)}
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