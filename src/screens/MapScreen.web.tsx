import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Dimensions, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../components/ui/Card';
import { API_URL } from '../constants/api';
import AssociationFormScreen from './AssociationFormScreen';
import ReportFormScreen from './ReportFormScreen';
import { Reporte } from '../types/reporte';


const LeafletMap = lazy(() => import('./LeafletMap'));

const { width, height } = Dimensions.get('window');

export default function MapScreen() {
  const [isClient, setIsClient] = useState(false);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [selectedReport, setSelectedReport] = useState<Reporte | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isAssociationFormVisible, setIsAssociationFormVisible] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const fetchReportes = async () => {
      try {
        const response = await axios.get(`${API_URL}/reports`);
        // Filtramos solo los reportes que tienen latitud y longitud válidas para el mapa
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
    <View className="flex-1 bg-white">
      {isClient ? (
        <Suspense fallback={<View style={{ width, height, backgroundColor: '#E5E7EB' }} />}>
          <LeafletMap
            reportes={reportes}
            getMarkerColor={getMarkerColor}
            onSelectReport={setSelectedReport}
            onMapClick={() => setSelectedReport(null)}
            width={width}
            height={height}
          />
        </Suspense>
      ) : (
        <View style={{ width, height, backgroundColor: '#E5E7EB' }} />
      )}

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
                  <Text style={{ backgroundColor: getMarkerColor(selectedReport.estado_reporte) }} className="text-white text-[10px] font-bold py-1 px-2 rounded-lg overflow-hidden">
                    {getEstadoLabel(selectedReport.estado_reporte)}
                  </Text>
                  <View className="flex-row items-center">
                    <View style={{ backgroundColor: getCondicionColor(selectedReport.condicion) }} className="w-2.5 h-2.5 rounded-full mr-1" />
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

      <TouchableOpacity
        onPress={() => setIsFormVisible(true)}
        style={{ position: 'absolute', bottom: selectedReport ? 140 : 30, right: 20, backgroundColor: '#3498DB', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5, zIndex: 1000 }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>+ Crear Reporte</Text>
      </TouchableOpacity>

      <Modal visible={isFormVisible} animationType="slide" transparent={true} onRequestClose={() => setIsFormVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
            <ReportFormScreen onClose={() => setIsFormVisible(false)} />
          </View>
        </View>
      </Modal>

      <TouchableOpacity
        onPress={() => setIsAssociationFormVisible(true)}
        style={{ position: 'absolute', bottom: selectedReport ? 140 : 30, right: 20, marginBottom: 60, backgroundColor: '#27AE60', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5, zIndex: 1000 }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>+ Registrar Asociación</Text>
      </TouchableOpacity>

      <Modal visible={isAssociationFormVisible} animationType="slide" transparent={true} onRequestClose={() => setIsAssociationFormVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
            <AssociationFormScreen onClose={() => setIsAssociationFormVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}