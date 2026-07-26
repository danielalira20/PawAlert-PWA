import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { Toast, useToast } from '../../components/Toast';
import {
  CategoriaSubcategoriaSelector,
  CatalogoItem,
} from '../../components/red-aliados/CategoriaSubcategoriaSelector';

// Misma paleta que AportacionFormScreen.tsx/CapacidadesFormScreen.tsx.
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
  verde: '#27AE60',
};

const PASOS = ['Qué vas a donar', 'Cantidad y empaque', 'Reparto y entrega'];

type Especie = 'perro' | 'gato';
type Option = { value: string; label: string; description?: string };

const DIVISIBLE_OPCIONES: Option[] = [
  { value: 'no', label: 'No se reparte', description: 'Va completo a una sola asociación.' },
  { value: 'solo_empaques_completos', label: 'Solo empaques completos', description: 'Se puede repartir, pero sin abrir empaques.' },
  { value: 'aliado_prepara_lotes', label: 'Yo preparo los lotes', description: 'Tú divides el total en partes para cada asociación.' },
];

const FORMA_ENTREGA_OPCIONES: Option[] = [
  { value: 'institucion_lleva', label: 'Yo lo llevo' },
  { value: 'asociacion_recoge', label: 'La asociación debe recogerlo' },
  { value: 'ambas', label: 'Cualquiera de las dos' },
  { value: 'punto_acordado', label: 'Punto acordado' },
];

interface AsociacionCompatible {
  id: string;
  nombre: string;
  distancia_km: number;
}

interface Props {
  onClose?: () => void;
}

