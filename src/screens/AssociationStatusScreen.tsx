import axios from 'axios';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View, Modal, TextInput, Dimensions } from 'react-native';
import { Toast, useToast } from '../components/Toast';
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
  fotos_urls: string[];
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

const SHADOW_STYLE = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 3,
};

export default function AssociationStatusScreen() {
  const { token, logout, isLoading  } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const [info, setInfo] = useState<AsociacionInfo | null>(null);
  //const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);

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

  // Modal Detalles
  const [reporteSeleccionado, setReporteSeleccionado] = useState<ReporteAsignado | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const screenWidth = Dimensions.get('window').width;
  

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
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos actualizar el reporte.' });
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
    setIsLoadingInfo(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInfo(res.data);
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos cargar el estado de tu asociación.' });
    } finally {
      setIsLoadingInfo(false);
    }
  };

  useEffect(() => {
    if (!isLoading) {
      cargarEstado();
    }
  }, [isLoading]);

  useEffect(() => {
    if (info?.estado === 'aprobada') {
      cargarReportes();
    }
  }, [info]);

  const handleAgregarRepresentante = async () => {
    if (!nombreRep.trim() || !apellidoRep.trim() || !telefonoRep.trim()) {
      showToast({ type: 'warning', title: 'Datos incompletos', message: 'Nombre, apellido y teléfono son obligatorios.' });
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
      showToast({ type: 'success', title: '¡Listo!', message: 'Esa persona ya puede registrarse con ese mismo teléfono para tener acceso.' });
      setNombreRep('');
      setApellidoRep('');
      setTelefonoRep('');
      setEmailRep('');
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos agregar al representante.' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  if (isLoadingInfo) {
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
      <Toast toast={toast} translateY={translateY} />
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>
                Reportes asignados
              </Text>
              <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 16 }}>
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
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-start' }}>
                  {reportesFiltrados.map((reporte) => (
                    <View key={reporte.asignacion_id} style={{
                      width: screenWidth > 768 ? '23.5%' : '48%',
                      borderWidth: 1, borderColor: '#ECF0F1', borderRadius: 12,
                      marginBottom: 16, backgroundColor: '#FFF',
                      ...SHADOW_STYLE
                    }}>
                      {/* Floating Badge */}
                      <View style={{ position: 'relative' }}>
                        {reporte.foto_url ? (
                          <Image
                            source={{ uri: reporte.foto_url }}
                            style={{ width: '100%', aspectRatio: 1.5, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={{ width: '100%', aspectRatio: 1.5, backgroundColor: '#EAEDED', alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                            <Text style={{ color: '#BDC3C7', fontSize: 13 }}>Sin foto</Text>
                          </View>
                        )}
                        <View style={{
                          position: 'absolute', top: 10, left: 10,
                          backgroundColor: reporte.animal?.condicion === 'grave' ? 'rgba(231, 76, 60, 0.9)' : 'rgba(243, 156, 18, 0.9)',
                          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12
                        }}>
                          <Text style={{ color: '#FFF', fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase' }}>
                            {reporte.animal?.condicion || 'Desconocida'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ padding: 12 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#2C3E50', textTransform: 'capitalize', marginBottom: 4 }} numberOfLines={1}>
                          {reporte.animal?.tipo_animal || 'Animal'}
                        </Text>
                        <Text style={{ fontSize: 15, color: '#566573', marginBottom: 4, lineHeight: 18 }} numberOfLines={2}>
                          {[reporte.calle, reporte.colonia, reporte.municipio].filter(Boolean).join(', ')}
                        </Text>
                        <Text style={{ fontSize: 13, color: '#95A5A6', marginBottom: 12 }}>
                          {new Date(reporte.created_at).toLocaleDateString('es-MX', {
                            day: 'numeric', month: 'short'
                          })}
                        </Text>

                        {/* Botón Ver Detalles */}
                        <TouchableOpacity
                          onPress={() => { setReporteSeleccionado(reporte); setCurrentPhotoIndex(0); }}
                          style={{ backgroundColor: '#F0F3F4', paddingVertical: 8, borderRadius: 8, alignItems: 'center', marginBottom: 10 }}
                        >
                          <Text style={{ color: '#34495E', fontWeight: '700', fontSize: 15 }}>Ver detalles</Text>
                        </TouchableOpacity>

                        {reporte.estado_asignacion_clave === 'notificada' ? (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              onPress={() => handleAccionReporte(reporte.reporte_id, 'accept-staff')}
                              style={{ flex: 1, backgroundColor: '#27AE60', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
                            >
                              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Aceptar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleRechazarClick(reporte.reporte_id)}
                              style={{ flex: 1, borderWidth: 1, borderColor: '#E74C3C', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
                            >
                              <Text style={{ color: '#E74C3C', fontWeight: '700', fontSize: 15 }}>Rechazar</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={{
                            backgroundColor: ['aceptada', 'completada'].includes(reporte.estado_asignacion_clave) ? '#EAFAF1' : '#FDEDEC',
                            paddingVertical: 8, borderRadius: 8, alignItems: 'center'
                          }}>
                            <Text style={{
                              color: ['aceptada', 'completada'].includes(reporte.estado_asignacion_clave) ? '#27AE60' : '#E74C3C',
                              fontWeight: '800', fontSize: 14, textTransform: 'uppercase'
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

      {/* Modal Detalles del Reporte */}
      {reporteSeleccionado && (
        <Modal visible={true} transparent animationType="slide">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: '#FFF', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90%', overflow: 'hidden' }}>
              <ScrollView>
                {(() => {
                  const fotos = reporteSeleccionado.fotos_urls?.length
                    ? reporteSeleccionado.fotos_urls
                    : (reporteSeleccionado.foto_url ? [reporteSeleccionado.foto_url] : []);

                  if (fotos.length > 0) {
                    return (
                      <View style={{ width: '100%', height: 300, position: 'relative' }}>
                        <Image
                          source={{ uri: fotos[currentPhotoIndex] }}
                          style={{ width: '100%', height: 300 }}
                          resizeMode="cover"
                        />
                        {fotos.length > 1 && (
                          <>
                            <TouchableOpacity
                              style={{ position: 'absolute', left: 10, top: '50%', marginTop: -20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                              onPress={() => setCurrentPhotoIndex(prev => prev > 0 ? prev - 1 : fotos.length - 1)}
                            >
                              <Text style={{ color: '#FFF', fontSize: 24, fontWeight: 'bold' }}>‹</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{ position: 'absolute', right: 10, top: '50%', marginTop: -20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                              onPress={() => setCurrentPhotoIndex(prev => prev < fotos.length - 1 ? prev + 1 : 0)}
                            >
                              <Text style={{ color: '#FFF', fontSize: 24, fontWeight: 'bold' }}>›</Text>
                            </TouchableOpacity>
                            <View style={{ position: 'absolute', bottom: 10, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                              {fotos.map((_, idx) => (
                                <View key={idx} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: idx === currentPhotoIndex ? '#FFF' : 'rgba(255,255,255,0.5)' }} />
                              ))}
                            </View>
                          </>
                        )}
                      </View>
                    );
                  }
                  return (
                    <View style={{ width: '100%', height: 200, backgroundColor: '#EAEDED', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#BDC3C7' }}>Sin fotos disponibles</Text>
                    </View>
                  );
                })()}

                <View style={{ padding: 20 }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#2C3E50', textTransform: 'capitalize', marginBottom: 4 }}>
                    {reporteSeleccionado.animal?.tipo_animal || 'Animal'}
                  </Text>
                  <Text style={{ fontSize: 14, color: reporteSeleccionado.animal?.condicion === 'grave' ? '#E74C3C' : '#F39C12', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 16 }}>
                    {reporteSeleccionado.animal?.condicion}
                  </Text>

                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#34495E', marginTop: 8 }}>Detalles Adicionales</Text>
                  <Text style={{ fontSize: 14, color: '#566573', marginTop: 4 }}>• Tamaño: <Text style={{ fontWeight: '500', textTransform: 'capitalize' }}>{reporteSeleccionado.animal?.tamanio || 'No especificado'}</Text></Text>
                  <Text style={{ fontSize: 14, color: '#566573', marginTop: 2 }}>• Sexo: <Text style={{ fontWeight: '500', textTransform: 'capitalize' }}>{reporteSeleccionado.animal?.sexo || 'No especificado'}</Text></Text>
                  <Text style={{ fontSize: 14, color: '#566573', marginTop: 2 }}>• Edad: <Text style={{ fontWeight: '500', textTransform: 'capitalize' }}>{reporteSeleccionado.animal?.edad_aproximada || 'No especificada'}</Text></Text>

                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#34495E', marginTop: 16 }}>Descripción del Reporte</Text>
                  <Text style={{ fontSize: 14, color: '#566573', marginTop: 4, lineHeight: 20 }}>{reporteSeleccionado.animal?.descripcion || 'Sin descripción adicional brindada por el usuario.'}</Text>

                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#34495E', marginTop: 16 }}>Ubicación Exacta</Text>
                  <Text style={{ fontSize: 14, color: '#566573', marginTop: 4 }}>{[reporteSeleccionado.calle, reporteSeleccionado.colonia, reporteSeleccionado.municipio].filter(Boolean).join(', ')}</Text>
                </View>
              </ScrollView>

              <View style={{ padding: 16, borderTopWidth: 1, borderColor: '#ECF0F1' }}>
                <TouchableOpacity
                  style={{ backgroundColor: '#3498DB', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                  onPress={() => setReporteSeleccionado(null)}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Cerrar Detalles</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

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