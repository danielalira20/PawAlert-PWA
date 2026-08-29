import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { Toast, useToast } from '../Toast';

const COLORS = {
  primary: '#EC802B',
  accent: '#66BCB4',
  accentSoft: '#EAF8F6',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#D94025',
  dangerSoft: '#FDEDE8',
  warning: '#B7791F',
  warnSoft: '#FFF7DF',
  warnBorder: '#EDC55B',
  cardBg: '#FAF3EA',
  border: '#E8DCCA',
};

/** Etiquetas de LocationSource (backend/app/models/dispatch.py). */
const FUENTE_LABEL: Record<string, string> = {
  reporte_inicial: 'Reporte inicial',
  confirmacion_reportante: 'Reportante del caso',
  voluntario_asignado: 'Voluntario asignado',
  voluntario_verificado: 'Voluntario verificado',
  testigo_cercano: 'Testigo cercano',
  asociacion: 'Asociación',
  administracion: 'Administración',
};

/** Etiquetas de ObservedMobility (mismo modelo). */
const MOVILIDAD_LABEL: Record<string, string> = {
  sin_movimiento: 'No se movía',
  limitada: 'Se movía con dificultad',
  normal: 'Se movía normal',
  corrio_se_alejo: 'Corrió / se alejó',
  desconocida: 'Movilidad desconocida',
};

interface AvistamientoPendiente {
  id: string;
  animal_id?: string | null;
  animal?: { orden?: number | null; tipo_animal?: string | null } | null;
  latitud?: number | null;
  longitud?: number | null;
  precision_metros?: number | null;
  observado_at?: string | null;
  registrado_at?: string | null;
  fuente?: string | null;
  movilidad_observada?: string | null;
  direccion_observada?: string | null;
  comentario?: string | null;
  evidencia_id?: string | null;
  foto_url?: string | null;
  advertencia_visual?: string | null;
  registrado_por?: string | null;
}

interface GrupoPendiente {
  reporte_id: string;
  reporte?: {
    estado_reporte?: string | null;
    municipio?: string | null;
    colonia?: string | null;
    calle?: string | null;
    created_at?: string | null;
  } | null;
  en_conflicto: boolean;
  avistamientos: AvistamientoPendiente[];
}

interface Props {
  visible: boolean;
}

function mensajeError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

function ubicacionTexto(reporte: GrupoPendiente['reporte']): string {
  return (
    [reporte?.calle, reporte?.colonia, reporte?.municipio].filter(Boolean).join(', ')
    || 'Ubicación no especificada'
  );
}

function tiempoRelativo(fecha?: string | null): string {
  if (!fecha) return 'sin fecha';
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return 'sin fecha';
  return formatDistanceToNow(valor, { addSuffix: true, locale: es });
}

function coordenadas(avistamiento: AvistamientoPendiente): string {
  if (avistamiento.latitud == null || avistamiento.longitud == null) {
    return 'Sin coordenadas';
  }
  return `${Number(avistamiento.latitud).toFixed(5)}, ${Number(avistamiento.longitud).toFixed(5)}`;
}

function tituloAnimal(avistamiento: AvistamientoPendiente): string {
  const especie = avistamiento.animal?.tipo_animal;
  const nombre = especie
    ? especie.charAt(0).toUpperCase() + especie.slice(1)
    : 'Animal';
  const orden = avistamiento.animal?.orden;
  return orden ? `${nombre} ${orden}` : nombre;
}

/** Datos de un avistamiento, compartidos por la tarjeta simple y la
 * comparativa: si cambian los campos que se muestran, cambian en los dos. */
