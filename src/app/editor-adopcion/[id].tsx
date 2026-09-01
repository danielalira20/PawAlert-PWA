import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { Toast, useToast } from '../../components/Toast';
import { Input } from '../../components/ui/Input';

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
const PASO_NOMBRES = ['Datos Básicos', 'Estado Médico', 'Fotografías', 'Requisitos', 'Publicar'];
const TOTAL_PASOS = 5;

export default function AdoptionProfileEditorScreen() {
  const { id } = useLocalSearchParams(); // Capturamos el ID de la URL
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [paso, setPaso] = useState(1);
  const [perfil, setPerfil] = useState<any>(null);

  // Estados base del formulario (Paso 1)
  const [nombrePublico, setNombrePublico] = useState('');
  const [sexo, setSexo] = useState('desconocido');
  const [edad, setEdad] = useState('desconocido');
  const [descripcion, setDescripcion] = useState('');
  const [personalidad, setPersonalidad] = useState('');

  // Estados Médicos (Paso 2)
  const [salud, setSalud] = useState('');
  const [tratamientos, setTratamientos] = useState('');
  const [necesidades, setNecesidades] = useState('');
  const [vacunas, setVacunas] = useState('desconocido');
  const [esterilizacion, setEsterilizacion] = useState('desconocido');

  useEffect(() => {
    cargarPerfil();
  }, [id]);

  const cargarPerfil = async () => {
    if (!token || !id) return;
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/adoptions/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = res.data;
      setPerfil(data);
      setNombrePublico(data.nombre_publico || '');
      setSexo(data.sexo || 'desconocido');
      setEdad(data.edad_aproximada || 'desconocido');
      setDescripcion(data.descripcion || '');
      setPersonalidad(data.personalidad || '');
      setSalud(data.salud_conocida || '');
      setTratamientos(data.tratamientos || '');
      setNecesidades(data.necesidades_especiales || '');
      setVacunas(data.vacunacion_estado || 'desconocido');
      setEsterilizacion(data.esterilizacion_estado || 'desconocido');
    } catch (error) {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos cargar el expediente.' });
      setTimeout(() => router.back(), 2000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSiguiente = () => {
    if (paso < TOTAL_PASOS) setPaso(paso + 1);
  };

  const handleAnterior = () => {
    if (paso === 1) {
      router.back();
    } else {
      setPaso(paso - 1);
    }
  };

  // ─── Renders ───
  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={{ flexDirection: 'row', alignItems: 'center', zIndex: 10 }}>
        <TouchableOpacity onPress={handleAnterior} style={styles.headerBackButton}>
          <Feather name="chevron-left" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Expediente de Adopción</Text>
          <Text style={styles.headerSubtitle}>
            Paso {paso} de {TOTAL_PASOS}: {PASO_NOMBRES[paso - 1]}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Feather name="x" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, marginTop: 18, zIndex: 10 }}>
        <View style={{ height: 4, backgroundColor: COLORS.secondary, borderRadius: 2, width: `${(paso / TOTAL_PASOS) * 100}%` }} />
      </View>
      <Image source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3047/3047928.png' }} style={styles.decorationImage} resizeMode="contain" />
    </View>
  );

  const renderPaso1 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>Datos Públicos del Animal</Text>
        <Text style={styles.formSectionSubtitle}>Esta información será visible en la galería de adopciones.</Text>
        
        <Input 
          label="Nombre Público" 
          placeholder="Ej. Max" 
          value={nombrePublico} 
          onChangeText={setNombrePublico} 
          required 
        />
        
        <Input 
          label="Historia y Descripción" 
          placeholder="¿Cómo es su día a día? ¿Qué le gusta hacer?" 
          value={descripcion} 
          onChangeText={setDescripcion} 
          multiline 
          style={{ height: 100, textAlignVertical: 'top' } as any} 
        />
      </View>

      <TouchableOpacity onPress={handleSiguiente} style={styles.submitButton}>
        <Text style={styles.submitButtonText}>Siguiente →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
