import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, FlatList, StyleSheet, Dimensions, Platform, ScrollView, Image } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../../constants/api';
import { AdoptionCard } from './AdoptionCard';

const C = { primary: '#EC802B', bg: '#FFFFFF', bgSoft: '#F9F6F0', textDark: '#4A3728', textLight: '#8C7A6B', neutralLight: '#E5E7EB' };
const { width, height } = Dimensions.get('window');

interface Props {
  visible: boolean;
  asociacionId: string | null;
  asociacionNombre: string;
  onClose: () => void;
}

export function AssociationAdoptionsModal({ visible, asociacionId, asociacionNombre, onClose }: Props) {
  const [perfiles, setPerfiles] = useState<any[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  
  // Estados para manejar la navegación interna del modal
  const [vista, setVista] = useState<'lista' | 'detalle'>('lista');
  const [perfilDetalle, setPerfilDetalle] = useState<any>(null);
  const [isLoadingDetalle, setIsLoadingDetalle] = useState(false);

  // Reiniciar la vista cada vez que se abre el modal
  useEffect(() => {
    if (visible && asociacionId) {
      setVista('lista');
      setPerfilDetalle(null);
      cargarPeluditos();
    }
  }, [visible, asociacionId]);

  const cargarPeluditos = async () => {
    setIsLoadingList(true);
    try {
      const res = await axios.get(`${API_URL}/adoptions?asociacion_id=${asociacionId}&limite=20`);
      setPerfiles(res.data.items || []);
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
      // Usamos el mismo endpoint público que ya tienes para obtener los detalles
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

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={handleCerrar}>
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

          {/* VISTA 1: LISTA (CUADRÍCULA) */}
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
                  numColumns={width > 768 ? 3 : 2}
                  columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 24 }}
                  contentContainerStyle={{ paddingBottom: 40, paddingTop: 24 }}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <AdoptionCard perfil={item} onPress={() => verDetallePerrito(item.id)} />
                  )}
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
                    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ borderRadius: 16, overflow: 'hidden', height: 250, marginBottom: 16 }}>
                      {perfilDetalle.fotos.map((foto: any, index: number) => (
                        <Image key={index} source={{ uri: foto.foto_url }} style={{ width: width > 768 ? 960 : width - 48, height: 250 }} resizeMode="cover" />
                      ))}
                    </ScrollView>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(46,42,38,0.6)', justifyContent: 'flex-end', alignItems: 'center' },
  modalContent: { backgroundColor: C.bgSoft, width: '100%', maxWidth: 1024, height: height * 0.85, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', ...Platform.select({ web: { boxShadow: '0 -10px 40px rgba(0,0,0,0.15)' }, default: { elevation: 20 } }) },
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