import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import { API_URL } from '../../constants/api';
import { Brand } from '../../constants/theme';

export interface CatalogoItem {
  id: string;
  clave: string;
  descripcion: string;
  // Solo presentes en subcategorías (migrations/0007_red_aliados_subcategorias.sql).
  especies_aplicables?: string[];
  requiere_tamanio?: boolean;
}

interface Props {
  categoria: CatalogoItem | null;
  subcategoria: CatalogoItem | null;
  onChangeCategoria: (categoria: CatalogoItem) => void;
  onChangeSubcategoria: (subcategoria: CatalogoItem) => void;
  errorCategoria?: string;
  errorSubcategoria?: string;
}

// Selector reusable de categoría/subcategoría de recurso — consume
// GET /red-aliados/categorias y GET /red-aliados/subcategorias/{clave}
// en vez de hardcodear las opciones (a diferencia de los selectores
// inline de ReportFormScreen/CapacidadesFormScreen, que sí hardcodean
// tipo_animal/raza como arrays literales).
export function CategoriaSubcategoriaSelector({
  categoria,
  subcategoria,
  onChangeCategoria,
  onChangeSubcategoria,
  errorCategoria,
  errorSubcategoria,
}: Props) {
  const [categorias, setCategorias] = useState<CatalogoItem[]>([]);
  const [subcategorias, setSubcategorias] = useState<CatalogoItem[]>([]);
  const [isLoadingCategorias, setIsLoadingCategorias] = useState(true);
  const [isLoadingSubcategorias, setIsLoadingSubcategorias] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const res = await axios.get<CatalogoItem[]>(`${API_URL}/red-aliados/categorias`);
        if (vigente) setCategorias(res.data);
      } catch {
        if (vigente) setCategorias([]);
      } finally {
        if (vigente) setIsLoadingCategorias(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (!categoria) {
      setSubcategorias([]);
      return;
    }
    let vigente = true;
    setIsLoadingSubcategorias(true);
    (async () => {
      try {
        const res = await axios.get<CatalogoItem[]>(`${API_URL}/red-aliados/subcategorias/${categoria.clave}`);
        if (vigente) setSubcategorias(res.data);
      } catch {
        if (vigente) setSubcategorias([]);
      } finally {
        if (vigente) setIsLoadingSubcategorias(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [categoria]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Categoría <Text style={styles.required}>*</Text>
      </Text>
      {isLoadingCategorias ? (
        <ActivityIndicator color={Brand.primary} />
      ) : (
        <View style={styles.chipsRow}>
          {categorias.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => onChangeCategoria(c)}
              style={[styles.chip, categoria?.id === c.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, categoria?.id === c.id && styles.chipTextActive]}>{c.descripcion}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {errorCategoria && <Text style={styles.errorText}>{errorCategoria}</Text>}

      {categoria && (
        <>
          <Text style={[styles.label, styles.labelSubcategoria]}>
            Subcategoría <Text style={styles.required}>*</Text>
          </Text>
          {isLoadingSubcategorias ? (
            <ActivityIndicator color={Brand.primary} />
          ) : (
            <View style={styles.chipsRow}>
              {subcategorias.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => onChangeSubcategoria(s)}
                  style={[styles.chip, subcategoria?.id === s.id && styles.chipActive]}
                >
                  <Text style={[styles.chipText, subcategoria?.id === s.id && styles.chipTextActive]}>
                    {s.descripcion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {errorSubcategoria && <Text style={styles.errorText}>{errorSubcategoria}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: Brand.textDark, marginBottom: 8 },
  labelSubcategoria: { marginTop: 16 },
  required: { color: Brand.danger },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E4D3B8',
    backgroundColor: Brand.cardWarm,
  },
  chipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Brand.textMuted },
  chipTextActive: { color: '#fff' },
  errorText: { color: Brand.danger, fontSize: 12, marginTop: 6 },
});