const renderPaso2 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>Estado Médico</Text>
        <Text style={styles.formSectionSubtitle}>Transparencia sobre la salud actual del animal.</Text>
        
        <Input label="Salud General" placeholder="Ej. Sano, en tratamiento por desnutrición." value={salud} onChangeText={setSalud} multiline style={{ height: 70, textAlignVertical: 'top' } as any} required />
        <Input label="Tratamientos Activos (Opcional)" placeholder="Ej. Requiere curaciones diarias." value={tratamientos} onChangeText={setTratamientos} multiline style={{ height: 70, textAlignVertical: 'top' } as any} />
        <Input label="Necesidades Especiales (Opcional)" placeholder="Ej. Dieta especial, usa silla de ruedas." value={necesidades} onChangeText={setNecesidades} multiline style={{ height: 70, textAlignVertical: 'top' } as any} />

        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8, marginTop: 8 }}>Estado de Vacunación</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {(['completo', 'parcial', 'pendiente', 'no_aplica', 'desconocido'] as const).map(opcion => (
            <TouchableOpacity key={opcion} onPress={() => setVacunas(opcion)} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: vacunas === opcion ? COLORS.secondary : '#D1D5DB', backgroundColor: vacunas === opcion ? 'rgba(237,197,91,0.15)' : COLORS.bgWhite, alignItems: 'center' }}>
              <Text style={{ color: vacunas === opcion ? COLORS.textDark : COLORS.textLight, fontWeight: vacunas === opcion ? '800' : '600', textTransform: 'capitalize', fontSize: 12 }}>{opcion.replace('_', ' ')}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Estado de Esterilización</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {(['completo', 'pendiente', 'no_aplica', 'desconocido'] as const).map(opcion => (
            <TouchableOpacity key={opcion} onPress={() => setEsterilizacion(opcion)} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: esterilizacion === opcion ? COLORS.secondary : '#D1D5DB', backgroundColor: esterilizacion === opcion ? 'rgba(237,197,91,0.15)' : COLORS.bgWhite, alignItems: 'center' }}>
              <Text style={{ color: esterilizacion === opcion ? COLORS.textDark : COLORS.textLight, fontWeight: esterilizacion === opcion ? '800' : '600', textTransform: 'capitalize', fontSize: 12 }}>{opcion.replace('_', ' ')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
  if (isLoading) {
    return (
      <View style={styles.outerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: COLORS.bgWhite, marginTop: 12, fontWeight: '700' }}>Cargando expediente...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.outerContainer, { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any]}>
      <Toast toast={toast} translateY={translateY} />
      
      <View style={styles.centeredContent}>
        <View style={styles.cardContainer}>
          {renderHeader()}

          <View style={styles.bodySection}>
            {paso === 1 && renderPaso1()}
            {paso === 2 && renderPaso2()}
            {paso === 3 && <Text style={styles.placeholderText}>Aquí irá el gestor de Fotografías</Text>}
            {paso === 4 && <Text style={styles.placeholderText}>Aquí irán los Requisitos Adicionales</Text>}
            {paso === 5 && <Text style={styles.placeholderText}>Aquí irá la previsualización y el botón de Publicar</Text>}
            
            {paso > 1 && (
              <TouchableOpacity onPress={handleSiguiente} style={styles.submitButton}>
                <Text style={styles.submitButtonText}>{paso === TOTAL_PASOS ? 'Publicar Perfil' : 'Siguiente →'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1, backgroundColor: 'rgba(38,30,24,0.8)', // Fondo oscuro elegante
    justifyContent: 'center', alignItems: 'center', padding: 20
  },
  centeredContent: { width: '100%', maxWidth: FORM_MAX_WIDTH, maxHeight: '95%', alignSelf: 'center', flex: 1 },
  cardContainer: {
    flex: 1, backgroundColor: COLORS.bgWhite, borderRadius: 32, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 15,
  },
  headerSection: { paddingHorizontal: 32, paddingTop: 24, paddingBottom: 32, backgroundColor: COLORS.bgTeal, position: 'relative', zIndex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.bgWhite },
  headerSubtitle: { fontSize: 13, fontWeight: '600', color: COLORS.bgWhite, opacity: 0.9, marginTop: 4 },
  headerBackButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  closeButton: { backgroundColor: 'rgba(255,255,255,0.3)', padding: 8, borderRadius: 20 },
  decorationImage: { width: 120, height: 120, position: 'absolute', bottom: -10, right: 30, zIndex: 0 },
  bodySection: { flex: 1, backgroundColor: COLORS.bgWhite, borderTopLeftRadius: 40, borderTopRightRadius: 40, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 20, zIndex: 2 },
  scrollContent: { paddingBottom: 40 },
  formSection: { marginBottom: 24 },
  formSectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 },
  formSectionSubtitle: { fontSize: 13, color: COLORS.textLight, marginBottom: 16 },
  submitButton: { backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 24, alignItems: 'center', marginTop: 16 },
  submitButtonText: { color: COLORS.bgWhite, fontWeight: '900', fontSize: 16 },
  placeholderText: { fontSize: 16, color: COLORS.textLight, textAlign: 'center', marginTop: 40, fontWeight: '600' }
});