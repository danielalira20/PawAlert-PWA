import axios from 'axios';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Toast, useToast } from '../components/Toast';
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

// interfaz para apelaciones 
interface Apelacion {
  id: string;
  mensaje: string;
  documentos_urls: string[];
  estado: string;
  created_at: string;
  asociaciones: {
    id: string;
    nombre: string;
    nombre_responsable: string;
    contacto_email: string;
    motivo_rechazo: string;
  };
}

// 1. Agregamos la interfaz para recibir onClose
interface Props {
  onClose?: () => void;
}

export default function AdminDashboardScreen({ onClose }: Props) {
  const { token, logout } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const [asociaciones, setAsociaciones] = useState<AsociacionPendiente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rechazoActivo, setRechazoActivo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  //estados para apelaciones 
  const [apelaciones, setApelaciones] = useState<Apelacion[]>([]);
  const [apelacionActiva, setApelacionActiva] = useState<Apelacion | null>(null);
  const [respuestaApelacion, setRespuestaApelacion] = useState('');
  const [isResolviendo, setIsResolviendo] = useState(false);
  
  const cargarPendientes = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/asociaciones-pendientes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAsociaciones(res.data);
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos cargar las asociaciones pendientes.' });
    } finally {
      setIsLoading(false);
    }
  };

    //funcion para cargar y resolver apleaciones
  const cargarApelaciones = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/apelaciones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setApelaciones(res.data);
    } catch (error: any) {
      console.log('Error al cargar apelaciones', error);
    }
  };

  const resolverApelacion = async (decision: 'aprobar' | 'rechazar') => {
    if (!apelacionActiva) return;
    setIsResolviendo(true);
    try {
      await axios.patch(
        `${API_URL}/admin/apelaciones/${apelacionActiva.id}`,
        { decision, respuesta: respuestaApelacion.trim() || null },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setApelaciones(prev => prev.filter(a => a.id !== apelacionActiva.id));
      setApelacionActiva(null);
      setRespuestaApelacion('');
      showToast({ 
        type: 'success', 
        title: decision === 'aprobar' ? 'Apelación aprobada' : 'Apelación rechazada', 
        message: decision === 'aprobar' ? 'La asociación fue verificada.' : 'La apelación fue rechazada.' 
      });
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos procesar la apelación.' });
    } finally {
      setIsResolviendo(false);
    }
  };

  useEffect(() => {
    cargarPendientes();
    cargarApelaciones();
  }, []);

  const handleAprobar = async (id: string) => {
    try {
      await axios.post(`${API_URL}/admin/asociaciones/${id}/aprobar`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAsociaciones((prev) => prev.filter((a) => a.id !== id));
      showToast({ type: 'success', title: 'Aprobada', message: 'La asociación fue aprobada y ya puede recibir reportes.' });
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos aprobar la asociación.' });
    }
  };

  const handleRechazar = async () => {
    if (!rechazoActivo || !motivo.trim()) {
      showToast({ type: 'warning', title: 'Falta el motivo', message: 'Escribe el motivo del rechazo.' });
      return;
    }
    try {
      await axios.post(`${API_URL}/admin/asociaciones/${rechazoActivo}/rechazar`, { motivo: motivo.trim() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAsociaciones((prev) => prev.filter((a) => a.id !== rechazoActivo));
      setRechazoActivo(null);
      setMotivo('');
      showToast({ type: 'info', title: 'Rechazada', message: 'La asociación fue rechazada. El motivo quedó guardado para que lo vea.' });
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos rechazar la asociación.' });
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
      <Toast toast={toast} translateY={translateY} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>Panel de Administrador</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          
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

        {apelaciones.length > 0 && (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>
                Apelaciones pendientes
              </Text>
              <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 16 }}>
                {apelaciones.length} apelación(es) esperando revisión.
              </Text>

              {apelaciones.map((a) => (
                <Card key={a.id}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C3E50', marginBottom: 4 }}>
                    {a.asociaciones?.nombre}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#566573', marginBottom: 2 }}>
                    Responsable: {a.asociaciones?.nombre_responsable}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#566573', marginBottom: 2 }}>
                    Correo: {a.asociaciones?.contacto_email}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#E74C3C', marginBottom: 8 }}>
                    Motivo rechazo: {a.asociaciones?.motivo_rechazo}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#2C3E50', marginBottom: 12, lineHeight: 18 }}>
                    Mensaje: {a.mensaje}
                  </Text>

                  {a.documentos_urls && a.documentos_urls.length > 0 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#34495E', marginBottom: 6 }}>
                        Documentos adjuntos:
                      </Text>
                      {a.documentos_urls.map((url, idx) => (
                        <TouchableOpacity 
                          key={idx} 
                          onPress={() => Linking.openURL(url)}
                          style={{ padding: 8, backgroundColor: '#EBF5FB', borderRadius: 6, marginBottom: 4 }}
                        >
                          <Text style={{ fontSize: 13, color: '#3498DB' }}>Documento {idx + 1} — Ver</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setApelacionActiva(a)}
                      style={{ flex: 1, backgroundColor: '#3498DB', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                    >
                      <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Revisar</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              ))}
            </View>
          )}
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

      {/* Modal de apelacion */}
      <Modal visible={apelacionActiva !== null} transparent animationType="fade" onRequestClose={() => setApelacionActiva(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C3E50', marginBottom: 4 }}>
              {apelacionActiva?.asociaciones?.nombre}
            </Text>
            <Text style={{ fontSize: 13, color: '#566573', marginBottom: 12 }}>
              {apelacionActiva?.mensaje}
            </Text>
            <TextInput
              placeholder="Respuesta para la asociación (Opcional)..."
              value={respuestaApelacion}
              onChangeText={setRespuestaApelacion}
              multiline
              numberOfLines={3}
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, marginBottom: 16, minHeight: 70, textAlignVertical: 'top', color: '#2C3E50' }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => resolverApelacion('rechazar')}
                disabled={isResolviendo}
                style={{ flex: 1, borderWidth: 1.5, borderColor: '#E74C3C', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
              >
                <Text style={{ color: '#E74C3C', fontWeight: '700' }}>Rechazar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => resolverApelacion('aprobar')}
                disabled={isResolviendo}
                style={{ flex: 1, backgroundColor: '#27AE60', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
              >
                {isResolviendo ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '700' }}>Aprobar</Text>}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => { setApelacionActiva(null); setRespuestaApelacion(''); }}
              style={{ alignItems: 'center', marginTop: 12 }}
            >
              <Text style={{ color: '#95A5A6', fontSize: 13 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}