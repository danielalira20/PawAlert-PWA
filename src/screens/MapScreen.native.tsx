import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useEffect, useState } from 'react';
import { Dimensions, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import AuthGateModal from '../components/AuthGateModal';
import { Card } from '../components/ui/Card';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { Reporte } from '../types/reporte';
import ReportFormScreen from './ReportFormScreen';

const { width, height } = Dimensions.get('window');

const INITIAL_REGION: Region = {
  latitude: 19.0414,
  longitude: -98.2063,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapScreen() {
  const { isLoggedIn } = useAuth();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [selectedReport, setSelectedReport] = useState<Reporte | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isAuthGateVisible, setIsAuthGateVisible] = useState(false);

  const handleCrearReporte = () => {
    if (isLoggedIn) {
      setIsFormVisible(true);
    } else {
      setIsAuthGateVisible(true);
    }
  };

  useEffect(() => {
    const fetchReportes = async () => {
      try {
        const response = await axios.get(`${API_URL}/reports`);
        const validReports = response.data.filter((r: Reporte) => r.latitud && r.longitud);
        setReportes(validReports);
      } catch (error) {
        console.error("Error cargando reportes reales:", error);
      }
    };
    fetchReportes();
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
    <View style={{ flex: 1, backgroundColor: 'white' }}>

      <MapView
        style={{ width, height }}
        initialRegion={INITIAL_REGION}
        onPress={() => setSelectedReport(null)}
      >
        {reportes.map((reporte) => (
          <Marker
            key={reporte.id}
            coordinate={{
              latitude: reporte.latitud as number,
              longitude: reporte.longitud as number,
            }}
            pinColor={getMarkerColor(reporte.estado_reporte ?? '')}
            onPress={(e) => {
              e.stopPropagation();
              setSelectedReport(reporte);
            }}
          />
        ))}
      </MapView>

      {selectedReport && (
        <View style={{ position: 'absolute', bottom: 32, width: '100%', paddingHorizontal: 16, zIndex: 1000 }}>
          <Card className="m-0 shadow-lg border-0 p-3">
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image
                source={{ uri: selectedReport.foto_url ?? undefined }}
                style={{ width: 96, height: 96, borderRadius: 12 }}
                resizeMode="cover"
              />
              <View style={{ flex: 1, marginLeft: 16, justifyContent: 'center' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ backgroundColor: getMarkerColor(selectedReport.estado_reporte ?? ''), color: 'white', fontSize: 10, fontWeight: 'bold', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 }}>
                    {getEstadoLabel(selectedReport.estado_reporte ?? '')}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ backgroundColor: getCondicionColor(selectedReport.condicion ?? ''), width: 10, height: 10, borderRadius: 5, marginRight: 4 }} />
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>Salud</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: '#1F2937', fontWeight: '600', marginBottom: 4 }}>
                  Reportado {formatDistanceToNow(new Date(selectedReport.created_at), { addSuffix: true, locale: es })}
                </Text>
                <Text style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>
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

      <Modal visible={isFormVisible} animationType="slide" transparent onRequestClose={() => setIsFormVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
            <ReportFormScreen onClose={() => setIsFormVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}