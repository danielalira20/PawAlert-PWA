import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Modal, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast, Toast } from '../components/Toast';
import axios from 'axios';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { getAnimales, animalMasGrave } from '../types/reporte';

// ─── PALETA DE COLORES PETZEN ───
const COLORS = {
  bg: '#E8CCAD',
  primary: '#EC802B',
  secondary: '#EDC55B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  cardBg: '#FAF3EA'
};

const SHADOW_SM = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 2,
};

type CategoriaRecurso = 'Alimentos' | 'Insumos Médicos' | 'Servicios Veterinarios' | 'Difusión' | 'Transporte' | 'Hogar Temporal';
type NivelUrgencia = 'Baja' | 'Media' | 'Alta';

const CATEGORIAS: { id: CategoriaRecurso; icono: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'Alimentos', icono: 'nutrition-outline' },
  { id: 'Insumos Médicos', icono: 'medkit-outline' },
  { id: 'Servicios Veterinarios', icono: 'pulse-outline' },
  { id: 'Difusión', icono: 'megaphone-outline' },
  { id: 'Transporte', icono: 'car-outline' },
  { id: 'Hogar Temporal', icono: 'home-outline' },
];

// MOCK: Tabla 'subcategoria_recurso' basada en datos reales
const SUBCATEGORIAS_MOCK: Record<string, { id: string, nombre: string }[]> = {
  'Alimentos': [
    { id: 'a64f9bce-3ed4-4a82-b6bd-a70b00e14a92', nombre: 'Croquetas' },
    { id: '065ef372-efe2-4238-8b32-1f03ed8039ec', nombre: 'Alimento húmedo (latas, sobres)' },
    { id: 'c7d3642a-79fb-4560-b95d-f52a1c011df1', nombre: 'Fórmula para crías' }
  ],
  'Insumos Médicos': [
    { id: 'fc521ed7-1659-404b-be06-6a4b3cc47409', nombre: 'Material de curación' },
    { id: '49fc255f-26a9-4f93-abe2-00f9dfcf61c1', nombre: 'Kit médico animal' },
    { id: '686113c0-0a26-4153-9d80-518d07544d90', nombre: 'Arena sanitaria' },
    { id: '2b6ea89a-e7b8-4e5d-9a22-0464d0deb91f', nombre: 'Material de limpieza' },
    { id: '72ef61e0-5431-437e-918a-b6d826664302', nombre: 'Correas' },
    { id: '83da04a3-600d-42a2-b221-3ecb89de29f1', nombre: 'Bozales' },
    { id: 'b8b16048-0f56-438b-99e0-9b058309f2cd', nombre: 'Transportadoras' },
    { id: 'befdfe9f-0873-4537-9400-360d7cb8df66', nombre: 'Cobijas' },
    { id: 'dbe913a0-9fe5-4929-8917-03b963e254ef', nombre: 'Camas' },
    { id: 'e2262f0a-4a2a-4e7c-8e73-d342ccd89aa8', nombre: 'Collares' }
  ],
  'Servicios Veterinarios': [
    { id: '7f177586-aa6f-45b3-83a4-8df1f6c7188c', nombre: 'Consulta general o de urgencia' },
    { id: 'cd543257-db83-45ea-b53f-017d62e11256', nombre: 'Medicamentos' },
    { id: '3171a143-2ac2-4365-8ab4-3da40bd634e9', nombre: 'Hospitalización' },
    { id: '608d3116-7514-452f-96b9-ca45d6cfb8b6', nombre: 'Vacunación y esterilización' },
    { id: 'bfeb7215-e2f6-442e-b4ab-bb32fc685b70', nombre: 'Curaciones y cirugía' },
    { id: 'cb4824b7-733f-453c-bb0e-8df3bbff4c34', nombre: 'Diagnóstico y estudios' }
  ],
  'Difusión': [
    { id: '0b65642a-64f7-4520-b224-76094dc047f0', nombre: 'Servicios profesionales o tecnológicos' },
    { id: '54ba0656-24b5-4e62-8b34-50e474bba7d2', nombre: 'Espacios para eventos' },
    { id: '6bba0617-1584-4538-9e56-a7ffc02ddd39', nombre: 'Publicidad digital o impresa' },
    { id: 'ffe24da7-2686-454e-a23a-5d9a170b6f1f', nombre: 'Jornadas comunitarias' }
  ]
};

