import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/Toast';
import axios from 'axios';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import LocationPickerMap from '../LocationPickerMap';
import * as Location from 'expo-location';

const COLORS = {
  bgTeal: '#66BCB4',
  bgWhite: '#FFFFFF',
  primary: '#EC802B',
  secondary: '#EDC55B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  danger: '#E74C3C',
  grayLight: '#F3F4F6',
  border: '#E5E7EB'
};

const FORM_MAX_WIDTH = 750;

interface Props {
  onClose?: () => void;
}

export default function DonanteComunitarioFormScreen({ onClose }: Props) {
  const { user, token, refreshUser } = useAuth();
  const { showToast } = useToast();

  const [telefono, setTelefono] = useState(user?.telefono || '');
  const [categorias, setCategorias] = useState<string[]>([]);
  const [subcategorias, setSubcategorias] = useState<string[]>([]);
  const [subcategoriasData, setSubcategoriasData] = useState<any[]>([]);
  const [categoriasData, setCategoriasData] = useState<{ id: string; clave: string; descripcion: string }[]>([]);

  // Location states
  const [latitud, setLatitud] = useState<number | null>(null);
  const [longitud, setLongitud] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingGps, setIsLoadingGps] = useState(false);
  const [direccionConfirmada, setDireccionConfirmada] = useState('');

  const [calleNombre, setCalleNombre] = useState('');
  const [numero, setNumero] = useState('');
  const [colonia, setColonia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [estadoUbicacion, setEstadoUbicacion] = useState('');
  const [referencia, setReferencia] = useState('');

  const [radio, setRadio] = useState<number>(5);
  const [disponibilidad, setDisponibilidad] = useState('disponible');
  const [visibilidad, setVisibilidad] = useState('mostrar mi nombre');
  
  const [checkMural, setCheckMural] = useState(false);
  const [checkReglas, setCheckReglas] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitError, setShowSubmitError] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // ─── Obtener categorías y subcategorías ───
  useEffect(() => {
    const fetchCategorias = async () => {
      try {
        const res = await axios.get(`${API_URL}/red-aliados/categorias`);
        // Este formulario solo ofrece donación de bienes (alimentos/insumos)
        // — nunca servicios veterinarios ni difusión, a diferencia de
        // RegistroAliadoLocalScreen. Mismo alcance que ya tenía, ahora con
        // claves reales en vez del array hardcodeado.
        setCategoriasData(res.data.filter((c: any) => c.clave === 'alimentos' || c.clave === 'insumos'));
      } catch (err) {
        console.warn('Error fetching categorias:', err);
      }
    };
    fetchCategorias();

    const fetchSubcategorias = async () => {
      try {
        const res = await axios.get(`${API_URL}/catalogos/recursos/subcategorias`);
        setSubcategoriasData(res.data);
      } catch (err) {
        console.warn('Error fetching subcategorias:', err);
      }
    };
    fetchSubcategorias();
  }, []);

  // ─── Búsqueda Nominatim ───
  useEffect(() => {
    if (searchQuery.trim().length < 4) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: searchQuery, format: 'json', addressdetails: 1, limit: 6, countrycodes: 'mx' },
        });
        setSearchResults(res.data);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 600);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // ─── Geocodificación inversa ───
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: { lat, lon, format: 'json', addressdetails: 1 },
      });
      const address = res.data.address || {};
      setCalleNombre(address.road || address.pedestrian || address.square || address.footway || address.path || '');
      setNumero(address.house_number || '');
      setColonia(address.suburb || address.neighbourhood || address.colonia || address.city_district || address.quarter || address.residential || address.village || address.hamlet || address.borough || '');
      setMunicipio(address.city || address.town || address.municipality || address.county || '');
      setEstadoUbicacion(address.state || '');
      setDireccionConfirmada(res.data.display_name || '');
    } catch {
      // Ignorar error si no se puede reverse-geocodificar
    }
  };

  const handleGeocodeManualFields = async () => {
    const calleCompleta = [calleNombre, numero].filter((p) => p.trim()).join(' ');
    const query = [calleCompleta, colonia, municipio].filter((p) => p.trim()).join(', ');
    if (!query.trim()) return;
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: query, format: 'json', addressdetails: 1, limit: 1, countrycodes: 'mx' },
      });
      if (res.data && res.data.length > 0) {
        const result = res.data[0];
        const address = result.address || {};
        setLatitud(parseFloat(result.lat));
        setLongitud(parseFloat(result.lon));
        setEstadoUbicacion(address.state || '');
        setDireccionConfirmada(result.display_name);
      } else {
        showToast({ type: 'warning', title: 'Sin resultados', message: 'No se encontró la dirección, ajusta el pin.' });
      }
    } catch {
      // Error silencioso
    }
  };

  const handleGetLocation = async () => {
    setIsLoadingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', title: 'GPS Denegado', message: 'Ajusta el pin directamente en el mapa para indicar la ubicación.' });
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({});
      setLatitud(currentLocation.coords.latitude);
      setLongitud(currentLocation.coords.longitude);
      reverseGeocode(currentLocation.coords.latitude, currentLocation.coords.longitude);
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos obtener tu ubicación' });
    } finally {
      setIsLoadingGps(false);
    }
  };

  const handleSelectSearchResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    setLatitud(lat);
    setLongitud(lon);
    setSearchQuery(result.display_name);
    setDireccionConfirmada(result.display_name);
    setSearchResults([]);
  };

  const handlePinLocationSelect = (lat: number, lng: number) => {
    setLatitud(lat);
    setLongitud(lng);
    reverseGeocode(lat, lng);
  };

  const toggleArray = (val: string, arr: string[], setArr: (a: string[]) => void, fieldName: string) => {
    setErrors(prev => ({ ...prev, [fieldName]: '' }));
    if (arr.includes(val)) setArr(arr.filter(x => x !== val));
    else setArr([...arr, val]);
  };

  const handleCloseRequest = () => setShowCloseConfirm(true);

  const handleGuardar = async () => {
    let newErrors: any = {};
    if (categorias.length === 0) {
      newErrors.categorias = 'Selecciona al menos una categoría.';
    }
    if (!checkReglas) {
      newErrors.reglas = 'Debes aceptar las reglas de entrega.';
    }
    if (!telefono) {
      newErrors.telefono = 'Ingresa un teléfono de contacto.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setShowSubmitError(true);
      return;
    }

    setIsSubmitting(true);
    setShowSubmitError(false);
    try {
      const payload = {
        categorias,
        subcategorias,
        telefono,
        latitud,
        longitud,
        radio_km: radio,
        disponibilidad,
        preferencia_visibilidad: visibilidad,
        consentimiento_mural: checkMural
      };

      await axios.post(`${API_URL}/perfiles-apoyo/donante-comunitario`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      await refreshUser(); // Actualiza el estado global (tiene_perfil_apoyo = true)
      showToast({ type: 'success', title: '¡Bienvenido!', message: 'Ahora eres parte de la Red de Aliados.' });
      if (onClose) onClose();
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error.response?.data?.detail || 'No se pudo activar tu perfil.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCheckbox = (label: string, checked: boolean, onPress: (v: boolean) => void) => (
    <TouchableOpacity onPress={() => onPress(!checked)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
      <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: checked ? COLORS.primary : COLORS.border, backgroundColor: checked ? COLORS.primary : COLORS.bgWhite, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        {checked && <Ionicons name="checkmark" size={16} color={COLORS.bgWhite} />}
      </View>
      <Text style={{ flex: 1, fontSize: 14, color: COLORS.textDark, lineHeight: 20 }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.outerContainer}>
      <View style={styles.centeredContent}>
        <View style={styles.cardContainer}>
          <View style={styles.headerSection}>
            <TouchableOpacity onPress={handleCloseRequest} style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, ...styles.closeButton }}>
              <Ionicons name="close" size={24} color={COLORS.bgWhite} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Red de Aliados</Text>
            <Text style={styles.headerSubtitle}>Perfil de Donante Comunitario</Text>
          </View>

          <View style={styles.bodySection}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

              <FormSection title="Tus Datos">
                <View >
                  <Text style={styles.sectionLabel}>Nombre completo</Text>
                  <View style={styles.readOnlyBox}>
                    <Text style={styles.readOnlyText}>{user?.nombre} {user?.apellido_paterno}</Text>
                  </View>
                </View>

                {!user?.telefono && (
                  <View style={{ marginTop: 16 }}>
                    <Input
                      label="Teléfono de contacto"
                      placeholder="Añade un teléfono"
                      value={telefono}
                      onChangeText={(v) => { setTelefono(v); setErrors(prev => ({ ...prev, telefono: '' })) }}
                      keyboardType="phone-pad"
                      error={errors.telefono}
                    />
                  </View>
                )}
              </FormSection>

              <Divider />

              <FormSection title="¿Qué puedes donar?" subtitle="Selecciona lo que podrías aportar (no es un compromiso fijo).">
                <View style={styles.animalChips}>
                  {categoriasData.map((cat) => {
                    const isSelected = categorias.includes(cat.clave);
                    return (
                      <TouchableOpacity
                        key={cat.clave}
                        style={[styles.animalChip, { backgroundColor: isSelected ? COLORS.secondary : COLORS.grayLight }]}
                        onPress={() => toggleArray(cat.clave, categorias, setCategorias, 'categorias')}
                      >
                        <Text style={{ fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.textDark : COLORS.textLight }}>{cat.descripcion}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {errors.categorias && <Text style={styles.errorText}>{errors.categorias}</Text>}

                {/* Subcategorías dinámicas */}
                {categorias.map(clave => {
                  const subs = subcategoriasData.filter(s => s.categoria_clave === clave);
                  if (subs.length === 0) return null;

                  const catLabel = categoriasData.find(c => c.clave === clave)?.descripcion || clave;

                  return (
                    <View key={`subs-${clave}`} style={{ marginTop: 8, marginBottom: 12, backgroundColor: COLORS.grayLight, padding: 14, borderRadius: 16 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 10 }}>
                        Especifíca qué tipo de {catLabel.toLowerCase()} (Opcional):
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {subs.map(sub => {
                          const isSubSelected = subcategorias.includes(sub.clave);
                          return (
                            <TouchableOpacity
                              key={sub.clave}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
                                backgroundColor: isSubSelected ? COLORS.primary : COLORS.bgWhite,
                                borderWidth: 1, borderColor: isSubSelected ? COLORS.primary : COLORS.border
                              }}
                              onPress={() => toggleArray(sub.clave, subcategorias, setSubcategorias, 'subcategorias')}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: isSubSelected ? COLORS.bgWhite : COLORS.textDark }}>
                                {sub.descripcion}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </FormSection>

              <Divider />

              <FormSection title="Zona de donación" subtitle="Ubicación donde podrías realizar entregas (Opcional).">
                <Input placeholder="Buscar dirección, ej. Avenida Reforma, Puebla" value={searchQuery} onChangeText={setSearchQuery} />
                {isSearching && <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 4 }}>Buscando...</Text>}

                {searchResults.length > 0 && (
                  <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, marginTop: 4, marginBottom: 4 }}>
                    {searchResults.map((result, idx) => (
                      <TouchableOpacity key={idx} onPress={() => handleSelectSearchResult(result)} style={{ padding: 12, borderBottomWidth: idx === searchResults.length - 1 ? 0 : 1, borderBottomColor: '#ECF0F1' }}>
                        <Text style={{ fontSize: 13, color: COLORS.textDark }}>{result.display_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TouchableOpacity onPress={handleGetLocation} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
                  <Feather name="map-pin" size={14} color={COLORS.bgTeal} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 13, color: COLORS.bgTeal, fontWeight: '600' }}>
                    {isLoadingGps ? 'Obteniendo tu ubicación...' : 'Usar mi ubicación actual'}
                  </Text>
                </TouchableOpacity>

                <Text style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 8 }}>O ajusta directamente arrastrando el pin en el mapa:</Text>
                <View style={styles.mapContainer}>
                  <LocationPickerMap
                    selectedPosition={latitud && longitud ? { latitud, longitud } : undefined}
                    onLocationSelect={handlePinLocationSelect}
                  />
                </View>

                {direccionConfirmada !== '' && (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EAF6FF', padding: 10, borderRadius: 8, marginTop: 8 }}>
                    <Feather name="map-pin" size={14} color={COLORS.textDark} style={{ marginRight: 6, marginTop: 2 }} />
                    <Text style={{ fontSize: 12, color: COLORS.textDark, flex: 1 }}>
                      Ubicación seleccionada: <Text style={{ fontWeight: '600' }}>{direccionConfirmada}</Text>
                    </Text>
                  </View>
                )}

                <View style={{ marginTop: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 2 }}>
                      <Input label="Calle" placeholder="Ej. Francisco I. Madero" value={calleNombre} onChangeText={setCalleNombre} maxLength={100} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input label="Número" placeholder="Ej. 2912" value={numero} onChangeText={setNumero} keyboardType="numeric" maxLength={10} />
                    </View>
                  </View>
                  <Input label="Colonia" placeholder="Ej. Viveros" value={colonia} onChangeText={setColonia} maxLength={50} />
                  <Input label="Municipio" placeholder="Ej. Puebla" value={municipio} onChangeText={setMunicipio} maxLength={50} />
                  <Input label="Estado" placeholder="Ej. Puebla" value={estadoUbicacion} onChangeText={setEstadoUbicacion} maxLength={50} />
                  <TouchableOpacity onPress={handleGeocodeManualFields} style={{ flexDirection: 'row', alignItems: 'center', marginTop: -8, marginBottom: 8 }}>
                    <Feather name="refresh-cw" size={13} color={COLORS.bgTeal} style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 12, color: COLORS.bgTeal, fontWeight: '600' }}>Mover el pin a esta dirección</Text>
                  </TouchableOpacity>
                  <View>
                    <Input label="Referencia (Opcional)" placeholder="Ej. Frente a la tienda de abarrotes..." value={referencia} onChangeText={setReferencia} maxLength={150} />
                    <Text style={{ textAlign: 'right', color: COLORS.textLight, fontSize: 12, marginTop: -12, marginBottom: 8 }}>{referencia.length}/150</Text>
                  </View>
                </View>
              </FormSection>

              <Divider />

              <FormSection title="Disponibilidad actual" subtitle="Define si estás abierto a donar en este momento o prefieres pausar.">
                <View style={styles.animalChips}>
                  {[
                    { id: 'disponible', label: 'Disponible' },
                    { id: 'capacidad_limitada', label: 'Capacidad limitada' },
                    { id: 'no_disponible', label: 'No disponible' }
                  ].map((opt) => {
                    const isSelected = disponibilidad === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.animalChip, { backgroundColor: isSelected ? COLORS.secondary : COLORS.grayLight }]}
                        onPress={() => setDisponibilidad(opt.id)}
                      >
                        <Text style={{ fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.textDark : COLORS.textLight }}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </FormSection>

              <Divider />

              <FormSection title="Preferencia de visibilidad" subtitle="Elige cómo quieres que tu nombre aparezca públicamente.">
                <View style={styles.animalChips}>
                  {[
                    { id: 'mostrar mi nombre', label: 'Mostrar mi nombre' },
                    { id: 'mostrar solo mi nombre de usuario', label: 'Solo mi alias' },
                    { id: 'donar anónimamente', label: 'Donar anónimamente' }
                  ].map((opt) => {
                    const isSelected = visibilidad === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.animalChip, { backgroundColor: isSelected ? COLORS.secondary : COLORS.grayLight }]}
                        onPress={() => setVisibilidad(opt.id)}
                      >
                        <Text style={{ fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.textDark : COLORS.textLight }}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {visibilidad !== 'donar anónimamente' && (
                  <View style={{ marginTop: 8 }}>
                    {renderCheckbox('Doy mi consentimiento para aparecer en el mural de impacto (reconocimiento público).', checkMural, setCheckMural)}
                  </View>
                )}
              </FormSection>

              <Divider />

              <FormSection title="Reglas y Condiciones">
                {renderCheckbox('Acepto las reglas de entrega por mi seguridad y la del rescatista.', checkReglas, (v) => { setCheckReglas(v); setErrors(prev => ({ ...prev, reglas: '' })) })}
                {errors.reglas && <Text style={styles.errorText}>{errors.reglas}</Text>}
              </FormSection>

              {showSubmitError && <Text style={styles.submitError}>Revisa los campos en rojo arriba.</Text>}

              <TouchableOpacity onPress={handleGuardar} style={styles.submitButton}>
                <Text style={styles.submitButtonText}>{isSubmitting ? 'Guardando...' : 'Activar perfil'}</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>

          <Modal visible={showCloseConfirm} transparent animationType="fade" onRequestClose={() => setShowCloseConfirm(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.confirmModal}>
                <Text style={styles.confirmTitle}>¿Seguro que deseas salir?</Text>
                <Text style={styles.confirmMessage}>Los datos ingresados se perderán.</Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity onPress={() => setShowCloseConfirm(false)} style={styles.confirmButtonCancel}>
                    <Text style={styles.confirmButtonCancelText}>Me quedo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setShowCloseConfirm(false); if (onClose) onClose(); }} style={styles.confirmButtonExit}>
                    <Text style={styles.confirmButtonExitText}>Sí, salir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

        </View>
      </View>
    </View>
  );
}

function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.formSection}>
      <Text style={styles.formSectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.formSectionSubtitle}>{subtitle}</Text>}
      {children}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  outerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  centeredContent: { width: '100%', maxWidth: FORM_MAX_WIDTH, maxHeight: '90%', alignSelf: 'center' },
  cardContainer: { flex: 1, backgroundColor: COLORS.bgWhite, borderRadius: 32, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 15, flexDirection: 'column', margin: 16 },
  headerSection: { paddingHorizontal: 32, paddingTop: 24, paddingBottom: 32, backgroundColor: COLORS.bgTeal, position: 'relative', zIndex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.bgWhite },
  headerSubtitle: { fontSize: 13, fontWeight: '600', color: COLORS.bgWhite, opacity: 0.9, marginTop: 4 },
  closeButton: { backgroundColor: 'rgba(255,255,255,0.3)', padding: 8, borderRadius: 20 },
  bodySection: { flex: 1, backgroundColor: COLORS.bgWhite, borderTopLeftRadius: 40, borderTopRightRadius: 40, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 20, zIndex: 2, marginTop: -20 },
  scrollContent: { paddingBottom: 40 },
  formSection: { marginBottom: 16 },
  formSectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 },
  formSectionSubtitle: { fontSize: 13, color: COLORS.textLight, marginBottom: 16, lineHeight: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 },
  readOnlyBox: { backgroundColor: COLORS.grayLight, padding: 16, borderRadius: 16 },
  readOnlyText: { fontSize: 16, color: COLORS.textDark, fontWeight: '600' },
  divider: { height: 1, backgroundColor: COLORS.border, marginBottom: 8 },
  animalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  animalChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  errorText: { color: COLORS.danger, fontSize: 12, marginTop: 4, marginBottom: 16 },
  mapContainer: { borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  submitError: { color: COLORS.danger, textAlign: 'center', marginBottom: 12, fontWeight: '700', fontSize: 14 },
  submitButton: { backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 24, alignItems: 'center', marginBottom: 16 },
  submitButtonText: { color: COLORS.bgWhite, fontWeight: '900', fontSize: 18 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  confirmModal: { backgroundColor: COLORS.bgWhite, borderRadius: 32, padding: 32, width: '100%', maxWidth: 400 },
  confirmTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', marginBottom: 12 },
  confirmMessage: { fontSize: 15, color: COLORS.textLight, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  confirmButtons: { flexDirection: 'row', gap: 12 },
  confirmButtonCancel: { flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: COLORS.grayLight, alignItems: 'center' },
  confirmButtonCancelText: { color: COLORS.textDark, fontWeight: '700' },
  confirmButtonExit: { flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: COLORS.danger, alignItems: 'center' },
  confirmButtonExitText: { color: COLORS.bgWhite, fontWeight: '700' },
});
