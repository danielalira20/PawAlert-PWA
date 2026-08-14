import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { AssocLocationMap } from './AssocLocationMap';

type Foto = {
  id: string;
  foto_url: string;
  orden?: number;
  analisis_ia_estado?: string | null;
  analisis_ia_error?: string | null;
  exif_estado_verificacion?: string | null;
  exif_distancia_declarada_m?: number | null;
  requiere_revision?: boolean | null;
};
type RazonValidacion = {
  codigo: string;
  resultado?: string;
  detalle?: string;
};
type Denuncia = {
  id: string;
  motivo: string;
  detalle?: string | null;
  created_at: string;
  resuelta_at?: string | null;
  resolucion?: string | null;
};
type Animal = {
  id: string;
  orden?: number;
  cantidad?: number;
  es_grupo?: boolean;
  sexo?: string | null;
  edad_aproximada?: string | null;
  descripcion?: string | null;
  especie_descripcion?: string | null;
  tiene_collar?: boolean | null;
  esta_prenada?: boolean | null;
  es_agresivo?: boolean | null;
  es_domestico_probable?: boolean | null;
  trae_crias_nacidas?: boolean | null;
  numero_crias_nacidas?: number | null;
  tipo_animal_catalogo?: { clave?: string } | null;
  condicion_catalogo?: { clave?: string } | null;
  tamanio_catalogo?: { clave?: string } | null;
  animal_fotos?: Foto[];
};

type ReporteModeracion = {
  id: string;
  estado_reporte: string;
  estado_moderacion: string;
  estado_validacion_reporte?: string | null;
  razones_validacion?: RazonValidacion[];
  moderacion_origen?: string | null;
  moderacion_actualizada_at?: string | null;
  municipio?: string | null;
  colonia?: string | null;
  calle?: string | null;
  estado_ubicacion?: string | null;
  referencia?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  ubicacion_fuente?: string | null;
  reportante_nombre?: string | null;
  reportante_apellido_paterno?: string | null;
  reportante_apellido_materno?: string | null;
  reportante_telefono?: string | null;
  reportante?: {
    nombre?: string | null;
    apellido_paterno?: string | null;
    apellido_materno?: string | null;
    email?: string | null;
    telefono?: string | null;
  } | null;
  created_at: string;
  phash_alerta?: boolean;
  phash_coincidencia_reporte_id?: string | null;
  phash_distancia?: number | null;
  animal?: Animal[];
  reporte_denuncias?: Denuncia[];
};

const MOTIVOS: Record<string, string> = {
  informacion_falsa: 'Información falsa',
  foto_internet: 'Fotografía tomada de Internet',
  reporte_repetido: 'Reporte repetido',
  ubicacion_incorrecta: 'Ubicación incorrecta',
  animal_no_esta: 'El animal no está en el lugar',
  contenido_inapropiado: 'Contenido inapropiado',
  posible_fraude: 'Posible fraude',
  otro: 'Otro motivo',
};

const RAZONES_VALIDACION: Record<string, string> = {
  sin_evidencia_fotografica: 'No se recibió evidencia fotográfica',
  gemini_error_tecnico: 'El análisis automático no pudo completarse',
  exif_ubicacion_discrepante: 'La ubicación de la foto no coincide con el reporte',
  phash_coincidencia: 'La fotografía coincide con otro reporte',
  trust_score_revision_previa: 'La cuenta requiere revisión previa',
  trust_score_no_disponible: 'No se pudo verificar la reputación de la cuenta',
};

function descargarFoto(url: string, index: number) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `evidencia-pawalert-${index + 1}.jpg`;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    return;
  }
  Linking.openURL(url);
}