export default function LoteFormScreen({ onClose }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [paso, setPaso] = useState(1);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [categoria, setCategoria] = useState<CatalogoItem | null>(null);
  const [subcategoria, setSubcategoria] = useState<CatalogoItem | null>(null);
  const [especiesAplica, setEspeciesAplica] = useState<Especie[]>([]);

  const [cantidadValor, setCantidadValor] = useState('');
  const [cantidadUnidad, setCantidadUnidad] = useState('');
  const [tipoEmpaque, setTipoEmpaque] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const [divisible, setDivisible] = useState<string | null>(null);
  const [maxAsociaciones, setMaxAsociaciones] = useState('1');
  const [formaEntrega, setFormaEntrega] = useState<string | null>(null);

  const [loteId, setLoteId] = useState<string | null>(null);
  const [asociaciones, setAsociaciones] = useState<AsociacionCompatible[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const [isLoadingAsociaciones, setIsLoadingAsociaciones] = useState(false);
  const [isInvitando, setIsInvitando] = useState(false);
  const [invitacionesEnviadas, setInvitacionesEnviadas] = useState(false);

  const especiesDisponibles: Especie[] =
    (subcategoria?.especies_aplicables as Especie[] | undefined) || ['perro', 'gato'];

  const toggleEspecie = (value: string) => {
    const especie = value as Especie;
    setEspeciesAplica((prev) =>
      prev.includes(especie) ? prev.filter((e) => e !== especie) : [...prev, especie]
    );
  };

  const validarPaso = (numero: number): boolean => {
    const nuevos: Record<string, string> = {};

    if (numero === 1) {
      if (!categoria) nuevos.categoria = 'Selecciona una categoría.';
      if (!subcategoria) nuevos.subcategoria = 'Selecciona una subcategoría.';
    }
    if (numero === 2) {
      if (!cantidadValor.trim() || isNaN(Number(cantidadValor)) || Number(cantidadValor) <= 0) {
        nuevos.cantidadValor = 'Ingresa una cantidad válida.';
      }
      if (!cantidadUnidad.trim()) nuevos.cantidadUnidad = 'Indica la unidad (kg, piezas...).';
      if (!tipoEmpaque.trim()) nuevos.tipoEmpaque = 'Describe cómo viene empacado.';
    }
    if (numero === 3) {
      if (!divisible) nuevos.divisible = 'Selecciona una opción.';
      if (divisible !== 'no' && (!maxAsociaciones.trim() || Number(maxAsociaciones) < 1)) {
        nuevos.maxAsociaciones = 'Indica a cuántas asociaciones se puede repartir.';
      }
      if (!formaEntrega) nuevos.formaEntrega = 'Selecciona una forma de entrega.';
    }

    setErrors(nuevos);
    if (Object.keys(nuevos).length) {
      showToast({ type: 'warning', title: 'Falta información', message: 'Revisa las preguntas marcadas antes de continuar.' });
      return false;
    }
    return true;
  };

  const cargarAsociacionesCompatibles = async (id: string) => {
    setIsLoadingAsociaciones(true);
    try {
      const res = await axios.get(`${API_URL}/red-aliados/lotes/${id}/asociaciones-compatibles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAsociaciones(res.data);
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos cargar asociaciones cercanas.' });
    } finally {
      setIsLoadingAsociaciones(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await axios.post(
        `${API_URL}/red-aliados/lotes`,
        {
          categoria: categoria!.clave,
          subcategoria_id: subcategoria!.id,
          especies_aplica: especiesAplica,
          cantidad_valor: Number(cantidadValor),
          cantidad_unidad: cantidadUnidad.trim(),
          tipo_empaque: tipoEmpaque.trim(),
          divisible,
          max_asociaciones: divisible === 'no' ? 1 : Number(maxAsociaciones),
          forma_entrega: formaEntrega,
          descripcion: descripcion.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setLoteId(res.data.id);
      showToast({ type: 'success', title: 'Lote registrado', message: 'Ahora invita a las asociaciones que quieras.' });
      cargarAsociacionesCompatibles(res.data.id);
      setPaso(4);
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: error?.response?.data?.detail || 'No pudimos registrar el lote.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAsociacion = (id: string) => {
    setSeleccionadas((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const handleInvitar = async () => {
    if (!loteId || !seleccionadas.length) return;
    setIsInvitando(true);
    try {
      await axios.post(
        `${API_URL}/red-aliados/lotes/${loteId}/invitar`,
        { asociacion_ids: seleccionadas },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInvitacionesEnviadas(true);
      showToast({ type: 'success', title: 'Invitaciones enviadas', message: 'Las asociaciones ya pueden responder.' });
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: error?.response?.data?.detail || 'No pudimos enviar las invitaciones.',
      });
    } finally {
      setIsInvitando(false);
    }
  };

  const terminarFlujo = () => {
    if (onClose) onClose();
    else router.back();
  };

  const avanzar = () => {
    if (!validarPaso(paso)) return;
    if (paso === PASOS.length) {
      handleSubmit();
      return;
    }
    setPaso((p) => p + 1);
    setErrors({});
  };

  const retroceder = () => {
    if (paso === 1) {
      setShowCloseConfirm(true);
      return;
    }
    setPaso((p) => p - 1);
    setErrors({});
  };

  const renderPaso = () => {
    if (paso === 1) {
      return (
        <>
          <FormSection title="Categoría y subcategoría" subtitle="Elige qué tipo de recurso vas a donar en este lote.">
            <CategoriaSubcategoriaSelector
              categoria={categoria}
              subcategoria={subcategoria}
              onChangeCategoria={(c) => {
                setCategoria(c);
                setSubcategoria(null);
                setEspeciesAplica([]);
              }}
              onChangeSubcategoria={(s) => {
                setSubcategoria(s);
                setEspeciesAplica([]);
              }}
              errorCategoria={errors.categoria}
              errorSubcategoria={errors.subcategoria}
            />
          </FormSection>

          {subcategoria && (
            <FormSection title="¿Para qué animales aplica?">
              <MultiOptions
                options={especiesDisponibles.map((e) => ({ value: e, label: e === 'perro' ? 'Perros' : 'Gatos' }))}
                selected={especiesAplica}
                onToggle={toggleEspecie}
              />
            </FormSection>
          )}
        </>
      );
    }

    if (paso === 2) {
      return (
        <>
          <FormSection title="Cantidad total del lote">
            <TextInputField
              value={cantidadValor}
              onChangeText={(v) => setCantidadValor(v.replace(/[^0-9.]/g, ''))}
              placeholder="100"
              keyboardType="numeric"
            />
            {errors.cantidadValor && <ErrorText text={errors.cantidadValor} />}
            <Text style={[styles.sectionSubtitle, { marginTop: 12 }]}>Unidad</Text>
            <TextInputField value={cantidadUnidad} onChangeText={setCantidadUnidad} placeholder="kg, piezas, costales..." />
            {errors.cantidadUnidad && <ErrorText text={errors.cantidadUnidad} />}
          </FormSection>

          <FormSection title="¿Cómo viene empacado?" subtitle="Por ejemplo: 'Costales de 25kg' o 'Cajas de 12 piezas'.">
            <TextInputField value={tipoEmpaque} onChangeText={setTipoEmpaque} placeholder="Describe el empaque" />
            {errors.tipoEmpaque && <ErrorText text={errors.tipoEmpaque} />}
          </FormSection>

          <FormSection title="Descripción" subtitle="Opcional — algo más que quieras contarle a las asociaciones.">
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="Detalles del lote..."
              placeholderTextColor={COLORS.textLight}
              multiline
            />
          </FormSection>
        </>
      );
    }

    return (
      <>
        <FormSection title="¿Se puede repartir entre varias asociaciones?">
          <SingleOptions options={DIVISIBLE_OPCIONES} selected={divisible || ''} onSelect={setDivisible} error={errors.divisible} />
        </FormSection>

        {divisible && divisible !== 'no' && (
          <FormSection title="¿Entre cuántas asociaciones como máximo?">
            <TextInputField
              value={maxAsociaciones}
              onChangeText={(v) => setMaxAsociaciones(v.replace(/[^0-9]/g, ''))}
              placeholder="3"
              keyboardType="numeric"
            />
            {errors.maxAsociaciones && <ErrorText text={errors.maxAsociaciones} />}
          </FormSection>
        )}

        <FormSection title="Forma de entrega">
          <SingleOptions options={FORMA_ENTREGA_OPCIONES} selected={formaEntrega || ''} onSelect={setFormaEntrega} error={errors.formaEntrega} />
        </FormSection>
      </>
    );
  };

  const renderInvitar = () => (
    <>
      <FormSection title="Asociaciones cercanas compatibles" subtitle="Ordenadas por cercanía a tu zona de cobertura.">
        {isLoadingAsociaciones ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
        ) : asociaciones.length === 0 ? (
          <Text style={styles.sectionSubtitle}>No encontramos asociaciones verificadas cerca de tu zona por ahora.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {asociaciones.map((a) => {
              const active = seleccionadas.includes(a.id);
              return (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => toggleAsociacion(a.id)}
                  style={[styles.asocRow, active && styles.asocRowActive]}
                >
                  <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={active ? COLORS.verde : COLORS.textLight} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.asocNombre}>{a.nombre}</Text>
                    <Text style={styles.asocDistancia}>{a.distancia_km.toFixed(1)} km de distancia</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </FormSection>
    </>
  );

  return (
    <View style={styles.outerContainer}>
      <Toast toast={toast} translateY={translateY} />
      <View style={styles.centeredContent}>
        <View style={styles.card}>
          <View style={styles.header}>
            {paso <= PASOS.length && (
              <TouchableOpacity style={styles.headerButton} onPress={retroceder}>
                <Ionicons name="chevron-back" size={22} color={COLORS.bgWhite} />
              </TouchableOpacity>
            )}
            <View style={styles.headerText}>
              <Text style={styles.title}>Registrar un lote</Text>
              <Text style={styles.subtitle}>
                {paso <= PASOS.length ? `Paso ${paso} de ${PASOS.length}: ${PASOS[paso - 1]}` : '¿A quién quieres invitar?'}
              </Text>
            </View>
            <TouchableOpacity style={styles.headerButton} onPress={() => (paso <= PASOS.length ? setShowCloseConfirm(true) : terminarFlujo())}>
              <Ionicons name="close" size={22} color={COLORS.bgWhite} />
            </TouchableOpacity>
            {paso <= PASOS.length && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(paso / PASOS.length) * 100}%` }]} />
              </View>
            )}
          </View>

          {paso <= PASOS.length ? (
            <>
              <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {renderPaso()}
              </ScrollView>
              <View style={styles.fixedFooter}>
                <TouchableOpacity style={styles.primaryButton} onPress={avanzar} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <ActivityIndicator color={COLORS.bgWhite} />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>{paso === PASOS.length ? 'Registrar lote' : 'Continuar'}</Text>
                      {paso !== PASOS.length && <Ionicons name="arrow-forward" size={18} color={COLORS.bgWhite} />}
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : invitacionesEnviadas ? (
            <>
              <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <FormSection title="¡Listo!">
                  <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                    <Ionicons name="checkmark-circle" size={56} color={COLORS.verde} />
                    <Text style={[styles.sectionSubtitle, { textAlign: 'center', marginTop: 12 }]}>
                      Invitamos a {seleccionadas.length} asociación(es). Te avisamos cuando respondan.
                    </Text>
                  </View>
                </FormSection>
              </ScrollView>
              <View style={styles.fixedFooter}>
                <TouchableOpacity style={styles.primaryButton} onPress={terminarFlujo}>
                  <Text style={styles.primaryButtonText}>Terminar</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {renderInvitar()}
              </ScrollView>
              <View style={styles.fixedFooter}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={terminarFlujo}>
                    <Text style={styles.secondaryButtonText}>Invitar después</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, { flex: 1, opacity: seleccionadas.length ? 1 : 0.5 }]}
                    onPress={handleInvitar}
                    disabled={!seleccionadas.length || isInvitando}
                  >
                    {isInvitando ? (
                      <ActivityIndicator color={COLORS.bgWhite} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Invitar ({seleccionadas.length})</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
      </View>

      <Modal visible={showCloseConfirm} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>¿Salir del formulario?</Text>
            <Text style={styles.confirmText}>Los cambios que no hayas guardado se perderán.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowCloseConfirm(false)}>
                <Text style={styles.secondaryButtonText}>Continuar llenando</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: COLORS.danger }]}
                onPress={() => {
                  setShowCloseConfirm(false);
                  terminarFlujo();
                }}
              >
                <Text style={styles.primaryButtonText}>Salir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Helpers locales — mismo patrón que AportacionFormScreen.tsx (cada
// formulario mantiene su propia copia, no se comparten) ───────────────────

function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function MultiOptions({ options, selected, onToggle }: { options: Option[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <View style={styles.optionsWrap}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <TouchableOpacity key={option.value} style={[styles.optionChip, active && styles.optionChipSelected]} onPress={() => onToggle(option.value)}>
            <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={active ? COLORS.bgWhite : COLORS.textLight} />
            <Text style={[styles.optionText, active && styles.selectedText]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SingleOptions({ options, selected, onSelect, error }: { options: Option[]; selected: string; onSelect: (value: string) => void; error?: string }) {
  return (
    <>
      <View style={styles.optionsWrap}>
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <TouchableOpacity key={option.value} style={[styles.optionChip, active && styles.optionChipSelected]} onPress={() => onSelect(option.value)}>
              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? COLORS.bgWhite : COLORS.textLight} />
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.optionText, active && styles.selectedText]}>{option.label}</Text>
                {option.description ? <Text style={[styles.optionDescription, active && styles.selectedDescription]}>{option.description}</Text> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {error ? <ErrorText text={error} /> : null}
    </>
  );
}

function ErrorText({ text }: { text: string }) {
  return <Text style={styles.errorText}>{text}</Text>;
}

function TextInputField(props: { value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: 'default' | 'numeric' }) {
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

const styles = {
  outerContainer: {
    ...({} as any),
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 9999,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: Platform.OS === 'web' ? 24 : 0,
    backgroundColor: 'rgba(28, 20, 14, 0.52)',
  },
  centeredContent: { width: '100%' as const, maxWidth: 820, maxHeight: Platform.OS === 'web' ? '94%' as const : '100%' as const },
  card: {
    flex: 1,
    overflow: 'hidden' as const,
    backgroundColor: COLORS.bgWhite,
    borderRadius: Platform.OS === 'web' ? 30 : 0,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  header: {
    position: 'relative' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 28,
    backgroundColor: COLORS.bgTeal,
  },
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerText: { flex: 1 },
  title: { color: COLORS.bgWhite, fontSize: 23, fontWeight: '900' as const },
  subtitle: { color: COLORS.bgWhite, fontSize: 13, fontWeight: '600' as const, opacity: 0.9, marginTop: 3 },
  progressTrack: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, height: 5, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressFill: { height: 5, backgroundColor: COLORS.secondary },
  scrollContent: { padding: 28, paddingBottom: 36 },
  section: { padding: 20, marginBottom: 18, borderWidth: 1, borderColor: COLORS.border, borderRadius: 22, backgroundColor: COLORS.bgWhite },
  sectionTitle: { color: COLORS.textDark, fontSize: 17, fontWeight: '800' as const, marginBottom: 6 },
  sectionSubtitle: { color: COLORS.textLight, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  optionsWrap: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10, marginTop: 8 },
  optionChip: { minHeight: 44, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 16, backgroundColor: COLORS.grayLight, borderWidth: 1, borderColor: COLORS.border },
  optionChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  optionText: { color: COLORS.textDark, fontSize: 13, fontWeight: '700' as const, flexShrink: 1 },
  optionDescription: { color: COLORS.textLight, fontSize: 11, marginTop: 2 },
  selectedText: { color: COLORS.bgWhite },
  selectedDescription: { color: 'rgba(255,255,255,0.82)' },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, marginTop: 10, color: COLORS.textDark, fontSize: 14, backgroundColor: COLORS.grayLight },
  errorText: { color: COLORS.danger, fontSize: 12, fontWeight: '700' as const, marginTop: 8 },
  fixedFooter: { paddingHorizontal: 28, paddingVertical: 18, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bgWhite },
  primaryButton: { minHeight: 50, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingHorizontal: 22, borderRadius: 18, backgroundColor: COLORS.primary },
  primaryButtonText: { color: COLORS.bgWhite, fontSize: 15, fontWeight: '900' as const },
  secondaryButton: { minHeight: 50, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 22, borderRadius: 18, backgroundColor: COLORS.grayLight },
  secondaryButtonText: { color: COLORS.textDark, fontSize: 14, fontWeight: '800' as const },
  modalBackdrop: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 20, backgroundColor: 'rgba(0,0,0,0.58)' },
  confirmCard: { width: '100%' as const, maxWidth: 440, padding: 28, borderRadius: 25, backgroundColor: COLORS.bgWhite },
  confirmTitle: { color: COLORS.textDark, fontSize: 21, fontWeight: '900' as const, textAlign: 'center' as const },
  confirmText: { color: COLORS.textLight, fontSize: 14, lineHeight: 21, textAlign: 'center' as const, marginTop: 9 },
  confirmActions: { flexDirection: 'row' as const, gap: 10, marginTop: 24 },
  asocRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.grayLight },
  asocRowActive: { borderColor: COLORS.verde, backgroundColor: `${COLORS.verde}12` },
  asocNombre: { color: COLORS.textDark, fontSize: 14, fontWeight: '800' as const },
  asocDistancia: { color: COLORS.textLight, fontSize: 12, marginTop: 2 },
};
