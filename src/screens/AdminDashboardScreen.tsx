import axios from 'axios';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from '../components/ui/Card';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

interface AsociacionPendiente {
  id: string;
  nombre: string;
  nombre_responsable: string;
  contacto_telefono: string;
  contacto_email: string;
  created_at: string;
}

// 1. Agregamos la interfaz para recibir onClose
interface Props {
  onClose?: () => void;
}

export default function AdminDashboardScreen({ onClose }: Props) {
  const { token, logout } = useAuth();
  const [asociaciones, setAsociaciones] = useState<AsociacionPendiente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rechazoActivo, setRechazoActivo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  const cargarPendientes = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/asociaciones-pendientes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAsociaciones(res.data);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'No pudimos cargar las asociaciones pendientes.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarPendientes();
  }, []);

  const handleAprobar = async (id: string) => {
    try {
      await axios.post(`${API_URL}/admin/asociaciones/${id}/aprobar`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAsociaciones((prev) => prev.filter((a) => a.id !== id));
      Alert.alert('Aprobada', 'La asociación fue aprobada y ya puede recibir reportes.');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'No pudimos aprobar la asociación.');
    }
  };

  const handleRechazar = async () => {
    if (!rechazoActivo || !motivo.trim()) {
      Alert.alert('Falta el motivo', 'Escribe el motivo del rechazo.');
      return;
    }
    try {
      await axios.post(`${API_URL}/admin/asociaciones/${rechazoActivo}/rechazar`, { motivo: motivo.trim() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAsociaciones((prev) => prev.filter((a) => a.id !== rechazoActivo));
      setRechazoActivo(null);
      setMotivo('');
      Alert.alert('Rechazada', 'La asociación fue rechazada. El motivo quedó guardado para que lo vea.');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'No pudimos rechazar la asociación.');
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5' }}>
        <ActivityIndicator size="large" color="#3498DB" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>Panel de Administrador</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={{ color: '#E74C3C', fontSize: 13, fontWeight: '600' }}>Salir</Text>
          </TouchableOpacity>
          {/* Botón para cerrar la tarjeta */}
          {onClose && (
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#95A5A6' }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 16 }}>
          {asociaciones.length === 0
            ? 'No hay asociaciones pendientes de revisión.'
            : `${asociaciones.length} asociación(es) esperando revisión.`}
        </Text>

        {asociaciones.map((a) => (
          <Card key={a.id}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C3E50', marginBottom: 4 }}>{a.nombre}</Text>
            <Text style={{ fontSize: 13, color: '#566573', marginBottom: 2 }}>Responsable: {a.nombre_responsable}</Text>
            <Text style={{ fontSize: 13, color: '#566573', marginBottom: 2 }}>Tel: {a.contacto_telefono}</Text>
            <Text style={{ fontSize: 13, color: '#566573', marginBottom: 12 }}>Correo: {a.contacto_email}</Text>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => handleAprobar(a.id)}
                style={{ flex: 1, backgroundColor: '#27AE60', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Aprobar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRechazoActivo(a.id)}
                style={{ flex: 1, borderWidth: 1.5, borderColor: '#E74C3C', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
              >
                <Text style={{ color: '#E74C3C', fontWeight: '700' }}>Rechazar</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}
      </ScrollView>

      <Modal visible={rechazoActivo !== null} transparent animationType="fade" onRequestClose={() => setRechazoActivo(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C3E50', marginBottom: 12 }}>
              Motivo del rechazo
            </Text>
            <TextInput
              placeholder="Explica por qué se rechaza esta asociación..."
              value={motivo}
              onChangeText={setMotivo}
              multiline
              numberOfLines={4}
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, marginBottom: 16, minHeight: 90, textAlignVertical: 'top', color: '#2C3E50' }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => { setRechazoActivo(null); setMotivo(''); }}
                style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#95A5A6', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRechazar}
                style={{ flex: 1, backgroundColor: '#E74C3C', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Confirmar rechazo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}