export function ReportModerationPanel({
  onCountChange,
  showToast,
}: {
  onCountChange?: (count: number) => void;
  showToast: (toast: {
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }) => void;
}) {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const [reportes, setReportes] = useState<ReporteModeracion[]>([]);
  const [seleccionado, setSeleccionado] = useState<ReporteModeracion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [resolviendo, setResolviendo] = useState(false);
  const [notas, setNotas] = useState('');

  const cargar = async () => {
    if (!token) return;
    setCargando(true);
    try {
      const respuesta = await axios.get<ReporteModeracion[]>(
        `${API_URL}/admin/reportes-moderacion`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setReportes(respuesta.data);
      onCountChange?.(respuesta.data.length);
    } catch {
      showToast({
        type: 'error',
        title: 'No se pudo cargar la moderación',
        message: 'Revisa la conexión e inténtalo nuevamente.',
      });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [token]);

  const resolver = async (decision: 'aprobar' | 'rechazar') => {
    if (!seleccionado || !token) return;
    const esRevisionInicial = seleccionado.estado_validacion_reporte === 'revision_manual';
    if (decision === 'rechazar' && !notas.trim()) {
      showToast({
        type: 'warning',
        title: 'Indica el motivo',
        message: 'La persona que creó el reporte debe saber por qué se retiró.',
      });
      return;
    }
    setResolviendo(true);
    try {
      await axios.patch(
        `${API_URL}/admin/reportes-moderacion/${seleccionado.id}`,
        { decision, notas: notas.trim() || null },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const restantes = reportes.filter((reporte) => reporte.id !== seleccionado.id);
      setReportes(restantes);
      onCountChange?.(restantes.length);
      setSeleccionado(null);
      setNotas('');
      showToast({
        type: 'success',
        title:
          decision === 'aprobar'
            ? (esRevisionInicial ? 'Reporte activado' : 'Reporte restablecido')
            : 'Reporte retirado',
        message:
          decision === 'aprobar'
            ? (esRevisionInicial
              ? 'Superó la revisión y entró al flujo de atención.'
              : 'Volvió a aparecer en el mapa y en el listado público.')
            : 'Permanecerá fuera de la vista pública.',
      });
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No se pudo resolver',
        message: error?.response?.data?.detail || 'Inténtalo nuevamente.',
      });
    } finally {
      setResolviendo(false);
    }
  };

  if (cargando) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#EC802B" />
        <Text style={styles.loadingText}>Cargando reportes en revisión…</Text>
      </View>
    );
  }

  if (seleccionado) {
    return (
      <ModerationDetail
        reporte={seleccionado}
        notas={notas}
        onChangeNotas={setNotas}
        onBack={() => {
          setSeleccionado(null);
          setNotas('');
        }}
        onApprove={() => resolver('aprobar')}
        onReject={() => resolver('rechazar')}
        resolving={resolviendo}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={[styles.listHeader, compact && styles.listHeaderCompact]}>
        <View style={styles.headerIcon}>
          <Ionicons name="shield-checkmark-outline" size={24} color="#EC802B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Moderación comunitaria</Text>
          <Text style={styles.subtitle}>
            Reportes detenidos antes de asignarse y publicaciones con alertas que requieren revisión humana.
          </Text>
        </View>
        <TouchableOpacity onPress={cargar} style={styles.refreshButton}>
          <Ionicons name="refresh" size={20} color="#6D5948" />
        </TouchableOpacity>
      </View>

      {reportes.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#63BFB6" />
          <Text style={styles.emptyTitle}>Todo está revisado</Text>
          <Text style={styles.emptyText}>No hay publicaciones pendientes de moderación.</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {reportes.map((reporte) => (
            <ModerationCard
              key={reporte.id}
              reporte={reporte}
              compact={compact}
              onPress={() => setSeleccionado(reporte)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ModerationCard({
  reporte,
  compact,
  onPress,
}: {
  reporte: ReporteModeracion;
  compact: boolean;
  onPress: () => void;
}) {
  const animales = reporte.animal || [];
  const foto = animales.flatMap((animal) => animal.animal_fotos || [])[0]?.foto_url;
  const denuncias = reporte.reporte_denuncias?.filter((item) => !item.resuelta_at).length || 0;
  const especie = animales[0]?.tipo_animal_catalogo?.clave || 'animal';
  const cantidad = animales.reduce((total, animal) => total + (animal.cantidad || 1), 0);
  return (
    <TouchableOpacity onPress={onPress} style={[styles.card, !compact && styles.cardDesktop]}>
      {foto ? (
        <Image source={{ uri: foto }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, styles.noPhoto]}>
          <Ionicons name="image-outline" size={32} color="#B6A597" />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.badgesRow}>
          {denuncias >= 3 && (
            <View style={styles.dangerBadge}>
              <Ionicons name="flag" size={12} color="#C43B32" />
              <Text style={styles.dangerBadgeText}>{denuncias} alertas</Text>
            </View>
          )}
          {reporte.phash_alerta && (
            <View style={styles.hashBadge}>
              <Ionicons name="copy-outline" size={12} color="#8A5A12" />
              <Text style={styles.hashBadgeText}>Foto similar</Text>
            </View>
          )}
          {reporte.estado_validacion_reporte === 'revision_manual' && (
            <View style={styles.dangerBadge}>
              <Ionicons name="pause-circle-outline" size={12} color="#C43B32" />
              <Text style={styles.dangerBadgeText}>Sin asignar</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {cantidad} {especie}{cantidad === 1 ? '' : 's'}
        </Text>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={15} color="#EC802B" />
          <Text style={styles.cardMeta} numberOfLines={1}>
            {[reporte.colonia, reporte.municipio].filter(Boolean).join(', ') || 'Ubicación no indicada'}
          </Text>
        </View>
        <Text style={styles.cardDate}>
          Enviado {new Date(reporte.created_at).toLocaleDateString('es-MX')}
        </Text>
        <View style={styles.reviewLink}>
          <Text style={styles.reviewLinkText}>Revisar evidencia</Text>
          <Ionicons name="arrow-forward" size={16} color="#63BFB6" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ModerationDetail({
  reporte,
  notas,
  onChangeNotas,
  onBack,
  onApprove,
  onReject,
  resolving,
}: {
  reporte: ReporteModeracion;
  notas: string;
  onChangeNotas: (value: string) => void;
  onBack: () => void;
  onApprove: () => void;
  onReject: () => void;
  resolving: boolean;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const animales = reporte.animal || [];
  const fotos = useMemo(
    () => animales.flatMap((animal) => animal.animal_fotos || []),
    [animales],
  );
  const denuncias = (reporte.reporte_denuncias || []).filter((item) => !item.resuelta_at);
  const esRevisionInicial = reporte.estado_validacion_reporte === 'revision_manual';
  const razonesValidacion = (reporte.razones_validacion || []).filter(
    (razon) => razon.resultado === 'revision_manual',
  );
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={21} color="#49372A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailEyebrow}>REVISIÓN DE PUBLICACIÓN</Text>
          <Text style={styles.detailTitle}>Evidencia y alertas</Text>
        </View>
        <View style={reporte.estado_moderacion === 'en_revision' ? styles.hiddenBadge : styles.signalBadge}>
          <Ionicons
            name={reporte.estado_moderacion === 'en_revision' ? 'eye-off-outline' : 'warning-outline'}
            size={14}
            color={reporte.estado_moderacion === 'en_revision' ? '#C43B32' : '#8A5A12'}
          />
          <Text style={reporte.estado_moderacion === 'en_revision' ? styles.hiddenBadgeText : styles.signalBadgeText}>
            {reporte.estado_moderacion === 'en_revision' ? 'Fuera del mapa' : 'Aún visible'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.detailContent}>
        <View style={styles.evidenceCard}>
          <View style={styles.evidenceHeader}>
            <View>
              <Text style={styles.sectionTitle}>Evidencia fotográfica</Text>
              <Text style={styles.evidenceHint}>{fotos.length} {fotos.length === 1 ? 'imagen adjunta' : 'imágenes adjuntas'}</Text>
            </View>
            <Ionicons name="images-outline" size={22} color="#EC802B" />
          </View>
          <View style={styles.photoRow}>
          {fotos.length ? fotos.map((foto, index) => (
            <View
              key={foto.id}
              style={[
                styles.photoContainer,
                fotos.length === 1 ? styles.photoSingle : styles.photoMultiple,
                compact && styles.photoCompact,
              ]}
            >
              <Image
                source={{ uri: foto.foto_url }}
                style={[styles.detailPhoto, compact && styles.detailPhotoCompact]}
                resizeMode="contain"
              />
              <TouchableOpacity onPress={() => descargarFoto(foto.foto_url, index)} style={styles.downloadButton}>
                <Ionicons name="download-outline" size={16} color="#FFF" />
                <Text style={styles.downloadText}>Descargar</Text>
              </TouchableOpacity>
            </View>
          )) : (
            <View style={[styles.detailPhoto, styles.noPhoto]}>
              <Ionicons name="image-outline" size={42} color="#B6A597" />
              <Text style={styles.noPhotoText}>Sin fotografía</Text>
            </View>
          )}
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Resumen del caso</Text>
          <InfoLine icon="paw-outline" label="Animales" value={animales.map((animal) => `${animal.cantidad || 1} ${animal.tipo_animal_catalogo?.clave || 'animal'}`).join(' · ') || 'Sin datos'} />
          <InfoLine icon="location-outline" label="Ubicación" value={[reporte.calle, reporte.colonia, reporte.municipio, reporte.estado_ubicacion].filter(Boolean).join(', ') || 'No indicada'} />
          <InfoLine icon="pulse-outline" label="Estado operativo" value={reporte.estado_reporte} />
          <InfoLine icon="calendar-outline" label="Creado" value={new Date(reporte.created_at).toLocaleString('es-MX')} />
          {!!reporte.referencia && <InfoLine icon="navigate-outline" label="Referencia" value={reporte.referencia} />}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Información de los animales</Text>
          {animales.map((animal, index) => (
            <View key={animal.id} style={[styles.animalBlock, index === animales.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.animalTitle}>Animal {index + 1} · {animal.tipo_animal_catalogo?.clave || animal.especie_descripcion || 'Sin especie'}</Text>
              <View style={styles.chipsRow}>
                {[animal.condicion_catalogo?.clave, animal.tamanio_catalogo?.clave, animal.sexo, animal.edad_aproximada, animal.es_grupo ? `Grupo de ${animal.cantidad || 1}` : null]
                  .filter(Boolean).map((valor) => <Text key={valor} style={styles.animalChip}>{valor}</Text>)}
              </View>
              {!!animal.descripcion && <Text style={styles.animalDescription}>{animal.descripcion}</Text>}
              <Text style={styles.animalFlags}>
                {[
                  animal.tiene_collar ? 'Tiene collar' : null,
                  animal.esta_prenada ? 'Está preñada' : null,
                  animal.es_agresivo ? 'Puede ser agresivo' : null,
                  animal.es_domestico_probable ? 'Probablemente doméstico' : null,
                  animal.trae_crias_nacidas ? `Con ${animal.numero_crias_nacidas || 0} crías` : null,
                ].filter(Boolean).join(' · ') || 'Sin características adicionales'}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Persona que creó el reporte</Text>
          <InfoLine
            icon="person-outline"
            label="Nombre"
            value={[
              reporte.reportante?.nombre || reporte.reportante_nombre,
              reporte.reportante?.apellido_paterno || reporte.reportante_apellido_paterno,
              reporte.reportante?.apellido_materno || reporte.reportante_apellido_materno,
            ].filter(Boolean).join(' ') || 'Reporte anónimo'}
          />
          <InfoLine icon="call-outline" label="Teléfono" value={reporte.reportante?.telefono || reporte.reportante_telefono || 'No proporcionado'} />
          <InfoLine icon="mail-outline" label="Correo" value={reporte.reportante?.email || 'No proporcionado'} />
        </View>

        {reporte.latitud != null && reporte.longitud != null && (
          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Ubicación declarada</Text>
            <AssocLocationMap latitud={reporte.latitud} longitud={reporte.longitud} radioKm={0.2} height={250} />
            <Text style={styles.coordinates}>{reporte.latitud.toFixed(6)}, {reporte.longitud.toFixed(6)} · Fuente: {reporte.ubicacion_fuente || 'no indicada'}</Text>
          </View>
        )}

        {reporte.phash_alerta && (
          <View style={styles.warningCard}>
            <Ionicons name="copy-outline" size={24} color="#A76A12" />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Coincidencia fotográfica</Text>
              <Text style={styles.warningText}>
                La imagen se parece a la de otro reporte (distancia perceptual {reporte.phash_distancia ?? '—'} de 64). Es una señal, no una prueba automática.
              </Text>
              {!!reporte.phash_coincidencia_reporte_id && (
                <Text style={styles.hashId}>Caso relacionado: {reporte.phash_coincidencia_reporte_id}</Text>
              )}
            </View>
          </View>
        )}

        {esRevisionInicial && (
          <View style={styles.warningCard}>
            <Ionicons name="pause-circle-outline" size={24} color="#A76A12" />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Activación detenida</Text>
              <Text style={styles.warningText}>
                Este reporte todavía no tiene asociación ni voluntarios candidatos.
              </Text>
              {razonesValidacion.map((razon) => (
                <View key={razon.codigo} style={styles.validationReason}>
                  <Ionicons name="alert-circle-outline" size={16} color="#8A5A12" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.validationReasonTitle}>
                      {RAZONES_VALIDACION[razon.codigo] || razon.codigo}
                    </Text>
                    {!!razon.detalle && (
                      <Text style={styles.validationReasonDetail}>{razon.detalle}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Alertas de la comunidad ({denuncias.length})</Text>
          {denuncias.length === 0 ? (
            <Text style={styles.emptyText}>
              {esRevisionInicial
                ? 'Este caso no tiene alertas de la comunidad.'
                : 'Este caso llegó por coincidencia fotográfica.'}
            </Text>
          ) : denuncias.map((denuncia, index) => (
            <View key={denuncia.id} style={[styles.complaint, index === denuncias.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.complaintNumber}><Text style={styles.complaintNumberText}>{index + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.complaintReason}>{MOTIVOS[denuncia.motivo] || denuncia.motivo}</Text>
                {!!denuncia.detalle && <Text style={styles.complaintDetail}>{denuncia.detalle}</Text>}
                <Text style={styles.cardDate}>{new Date(denuncia.created_at).toLocaleString('es-MX')}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Notas de moderación</Text>
          <Text style={styles.inputHint}>Son obligatorias si decides retirar el reporte.</Text>
          <TextInput
            value={notas}
            onChangeText={onChangeNotas}
            maxLength={700}
            multiline
            placeholder="Describe qué verificaste y la razón de tu decisión…"
            placeholderTextColor="#B4A496"
            style={styles.notesInput}
          />
          <Text style={styles.counter}>{notas.length}/700</Text>
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        <TouchableOpacity disabled={resolving} onPress={onApprove} style={styles.approveButton}>
          {resolving ? <ActivityIndicator color="#239354" /> : <><Ionicons name={esRevisionInicial ? 'play-outline' : 'eye-outline'} size={19} color="#239354" /><Text style={styles.approveText}>{esRevisionInicial ? 'Aprobar y activar' : 'Restaurar en el mapa'}</Text></>}
        </TouchableOpacity>
        <TouchableOpacity disabled={resolving} onPress={onReject} style={styles.rejectButton}>
          {resolving ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="trash-outline" size={18} color="#FFF" /><Text style={styles.rejectText}>{esRevisionInicial ? 'Rechazar reporte' : 'Retirar definitivamente'}</Text></>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function InfoLine({ icon, label, value }: { icon: any; label: string; value: string }) {
  return <View style={styles.infoLine}><Ionicons name={icon} size={18} color="#EC802B" /><View style={{ flex: 1 }}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { color: '#897667', fontWeight: '700' },
  listContent: { padding: 24, paddingBottom: 50 },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  listHeaderCompact: { alignItems: 'flex-start' },
  headerIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#FFF0E4', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '900', color: '#3F3025' },
  subtitle: { color: '#8A7767', fontSize: 13, lineHeight: 19, marginTop: 3, maxWidth: 680 },
  refreshButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F3EDE7', alignItems: 'center', justifyContent: 'center' },
  emptyCard: { padding: 45, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', borderWidth: 1, borderColor: '#EEE4DA' },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#3F3025', marginTop: 12 },
  emptyText: { color: '#8A7767', lineHeight: 20, marginTop: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  card: { width: '100%', borderRadius: 20, backgroundColor: '#FFF', overflow: 'hidden', borderWidth: 1, borderColor: '#EEE3D8', shadowColor: '#5D4433', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  cardDesktop: { width: '48%' },
  cardImage: { width: '100%', height: 180, backgroundColor: '#F5EFE9' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { color: '#A89585', marginTop: 6 },
  cardBody: { padding: 17 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  dangerBadge: { flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: '#FFF0EE', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  dangerBadgeText: { color: '#C43B32', fontSize: 11, fontWeight: '900' },
  hashBadge: { flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: '#FFF6DC', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  hashBadgeText: { color: '#8A5A12', fontSize: 11, fontWeight: '900' },
  cardTitle: { fontSize: 20, fontWeight: '900', color: '#3F3025', textTransform: 'capitalize' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  cardMeta: { flex: 1, color: '#776555', fontWeight: '600' },
  cardDate: { color: '#A08E7F', fontSize: 11, marginTop: 7 },
  reviewLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  reviewLinkText: { color: '#55AAA2', fontWeight: '900' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 20, borderBottomWidth: 1, borderBottomColor: '#EDE2D7', backgroundColor: '#FFFCF8' },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F3EDE7', alignItems: 'center', justifyContent: 'center' },
  detailEyebrow: { fontSize: 10, fontWeight: '900', color: '#EC802B', letterSpacing: 1 },
  detailTitle: { fontSize: 22, fontWeight: '900', color: '#3F3025' },
  hiddenBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 18, backgroundColor: '#FFF0EE', paddingHorizontal: 10, paddingVertical: 7 },
  hiddenBadgeText: { color: '#C43B32', fontWeight: '800', fontSize: 11 },
  signalBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 18, backgroundColor: '#FFF6DC', paddingHorizontal: 10, paddingVertical: 7 },
  signalBadgeText: { color: '#8A5A12', fontWeight: '800', fontSize: 11 },
  detailContent: { padding: 22, gap: 17, paddingBottom: 36 },
  evidenceCard: { backgroundColor: '#FFF', borderRadius: 19, borderWidth: 1, borderColor: '#EEE3D8', padding: 18 },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  evidenceHint: { color: '#9A8879', fontSize: 11, marginTop: -7 },
  photoRow: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoContainer: { position: 'relative', overflow: 'hidden', borderRadius: 17, backgroundColor: '#29241F' },
  photoSingle: { width: '100%' },
  photoMultiple: { width: '48%' },
  photoCompact: { width: '100%' },
  detailPhoto: { width: '100%', height: 340, backgroundColor: '#29241F' },
  detailPhotoCompact: { height: 230 },
  downloadButton: { position: 'absolute', right: 9, bottom: 9, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(48,35,25,0.82)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  downloadText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  infoCard: { backgroundColor: '#FFF', borderRadius: 19, borderWidth: 1, borderColor: '#EEE3D8', padding: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: '#3F3025', marginBottom: 12 },
  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  infoLabel: { color: '#9A8879', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  infoValue: { color: '#49372A', fontWeight: '700', marginTop: 2, textTransform: 'capitalize' },
  animalBlock: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0E7DF' },
  animalTitle: { color: '#49372A', fontSize: 15, fontWeight: '900', textTransform: 'capitalize' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  animalChip: { color: '#6F5A48', backgroundColor: '#F5EEE7', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  animalDescription: { color: '#685646', lineHeight: 19, marginTop: 9 },
  animalFlags: { color: '#9A7762', fontSize: 11, marginTop: 8 },
  coordinates: { color: '#8B796A', fontSize: 11, marginTop: 9 },
  warningCard: { flexDirection: 'row', gap: 13, padding: 18, borderRadius: 19, backgroundColor: '#FFF7DF', borderWidth: 1, borderColor: '#F0D894' },
  warningTitle: { color: '#7D5010', fontSize: 16, fontWeight: '900' },
  warningText: { color: '#806A48', lineHeight: 20, marginTop: 4 },
  hashId: { color: '#9C7C43', fontSize: 11, marginTop: 8 },
  validationReason: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 11 },
  validationReasonTitle: { color: '#6E4B18', fontWeight: '800', fontSize: 12 },
  validationReasonDetail: { color: '#806A48', fontSize: 11, marginTop: 2 },
  complaint: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0E7DF' },
  complaintNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFF0EE', alignItems: 'center', justifyContent: 'center' },
  complaintNumberText: { color: '#C43B32', fontWeight: '900' },
  complaintReason: { color: '#49372A', fontWeight: '900' },
  complaintDetail: { color: '#776555', lineHeight: 19, marginTop: 4 },
  inputHint: { color: '#8A7767', marginTop: -6, marginBottom: 10, fontSize: 12 },
  notesInput: { minHeight: 110, borderRadius: 14, borderWidth: 1.5, borderColor: '#E7DACE', backgroundColor: '#FFFCF9', padding: 13, textAlignVertical: 'top', color: '#3F3025' },
  counter: { alignSelf: 'flex-end', color: '#A08E7F', fontSize: 10, marginTop: 4 },
  actionBar: { flexDirection: 'row', gap: 12, padding: 17, borderTopWidth: 1, borderTopColor: '#E9DED4', backgroundColor: '#FFF' },
  rejectButton: { flex: 1, minHeight: 50, borderRadius: 15, backgroundColor: '#E7443A', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  rejectText: { color: '#FFF', fontWeight: '900' },
  approveButton: { flex: 1, minHeight: 50, borderRadius: 15, backgroundColor: '#F0FAF4', borderWidth: 1.5, borderColor: '#27AE60', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  approveText: { color: '#239354', fontWeight: '900' },
});
