import axios from 'axios';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

interface AsociacionInfo {
  id: string;
  nombre: string;
  estado: 'pendiente' | 'rechazada' | 'aprobada';
  motivo_rechazo: string | null;
}

interface ReporteAsignado {
  id: string;
  estado_reporte: string;
  municipio: string | null;
  colonia: string | null;
  calle: string | null;
  created_at: string;
  foto_url: string | null;
  animal: {
    tipo_animal: string | null;
    condicion: string | null;
    tamanio: string | null;
    sexo: string | null;
    edad_aproximada: string | null;
    descripcion: string | null;
  };
}

export default function AssociationStatusScreen() {
  const { token, logout } = useAuth();
  const [info, setInfo] = useState<AsociacionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [nombreRep, setNombreRep] = useState('');
  const [apellidoRep, setApellidoRep] = useState('');
  const [telefonoRep, setTelefonoRep] = useState('');
  const [emailRep, setEmailRep] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [reportes, setReportes] = useState<ReporteAsignado[]>([]);
  const [isLoadingReportes, setIsLoadingReportes] = useState(false);

  const cargarReportes = async () => {
    setIsLoadingReportes(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/reportes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReportes(res.data);
    } catch {
      // Si falla no bloqueamos la pantalla
    } finally {
      setIsLoadingReportes(false);
    }
  };

  const handleCambiarEstadoReporte = async (reporteId: string, nuevoEstado: string) => {
  try {
    await axios.patch(
      `${API_URL}/reports/${reporteId}/status`,
      { estado: nuevoEstado }, 
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await cargarReportes();
  } catch (error: any) {
    Alert.alert('Error', error?.response?.data?.detail || 'No pudimos actualizar el reporte.');
  }
};
  const cargarEstado = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInfo(res.data);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'No pudimos cargar el estado de tu asociación.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarEstado();
  }, []);

  useEffect(() => {
  if (info?.estado === 'aprobada') {
    cargarReportes();
  }
}, [info]);

  const handleAgregarRepresentante = async () => {
    if (!nombreRep.trim() || !apellidoRep.trim() || !telefonoRep.trim()) {
      Alert.alert('Datos incompletos', 'Nombre, apellido y teléfono son obligatorios.');
      return;
    }
    if (!info) return;
    setIsAdding(true);
    try {
      await axios.post(
        `${API_URL}/associations/${info.id}/representantes`,
        {
          nombre: nombreRep.trim(),
          apellido_paterno: apellidoRep.trim(),
          telefono: telefonoRep.replace(/\s|-/g, ''),
          email: emailRep.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert('¡Listo!', 'Esa persona ya puede registrarse con ese mismo teléfono para tener acceso.');
      setNombreRep('');
      setApellidoRep('');
      setTelefonoRep('');
      setEmailRep('');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'No pudimos agregar al representante.');
    } finally {
      setIsAdding(false);
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

  if (!info) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5', padding: 24 }}>
        <Text style={{ fontSize: 14, color: '#7F8C8D', textAlign: 'center', marginBottom: 16 }}>
          No pudimos cargar la información de tu asociación.
        </Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={{ color: '#E74C3C', fontWeight: '600' }}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F5F5F5' }} contentContainerStyle={{ padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>{info.nombre}</Text>
      <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 24 }}>Estado de tu asociación</Text>

      {info.estado === 'pendiente' && (
        <Card>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#F39C12', marginBottom: 8 }}>
            En revisión
          </Text>
          <Text style={{ fontSize: 14, color: '#566573', lineHeight: 20 }}>
            Tu asociación está siendo revisada por nuestro equipo. Te avisaremos en cuanto sea aprobada
            y puedas empezar a recibir reportes.
          </Text>
        </Card>
      )}

      {info.estado === 'rechazada' && (
        <Card>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#E74C3C', marginBottom: 8 }}>
            Solicitud rechazada
          </Text>
          <Text style={{ fontSize: 14, color: '#566573', lineHeight: 20 }}>
            {info.motivo_rechazo || 'No se especificó un motivo. Contáctanos para más información.'}
          </Text>
        </Card>
      )}

      {info.estado === 'aprobada' && (
        <>
          <Card>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#27AE60', marginBottom: 8 }}>
              Asociación activa
            </Text>
            <Text style={{ fontSize: 14, color: '#566573', lineHeight: 20 }}>
              Tu asociación ya puede recibir reportes de animales en tu zona.
            </Text>
          </Card>

          <Card>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>
              Reportes asignados
            </Text>
            <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>
              Animales en tu zona que esperan atención.
            </Text>

            {isLoadingReportes ? (
              <ActivityIndicator size="small" color="#3498DB" />
            ) : reportes.length === 0 ? (
              <Text style={{ fontSize: 14, color: '#95A5A6', textAlign: 'center', paddingVertical: 16 }}>
                No hay reportes asignados por el momento.
              </Text>
            ) : (
              reportes.map((reporte) => (
                <View key={reporte.id} style={{
                  borderWidth: 1, borderColor: '#ECF0F1', borderRadius: 12,
                  marginBottom: 12, overflow: 'hidden'
                }}>
                  {reporte.foto_url && (
                    <Image
                      source={{ uri: reporte.foto_url }}
                      style={{ width: '100%', height: 160 }}
                      resizeMode="cover"
                    />
                  )}
                  <View style={{ padding: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C3E50', textTransform: 'capitalize' }}>
                        {reporte.animal?.tipo_animal || 'Animal'}
                      </Text>
                      <View style={{
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                        backgroundColor:
                          reporte.animal?.condicion === 'grave' ? '#FADBD8' :
                          reporte.animal?.condicion === 'herido' ? '#FDEBD0' : '#EAFAF1'
                      }}>
                        <Text style={{
                          fontSize: 11, fontWeight: '600', textTransform: 'capitalize',
                          color:
                            reporte.animal?.condicion === 'grave' ? '#E74C3C' :
                            reporte.animal?.condicion === 'herido' ? '#F39C12' : '#27AE60'
                        }}>
                          {reporte.animal?.condicion || 'desconocida'}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 4 }}>
                      {[reporte.calle, reporte.colonia, reporte.municipio].filter(Boolean).join(', ')}
                    </Text>

                    <Text style={{ fontSize: 11, color: '#BDC3C7', marginBottom: 12 }}>
                      {new Date(reporte.created_at).toLocaleDateString('es-MX', {
                        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
                      })}
                    </Text>

                    {reporte.estado_reporte === 'asignado' && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => handleCambiarEstadoReporte(reporte.id, 'en_atencion')}
                          style={{ flex: 1, backgroundColor: '#3498DB', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                        >
                          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Aceptar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleCambiarEstadoReporte(reporte.id, 'pendiente')}
                          style={{ flex: 1, borderWidth: 1.5, borderColor: '#E74C3C', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                        >
                          <Text style={{ color: '#E74C3C', fontWeight: '700', fontSize: 13 }}>Rechazar</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {reporte.estado_reporte === 'en_atencion' && (
                      <View style={{ backgroundColor: '#EAF6FF', padding: 8, borderRadius: 8 }}>
                        <Text style={{ fontSize: 12, color: '#3498DB', fontWeight: '600', textAlign: 'center' }}>
                          En atención
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </Card>

          <Card>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>
              Agregar representante
            </Text>
            <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>
              Esa persona podrá iniciar sesión registrándose con el mismo teléfono que pongas aquí.
            </Text>
            <Input label="Nombre(s)" placeholder="Ej. Ana" value={nombreRep} onChangeText={setNombreRep} />
            <Input label="Apellido" placeholder="Ej. Pérez" value={apellidoRep} onChangeText={setApellidoRep} />
            <Input label="Teléfono" placeholder="Ej. 2221234567" value={telefonoRep} onChangeText={setTelefonoRep} keyboardType="numeric" maxLength={10} />
            <Input label="Correo (Opcional)" placeholder="Ej. correo@ejemplo.com" value={emailRep} onChangeText={setEmailRep} keyboardType="email-address" autoCapitalize="none" />
            <Button label="Agregar representante" onPress={handleAgregarRepresentante} isLoading={isAdding} />
          </Card>
        </>
      )}

      <TouchableOpacity onPress={handleLogout} style={{ alignItems: 'center', marginTop: 8, marginBottom: 24 }}>
        <Text style={{ color: '#95A5A6', fontSize: 14 }}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}