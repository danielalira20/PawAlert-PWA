import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, StyleSheet, Dimensions, Platform, Modal, ScrollView, Image, Linking } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import axios from 'axios';
import { useWindowDimensions } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { API_URL } from '../../constants/api';
// IMPORTAMOS LA NUEVA TARJETA
import { AdoptionCardGlobal } from '../../components/adopciones/AdoptionCardGlobal';

const C = { primary: '#EC802B', bg: '#FFFFFF', bgSoft: '#F9F6F0', textDark: '#4A3728', textLight: '#8C7A6B' };

export default function AdopcionesGlobalScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  const [perfiles, setPerfiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtroEspecie, setFiltroEspecie] = useState<string | null>(null);
  
  // Ubicación y bandera
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationResolved, setLocationResolved] = useState(false);

  // Estados de Paginación
  const [pagina, setPagina] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Estados para el Modal de Detalle
  const [perfilDetalle, setPerfilDetalle] = useState<any>(null);
  const [isLoadingDetalle, setIsLoadingDetalle] = useState(false);
  const [fotoExpandida, setFotoExpandida] = useState<string | null>(null);
  const [mostrarContacto, setMostrarContacto] = useState(false);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } else {
        setLocation(null);
      }
      setLocationResolved(true);
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (locationResolved) {
        cargarGaleria(location?.lat, location?.lng, filtroEspecie, pagina);
      }
    }, [locationResolved, location, filtroEspecie, pagina])
  );

  const cargarGaleria = async (lat?: number | null, lng?: number | null, especie?: string | null, page: number = 1) => {
    setIsLoading(true);
    try {
      let url = `${API_URL}/adoptions?limite=8&pagina=${page}`;
      if (lat && lng) url += `&lat=${lat}&lng=${lng}`;
      if (especie) url += `&especie=${especie}`;

      const res = await axios.get(url);
      setPerfiles(res.data.items || []);
      setTotalItems(res.data.total || 0);
    } catch (error) {
      console.log('Error cargando galería:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const manejarFiltro = (valor: string | null) => {
    setFiltroEspecie(valor);
    setPagina(1);
  };

  const verDetallePerrito = async (id: string) => {
    setPerfilDetalle(true); 
    setMostrarContacto(false);
    setIsLoadingDetalle(true);
    try {
      const res = await axios.get(`${API_URL}/adoptions/${id}`);
      setPerfilDetalle(res.data);
    } catch (error) {
      console.log('Error cargando detalle:', error);
      setPerfilDetalle(null);
    } finally {
      setIsLoadingDetalle(false);
    }
  };

  const FiltroBoton = ({ label, valor, icon }: { label: string, valor: string | null, icon: any }) => {
    const activo = filtroEspecie === valor;
    return (
      <TouchableOpacity 
        onPress={() => manejarFiltro(valor)}
        style={[styles.filtroBoton, activo && styles.filtroActivo]}
      >
        <Ionicons name={icon} size={16} color={activo ? C.bg : C.textDark} style={{ marginRight: 6 }} />
        <Text style={{ color: activo ? C.bg : C.textDark, fontWeight: activo ? '800' : '600', fontSize: 13 }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderPaginacion = () => {
    if (totalItems === 0) return null;
    const totalPages = Math.max(1, Math.ceil(totalItems / 8));
    const inicio = (pagina - 1) * 8 + 1;
    const fin = Math.min(pagina * 8, totalItems);

    return (
      <View style={{ backgroundColor: '#FDF8F4', borderRadius: 16, padding: 16, marginTop: 16, alignItems: 'center', width: '100%' }}>
        <Text style={{ fontSize: 13, color: '#8C7A6B', fontWeight: '600', marginBottom: 12 }}>
          Mostrando {inicio}–{fin} de {totalItems} peluditos
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
          <TouchableOpacity
            disabled={pagina === 1}
            onPress={() => setPagina(p => p - 1)}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: pagina === 1 ? 'transparent' : '#F0E8DC', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, opacity: pagina === 1 ? 0.5 : 1 }}
          >
            <Feather name="chevron-left" size={16} color="#4A3728" />
            <Text style={{ color: '#4A3728', fontWeight: '700', marginLeft: 4 }}>Anterior</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 13, fontWeight: '800', color: '#2E2A26' }}>Página {pagina} de {totalPages}</Text>

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
    <View style={styles.container}>
      {/* HEADER Y FILTROS */}
      <View style={styles.header}>
        <Text style={styles.title}>Encuentra a tu mejor amigo</Text>
        <Text style={styles.subtitle}>
          {location ? "Ordenados por cercanía a ti" : "Mostrando todos los disponibles"}
        </Text>
        
        <View style={styles.filtrosRow}>
          <FiltroBoton label="Todos" valor={null} icon="paw" />
          <FiltroBoton label="Perros" valor="perro" icon="logo-octocat" />
          <FiltroBoton label="Gatos" valor="gato" icon="logo-octocat" />
        </View>
      </View>

      {/* GALERÍA */}
      {isLoading && perfiles.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : perfiles.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="search" size={64} color="#D1D5DB" />
          <Text style={styles.emptyText}>No hay peluditos disponibles en esta categoría.</Text>
        </View>
      ) : (
        <FlatList
          data={perfiles}
          keyExtractor={(item) => item.id}
          numColumns={isDesktop ? 4 : 2}
          key={isDesktop ? 'desktop-4' : 'mobile-2'}
          columnWrapperStyle={{
            paddingHorizontal: 16,
            marginBottom: 24
          }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={renderPaginacion()}
          renderItem={({ item }) => (
          
            <View style={{ 
              flex: 1, 
              maxWidth: isDesktop ? '25%' : '50%',
              paddingHorizontal: 8 
            }}>
              <AdoptionCardGlobal 
                perfil={item} 
                onPress={() => verDetallePerrito(item.id)} 
              />
            </View>
          )}
        />
      )}

      {/* MODAL DE DETALLE DEL PERRITO */}
      <Modal visible={!!perfilDetalle} animationType="fade" transparent={true} onRequestClose={() => setPerfilDetalle(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalContent}>
            
            {/* Header del Modal */}
            <View style={styles.headerModal}>
              <TouchableOpacity onPress={() => setPerfilDetalle(null)} style={{ marginRight: 16 }}>
                <Feather name="arrow-left" size={24} color={C.textDark} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.subtitleModal}>Detalle de adopción</Text>
                <Text style={styles.titleModal} numberOfLines={1}>
                  {typeof perfilDetalle === 'object' ? perfilDetalle?.nombre_publico : 'Cargando...'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPerfilDetalle(null)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={C.textDark} />
              </TouchableOpacity>
            </View>

            {/* Contenido del Detalle */}
            <View style={{ flex: 1 }}>
              {isLoadingDetalle || !perfilDetalle || perfilDetalle === true ? (
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

                  {/* Botón de Adopción o Datos de Contacto */}
                  {!mostrarContacto ? (
                    <TouchableOpacity style={styles.adoptButton} onPress={() => setMostrarContacto(true)}>
                      <Ionicons name="heart" size={20} color={C.bg} style={{ marginRight: 8 }} />
                      <Text style={styles.adoptButtonText}>¡Quiero Adoptarlo!</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ backgroundColor: '#FDF8F4', borderRadius: 16, padding: 20, marginTop: 10, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: C.textDark, marginBottom: 16 }}>Contacta a la Asociación</Text>
                      
                      {perfilDetalle.asociacion?.telefono && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                          <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                          <Text style={{ fontSize: 15, color: C.textDark, marginLeft: 8, fontWeight: '600' }}>{perfilDetalle.asociacion.telefono}</Text>
                        </View>
                      )}

                      {perfilDetalle.asociacion?.email ? (
                        <TouchableOpacity 
                          onPress={() => Linking.openURL(`mailto:${perfilDetalle.asociacion.email}?subject=Deseo%20adoptar%20a%20${perfilDetalle.nombre_publico}&body=Hola%20${perfilDetalle.asociacion.nombre},%20me%20gustar%C3%ADa%20recibir%20m%C3%A1s%20informaci%C3%B3n%20sobre%20el%20proceso%20de%20adopci%C3%B3n%20de%20${perfilDetalle.nombre_publico}.%0A%0AGracias.`)} 
                          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', width: '100%', justifyContent: 'center' }}
                        >
                          <Ionicons name="mail" size={20} color={C.primary} />
                          <Text style={{ fontSize: 14, color: C.primary, marginLeft: 8, fontWeight: '700' }}>Enviar correo de adopción</Text>
                        </TouchableOpacity>
                      ) : (
                         <Text style={{ fontSize: 13, color: C.textLight, marginTop: 4 }}>Sin correo registrado</Text>
                      )}
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgSoft },
  header: { paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 20, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title: { fontSize: 24, fontWeight: '900', color: C.textDark, marginBottom: 4 },
  subtitle: { fontSize: 13, color: C.textLight, marginBottom: 16 },
  filtrosRow: { flexDirection: 'row', gap: 12 },
  filtroBoton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  filtroActivo: { backgroundColor: C.primary },
  
  listContent: { paddingBottom: 40, paddingTop: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { marginTop: 16, fontSize: 15, fontWeight: '600', color: C.textLight, textAlign: 'center' },

  // Estilos del Modal
  overlay: { flex: 1, backgroundColor: 'rgba(46,42,38,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: C.bgSoft, width: '100%', maxWidth: 1024, maxHeight: '90%', borderRadius: 24, overflow: 'hidden', ...Platform.select({ web: { boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }, default: { elevation: 20 } }) },
  headerModal: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  titleModal: { fontSize: 22, fontWeight: '900', color: C.textDark },
  subtitleModal: { fontSize: 11, fontWeight: '800', color: C.primary, textTransform: 'uppercase', marginBottom: 2 },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.bgSoft, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 8 },
  bodyText: { fontSize: 14, color: '#566573', lineHeight: 22 },
  detailBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  detailBadgeText: { fontSize: 12, color: C.textDark, fontWeight: '700', marginLeft: 6, textTransform: 'capitalize' },
  adoptButton: { flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 16, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  adoptButtonText: { color: C.bg, fontSize: 15, fontWeight: '900' }
});