import axios from 'axios';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Toast, useToast } from '../components/Toast';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import LocationPickerMap from './LocationPickerMap';

const COLORS = {
  bgTeal: '#66BCB4',
  bgWhite: '#FFFFFF',
  primary: '#EC802B',
  secondary: '#EDC55B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  danger: '#E74C3C',
  grayLight: '#F3F4F6',
  border: '#E5E7EB',
  cardBg: '#FAF3EA',
};

const FORM_MAX_WIDTH = 700;
const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sab', 'dom'];
const DIAS_VALORES = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];

// Opciones de horarios a mostrar en el selector
const TIME_OPTIONS = [
  { label: '6:00 am', value: '06:00' },
  { label: '7:00 am', value: '07:00' },
  { label: '8:00 am', value: '08:00' },
  { label: '9:00 am', value: '09:00' },
  { label: '10:00 am', value: '10:00' },
  { label: '11:00 am', value: '11:00' },
  { label: '12:00 pm', value: '12:00' },
  { label: '1:00 pm', value: '13:00' },
  { label: '2:00 pm', value: '14:00' },
  { label: '3:00 pm', value: '15:00' },
  { label: '4:00 pm', value: '16:00' },
  { label: '5:00 pm', value: '17:00' },
  { label: '6:00 pm', value: '18:00' },
  { label: '7:00 pm', value: '19:00' },
  { label: '8:00 pm', value: '20:00' },
  { label: '9:00 pm', value: '21:00' },
  { label: '10:00 pm', value: '22:00' },
  { label: '11:00 pm', value: '23:00' },
];

interface Capacidades {
  disponibilidad?: { dias: string[]; horarios: Array<{ de: string; a: string }> };
  ofrece_casa_hogar?: boolean;
  capacidad_animales?: number;
  especies?: string[];
  tamanios?: string[];
  otros_animales_en_casa?: boolean;
  ninos_en_casa?: boolean;
  tiene_vehiculo?: boolean;
  latitud?: number;
  longitud?: number;
  experiencia_previa?: string;
  acepto_terminos?: boolean;
}

interface Props {
  onClose?: () => void;
  fromProfile?: boolean;
}

