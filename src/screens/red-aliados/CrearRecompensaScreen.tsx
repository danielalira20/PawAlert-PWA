import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { Toast, useToast } from '../../components/Toast';
import { DateRangePickerChip } from '../../components/red-aliados/DateRangePickerChip';

// Misma paleta que AportacionFormScreen.tsx / CapacidadesFormScreen.tsx
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
};

type Option = { value: string; label: string; description?: string };
type Errors = Record<string, string>;

const TIPO_OPTIONS: Option[] = [
  { value: 'descuento', label: 'Descuento' },
  { value: 'producto', label: 'Producto' },
  { value: 'servicio', label: 'Servicio' },
];

// Mismo costo que backend/app/models/recompensas.py::COSTO_POR_NIVEL — solo
// para mostrar el hint aquí, el backend es quien calcula el costo real.
const NIVEL_OPTIONS: Option[] = [
  { value: 'pequena', label: 'Pequeña', description: '100 puntos' },
  { value: 'mediana', label: 'Mediana', description: '250 puntos' },
  { value: 'grande', label: 'Grande', description: '600 puntos' },
];

const VIGENCIA_MINIMA_DIAS = 30;
const VIGENCIA_MAXIMA_DIAS = 90;

interface Props {
  onClose?: () => void;
}

export default function CrearRecompensaScreen({ onClose }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [tipo, setTipo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [subcategoria, setSubcategoria] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [nivel, setNivel] = useState('');
  const [unidadesTotales, setUnidadesTotales] = useState('');
  const [inicio, setInicio] = useState<Date | null>(null);
  const [vencimiento, setVencimiento] = useState<Date | null>(null);
  const [sucursalLugar, setSucursalLugar] = useState('');
  const [horario, setHorario] = useState('');
  const [formaEntrega, setFormaEntrega] = useState('');
  const [condiciones, setCondiciones] = useState('');
  const [inventarioSeparado, setInventarioSeparado] = useState<boolean | null>(null);

  const [errors, setErrors] = useState<Errors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const terminarFlujo = () => {
    if (onClose) onClose();
  };

  const validar = (): boolean => {
    const nuevosErrores: Errors = {};
    if (!tipo) nuevosErrores.tipo = 'Elige el tipo de beneficio';
    if (!categoria.trim()) nuevosErrores.categoria = 'Escribe una categoría';
    if (!nombre.trim()) nuevosErrores.nombre = 'Escribe un nombre';
    if (!descripcion.trim()) nuevosErrores.descripcion = 'Escribe una descripción';
    if (!nivel) nuevosErrores.nivel = 'Elige un nivel';
    const unidades = Number(unidadesTotales);
    if (!unidadesTotales || !Number.isFinite(unidades) || unidades <= 0) {
      nuevosErrores.unidadesTotales = 'Indica cuántas unidades vas a ofrecer';
    }
    if (!inicio || !vencimiento) {
      nuevosErrores.vigencia = 'Elige el inicio y el vencimiento';
    } else {
      const dias = Math.round((vencimiento.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
      if (dias < VIGENCIA_MINIMA_DIAS || dias > VIGENCIA_MAXIMA_DIAS) {
        nuevosErrores.vigencia = `La vigencia debe ser de entre ${VIGENCIA_MINIMA_DIAS} y ${VIGENCIA_MAXIMA_DIAS} días`;
      }
    }
    if (!formaEntrega.trim()) nuevosErrores.formaEntrega = 'Indica cómo se entrega';
    if (inventarioSeparado !== true) {
      nuevosErrores.inventarioSeparado = 'Debes confirmar que este inventario está separado de tus recursos para rescates';
    }
    setErrors(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const handleSubmit = async () => {
    if (!validar()) {
      showToast({ type: 'warning', title: 'Revisa el formulario', message: 'Faltan campos por completar.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(
        `${API_URL}/recompensas`,
        {
          tipo,
          categoria: categoria.trim(),
          subcategoria: subcategoria.trim() || null,
          nombre: nombre.trim(),
          descripcion: descripcion.trim(),
          nivel,
          unidades_totales: Number(unidadesTotales),
          inicio: inicio!.toISOString().slice(0, 10),
          vencimiento: vencimiento!.toISOString().slice(0, 10),
          sucursal_lugar: sucursalLugar.trim() || null,
          horario: horario.trim() || null,
          forma_entrega: formaEntrega.trim(),
          condiciones: condiciones.trim() || null,
          inventario_separado_confirmado: inventarioSeparado,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast({
        type: 'success',
        title: 'Recompensa creada',
        message: 'Quedó guardada como borrador. Publícala desde tu panel cuando esté lista.',
      });
      terminarFlujo();
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos crear la recompensa',
        message: error?.response?.data?.detail || 'Intenta de nuevo en unos minutos.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.outerContainer}>
      <Toast toast={toast} translateY={translateY} />
      <View style={styles.centeredContent}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Crear recompensa</Text>
              <Text style={styles.subtitle}>Publica un beneficio para la comunidad PawAlert</Text>
            </View>
            <TouchableOpacity style={styles.headerButton} onPress={terminarFlujo}>
              <Ionicons name="close" size={22} color={COLORS.bgWhite} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <FormSection title="Tipo de beneficio">
              <SingleOptions options={TIPO_OPTIONS} selected={tipo} onSelect={setTipo} error={errors.tipo} />
            </FormSection>

            <FormSection title="Categoría y subcategoría" subtitle="Describe brevemente de qué se trata.">
              <TextInputField value={categoria} onChangeText={setCategoria} placeholder="Ej. Alimento para mascotas" />
              {errors.categoria ? <ErrorText text={errors.categoria} /> : null}
              <View style={styles.inputGroup}>
                <TextInputField value={subcategoria} onChangeText={setSubcategoria} placeholder="Subcategoría (opcional)" />
              </View>
            </FormSection>

            <FormSection title="Nombre y descripción">
              <TextInputField value={nombre} onChangeText={setNombre} placeholder="Nombre de la recompensa" />
              {errors.nombre ? <ErrorText text={errors.nombre} /> : null}
              <View style={styles.inputGroup}>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={descripcion}
                  onChangeText={setDescripcion}
                  placeholder="Descripción para quien la va a canjear"
                  placeholderTextColor={COLORS.textLight}
                  multiline
                  numberOfLines={3}
                />
              </View>
              {errors.descripcion ? <ErrorText text={errors.descripcion} /> : null}
            </FormSection>

            <FormSection title="Nivel" subtitle="Define el costo en puntos — lo calcula PawAlert, no tú.">
              <SingleOptions options={NIVEL_OPTIONS} selected={nivel} onSelect={setNivel} error={errors.nivel} />
            </FormSection>

            <FormSection title="Unidades disponibles">
              <TextInputField
                value={unidadesTotales}
                onChangeText={setUnidadesTotales}
                placeholder="Ej. 20"
                keyboardType="numeric"
              />
              {errors.unidadesTotales ? <ErrorText text={errors.unidadesTotales} /> : null}
            </FormSection>

            <FormSection title="Vigencia" subtitle={`Entre ${VIGENCIA_MINIMA_DIAS} y ${VIGENCIA_MAXIMA_DIAS} días.`}>
              <DateRangePickerChip
                label="Inicio y vencimiento"
                startDate={inicio}
                endDate={vencimiento}
                onChange={(start, end) => { setInicio(start); setVencimiento(end); }}
                required
                error={errors.vigencia}
              />
            </FormSection>

            <FormSection title="Lugar y horario">
              <TextInputField value={sucursalLugar} onChangeText={setSucursalLugar} placeholder="Sucursal o lugar (opcional)" />
              <View style={styles.inputGroup}>
                <TextInputField value={horario} onChangeText={setHorario} placeholder="Horario (opcional)" />
              </View>
            </FormSection>

            <FormSection title="Forma de entrega">
              <TextInputField value={formaEntrega} onChangeText={setFormaEntrega} placeholder="Ej. Presentar QR en sucursal" />
              {errors.formaEntrega ? <ErrorText text={errors.formaEntrega} /> : null}
            </FormSection>

            <FormSection title="Condiciones">
              <TextInput
                style={[styles.input, styles.textArea]}
                value={condiciones}
                onChangeText={setCondiciones}
                placeholder="Restricciones o condiciones (opcional)"
                placeholderTextColor={COLORS.textLight}
                multiline
                numberOfLines={3}
              />
            </FormSection>

            <FormSection
              title="Inventario separado"
              subtitle="Los recursos destinados a rescates nunca se usan como premios."
            >
              <BooleanOptions value={inventarioSeparado} onChange={setInventarioSeparado} error={errors.inventarioSeparado} />
            </FormSection>
          </ScrollView>

          <View style={styles.fixedFooter}>
            <TouchableOpacity
              style={[styles.primaryButton, isSubmitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={COLORS.bgWhite} />
              ) : (
                <Text style={styles.primaryButtonText}>Guardar como borrador</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function SingleOptions({
  options,
  selected,
  onSelect,
  error,
}: {
  options: Option[];
  selected: string;
  onSelect: (value: string) => void;
  error?: string;
}) {
  return (
    <>
      <View style={styles.optionsWrap}>
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.optionChip, active && styles.optionChipSelected]}
              onPress={() => onSelect(option.value)}
            >
              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? COLORS.bgWhite : COLORS.textLight} />
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.optionText, active && styles.selectedText]}>{option.label}</Text>
                {option.description ? (
                  <Text style={[styles.optionDescription, active && styles.selectedDescription]}>{option.description}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {error ? <ErrorText text={error} /> : null}
    </>
  );
}

function BooleanOptions({
  value,
  onChange,
  error,
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
  error?: string;
}) {
  return (
    <SingleOptions
      options={[
        { value: 'si', label: 'Sí, es inventario aparte' },
        { value: 'no', label: 'No' },
      ]}
      selected={value === null ? '' : value ? 'si' : 'no'}
      onSelect={(selected) => onChange(selected === 'si')}
      error={error}
    />
  );
}

function ErrorText({ text }: { text: string }) {
  return <Text style={styles.errorText}>{text}</Text>;
}

// TextInput mínimo con el mismo estilo `input` de AportacionFormScreen —
// no se reusa src/components/ui/Input porque ese componente trae su propio
// look (NativeWind) distinto al de este patrón.
function TextInputField(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
}) {
  return (
    <TextInput
      style={styles.input}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={COLORS.textLight}
      keyboardType={props.keyboardType}
    />
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 24 : 0,
    backgroundColor: 'rgba(28, 20, 14, 0.52)',
  },
  centeredContent: {
    width: '100%',
    maxWidth: 820,
    maxHeight: Platform.OS === 'web' ? '94%' : '100%',
  },
  card: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: COLORS.bgWhite,
    borderRadius: Platform.OS === 'web' ? 30 : 0,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 22,
    backgroundColor: COLORS.bgTeal,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerText: { flex: 1 },
  title: { color: COLORS.bgWhite, fontSize: 23, fontWeight: '900' },
  subtitle: { color: COLORS.bgWhite, fontSize: 13, fontWeight: '600', opacity: 0.9, marginTop: 3 },
  scrollContent: { padding: 28, paddingBottom: 36 },
  section: {
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    backgroundColor: COLORS.bgWhite,
  },
  sectionTitle: { color: COLORS.textDark, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  sectionSubtitle: { color: COLORS.textLight, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  optionChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: COLORS.grayLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  optionText: { color: COLORS.textDark, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  optionDescription: { color: COLORS.textLight, fontSize: 11, marginTop: 2 },
  selectedText: { color: COLORS.bgWhite },
  selectedDescription: { color: 'rgba(255,255,255,0.82)' },
  inputGroup: { marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 10,
    color: COLORS.textDark,
    fontSize: 14,
    backgroundColor: COLORS.grayLight,
  },
  textArea: { minHeight: 84, textAlignVertical: 'top' },
  errorText: { color: COLORS.danger, fontSize: 12, fontWeight: '700', marginTop: 8 },
  fixedFooter: {
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bgWhite,
  },
  primaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: { color: COLORS.bgWhite, fontSize: 15, fontWeight: '900' },
});
