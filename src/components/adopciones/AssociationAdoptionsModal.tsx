import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, FlatList, StyleSheet, Dimensions, Platform, ScrollView, Image } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../../constants/api';
import { AdoptionCard } from './AdoptionCard';

const C = { primary: '#EC802B', bg: '#FFFFFF', bgSoft: '#F9F6F0', textDark: '#4A3728', textLight: '#8C7A6B', neutralLight: '#E5E7EB' };
const { width, height } = Dimensions.get('window');
const isDesktop = width > 768;

interface Props {
  visible: boolean;
  asociacionId: string | null;
  asociacionNombre: string;
  onClose: () => void;
}

export function AssociationAdoptionsModal({ visible, asociacionId, asociacionNombre, onClose }: Props) {
  const [perfiles, setPerfiles] = useState<any[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  
  // ─── Paginación (3 columnas x 2 filas = 6 por página) ───
  const [pagina, setPagina] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Estados para manejar la navegación interna del modal
  const [vista, setVista] = useState<'lista' | 'detalle'>('lista');
  const [perfilDetalle, setPerfilDetalle] = useState<any>(null);
  const [isLoadingDetalle, setIsLoadingDetalle] = useState(false);
  const [fotoExpandida, setFotoExpandida] = useState<string | null>(null);

  // Reiniciar la vista y cargar página 1 al abrir el modal
  useEffect(() => {
    if (visible && asociacionId) {
      setVista('lista');
      setPerfilDetalle(null);
      setPagina(1);
      cargarPeluditos(1);
    }
  }, [visible, asociacionId]);

  // Cargar datos cuando el usuario cambia de página
  useEffect(() => {
    if (visible && asociacionId && pagina !== 1) {
      cargarPeluditos(pagina);
    }
  }, [pagina]);

  const cargarPeluditos = async (page: number) => {
    setIsLoadingList(true);
    try {
      // Pedimos exactamente 6 elementos (3x2)
      const res = await axios.get(`${API_URL}/adoptions?asociacion_id=${asociacionId}&limite=6&pagina=${page}`);
      setPerfiles(res.data.items || []);
      // Obtenemos el total de casos del backend para calcular las páginas
      setTotalItems(res.data.total || res.data.items?.length || 0);
    } catch (error) {
      console.log('Error cargando adopciones:', error);
    } finally {
      setIsLoadingList(false);
    }
  };

  const verDetallePerrito = async (id: string) => {
    setVista('detalle');
    setIsLoadingDetalle(true);
    try {
      const res = await axios.get(`${API_URL}/adoptions/${id}`);
      setPerfilDetalle(res.data);
    } catch (error) {
      console.log('Error cargando detalle:', error);
    } finally {
      setIsLoadingDetalle(false);
    }
  };

  const handleCerrar = () => {
    if (vista === 'detalle') {
      setVista('lista'); // Si está viendo un perrito, regresa a la cuadrícula
    } else {
      onClose(); // Si está en la cuadrícula, cierra el modal completo
    }
  };

  // ─── Componente visual de paginación ───
  const renderPaginacion = () => {
    if (totalItems === 0) return null;
    const totalPages = Math.max(1, Math.ceil(totalItems / 6));
    const inicio = (pagina - 1) * 6 + 1;
    const fin = Math.min(pagina * 6, totalItems);

    return (
      <View style={{ backgroundColor: '#FDF8F4', borderRadius: 16, padding: 16, marginTop: 16, alignItems: 'center', width: '100%' }}>
        <Text style={{ fontSize: 13, color: '#8C7A6B', fontWeight: '600', marginBottom: 12 }}>
          Mostrando {inicio}–{fin} de {totalItems} casos
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
          {/* Botón Anterior */}
          <TouchableOpacity
            disabled={pagina === 1}
            onPress={() => setPagina(p => p - 1)}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: pagina === 1 ? 'transparent' : '#F0E8DC', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, opacity: pagina === 1 ? 0.5 : 1 }}
          >
            <Feather name="chevron-left" size={16} color="#4A3728" />
            <Text style={{ color: '#4A3728', fontWeight: '700', marginLeft: 4 }}>Anterior</Text>
          </TouchableOpacity>

          {/* Texto de Página */}
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#2E2A26' }}>Página {pagina} de {totalPages}</Text>

          {/* Botón Siguiente */}
          <TouchableOpacity
            disabled={pagina >= totalPages}
            onPress={() => setPagina(p => p + 1)}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: pagina >= totalPages ? '#F0E8DC' : C.primary, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, opacity: pagina >= totalPages ? 0.5 : 1 }}
          >
            <Text style={{ color: pagina >= totalPages ? '#4A3728' : '#FFF', fontWeight: '700', marginRight: 4 }}>Siguiente</Text>
            <Feather name="chevron-right" size={16} color={pagina >= totalPages ? '#4A3728' : '#FFF'} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={handleCerrar}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          
          {/* Header del Modal */}
          <View style={styles.header}>
            {vista === 'detalle' && (
              <TouchableOpacity onPress={handleCerrar} style={{ marginRight: 16 }}>
                <Feather name="arrow-left" size={24} color={C.textDark} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.subtitle}>
                {vista === 'lista' ? 'En adopción en' : 'Detalle de adopción'}
              </Text>
              <Text style={styles.title} numberOfLines={1}>
                {vista === 'lista' ? asociacionNombre : (perfilDetalle?.nombre_publico || 'Cargando...')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={C.textDark} />
            </TouchableOpacity>
          </View>

          {/* VISTA 1: LISTA (CUADRÍCULA 3x2) */}
          {vista === 'lista' && (
            <View style={{ flex: 1 }}>
              {isLoadingList ? (
                <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
              ) : perfiles.length === 0 ? (
                <View style={styles.center}>
                  <Ionicons name="paw-outline" size={64} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No tienen peluditos publicados actualmente.</Text>
                </View>
              ) : (
                <FlatList
                  data={perfiles}
                  keyExtractor={(item) => item.id}
                  numColumns={isDesktop ? 3 : 2}
                  key={isDesktop ? 'desktop-3' : 'mobile-2'}
                  columnWrapperStyle={{ justifyContent: 'flex-start', gap: isDesktop ? 20 : 10, paddingHorizontal: 24 }}
                  contentContainerStyle={{ paddingBottom: 24, paddingTop: 24 }}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <AdoptionCard perfil={item} onPress={() => verDetallePerrito(item.id)} />
                  )}
                  ListFooterComponent={renderPaginacion()}
                />
              )}
            </View>
          )}

          {/* VISTA 2: DETALLE DEL PERRITO */}
          {vista === 'detalle' && (
            <View style={{ flex: 1 }}>
              {isLoadingDetalle || !perfilDetalle ? (
                 <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
                  {/* Carrusel / Foto principal */}
                  {perfilDetalle.fotos && perfilDetalle.fotos.length > 0 ? (
                    <View style={{ position: 'relative', height: 250, marginBottom: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FAF3EA' }}>
                      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                        {perfilDetalle.fotos.map((foto: any, index: number) => (
                          <View key={index} style={{ width: isDesktop ? 976 : width - 48, height: 250, justifyContent: 'center', alignItems: 'center' }}>
                            <Image source={{ uri: foto.foto_url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                            <TouchableOpacity 
                              onPress={() => setFotoExpandida(foto.foto_url)}
                              style={{ position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 }}
                            >
                              <Feather name="maximize-2" size={16} color="#FFF" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  ) : (
                    <View style={{ height: 250, backgroundColor: '#FAF3EA', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                      <Ionicons name="paw" size={64} color="#EDC55B" />
                    </View>
                  )}

                  {/* Badges de Información */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                    <View style={styles.detailBadge}>
                      <Ionicons name="calendar-outline" size={14} color={C.textLight} />
                      <Text style={styles.detailBadgeText}>{perfilDetalle.edad_aproximada}</Text>
                    </View>
                    <View style={styles.detailBadge}>
                      <Ionicons name="resize-outline" size={14} color={C.textLight} />
                      <Text style={styles.detailBadgeText}>{perfilDetalle.tamanio?.descripcion}</Text>
                    </View>
                    <View style={styles.detailBadge}>
                      <Ionicons name={perfilDetalle.sexo === 'macho' ? 'male' : 'female'} size={14} color={perfilDetalle.sexo === 'macho' ? '#3498DB' : '#E74C3C'} />
                      <Text style={styles.detailBadgeText}>{perfilDetalle.sexo}</Text>
                    </View>
                  </View>

                  {/* Textos de Detalles */}
                  <View style={{ marginBottom: 20 }}>
                    <Text style={styles.sectionTitle}>Su historia</Text>
                    <Text style={styles.bodyText}>{perfilDetalle.descripcion}</Text>
                  </View>

                  <View style={{ marginBottom: 20 }}>
                    <Text style={styles.sectionTitle}>Personalidad</Text>
                    <Text style={styles.bodyText}>{perfilDetalle.personalidad}</Text>
                  </View>

                  {/* Sección de Estado Médico */}
                  <View style={{ marginBottom: 24 }}>
                    <Text style={styles.sectionTitle}>Estado médico</Text>
                    <Text style={styles.bodyText}>{perfilDetalle.salud_conocida || 'No especificado'}</Text>
                    
                    <View style={{ marginTop: 12, gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="checkmark-circle" size={18} color={perfilDetalle.vacunacion_estado === 'completo' ? '#27AE60' : C.textLight} />
                        <Text style={{ fontSize: 14, color: C.textDark, marginLeft: 8, textTransform: 'capitalize', fontWeight: '600' }}>
                          Vacunas: {perfilDetalle.vacunacion_estado?.replace('_', ' ') || 'Desconocido'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="checkmark-circle" size={18} color={perfilDetalle.esterilizacion_estado === 'completo' ? '#27AE60' : C.textLight} />
                        <Text style={{ fontSize: 14, color: C.textDark, marginLeft: 8, textTransform: 'capitalize', fontWeight: '600' }}>
                          Esterilización: {perfilDetalle.esterilizacion_estado?.replace('_', ' ') || 'Desconocido'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Botón de Adopción */}
                  <TouchableOpacity style={styles.adoptButton} onPress={() => alert('Próximamente: Flujo de solicitud')}>
                    <Ionicons name="heart" size={20} color={C.bg} style={{ marginRight: 8 }} />
                    <Text style={styles.adoptButtonText}>¡Quiero Adoptarlo!</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          )}

        </View>
      </View>

      {/* Sub-Modal para Imagen Expandida */}
      <Modal visible={!!fotoExpandida} transparent={true} animationType="fade" onRequestClose={() => setFotoExpandida(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity 
            style={{ position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 24 }} 
            onPress={() => setFotoExpandida(null)}
          >
            <Feather name="x" size={28} color="#FFF" />
          </TouchableOpacity>
          {fotoExpandida && (
            <Image source={{ uri: fotoExpandida }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Se cambió justifyContent a 'center' para centrar el modal y se agregó padding
  overlay: { flex: 1, backgroundColor: 'rgba(46,42,38,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  // Se quitó el borderRadius asimétrico y se le dio borderRadius a todo, limitando la altura
  modalContent: { backgroundColor: C.bgSoft, width: '100%', maxWidth: 1024, maxHeight: height * 0.9, borderRadius: 24, overflow: 'hidden', ...Platform.select({ web: { boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }, default: { elevation: 20 } }) },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.neutralLight },
  title: { fontSize: 22, fontWeight: '900', color: C.textDark },
  subtitle: { fontSize: 11, fontWeight: '800', color: C.primary, textTransform: 'uppercase', marginBottom: 2 },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.bgSoft, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { marginTop: 16, fontSize: 14, fontWeight: '600', color: C.textLight, textAlign: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 8 },
  bodyText: { fontSize: 14, color: '#566573', lineHeight: 22 },
  detailBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: C.neutralLight },
  detailBadgeText: { fontSize: 12, color: C.textDark, fontWeight: '700', marginLeft: 6, textTransform: 'capitalize' },
  adoptButton: { flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 16, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  adoptButtonText: { color: C.bg, fontSize: 15, fontWeight: '900' }
});