export default function CapacidadesFormScreen({ onClose, fromProfile = false }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const { width: screenWidth } = useWindowDimensions();

  const [diasSeleccionados, setDiasSeleccionados] = useState<string[]>([]);
  const [horaApertura, setHoraApertura] = useState('09:00');
  const [horaCierre, setHoraCierre] = useState('18:00');

  // Estados para el Modal de horas
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<'apertura' | 'cierre' | null>(null);

  const [ofreceCasaHogar, setOfreceCasaHogar] = useState(false);
  const [capacidadAnimales, setCapacidadAnimales] = useState(1);
  const [especiesSeleccionadas, setEspeciesSeleccionadas] = useState<string[]>([]);
  const [tamanosSeleccionados, setTamanosSeleccionados] = useState<string[]>([]);
  const [otrosAnimales, setOtrosAnimales] = useState(false);
  const [ninos, setNinos] = useState(false);

  const [tieneVehiculo, setTieneVehiculo] = useState(false);

  const [ubicacion, setUbicacion] = useState<{ latitud: number; longitud: number }>({ latitud: 19.0414, longitud: -98.2063 });
  const [ubicacionConfirmada, setUbicacionConfirmada] = useState(false);
  const [isLoadingGps, setIsLoadingGps] = useState(false);

  const [experiencia, setExperiencia] = useState('');
  const [aceptoTerminos, setAceptoTerminos] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const ESPECIES = ['perro', 'gato', 'otro'];
  const TAMANOS = ['pequeno', 'mediano', 'grande'];

  useEffect(() => {
    const cargarCapacidades = async () => {
      try {
        if (!token) {
          setIsLoading(false);
          return;
        }
        const response = await axios.get(`${API_URL}/voluntarios/me/capacidades`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const cap = response.data;
        if (cap?.disponibilidad?.dias) setDiasSeleccionados(cap.disponibilidad.dias);
        if (cap?.disponibilidad?.horarios?.[0]) {
          setHoraApertura(cap.disponibilidad.horarios[0].de);
          setHoraCierre(cap.disponibilidad.horarios[0].a);
        }
        setOfreceCasaHogar(cap?.ofrece_casa_hogar ?? false);
        setCapacidadAnimales(cap?.capacidad_animales ?? 1);
        setEspeciesSeleccionadas(cap?.especies ?? []);
        setTamanosSeleccionados(cap?.tamanios ?? []);
        setOtrosAnimales(cap?.otros_animales_en_casa ?? false);
        setNinos(cap?.ninos_en_casa ?? false);
        setTieneVehiculo(cap?.tiene_vehiculo ?? false);
        
        const lat = cap?.latitud;
        const lng = cap?.longitud;
        if (lat && lng) {
          setUbicacion({ latitud: lat, longitud: lng });
          setUbicacionConfirmada(true);
        }
        setExperiencia(cap?.experiencia_previa ?? '');
        setAceptoTerminos(cap?.acepto_terminos ?? false);
      } catch (err) {
        console.error('Error cargando capacidades:', err);
      } finally {
        setIsLoading(false);
      }
    };
    cargarCapacidades();
  }, [token]);

  const handleGetLocation = async () => {
    try {
      setIsLoadingGps(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast({ title: 'Permiso denegado', description: 'No pudimos acceder a tu ubicación.', type: 'error' });
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      setUbicacion({ latitud: location.coords.latitude, longitud: location.coords.longitude });
      setUbicacionConfirmada(true);
    } catch (err) {
      showToast({ title: 'Error', description: 'No pudimos obtener tu ubicación.', type: 'error' });
    } finally {
      setIsLoadingGps(false);
    }
  };

  const toggleDia = (dia: string) => {
    setDiasSeleccionados(prev => prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]);
    setErrors(prev => ({ ...prev, dias: '' }));
  };

  const toggleEspecie = (especie: string) => {
    setEspeciesSeleccionadas(prev => prev.includes(especie) ? prev.filter(e => e !== especie) : [...prev, especie]);
  };

  const toggleTamano = (tamano: string) => {
    setTamanosSeleccionados(prev => prev.includes(tamano) ? prev.filter(t => t !== tamano) : [...prev, tamano]);
  };

  const openTimePicker = (target: 'apertura' | 'cierre') => {
    setTimePickerTarget(target);
    setShowTimePicker(true);
  };

  const handleSelectTime = (value: string) => {
    if (timePickerTarget === 'apertura') {
      setHoraApertura(value);
    } else if (timePickerTarget === 'cierre') {
      setHoraCierre(value);
    }
    setShowTimePicker(false);
    setErrors(prev => ({ ...prev, horaApertura: '', horaCierre: '' }));
  };

  // Función para obtener la etiqueta "9:00 am" a partir del valor "09:00"
  const getDisplayTime = (val: string) => {
    return TIME_OPTIONS.find(o => o.value === val)?.label || val;
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (diasSeleccionados.length === 0) newErrors.dias = 'Selecciona al menos un día disponible.';
    if (!horaApertura) newErrors.horaApertura = 'Selecciona la hora de inicio.';
    if (!horaCierre) newErrors.horaCierre = 'Selecciona la hora de fin.';

    if (ofreceCasaHogar) {
      if (especiesSeleccionadas.length === 0) newErrors.especies = 'Selecciona al menos una especie que puedas acoger.';
      if (tamanosSeleccionados.length === 0) newErrors.tamanos = 'Selecciona al menos un tamaño.';
    }

    if (!ubicacionConfirmada || !ubicacion.latitud || !ubicacion.longitud) {
      newErrors.ubicacion = 'Por favor, confirma tu zona de cobertura en el mapa.';
    }

    if (!aceptoTerminos) newErrors.aceptoTerminos = 'Debes aceptar los términos y condiciones.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const disponibilidad = {
        dias: diasSeleccionados,
        horarios: [{ de: horaApertura, a: horaCierre }],
      };

      const payload: Capacidades = {
        disponibilidad,
        ofrece_casa_hogar: ofreceCasaHogar,
        capacidad_animales: ofreceCasaHogar ? capacidadAnimales : 0,
        especies: ofreceCasaHogar ? especiesSeleccionadas : [],
        tamanios: ofreceCasaHogar ? tamanosSeleccionados : [],
        otros_animales_en_casa: otrosAnimales,
        ninos_en_casa: ninos,
        tiene_vehiculo: tieneVehiculo,
        latitud: ubicacion.latitud,
        longitud: ubicacion.longitud,
        experiencia_previa: experiencia.trim(),
        acepto_terminos: aceptoTerminos,
      };

      await axios.put(`${API_URL}/voluntarios/me/capacidades`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      showToast({ title: '¡Listo!', description: 'Tus capacidades han sido guardadas.', type: 'success' });

      if (fromProfile) {
        if (onClose) onClose();
      } else {
        router.push('/(tabs)/profile');
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al guardar tus capacidades.';
      showToast({ title: 'Error', description: message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasUnsavedChanges = () => {
    return (
      diasSeleccionados.length > 0 ||
      especiesSeleccionadas.length > 0 ||
      experiencia.trim() !== '' ||
      ofreceCasaHogar ||
      tieneVehiculo ||
      aceptoTerminos
    );
  };

  const handleCloseRequest = () => {
    if (hasUnsavedChanges()) {
      setShowCloseConfirm(true);
    } else {
      if (onClose) onClose();
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <View style={styles.headerContent}>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Cargando...</Text>
            </View>
          </View>
        </View>
        <View style={[styles.bodySection, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Toast toast={toast} translateY={translateY} />

      <View style={styles.headerSection}>
        <View style={styles.headerContent}>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Mis Capacidades</Text>
            <Text style={styles.headerSubtitle}>Cuéntanos cómo puedes ayudar</Text>
          </View>
        </View>
        <Image
          pointerEvents="none"
          source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3047/3047928.png' }}
          style={styles.decorationImage}
          resizeMode="contain"
        />
      </View>

      <View style={styles.bodySection}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* ─── Disponibilidad ─── */}
          <FormSection title="Disponibilidad" subtitle="¿Qué días y horas puedes atender?">
            <Text style={styles.sectionLabel}>Días disponibles *</Text>
            <View style={styles.daysContainer}>
              {DIAS_SEMANA.map((dia, idx) => {
                const valor = DIAS_VALORES[idx];
                const isSelected = diasSeleccionados.includes(valor);
                return (
                  <TouchableOpacity
                    key={valor}
                    onPress={() => toggleDia(valor)}
                    style={[styles.dayChip, { backgroundColor: isSelected ? COLORS.primary : COLORS.grayLight }]}
                  >
                    <Text style={[styles.dayChipText, { color: isSelected ? COLORS.bgWhite : COLORS.textLight }]}>
                      {dia}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors.dias && <Text style={styles.errorText}>{errors.dias}</Text>}

            <View style={{ marginTop: 20 }}>
              <Text style={styles.sectionLabel}>Rango horario *</Text>
              <View style={styles.timeContainer}>
                {/* Botones que abren el Modal de Horario */}
                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>Desde</Text>
                  <TouchableOpacity onPress={() => openTimePicker('apertura')} style={styles.timeSelectorBtn}>
                    <Text style={styles.timeSelectorBtnText}>{getDisplayTime(horaApertura)}</Text>
                    <Ionicons name="chevron-down" size={16} color={COLORS.textLight} />
                  </TouchableOpacity>
                </View>
                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>Hasta</Text>
                  <TouchableOpacity onPress={() => openTimePicker('cierre')} style={styles.timeSelectorBtn}>
                    <Text style={styles.timeSelectorBtnText}>{getDisplayTime(horaCierre)}</Text>
                    <Ionicons name="chevron-down" size={16} color={COLORS.textLight} />
                  </TouchableOpacity>
                </View>
              </View>
              {(errors.horaApertura || errors.horaCierre) && (
                <Text style={styles.errorText}>{errors.horaApertura || errors.horaCierre}</Text>
              )}
            </View>
          </FormSection>

          <Divider />

          {/* ─── Casa Hogar ─── */}
          <FormSection title="Casa Hogar" subtitle="¿Ofreces espacio en tu hogar para animales?">
            <TouchableOpacity
              onPress={() => setOfreceCasaHogar(!ofreceCasaHogar)}
              style={[
                styles.checkboxContainer,
                { borderColor: ofreceCasaHogar ? COLORS.primary : COLORS.border }
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  { backgroundColor: ofreceCasaHogar ? COLORS.primary : 'transparent', borderColor: COLORS.primary }
                ]}
              >
                {ofreceCasaHogar && <Ionicons name="checkmark" size={18} color={COLORS.bgWhite} />}
              </View>
              <Text style={styles.checkboxLabel}>Ofrezco espacio en mi casa hogar</Text>
            </TouchableOpacity>

            {ofreceCasaHogar && (
              <View style={{ marginTop: 20 }}>
                <Text style={styles.sectionLabel}>Capacidad de animales *</Text>
                <View style={styles.capacityContainer}>
                  {[1, 2].map(cap => (
                    <TouchableOpacity
                      key={cap}
                      onPress={() => setCapacidadAnimales(cap)}
                      style={[
                        styles.capacityChip,
                        { backgroundColor: capacidadAnimales === cap ? COLORS.secondary : COLORS.grayLight }
                      ]}
                    >
                      <Text
                        style={[
                          styles.capacityChipText,
                          { color: capacidadAnimales === cap ? COLORS.textDark : COLORS.textLight }
                        ]}
                      >
                        {cap} animal{cap > 1 ? 'es' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Especies que puedes acoger *</Text>
                <View style={styles.chipContainer}>
                  {ESPECIES.map(especie => {
                    const isSelected = especiesSeleccionadas.includes(especie);
                    return (
                      <TouchableOpacity
                        key={especie}
                        onPress={() => toggleEspecie(especie)}
                        style={[
                          styles.chip,
                          { backgroundColor: isSelected ? COLORS.primary : COLORS.grayLight }
                        ]}
                      >
                        <Text
                          style={{
                            fontWeight: '700',
                            fontSize: 13,
                            color: isSelected ? COLORS.bgWhite : COLORS.textLight,
                            textTransform: 'capitalize'
                          }}
                        >
                          {especie}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {errors.especies && <Text style={styles.errorText}>{errors.especies}</Text>}

                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Tamaños de animales *</Text>
                <View style={styles.chipContainer}>
                  {TAMANOS.map(tamano => {
                    const isSelected = tamanosSeleccionados.includes(tamano);
                    return (
                      <TouchableOpacity
                        key={tamano}
                        onPress={() => toggleTamano(tamano)}
                        style={[
                          styles.chip,
                          { backgroundColor: isSelected ? COLORS.secondary : COLORS.grayLight }
                        ]}
                      >
                        <Text
                          style={{
                            fontWeight: '700',
                            fontSize: 13,
                            color: isSelected ? COLORS.textDark : COLORS.textLight,
                            textTransform: 'capitalize'
                          }}
                        >
                          {tamano}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {errors.tamanos && <Text style={styles.errorText}>{errors.tamanos}</Text>}

                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Tu situación en casa</Text>
                <TouchableOpacity
                  onPress={() => setOtrosAnimales(!otrosAnimales)}
                  style={[styles.checkboxContainer, { borderColor: COLORS.border }]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      { backgroundColor: otrosAnimales ? COLORS.primary : 'transparent', borderColor: COLORS.primary }
                    ]}
                  >
                    {otrosAnimales && <Ionicons name="checkmark" size={16} color={COLORS.bgWhite} />}
                  </View>
                  <Text style={styles.checkboxLabel}>Tengo otros animales en casa</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setNinos(!ninos)}
                  style={[styles.checkboxContainer, { borderColor: COLORS.border, marginTop: 12 }]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      { backgroundColor: ninos ? COLORS.primary : 'transparent', borderColor: COLORS.primary }
                    ]}
                  >
                    {ninos && <Ionicons name="checkmark" size={16} color={COLORS.bgWhite} />}
                  </View>
                  <Text style={styles.checkboxLabel}>Tengo niños en casa</Text>
                </TouchableOpacity>
              </View>
            )}
          </FormSection>

          <Divider />

          {/* ─── Transporte ─── */}
          <FormSection title="Transporte" subtitle="¿Cuentas con vehículo?">
            <TouchableOpacity
              onPress={() => setTieneVehiculo(!tieneVehiculo)}
              style={[styles.checkboxContainer, { borderColor: COLORS.border }]}
            >
              <View
                style={[
                  styles.checkbox,
                  { backgroundColor: tieneVehiculo ? COLORS.primary : 'transparent', borderColor: COLORS.primary }
                ]}
              >
                {tieneVehiculo && <Ionicons name="checkmark" size={18} color={COLORS.bgWhite} />}
              </View>
              <Text style={styles.checkboxLabel}>Tengo vehículo disponible</Text>
            </TouchableOpacity>
          </FormSection>

          <Divider />

          {/* ─── Zona de Cobertura ─── */}
          <FormSection title="Zona de Cobertura" subtitle="¿Desde qué zona puedes ayudar? Puede ser aproximado (el centro de tu colonia está bien).">
            <TouchableOpacity onPress={handleGetLocation} style={styles.locationButton} disabled={isLoadingGps}>
              <Ionicons name="location" size={18} color={COLORS.bgTeal} />
              <Text style={styles.locationButtonText}>
                {isLoadingGps ? 'Obteniendo tu ubicación...' : 'Usar mi ubicación actual'}
              </Text>
            </TouchableOpacity>

            <View
              style={[
                styles.mapContainer,
                { borderWidth: errors.ubicacion ? 2 : 0, borderColor: COLORS.danger }
              ]}
            >
              <LocationPickerMap
                selectedPosition={ubicacion}
                onLocationSelect={(lat, lng) => {
                  setUbicacion({ latitud: lat, longitud: lng });
                  setUbicacionConfirmada(true);
                  setErrors(prev => ({ ...prev, ubicacion: '' }));
                }}
              />
            </View>
            {errors.ubicacion && <Text style={styles.errorText}>{errors.ubicacion}</Text>}
          </FormSection>

          <Divider />

          {/* ─── Experiencia ─── */}
          <FormSection title="Experiencia" subtitle="Cuéntanos sobre tu experiencia con animales.">
            {/* Se cambia a TextInput normal para evitar confusión de importar componentes sin usar */}
            <View style={[styles.textArea, { backgroundColor: COLORS.grayLight, padding: 0 }]}>
              <Text style={{ display: 'none' }} /> {/* Fix temporal si requería import custom */}
              <textarea 
                value={experiencia}
                onChange={(e) => setExperiencia(e.target.value)}
                placeholder="Ej. He trabajado 2 años en un refugio, tengo experiencia con perros de gran tamaño..."
                maxLength={500}
                style={{
                  width: '100%', height: 100, backgroundColor: 'transparent',
                  border: 'none', padding: 12, outline: 'none',
                  fontFamily: 'inherit', fontSize: 14, color: COLORS.textDark,
                  resize: 'none'
                }}
              />
            </View>
            <Text style={styles.charCounter}>{experiencia.length}/500</Text>
          </FormSection>

          <Divider />

          {/* ─── Términos y Condiciones ─── */}
          <FormSection title="Términos y Privacidad">
            <TouchableOpacity
              onPress={() => setAceptoTerminos(!aceptoTerminos)}
              style={[
                styles.checkboxContainer,
                { borderColor: aceptoTerminos ? COLORS.primary : COLORS.border }
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  { backgroundColor: aceptoTerminos ? COLORS.primary : 'transparent', borderColor: COLORS.primary }
                ]}
              >
                {aceptoTerminos && <Ionicons name="checkmark" size={18} color={COLORS.bgWhite} />}
              </View>
              <Text style={styles.checkboxLabel}>
                Acepto los términos y condiciones, y el aviso de privacidad *
              </Text>
            </TouchableOpacity>
            {errors.aceptoTerminos && <Text style={styles.errorText}>{errors.aceptoTerminos}</Text>}

            <View style={styles.termsBox}>
              <Text style={styles.termsText}>
                Al aceptar, reconozco que proporcionaré información veraz, que mantendré comunicación continua
                con la asociación, y que cumpliré con los protocolos de seguridad y bienestar animal.
              </Text>
            </View>
          </FormSection>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={[styles.submitButton, { backgroundColor: COLORS.primary }]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={COLORS.bgWhite} />
            ) : (
              <Text style={styles.submitButtonText}>Guardar Capacidades</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* MODAL: Selector de Horario */}
      <Modal visible={showTimePicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTimePicker(false)}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                Selecciona la hora de {timePickerTarget === 'apertura' ? 'inicio' : 'fin'}
              </Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
              {TIME_OPTIONS.map((item) => (
                <TouchableOpacity
                  key={item.value}
                  style={styles.pickerOption}
                  onPress={() => handleSelectTime(item.value)}
                >
                  <Text style={styles.pickerOptionText}>{item.label}</Text>
                  {((timePickerTarget === 'apertura' && horaApertura === item.value) ||
                    (timePickerTarget === 'cierre' && horaCierre === item.value)) && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal de confirmación al cerrar */}
      <Modal visible={showCloseConfirm} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 32, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 16, textAlign: 'center' }}>
              ¿Descartar cambios?
            </Text>
            <Text style={{ fontSize: 15, color: COLORS.textLight, textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>
              Tienes cambios sin guardar. ¿Estás seguro de que deseas salir sin guardar?
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowCloseConfirm(false)}
                style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: '#E5E7EB' }}
              >
                <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}>Volver</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowCloseConfirm(false);
                  if (onClose) onClose();
                }}
                style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: COLORS.danger }}
              >
                <Text style={{ color: COLORS.bgWhite, fontWeight: 'bold' }}>Descartar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode; }) {
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
  container: {
    flex: 1,
    backgroundColor: COLORS.bgWhite,
  },

  headerSection: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 32,
    backgroundColor: COLORS.bgTeal,
    position: 'relative',
    overflow: 'hidden',
  },

  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 10,
  },

  headerText: {
    flex: 1,
    zIndex: 10,
  },

  headerTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.bgWhite,
  },

  headerSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.bgWhite,
    opacity: 0.9,
  },

  decorationImage: {
    width: 120,
    height: 120,
    position: 'absolute',
    bottom: -10,
    right: 30,
    zIndex: 0,
  },

  bodySection: {
    flex: 1,
    backgroundColor: COLORS.bgWhite,
    paddingHorizontal: 32,
    paddingTop: 32,
  },

  scrollContent: {
    paddingBottom: 40,
  },

  formSection: {
    marginBottom: 24,
  },

  formSectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 4,
  },

  formSectionSubtitle: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 16,
  },

  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 8,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 24,
  },

  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },

  dayChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },

  dayChipText: {
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'capitalize',
  },

  timeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },

  timeField: {
    flex: 1,
  },

  timeLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 6,
    fontWeight: '600',
  },

  // Botón selector que abre el modal
  timeSelectorBtn: {
    backgroundColor: COLORS.grayLight,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  timeSelectorBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
  },

  // Estilos del Modal de Horario
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },

  pickerModalContent: {
    backgroundColor: COLORS.bgWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 30, // Safe area
    maxHeight: '60%',
  },

  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  pickerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
  },

  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
  },

  pickerOptionText: {
    fontSize: 16,
    color: COLORS.textDark,
    fontWeight: '600',
  },

  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 2,
    borderRadius: 12,
    borderColor: COLORS.border,
    marginBottom: 8,
    backgroundColor: COLORS.grayLight,
  },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    flex: 1,
  },

  capacityContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },

  capacityChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },

  capacityChipText: {
    fontWeight: '700',
    fontSize: 13,
  },

  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },

  locationButton: {
    backgroundColor: 'rgba(102, 188, 180, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.bgTeal,
  },

  locationButtonText: {
    color: COLORS.bgTeal,
    fontWeight: '600',
    fontSize: 13,
  },

  mapContainer: {
    marginBottom: 16,
  },

  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },

  charCounter: {
    textAlign: 'right',
    color: COLORS.textLight,
    fontSize: 12,
    marginTop: 6,
    marginBottom: 16,
  },

  termsBox: {
    backgroundColor: 'rgba(102, 188, 180, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(102, 188, 180, 0.2)',
  },

  termsText: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 18,
  },

  submitButton: {
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },

  submitButtonText: {
    color: COLORS.bgWhite,
    fontWeight: '900',
    fontSize: 16,
  },

  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
    marginTop: -8,
    marginBottom: 12,
  },
});