export default function CreateNeedScreen() {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [tipoNecesidad, setTipoNecesidad] = useState<'general' | 'especifica'>('general');
  const [reporteId, setReporteId] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<CategoriaRecurso | null>(null);
  const [subcategoriaId, setSubcategoriaId] = useState<string | null>(null);
  const [urgencia, setUrgencia] = useState<NivelUrgencia | null>(null);
  
  // Nuevos campos
  const [cantidadValor, setCantidadValor] = useState('');
  const [cantidadUnidad, setCantidadUnidad] = useState('');
  const [notasAdicionales, setNotasAdicionales] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Estados para reportes dinámicos
  const [reportesActivos, setReportesActivos] = useState<{id: string, titulo: string, ubicacion: string}[]>([]);
  const [isLoadingReportes, setIsLoadingReportes] = useState(false);

  // FETCH DE REPORTES REALES
  useEffect(() => {
    const cargarCasosActivos = async () => {
      setIsLoadingReportes(true);
      try {
        const res = await axios.get(`${API_URL}/associations/me/reportes`, { 
          headers: { Authorization: `Bearer ${token}` } 
        });
        
        // Filtramos para mostrar solo casos que están en curso (no rechazados ni completados)
        const casosEnCurso = res.data.filter((r: any) => 
          !['rechazada', 'cancelada', 'completada'].includes(r.estado_asignacion_clave)
        );

        // Mapeamos los datos para armar la tarjeta visual
        const casosMapeados = casosEnCurso.map((reporte: any) => {
          const animales = getAnimales(reporte);
          const grave = animalMasGrave(animales);
          
          // Armamos un título dinámico
          const tipo = grave?.tipo_animal || 'Animal';
          const tituloCase = tipo.charAt(0).toUpperCase() + tipo.slice(1);
          
          // Armamos la ubicación
          const ubicacionStr = [reporte.colonia, reporte.municipio].filter(Boolean).join(', ') || 'Ubicación desconocida';

          return {
            id: reporte.reporte_id, // Este es el UUID de la base de datos
            titulo: `${tituloCase} en estado ${grave?.condicion || 'desconocido'}`,
            ubicacion: ubicacionStr
          };
        });

        setReportesActivos(casosMapeados);
      } catch (error) {
        console.error("Error al cargar los casos activos:", error);
      } finally {
        setIsLoadingReportes(false);
      }
    };

    if (token) {
      cargarCasosActivos();
    }
  }, [token]);

  const handleGuardarNecesidad = async () => {
    const newErrors: Record<string, string> = {};
    if (tipoNecesidad === 'especifica' && !reporteId) {
      newErrors.reporte = 'Debes seleccionar un caso activo.';
    }
    if (!categoria) {
      newErrors.categoria = 'Debes seleccionar una categoría.';
    }
    if (categoria === 'Servicios Veterinarios' && !urgencia) {
      newErrors.urgencia = 'Indica la urgencia médica.';
    }
    if (cantidadValor && !cantidadUnidad) {
      newErrors.cantidad_unidad = 'Indica la unidad (Ej. kg, piezas).';
    }
    if (cantidadUnidad && !cantidadValor) {
      newErrors.cantidad_valor = 'Indica la cantidad numérica.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast({ type: 'warning', title: 'Faltan datos', message: 'Revisa los campos requeridos.' });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const payload = {
        reporte_id: reporteId,
        categoria: categoria,
        urgencia: urgencia,
        subcategoria_id: subcategoriaId, 
        cantidad_valor: cantidadValor ? parseFloat(cantidadValor) : null,
        cantidad_unidad: cantidadUnidad || null,
        detalle: notasAdicionales ? { notas: notasAdicionales } : {}
      };

      await axios.post(`${API_URL}/associations/me/necesidades`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      showToast({ type: 'success', title: '¡Necesidad publicada!', message: 'Los aliados compatibles serán notificados.' });
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      let errorMsg = 'No se pudo publicar la necesidad.';
      if (error?.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          errorMsg = `Error en ${detail[0].loc[1]}: ${detail[0].msg}`;
        } else if (typeof detail === 'string') {
          errorMsg = detail;
        }
      }
      showToast({ type: 'error', title: 'Error', message: errorMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={true} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Toast toast={toast} translateY={translateY} />

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%', maxWidth: 650, maxHeight: '90%' }}
        >
          <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 32, paddingTop: 40, flexShrink: 1, overflow: 'hidden' }}>
            
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={8}
              style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={20} color={COLORS.textDark} />
            </TouchableOpacity>

            <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textDark, marginBottom: 24 }}>
              Crear Necesidad
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              
              {/* ── TIPO Y REPORTE ── */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 12 }}>¿Para qué es esta necesidad?</Text>
                <View style={{ flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 16, padding: 4, ...SHADOW_SM }}>
                  <TouchableOpacity onPress={() => { setTipoNecesidad('general'); setReporteId(null); setErrors({}); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: tipoNecesidad === 'general' ? COLORS.primary : 'transparent' }}>
                    <Text style={{ fontWeight: '700', fontSize: 13, color: tipoNecesidad === 'general' ? COLORS.white : COLORS.textLight }}>Fondo general</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setTipoNecesidad('especifica'); setErrors({}); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: tipoNecesidad === 'especifica' ? COLORS.primary : 'transparent' }}>
                    <Text style={{ fontWeight: '700', fontSize: 13, color: tipoNecesidad === 'especifica' ? COLORS.white : COLORS.textLight }}>Caso específico</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {tipoNecesidad === 'especifica' && (
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 12 }}>Selecciona el caso</Text>
                  {isLoadingReportes ? (
                    <View style={{ padding: 20, alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16, ...SHADOW_SM }}>
                      <ActivityIndicator color={COLORS.primary} />
                      <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 8 }}>Cargando casos activos...</Text>
                    </View>
                  ) : reportesActivos.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16, ...SHADOW_SM }}>
                      <Text style={{ fontSize: 13, color: COLORS.textLight }}>No tienes casos activos en este momento.</Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                      {reportesActivos.map((reporte) => (
                        <TouchableOpacity key={reporte.id} onPress={() => setReporteId(reporte.id)} style={{ width: 200, padding: 14, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 2, borderColor: reporteId === reporte.id ? COLORS.accent : 'transparent', ...SHADOW_SM }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 4 }} numberOfLines={2}>{reporte.titulo}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="location-outline" size={13} color={COLORS.primary} />
                            <Text style={{ fontSize: 11, color: COLORS.textLight, marginLeft: 4 }} numberOfLines={1}>{reporte.ubicacion}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                  {errors.reporte && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>{errors.reporte}</Text>}
                </View>
              )}

              {/* ── CATEGORÍA Y SUBCATEGORÍA ── */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 12 }}>Categoría del recurso</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {CATEGORIAS.map((cat) => {
                    const isSelected = categoria === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => { setCategoria(cat.id); setSubcategoriaId(null); setUrgencia(null); }}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: isSelected ? COLORS.secondary : COLORS.white, borderWidth: 1, borderColor: isSelected ? COLORS.secondary : 'rgba(0,0,0,0.05)', ...SHADOW_SM }}
                      >
                        <Ionicons name={cat.icono} size={16} color={isSelected ? COLORS.textDark : COLORS.textLight} style={{ marginRight: 6 }} />
                        <Text style={{ fontWeight: '700', fontSize: 13, color: isSelected ? COLORS.textDark : COLORS.textLight }}>{cat.id}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                {errors.categoria && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>{errors.categoria}</Text>}
              </View>

              {/* Subcategoría Opcional (Si la categoría tiene opciones) */}
              {categoria && SUBCATEGORIAS_MOCK[categoria] && (
                <View style={{ marginBottom: 24, padding: 16, backgroundColor: 'rgba(236,128,43,0.08)', borderRadius: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 10 }}>Específica lo que necesitas (Opcional)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {SUBCATEGORIAS_MOCK[categoria].map((sub) => (
                      <TouchableOpacity
                        key={sub.id}
                        onPress={() => setSubcategoriaId(sub.id === subcategoriaId ? null : sub.id)}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: subcategoriaId === sub.id ? COLORS.primary : COLORS.white, borderWidth: 1, borderColor: subcategoriaId === sub.id ? COLORS.primary : '#E5E7EB' }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: subcategoriaId === sub.id ? COLORS.white : COLORS.textDark }}>{sub.nombre}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* ── URGENCIA VETERINARIA ── */}
              {categoria === 'Servicios Veterinarios' && (
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 12 }}>Nivel de Urgencia</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {(['Baja', 'Media', 'Alta'] as NivelUrgencia[]).map((nivel) => {
                      const isSelected = urgencia === nivel;
                      const dotColor = nivel === 'Baja' ? '#2ECC71' : nivel === 'Media' ? '#F1C40F' : '#E74C3C';
                      return (
                        <TouchableOpacity
                          key={nivel} onPress={() => setUrgencia(nivel)}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: isSelected ? COLORS.white : 'transparent', borderWidth: 2, borderColor: isSelected ? dotColor : '#D1D5DB' }}
                        >
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor, marginRight: 6 }} />
                          <Text style={{ fontWeight: '700', fontSize: 13, color: isSelected ? COLORS.textDark : COLORS.textLight }}>{nivel}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {errors.urgencia && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>{errors.urgencia}</Text>}
                </View>
              )}

              {/* ── CANTIDAD Y DETALLES ── */}
              <View style={{ marginBottom: 28, flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Cantidad (Opcional)</Text>
                  <Input 
                    placeholder="Ej. 15" 
                    value={cantidadValor} 
                    onChangeText={(val) => { setCantidadValor(val); setErrors(p => ({ ...p, cantidad_valor: '' })); }} 
                    keyboardType="numeric" 
                    error={errors.cantidad_valor} 
                  />
                </View>
                <View style={{ flex: 1.2 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Unidad (Opcional)</Text>
                  <Input 
                    placeholder="Ej. kg, piezas, latas" 
                    value={cantidadUnidad} 
                    onChangeText={(val) => { setCantidadUnidad(val); setErrors(p => ({ ...p, cantidad_unidad: '' })); }} 
                    error={errors.cantidad_unidad} 
                  />
                </View>
              </View>

              {/* Campo JSON (Se guarda en la columna "detalle") */}
              <View style={{ marginBottom: 28 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Detalles o Especificaciones (Opcional)</Text>
                <Input 
                  placeholder={categoria === 'Alimentos' ? "Ej. Para cachorro etapa 1, marca recomendada..." : "Añade notas para los aliados..."}
                  value={notasAdicionales} 
                  onChangeText={setNotasAdicionales} 
                />
              </View>

              {/* ── BOTONES FINALES ── */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                <TouchableOpacity onPress={() => router.back()} style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 18, backgroundColor: '#E5E7EB' }}>
                  <Text style={{ color: COLORS.textLight, fontWeight: 'bold' }}>Cancelar</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Button label="Publicar" onPress={handleGuardarNecesidad} isLoading={isSubmitting} />
                </View>
              </View>
              
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}