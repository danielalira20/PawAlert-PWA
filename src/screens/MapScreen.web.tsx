import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import AuthGateModal from '../components/AuthGateModal';
import { Card } from '../components/ui/Card';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { Reporte } from '../types/reporte';
import ReportFormScreen from './ReportFormScreen';

const LeafletMap = lazy(() => import('./LeafletMap'));

const { width, height } = Dimensions.get('window');

export default function MapScreen() {
  const { isLoggedIn } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [selectedReport, setSelectedReport] = useState<Reporte | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isAuthGateVisible, setIsAuthGateVisible] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);
  const [refreshExpanded, setRefreshExpanded] = useState(false);
  const refreshWidth = useRef(new Animated.Value(40)).current;
  const refreshOpacity = useRef(new Animated.Value(0)).current;

  const expandRefresh = () => {
    Animated.parallel([
      Animated.spring(refreshWidth, { toValue: 210, useNativeDriver: false }),
      Animated.timing(refreshOpacity, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start();
    setRefreshExpanded(true);
  };

  const collapseRefresh = () => {
    Animated.parallel([
      Animated.spring(refreshWidth, { toValue: 40, useNativeDriver: false }),
      Animated.timing(refreshOpacity, { toValue: 0, duration: 100, useNativeDriver: false }),
    ]).start();
    setRefreshExpanded(false);
  };

  const handleCrearReporte = () => {
    if (isLoggedIn) {
      setIsFormVisible(true);
    } else {
      setIsAuthGateVisible(true);
    }
  };

  const fetchReportes = async () => {
    try {
      const response = await axios.get(`${API_URL}/reports`);
      const validReports = response.data.filter((r: Reporte) => r.latitud && r.longitud);
      setReportes(validReports);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error cargando reportes reales:", error);
    }
  };

  useEffect(() => {
    setIsClient(true);
    fetchReportes();
    const fetchInterval = setInterval(fetchReportes, 600000);
    const tickInterval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => {
      clearInterval(fetchInterval);
      clearInterval(tickInterval);
    };
  }, []);

  const getMarkerColor = (estado: string) => {
    switch (estado) {
      case 'pendiente': return 'orange';
      case 'asignado': return 'green';
      case 'en_atencion': return 'blue';
      case 'cerrado': return 'gray';
      default: return 'orange';
    }
  };

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case 'pendiente': return 'ESPERANDO ASOCIACIÓN';
      case 'asignado': return 'ASOCIACIÓN ASIGNADA';
      case 'en_atencion': return 'EN CAMINO';
      case 'cerrado': return 'ATENDIDO';
      default: return estado.toUpperCase();
    }
  };

  const getCondicionColor = (condicion: string) => {
    switch (condicion) {
      case 'green': return '#27AE60';
      case 'yellow': return '#F39C12';
      case 'red': return '#E74C3C';
      default: return '#BDC3C7';
    }
  };

  return (
    <View className="flex-1 bg-white">
      {isClient ? (
        <Suspense fallback={<View style={{ width, height, backgroundColor: '#E5E7EB' }} />}>
          <LeafletMap
            reportes={reportes.filter(r => r.estado_reporte !== 'rescatado')}
            getMarkerColor={getMarkerColor}
            onSelectReport={setSelectedReport}
            onMapClick={() => { setSelectedReport(null); collapseRefresh(); }}
            width={width}
            height={height}
          />
        </Suspense>
      ) : (
        <View style={{ width, height, backgroundColor: '#E5E7EB' }} />
      )}

      {lastUpdated && (
        <TouchableOpacity
          onPress={() => refreshExpanded ? collapseRefresh() : expandRefresh()}
          style={{ position: 'absolute', bottom: 60, left: 20, zIndex: 1000 }}
          activeOpacity={0.8}
        >
          <Animated.View style={{ width: refreshWidth, height: 40, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', paddingHorizontal: 10 }}>
            <Ionicons name="time-outline" size={20} color="#FFFFFF" />
            <Animated.Text style={{ color: '#FFFFFF', fontSize: 12, marginLeft: 6, opacity: refreshOpacity }} numberOfLines={1}>
              {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: es })}
            </Animated.Text>
          </Animated.View>
        </TouchableOpacity>
      )}

      {/* Leyenda de Colores - Superior Derecha */}
      <View style={{ position: 'absolute', top: 20, right: 20, backgroundColor: 'white', borderRadius: 12, padding: 12, zIndex: 999, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#1F2937', marginBottom: 8 }}>Condición</Text>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#27AE60', marginRight: 6 }} />
          <Text style={{ fontSize: 10, color: '#4B5563' }}>Estable</Text>
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#F39C12', marginRight: 6 }} />
          <Text style={{ fontSize: 10, color: '#4B5563' }}>Herido</Text>
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#E74C3C', marginRight: 6 }} />
          <Text style={{ fontSize: 10, color: '#4B5563' }}>Grave</Text>
        </View>
      </View>

      {selectedReport && (
        <View className="absolute bottom-8 w-full px-4" style={{ zIndex: 1000 }}>
          <Card className="m-0 mb-0 shadow-lg border-0 p-3">
            <View className="flex-row items-center">
              <Image
                source={{ uri: selectedReport.foto_url }}
                className="w-24 h-24 rounded-xl"
                resizeMode="cover"
              />
              <View className="flex-1 ml-4 justify-center">
                <View className="flex-row justify-between items-center mb-2">
                  <Text
                    style={{ backgroundColor: getMarkerColor(selectedReport.estado_reporte) }}
                    className="text-white text-[10px] font-bold py-1 px-2 rounded-lg overflow-hidden"
                  >
                    {getEstadoLabel(selectedReport.estado_reporte)}
                  </Text>
                  <View className="flex-row items-center">
                    <View
                      style={{ backgroundColor: getCondicionColor(selectedReport.condicion) }}
                      className="w-2.5 h-2.5 rounded-full mr-1"
                    />
                    <Text className="text-xs text-gray-500 font-medium">Salud</Text>
                  </View>
                </View>
                <Text className="text-[13px] text-gray-800 font-semibold mb-1">
                  Reportado {formatDistanceToNow(new Date(selectedReport.created_at), { addSuffix: true, locale: es })}
                </Text>
                <Text className="text-[11px] text-gray-400 italic">
                  Ubicación exacta protegida por privacidad.
                </Text>
              </View>
            </View>
          </Card>
        </View>
      )}

      <AuthGateModal
        visible={isAuthGateVisible}
        onClose={() => setIsAuthGateVisible(false)}
        onGuest={() => setIsFormVisible(true)}
      />

      {/* FAB: + Crear Reporte (Circular y con iconos) */}
      <TouchableOpacity
        onPress={handleCrearReporte}
        style={{
          position: 'absolute',
          bottom: selectedReport ? 160 : 40,
          right: 20,
          backgroundColor: '#3498DB',
          width: 64,
          height: 64,
          borderRadius: 32,
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'row',
          elevation: 6,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          zIndex: 1000,
        }}
      >
        <Ionicons name="paw" size={20} color="#FFFFFF" style={{ marginRight: -4 }} />
        <Ionicons name="add" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal
        visible={isFormVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsFormVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
            <ReportFormScreen
              onClose={() => {
                setIsFormVisible(false);
                setTimeout(fetchReportes, 400);
              }}
            />
          </View>
        </View>
      </Modal>

    </View>
  );
}