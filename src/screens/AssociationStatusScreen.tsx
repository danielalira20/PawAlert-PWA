import axios from 'axios';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View, Modal, TextInput } from 'react-native';
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
  asignacion_id: string;
  reporte_id: string;
  estado_asignacion_clave: string;
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

type FiltroAsignacion = 'todas' | 'pendientes' | 'aceptadas' | 'rechazadas';

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
  const [filtro, setFiltro] = useState<FiltroAsignacion>('pendientes');

  // Modal Rechazo
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [reporteRechazoId, setReporteRechazoId] = useState<string | null>(null);
  const [notasRechazo, setNotasRechazo] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

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

  const handleAccionReporte = async (reporteId: string, accion: 'accept-staff' | 'reject-staff', notas: string = '') => {
    try {
      await axios.post(
        `${API_URL}/reports/${reporteId}/${accion}`,
        { notas },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await cargarReportes();
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'No pudimos actualizar el reporte.');
    }
  };

  const handleRechazarClick = (reporteId: string) => {
    setReporteRechazoId(reporteId);
    setNotasRechazo('');
    setShowRejectModal(true);
  };

  const confirmarRechazo = async () => {
    if (!reporteRechazoId) return;
    setIsRejecting(true);
    await handleAccionReporte(reporteRechazoId, 'reject-staff', notasRechazo);
    setIsRejecting(false);
    setShowRejectModal(false);
    setReporteRechazoId(null);
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

  const reportesFiltrados = reportes.filter((r) => {
    if (filtro === 'todas') return true;
    if (filtro === 'pendientes') return r.estado_asignacion_clave === 'notificada';
    if (filtro === 'aceptadas') return ['aceptada', 'completada'].includes(r.estado_asignacion_clave);
    if (filtro === 'rechazadas') return ['rechazada', 'cancelada'].includes(r.estado_asignacion_clave);
    return true;
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
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

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>
                Reportes asignados
              </Text>
              <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>
                Historial y casos pendientes en tu zona.
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['pendientes', 'aceptadas', 'rechazadas', 'todas'] as FiltroAsignacion[]).map((f) => (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setFiltro(f)}
                      style={{
                        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                        backgroundColor: filtro === f ? '#3498DB' : '#EAEDED'
                      }}
                    >
                      <Text style={{
                        fontSize: 13, fontWeight: '600', textTransform: 'capitalize',
                        color: filtro === f ? '#FFF' : '#7F8C8D'
                      }}>
                        {f}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {isLoadingReportes ? (
                <ActivityIndicator size="small" color="#3498DB" style={{ marginTop: 20 }} />
              ) : reportesFiltrados.length === 0 ? (
                <Text style={{ fontSize: 14, color: '#95A5A6', textAlign: 'center', paddingVertical: 16 }}>
                  No hay reportes en esta categoría.
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
                  {reportesFiltrados.map((reporte) => (
                    <View key={reporte.asignacion_id} style={{
                      width: '31%',
                      borderWidth: 1, borderColor: '#ECF0F1', borderRadius: 12,
                      marginBottom: 12, overflow: 'hidden', backgroundColor: '#FFF'
                    }}>
                      {reporte.foto_url ? (
                        <Image
                          source={{ uri: reporte.foto_url }}
                          style={{ width: '100%', aspectRatio: 1 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ width: '100%', aspectRatio: 1, backgroundColor: '#EAEDED', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#BDC3C7', fontSize: 12 }}>Sin foto</Text>
                        </View>
                      )}
                      <View style={{ padding: 10 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C3E50', textTransform: 'capitalize', marginBottom: 2 }} numberOfLines={1}>
                          {reporte.animal?.tipo_animal || 'Animal'}
                        </Text>

                        <Text style={{ fontSize: 11, color: reporte.animal?.condicion === 'grave' ? '#E74C3C' : '#F39C12', fontWeight: '600', marginBottom: 4 }}>
                          {reporte.animal?.condicion || 'Desconocida'}
                        </Text>

                        <Text style={{ fontSize: 11, color: '#7F8C8D', marginBottom: 4 }} numberOfLines={2}>
                          {[reporte.calle, reporte.colonia, reporte.municipio].filter(Boolean).join(', ')}
                        </Text>

                        <Text style={{ fontSize: 10, color: '#BDC3C7', marginBottom: 8 }}>
                          {new Date(reporte.created_at).toLocaleDateString('es-MX', {
                            day: 'numeric', month: 'short'
                          })}
                        </Text>

                        {reporte.estado_asignacion_clave === 'notificada' ? (
                          <View style={{ flexDirection: 'column', gap: 6 }}>
                            <TouchableOpacity
                              onPress={() => handleAccionReporte(reporte.reporte_id, 'accept-staff')}
                              style={{ backgroundColor: '#27AE60', paddingVertical: 6, borderRadius: 6, alignItems: 'center' }}
                            >
                              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>Aceptar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleRechazarClick(reporte.reporte_id)}
                              style={{ borderWidth: 1, borderColor: '#E74C3C', paddingVertical: 6, borderRadius: 6, alignItems: 'center' }}
                            >
                              <Text style={{ color: '#E74C3C', fontWeight: '700', fontSize: 12 }}>Rechazar</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={{
                            backgroundColor: ['aceptada', 'completada'].includes(reporte.estado_asignacion_clave) ? '#EAFAF1' : '#FDEDEC',
                            paddingVertical: 6, borderRadius: 6, alignItems: 'center'
                          }}>
                            <Text style={{
                              color: ['aceptada', 'completada'].includes(reporte.estado_asignacion_clave) ? '#27AE60' : '#E74C3C',
                              fontWeight: '700', fontSize: 11, textTransform: 'uppercase'
                            }}>
                              {reporte.estado_asignacion_clave}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

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

      {/* Modal Rechazo */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 10 }}>
              Rechazar Reporte
            </Text>
            <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 16 }}>
              ¿Deseas dejar alguna nota sobre por qué no pueden atender este caso? (Opcional)
            </Text>
            <TextInput
              style={{
                borderWidth: 1, borderColor: '#BDC3C7', borderRadius: 8, padding: 12,
                fontSize: 14, color: '#2C3E50', marginBottom: 20, minHeight: 80, textAlignVertical: 'top'
              }}
              multiline
              placeholder="Ej. Falta de espacio, fuera de nuestra zona..."
              value={notasRechazo}
              onChangeText={setNotasRechazo}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#EAEDED' }}
                onPress={() => setShowRejectModal(false)}
                disabled={isRejecting}
              >
                <Text style={{ color: '#7F8C8D', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#E74C3C' }}
                onPress={confirmarRechazo}
                disabled={isRejecting}
              >
                {isRejecting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Rechazar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}