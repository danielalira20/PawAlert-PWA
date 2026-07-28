import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Modal, ActivityIndicator, Image } from 'react-native';
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

type NivelUrgencia = 'Baja' | 'Media' | 'Alta';

interface CategoriaRecursoApi {
  id: string;
  clave: string;
  descripcion: string;
}

interface SubcategoriaRecursoApi {
  id: string;
  clave: string;
  descripcion: string;
}

// Ícono por clave real de categoria_recurso — fallback genérico si el
// catálogo llega a tener una categoría sin ícono asignado aquí.
const ICONO_POR_CLAVE: Record<string, keyof typeof Ionicons.glyphMap> = {
  alimentos: 'nutrition-outline',
  insumos: 'medkit-outline',
  servicios_veterinarios: 'pulse-outline',
  difusion_campanas: 'megaphone-outline',
};
const ICONO_DEFAULT: keyof typeof Ionicons.glyphMap = 'cube-outline';

export default function CreateNeedScreen() {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [tipoNecesidad, setTipoNecesidad] = useState<'general' | 'especifica'>('general');
  const [reporteId, setReporteId] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [subcategoriaId, setSubcategoriaId] = useState<string | null>(null);
  const [urgencia, setUrgencia] = useState<NivelUrgencia | null>(null);

  const [cantidadValor, setCantidadValor] = useState('');
  const [cantidadUnidad, setCantidadUnidad] = useState('');
  const [notasAdicionales, setNotasAdicionales] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Ahora guardamos la foto_url en lugar de la ubicación
  const [reportesActivos, setReportesActivos] = useState<{id: string, titulo: string, foto_url: string | null}[]>([]);
  const [isLoadingReportes, setIsLoadingReportes] = useState(false);

  const [categoriasData, setCategoriasData] = useState<CategoriaRecursoApi[]>([]);
  const [subcategoriasData, setSubcategoriasData] = useState<SubcategoriaRecursoApi[]>([]);
  const [isLoadingSubcategorias, setIsLoadingSubcategorias] = useState(false);

  useEffect(() => {
    const cargarCategorias = async () => {
      try {
        const res = await axios.get(`${API_URL}/red-aliados/categorias`);
        setCategoriasData(res.data);
      } catch (error) {
        console.error("Error al cargar categorías:", error);
      }
    };
    cargarCategorias();
  }, []);

  useEffect(() => {
    if (!categoria) {
      setSubcategoriasData([]);
      return;
    }
    let vigente = true;
    const cargarSubcategorias = async () => {
      setIsLoadingSubcategorias(true);
      try {
        const res = await axios.get(`${API_URL}/red-aliados/subcategorias/${categoria}`);
        if (vigente) setSubcategoriasData(res.data);
      } catch (error) {
        console.error("Error al cargar subcategorías:", error);
        if (vigente) setSubcategoriasData([]);
      } finally {
        if (vigente) setIsLoadingSubcategorias(false);
      }
    };
    cargarSubcategorias();
    return () => { vigente = false; };
  }, [categoria]);

  useEffect(() => {
    const cargarCasosCerrados = async () => {
      setIsLoadingReportes(true);
      try {
        const res = await axios.get(`${API_URL}/associations/me/reportes`, { 
          headers: { Authorization: `Bearer ${token}` } 
        });
        
        // Filtramos para mostrar estrictamente los casos que ya fueron cerrados/rescatados
        const casosCerrados = res.data.filter((r: any) => r.estado_reporte === 'cerrado');

        const casosMapeados = casosCerrados.map((reporte: any) => {
          const animales = getAnimales(reporte);
          const grave = animalMasGrave(animales);
          
          const tipo = grave?.tipo_animal || 'Animal';
          const tituloCase = tipo.charAt(0).toUpperCase() + tipo.slice(1);
          
          return {
            id: reporte.reporte_id, 
            titulo: `${tituloCase} · ${grave?.condicion || 'desconocido'}`,
            foto_url: reporte.foto_url || null
          };
        });

        setReportesActivos(casosMapeados);
      } catch (error) {
        console.error("Error al cargar los casos:", error);
      } finally {
        setIsLoadingReportes(false);
      }
    };

    if (token) {
      cargarCasosCerrados();
    }
  }, [token]);

  const handleGuardarNecesidad = async () => {
    const newErrors: Record<string, string> = {};
    if (tipoNecesidad === 'especifica' && !reporteId) {
      newErrors.reporte = 'Debes seleccionar un caso rescatado.';
    }
    if (!categoria) {
      newErrors.categoria = 'Debes seleccionar una categoría.';
    }
    if (categoria === 'servicios_veterinarios' && !urgencia) {
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
                      <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 8 }}>Buscando casos rescatados...</Text>
                    </View>
                  ) : reportesActivos.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16, ...SHADOW_SM }}>
                      <Text style={{ fontSize: 13, color: COLORS.textLight }}>No tienes casos cerrados en este momento.</Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                      {reportesActivos.map((reporte) => (
                        <TouchableOpacity 
                          key={reporte.id} 
                          onPress={() => setReporteId(reporte.id)} 
                          style={{ width: 140, padding: 10, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 2, borderColor: reporteId === reporte.id ? COLORS.accent : 'transparent', ...SHADOW_SM }}
                        >
                          {reporte.foto_url ? (
                            <Image source={{ uri: reporte.foto_url }} style={{ width: '100%', height: 90, borderRadius: 10, backgroundColor: '#2E2A26', marginBottom: 8 }} resizeMode="cover" />
                          ) : (
                            <View style={{ width: '100%', height: 90, borderRadius: 10, backgroundColor: 'rgba(236,128,43,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                              <Ionicons name="paw" size={32} color={COLORS.primary} />
                            </View>
                          )}
                          <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textDark, textAlign: 'center' }} numberOfLines={2}>{reporte.titulo}</Text>
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
                  {categoriasData.map((cat) => {
                    const isSelected = categoria === cat.clave;
                    return (
                      <TouchableOpacity
                        key={cat.clave}
                        onPress={() => { setCategoria(cat.clave); setSubcategoriaId(null); setUrgencia(null); }}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: isSelected ? COLORS.secondary : COLORS.white, borderWidth: 1, borderColor: isSelected ? COLORS.secondary : 'rgba(0,0,0,0.05)', ...SHADOW_SM }}
                      >
                        <Ionicons name={ICONO_POR_CLAVE[cat.clave] || ICONO_DEFAULT} size={16} color={isSelected ? COLORS.textDark : COLORS.textLight} style={{ marginRight: 6 }} />
                        <Text style={{ fontWeight: '700', fontSize: 13, color: isSelected ? COLORS.textDark : COLORS.textLight }}>{cat.descripcion}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                {errors.categoria && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>{errors.categoria}</Text>}
              </View>

              {/* Subcategoría Opcional */}
              {categoria && (isLoadingSubcategorias || subcategoriasData.length > 0) && (
                <View style={{ marginBottom: 24, padding: 16, backgroundColor: 'rgba(236,128,43,0.08)', borderRadius: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 10 }}>Específica lo que necesitas (Opcional)</Text>
                  {isLoadingSubcategorias ? (
                    <ActivityIndicator color={COLORS.primary} />
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {subcategoriasData.map((sub) => (
                        <TouchableOpacity
                          key={sub.id}
                          onPress={() => setSubcategoriaId(sub.id === subcategoriaId ? null : sub.id)}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: subcategoriaId === sub.id ? COLORS.primary : COLORS.white, borderWidth: 1, borderColor: subcategoriaId === sub.id ? COLORS.primary : '#E5E7EB' }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: subcategoriaId === sub.id ? COLORS.white : COLORS.textDark }}>{sub.descripcion}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* ── URGENCIA VETERINARIA ── */}
              {categoria === 'servicios_veterinarios' && (
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
                  placeholder={categoria === 'alimentos' ? "Ej. Para cachorro etapa 1, marca recomendada..." : "Añade notas para los aliados..."}
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