function DetalleAvistamiento({
  avistamiento,
  compacto = false,
}: {
  avistamiento: AvistamientoPendiente;
  compacto?: boolean;
}) {
  return (
    <View style={compacto ? styles.detalleCompacto : undefined}>
      {avistamiento.foto_url ? (
        <Image
          accessibilityLabel={`Foto del avistamiento ${tituloAnimal(avistamiento)}`}
          source={{ uri: avistamiento.foto_url }}
          style={compacto ? styles.fotoCompacta : styles.foto}
          resizeMode="cover"
        />
      ) : (
        <View style={[compacto ? styles.fotoCompacta : styles.foto, styles.fotoVacia]}>
          <Ionicons name="image-outline" size={20} color={COLORS.textLight} />
          <Text style={styles.fotoVaciaTexto}>Sin foto</Text>
        </View>
      )}

      <View style={styles.datoFila}>
        <Ionicons name="time-outline" size={14} color={COLORS.textLight} />
        <Text style={styles.datoTexto}>
          Visto {tiempoRelativo(avistamiento.observado_at)}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.datoFila}
        activeOpacity={avistamiento.latitud != null && avistamiento.longitud != null ? 0.6 : 1}
        disabled={avistamiento.latitud == null || avistamiento.longitud == null}
        onPress={() => Linking.openURL(
          `https://www.google.com/maps/search/?api=1&query=${avistamiento.latitud},${avistamiento.longitud}`,
        )}
      >
        <Ionicons name="location-outline" size={14} color={COLORS.textLight} />
        <Text style={[styles.datoTexto, avistamiento.latitud != null && avistamiento.longitud != null && styles.datoTextoEnlace]}>
          {coordenadas(avistamiento)}
        </Text>
      </TouchableOpacity>
      <View style={styles.datoFila}>
        <Ionicons name="person-outline" size={14} color={COLORS.textLight} />
        <Text style={styles.datoTexto} numberOfLines={1}>
          {avistamiento.registrado_por || 'Sin nombre'}
          {avistamiento.fuente ? ` · ${FUENTE_LABEL[avistamiento.fuente] ?? avistamiento.fuente}` : ''}
        </Text>
      </View>
      {!!avistamiento.movilidad_observada && (
        <View style={styles.datoFila}>
          <Ionicons name="walk-outline" size={14} color={COLORS.textLight} />
          <Text style={styles.datoTexto}>
            {MOVILIDAD_LABEL[avistamiento.movilidad_observada]
              ?? avistamiento.movilidad_observada}
          </Text>
        </View>
      )}
      {!!avistamiento.direccion_observada && (
        <Text style={styles.notaTexto}>Dirección: {avistamiento.direccion_observada}</Text>
      )}
      {!!avistamiento.comentario && (
        <Text style={styles.notaTexto}>“{avistamiento.comentario}”</Text>
      )}
      {!!avistamiento.advertencia_visual && (
        <View style={styles.avisoVisual}>
          <Ionicons name="eye-outline" size={14} color={COLORS.warning} />
          <Text style={styles.avisoVisualTexto}>{avistamiento.advertencia_visual}</Text>
        </View>
      )}
    </View>
  );
}

