import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Dimensions, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import AuthGateModal from '../components/AuthGateModal';
import { Card } from '../components/ui/Card';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { Reporte } from '../types/reporte';
import AssociationFormScreen from './AssociationFormScreen';
import ReportFormScreen from './ReportFormScreen';

const { width, height } = Dimensions.get('window');

const INITIAL_REGION: Region = {
  latitude: 19.0414,
  longitude: -98.2063,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapScreen() {
  const { user, isLoggedIn, logout } = useAuth();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [selectedReport, setSelectedReport] = useState<Reporte | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isAuthGateVisible, setIsAuthGateVisible] = useState(false);
  const [isAssociationFormVisible, setIsAssociationFormVisible] = useState(false);

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

      {/* Botón de auth — esquina superior derecha */}
      <View style={{ position: 'absolute', top: 60, right: 16, zIndex: 2000, flexDirection: 'row', gap: 8 }}>
        {isLoggedIn && user ? (
          <>
            <View style={{ backgroundColor: '#1ABC9C', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 30, elevation: 5 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{user.nombre}</Text>
            </View>
            <TouchableOpacity onPress={logout} style={{ backgroundColor: '#E74C3C', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 30, elevation: 5 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Salir</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity onPress={() => router.push('/login')} style={{ backgroundColor: '#1ABC9C', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 30, elevation: 5 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Iniciar sesión</Text>
          </TouchableOpacity>
        )}
      </View>

      <MapView
        style={{ width, height }}
        initialRegion={INITIAL_REGION}
        onPress={() => setSelectedReport(null)}
      >
        {reportes.map((reporte) => (
          <Marker
            key={reporte.id}
            coordinate={{
              latitude: reporte.latitud,
              longitude: reporte.longitud,
            }}
            pinColor={getMarkerColor(reporte.estado_reporte)}
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
                source={{ uri: selectedReport.foto_url }}
                style={{ width: 96, height: 96, borderRadius: 12 }}
                resizeMode="cover"
              />
              <View style={{ flex: 1, marginLeft: 16, justifyContent: 'center' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ backgroundColor: getMarkerColor(selectedReport.estado_reporte), color: 'white', fontSize: 10, fontWeight: 'bold', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 }}>
                    {getEstadoLabel(selectedReport.estado_reporte)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ backgroundColor: getCondicionColor(selectedReport.condicion), width: 10, height: 10, borderRadius: 5, marginRight: 4 }} />
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

      <TouchableOpacity
        onPress={handleCrearReporte}
        style={{
          position: 'absolute',
          bottom: selectedReport ? 140 : 30,
          right: 20,
          backgroundColor: '#3498DB',
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 30,
          elevation: 5,
          zIndex: 1000,
        }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
          + Crear Reporte
        </Text>
      </TouchableOpacity>

      <Modal visible={isFormVisible} animationType="slide" transparent onRequestClose={() => setIsFormVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
            <ReportFormScreen onClose={() => setIsFormVisible(false)} />
          </View>
        </View>
      </Modal>

      <TouchableOpacity
        onPress={() => setIsAssociationFormVisible(true)}
        style={{
          position: 'absolute',
          bottom: selectedReport ? 140 : 30,
          right: 20,
          marginBottom: 60,
          backgroundColor: '#27AE60',
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 30,
          elevation: 5,
          zIndex: 1000,
        }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
          + Registrar Asociación
        </Text>
      </TouchableOpacity>

      <Modal visible={isAssociationFormVisible} animationType="slide" transparent onRequestClose={() => setIsAssociationFormVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
            <AssociationFormScreen onClose={() => setIsAssociationFormVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}