export function AvistamientosPendientesPanel({ visible }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const [grupos, setGrupos] = useState<GrupoPendiente[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const cargar = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const response = await axios.get<GrupoPendiente[]>(
        `${API_URL}/associations/me/avistamientos-pendientes`,
        { headers },
      );
      setGrupos(response.data || []);
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No pudimos cargar los avistamientos',
        message: mensajeError(error, 'Intenta actualizar la bandeja.'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [headers, showToast, token]);

  useEffect(() => {
    if (visible) void cargar();
  }, [cargar, visible]);

  if (!visible) return null;

  /**
   * Aprobar o rechazar. El barrido de los demás pendientes del caso
   * (`superado_por_otro`) lo hace el backend al aprobar — aquí no se
   * replica esa regla, solo se recarga la bandeja con lo que quedó.
   */
  const resolver = async (
    grupo: GrupoPendiente,
    avistamiento: AvistamientoPendiente,
    aprobar: boolean,
    esFalso = false,
  ) => {
    if (resolviendoId) return;
    setResolviendoId(avistamiento.id);
    try {
      await axios.post(
        `${API_URL}/reports/${grupo.reporte_id}/avistamientos/${avistamiento.id}/validar`,
        { aprobar, es_falso: esFalso },
        { headers },
      );
      showToast({
        type: 'success',
        title: aprobar
          ? 'Avistamiento aprobado'
          : esFalso
            ? 'Avistamiento marcado como falso'
            : 'Avistamiento rechazado',
        message: aprobar
          ? 'La ubicación del caso quedó actualizada.'
          : esFalso
            ? 'Se descartó y se registró un incidente contra quien lo reportó.'
            : 'El avistamiento quedó descartado.',
      });
      await cargar();
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No pudimos registrar la decisión',
        message: mensajeError(error, 'Actualiza la bandeja e inténtalo nuevamente.'),
      });
    } finally {
      setResolviendoId(null);
    }
  };

  const total = grupos.reduce((suma, grupo) => suma + grupo.avistamientos.length, 0);

  return (
    <View style={styles.container}>
      <Toast toast={toast} translateY={translateY} />

      <View style={styles.toolbar}>
        <Text style={styles.helperText}>
          Valida dónde se vio al animal antes de mover la ubicación del caso. Si hay
          varios reportes del mismo caso, elige el que describa mejor dónde está ahora.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Actualizar avistamientos"
          onPress={() => void cargar()}
          disabled={isLoading}
          style={styles.refreshButton}
        >
          <Ionicons name="refresh" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.stateText}>Cargando avistamientos…</Text>
        </View>
      ) : grupos.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="eye-off-outline" size={34} color={COLORS.accent} />
          <Text style={styles.emptyTitle}>No hay avistamientos por validar</Text>
          <Text style={styles.stateText}>
            Cuando alguien reporte haber visto a un animal de tus casos, aparecerá aquí.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          <Text style={styles.contador}>
            {total === 1
              ? '1 avistamiento por validar'
              : `${total} avistamientos por validar`}
          </Text>

          {grupos.map((grupo) => (
            <View key={grupo.reporte_id} style={styles.grupoCard}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconBox, grupo.en_conflicto && styles.iconBoxConflicto]}>
                  <Ionicons
                    name={grupo.en_conflicto ? 'git-compare-outline' : 'eye-outline'}
                    size={20}
                    color={grupo.en_conflicto ? COLORS.warning : COLORS.primary}
                  />
                </View>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardTitle}>
                    Caso {grupo.reporte_id.slice(0, 8).toUpperCase()}
                  </Text>
                  <Text style={styles.cardLocation} numberOfLines={1}>
                    {ubicacionTexto(grupo.reporte)}
                  </Text>
                </View>
              </View>

              {grupo.en_conflicto ? (
                <>
                  <View style={styles.avisoConflicto}>
                    <Ionicons name="alert-circle-outline" size={16} color={COLORS.warning} />
                    <Text style={styles.avisoConflictoTexto}>
                      {grupo.avistamientos.length} reportes distintos de dónde está.
                      Al elegir uno, los demás quedan descartados automáticamente.
                    </Text>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.comparativa}
                  >
                    {grupo.avistamientos.map((avistamiento, indice) => (
                      <View key={avistamiento.id} style={styles.columnaComparativa}>
                        <Text style={styles.columnaTitulo}>
                          {indice === 0 ? 'Más reciente' : `Opción ${indice + 1}`}
                        </Text>
                        <Text style={styles.columnaAnimal}>{tituloAnimal(avistamiento)}</Text>
                        <DetalleAvistamiento avistamiento={avistamiento} compacto />
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Elegir este avistamiento ${avistamiento.id}`}
                          disabled={!!resolviendoId}
                          onPress={() => void resolver(grupo, avistamiento, true)}
                          style={[styles.botonPrimario, !!resolviendoId && styles.botonDeshabilitado]}
                        >
                          {resolviendoId === avistamiento.id ? (
                            <ActivityIndicator size="small" color={COLORS.white} />
                          ) : (
                            <Text style={styles.botonPrimarioTexto}>Elegir este</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Rechazar avistamiento ${avistamiento.id}`}
                          disabled={!!resolviendoId}
                          onPress={() => void resolver(grupo, avistamiento, false)}
                          style={styles.botonTextoDanger}
                        >
                          <Text style={styles.botonTextoDangerLabel}>Rechazar</Text>
                        </TouchableOpacity>
                        {avistamiento.fuente === 'testigo_cercano' && (
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`Marcar como falso avistamiento ${avistamiento.id}`}
                            disabled={!!resolviendoId}
                            onPress={() => void resolver(grupo, avistamiento, false, true)}
                            style={styles.botonTextoDanger}
                          >
                            <Text style={styles.botonTextoDangerLabel}>Es falso</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                </>
              ) : (
                grupo.avistamientos.map((avistamiento) => (
                  <View key={avistamiento.id} style={styles.tarjetaSimple}>
                    <Text style={styles.columnaAnimal}>{tituloAnimal(avistamiento)}</Text>
                    <DetalleAvistamiento avistamiento={avistamiento} />
                    <View style={styles.accionesFila}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Aprobar avistamiento ${avistamiento.id}`}
                        disabled={!!resolviendoId}
                        onPress={() => void resolver(grupo, avistamiento, true)}
                        style={[styles.botonPrimario, styles.accionFlex, !!resolviendoId && styles.botonDeshabilitado]}
                      >
                        {resolviendoId === avistamiento.id ? (
                          <ActivityIndicator size="small" color={COLORS.white} />
                        ) : (
                          <Text style={styles.botonPrimarioTexto}>Aprobar</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Rechazar avistamiento ${avistamiento.id}`}
                        disabled={!!resolviendoId}
                        onPress={() => void resolver(grupo, avistamiento, false)}
                        style={[styles.botonSecundario, styles.accionFlex]}
                      >
                        <Text style={styles.botonSecundarioTexto}>Rechazar</Text>
                      </TouchableOpacity>
                      {avistamiento.fuente === 'testigo_cercano' && (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Marcar como falso avistamiento ${avistamiento.id}`}
                          disabled={!!resolviendoId}
                          onPress={() => void resolver(grupo, avistamiento, false, true)}
                          style={styles.botonTextoDanger}
                        >
                          <Text style={styles.botonTextoDangerLabel}>Es falso</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  helperText: { flex: 1, color: COLORS.textLight, fontSize: 13, lineHeight: 19 },
  refreshButton: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, backgroundColor: COLORS.cardBg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  centerState: { alignItems: 'center', paddingVertical: 42, gap: 10 },
  stateText: { color: COLORS.textLight, fontSize: 13, textAlign: 'center' },
  emptyTitle: { color: COLORS.textDark, fontSize: 16, fontWeight: '800' },
  list: { gap: 12 },
  contador: { color: COLORS.textLight, fontSize: 12, fontWeight: '700' },
  grupoCard: {
    backgroundColor: COLORS.cardBg, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(236,128,43,0.12)',
  },
  iconBoxConflicto: { backgroundColor: 'rgba(183,121,31,0.14)' },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  cardTitle: { color: COLORS.textDark, fontSize: 15, fontWeight: '800' },
  cardLocation: { color: COLORS.textLight, fontSize: 12, marginTop: 3 },
  avisoConflicto: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.warnSoft, borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: COLORS.warnBorder,
  },
  avisoConflictoTexto: { flex: 1, color: COLORS.textDark, fontSize: 12, lineHeight: 17 },
  avisoVisual: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: COLORS.warnSoft, borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: COLORS.warnBorder, marginTop: 8,
  },
  avisoVisualTexto: { flex: 1, color: COLORS.textDark, fontSize: 11, lineHeight: 15 },
  comparativa: { gap: 12, paddingVertical: 2 },
  columnaComparativa: {
    width: 210, backgroundColor: COLORS.white, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: COLORS.border, gap: 6,
  },
  columnaTitulo: {
    color: COLORS.accent, fontSize: 10, fontWeight: '900',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  columnaAnimal: { color: COLORS.textDark, fontSize: 14, fontWeight: '800' },
  tarjetaSimple: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: COLORS.border, gap: 6,
  },
  detalleCompacto: { gap: 4 },
  foto: { width: '100%', height: 150, borderRadius: 12, backgroundColor: COLORS.border },
  fotoCompacta: { width: '100%', height: 96, borderRadius: 10, backgroundColor: COLORS.border },
  fotoVacia: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  fotoVaciaTexto: { color: COLORS.textLight, fontSize: 10, fontWeight: '700' },
  datoFila: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  datoTexto: { flex: 1, color: COLORS.textLight, fontSize: 12 },
  datoTextoEnlace: { color: COLORS.primary, fontWeight: '700', textDecorationLine: 'underline' },
  notaTexto: { color: COLORS.textDark, fontSize: 12, lineHeight: 17, marginTop: 4 },
  accionesFila: { flexDirection: 'row', gap: 10, marginTop: 10 },
  accionFlex: { flex: 1 },
  botonPrimario: {
    minHeight: 42, borderRadius: 13, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  botonPrimarioTexto: { color: COLORS.white, fontSize: 13, fontWeight: '900' },
  botonDeshabilitado: { opacity: 0.6 },
  botonSecundario: {
    minHeight: 42, borderRadius: 13, backgroundColor: COLORS.dangerSoft,
    borderWidth: 1.5, borderColor: COLORS.danger,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  botonSecundarioTexto: { color: COLORS.danger, fontSize: 13, fontWeight: '900' },
  botonTextoDanger: { alignItems: 'center', paddingVertical: 8 },
  botonTextoDangerLabel: {
    color: COLORS.danger, fontSize: 11, fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
