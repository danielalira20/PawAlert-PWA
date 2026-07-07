import React, { useEffect, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { Toast, useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';
import { useAdminAssociations } from '../hooks/useAdminAssociations';
import { AssocListCard } from '../components/admin-dashboard/AssocListCard';
import { AssocAvatar } from '../components/admin-dashboard/AssocAvatar';
import { PendingBadge } from '../components/admin-dashboard/PendingBadge';
import { SectionBlock } from '../components/admin-dashboard/SectionBlock';
import { AboutBlock } from '../components/admin-dashboard/AboutBlock';
import { AnimalChips } from '../components/admin-dashboard/AnimalChips';
import { ContactBlock } from '../components/admin-dashboard/ContactBlock';
import { AssocLocationMap } from '../components/admin-dashboard/AssocLocationMap';
import { PhotoGallery } from '../components/admin-dashboard/PhotoGallery';
import { ActionBar } from '../components/admin-dashboard/ActionBar';
import { AdminActionButton } from '../components/admin-dashboard/AdminActionButton';
import { Brand } from '../constants/theme';
import type { AsociacionDetalle } from '../types/asociacionAdmin';

interface Props {
  onClose?: () => void;
}

type Tab = 'solicitudes' | 'apelaciones';
type DetailScreenState = 'list' | 'detail';

const DESKTOP_BREAKPOINT = 900;

type ShowToastFn = (toast: {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}) => void;

function esImagen(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
}

// En web usamos window.open directo (más confiable dentro de Expo Router
// que Linking.openURL). En nativo sí usamos Linking, pero envuelto para que
// un fallo real muestre un toast en vez de una promesa sin atrapar en consola.
async function abrirDocumento(url: string, showToast: ShowToastFn) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(url, '_blank');
    return;
  }
  try {
    const soportado = await Linking.canOpenURL(url);
    if (soportado) {
      await Linking.openURL(url);
    } else {
      showToast({ type: 'error', title: 'Error', message: 'No se pudo abrir el documento.' });
    }
  } catch {
    showToast({ type: 'error', title: 'Error', message: 'No se pudo abrir el documento.' });
  }
}

// ─── Tipo de apelación (el mensaje/documentos/motivo original — el detalle
// completo de la asociación se pide aparte, con el mismo endpoint de
// Solicitudes, para no duplicar esa información) ───────────────────────────
interface Apelacion {
  id: string;
  mensaje: string;
  documentos_urls: string[];
  estado: string;
  created_at: string;
  asociaciones: {
    id: string;
    nombre: string;
    nombre_responsable: string;
    contacto_email: string;
    motivo_rechazo: string;
  };
}

export default function AdminDashboardScreen({ onClose }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const [tab, setTab] = useState<Tab>('solicitudes');

  // ── Datos compartidos: lista/detalle de asociaciones + aprobar/rechazar ─
  // Tanto "Solicitudes" como el detalle dentro de "Apelaciones" usan el
  // mismo `detalle` — es el mismo expediente completo de la asociación,
  // solo cambia qué botones/contexto extra se muestran alrededor.
  const {
    asociaciones,
    isLoadingLista,
    cargarPendientes,
    detalle,
    isLoadingDetalle,
    cargarDetalle,
    limpiarDetalle,
    aprobar,
    rechazar,
    isSubmitting,
  } = useAdminAssociations(showToast);

  // ── Solicitudes: lista ↔ detalle ──────────────────────────────────────
  const [solicitudScreen, setSolicitudScreen] = useState<DetailScreenState>('list');

  useEffect(() => {
    cargarPendientes();
  }, [cargarPendientes]);

  const abrirSolicitud = async (id: string) => {
    setSolicitudScreen('detail');
    await cargarDetalle(id);
  };

  const volverASolicitudes = () => {
    setSolicitudScreen('list');
    limpiarDetalle();
    cargarPendientes();
  };

  const handleAprobar = async () => {
    if (!detalle) return;
    const ok = await aprobar(detalle.id);
    if (ok) volverASolicitudes();
  };

  const handleRechazar = async (motivo: string) => {
    if (!detalle) return;
    const ok = await rechazar(detalle.id, motivo);
    if (ok) volverASolicitudes();
  };

  // ── Apelaciones: lista ↔ detalle (reutiliza el mismo expediente) ──────
  const [apelaciones, setApelaciones] = useState<Apelacion[]>([]);
  const [apelacionScreen, setApelacionScreen] = useState<DetailScreenState>('list');
  const [apelacionSeleccionada, setApelacionSeleccionada] = useState<Apelacion | null>(null);
  const [respuestaApelacion, setRespuestaApelacion] = useState('');
  const [isResolviendo, setIsResolviendo] = useState(false);

  const cargarApelaciones = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/apelaciones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setApelaciones(res.data);
    } catch (error) {
      console.log('Error al cargar apelaciones', error);
    }
  };

  useEffect(() => {
    if (tab === 'apelaciones') cargarApelaciones();
  }, [tab]);

  const abrirApelacion = async (a: Apelacion) => {
    setApelacionSeleccionada(a);
    setApelacionScreen('detail');
    setRespuestaApelacion('');
    await cargarDetalle(a.asociaciones.id);
  };

  const volverAApelaciones = () => {
    setApelacionScreen('list');
    setApelacionSeleccionada(null);
    setRespuestaApelacion('');
    limpiarDetalle();
  };

  const resolverApelacion = async (decision: 'aprobar' | 'rechazar') => {
    if (!apelacionSeleccionada) return;
    setIsResolviendo(true);
    try {
      await axios.patch(
        `${API_URL}/admin/apelaciones/${apelacionSeleccionada.id}`,
        { decision, respuesta: respuestaApelacion.trim() || null },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setApelaciones((prev) => prev.filter((a) => a.id !== apelacionSeleccionada.id));
      showToast({
        type: 'success',
        title: decision === 'aprobar' ? 'Apelación aprobada' : 'Apelación rechazada',
        message:
          decision === 'aprobar' ? 'La asociación fue verificada.' : 'La apelación fue rechazada.',
      });
      volverAApelaciones();
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos procesar la apelación.' });
    } finally {
      setIsResolviendo(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>PAWALERT ADMIN</Text>
        <Text style={styles.headerTitle}>Revisión de Asociaciones</Text>
      </View>

      <View style={styles.tabsRow}>
        <TouchableOpacity
          onPress={() => {
            setTab('solicitudes');
            setSolicitudScreen('list');
          }}
          style={[styles.tab, tab === 'solicitudes' && styles.tabActiva]}
        >
          <Text style={[styles.tabText, tab === 'solicitudes' && styles.tabTextActiva]}>
            Solicitudes
          </Text>
          {asociaciones.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{asociaciones.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setTab('apelaciones');
            setApelacionScreen('list');
          }}
          style={[styles.tab, tab === 'apelaciones' && styles.tabActiva]}
        >
          <Text style={[styles.tabText, tab === 'apelaciones' && styles.tabTextActiva]}>
            Apelaciones
          </Text>
          {apelaciones.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{apelaciones.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {tab === 'solicitudes' ? (
        solicitudScreen === 'list' ? (
          <SolicitudesListScreen
            asociaciones={asociaciones}
            isLoading={isLoadingLista}
            onSelect={abrirSolicitud}
          />
        ) : (
          <DetailShell
            titulo="Solicitudes"
            detalle={detalle}
            isLoading={isLoadingDetalle}
            isDesktop={isDesktop}
            onBack={volverASolicitudes}
          >
            {(bodyProps) =>
              isDesktop ? <DetailDesktopBody {...bodyProps} /> : <DetailMobileBody {...bodyProps} />
            }
            <ActionBar onAprobar={handleAprobar} onRechazar={handleRechazar} isSubmitting={isSubmitting} />
          </DetailShell>
        )
      ) : apelacionScreen === 'list' ? (
        <ApelacionesListScreen apelaciones={apelaciones} onSelect={abrirApelacion} />
      ) : (
        <DetailShell
          titulo="Apelaciones"
          detalle={detalle}
          isLoading={isLoadingDetalle}
          isDesktop={isDesktop}
          onBack={volverAApelaciones}
        >
          {(bodyProps) => {
            const contexto = apelacionSeleccionada && (
              <ApelacionContextBlock apelacion={apelacionSeleccionada} showToast={showToast} />
            );
            return isDesktop ? (
              <DetailDesktopBody {...bodyProps} extraTop={contexto} />
            ) : (
              <DetailMobileBody {...bodyProps} extraTop={contexto} />
            );
          }}
          <ApelacionResolverBar
            respuesta={respuestaApelacion}
            onChangeRespuesta={setRespuestaApelacion}
            onAprobar={() => resolverApelacion('aprobar')}
            onRechazar={() => resolverApelacion('rechazar')}
            isResolviendo={isResolviendo}
          />
        </DetailShell>
      )}

      <Toast toast={toast} translateY={translateY} />
    </View>
  );
}

// ─── Pantalla: lista de solicitudes ───────────────────────────────────────

function SolicitudesListScreen({
  asociaciones,
  isLoading,
  onSelect,
}: {
  asociaciones: ReturnType<typeof useAdminAssociations>['asociaciones'];
  isLoading: boolean;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Brand.primary} />
      </View>
    );
  }

  if (asociaciones.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No hay asociaciones pendientes de revisión.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.listScrollContent}>
      <View style={styles.listCentered}>
        {asociaciones.map((a) => (
          <AssocListCard key={a.id} asociacion={a} onPress={() => onSelect(a.id)} />
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Pantalla: lista de apelaciones (ahora solo la card, sin modal) ───────

function ApelacionesListScreen({
  apelaciones,
  onSelect,
}: {
  apelaciones: Apelacion[];
  onSelect: (a: Apelacion) => void;
}) {
  if (apelaciones.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No hay apelaciones pendientes de revisión.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.listScrollContent}>
      <View style={styles.listCentered}>
        {apelaciones.map((a) => (
          <View key={a.id} style={styles.apelacionCard}>
            <Text style={styles.apelacionNombre}>{a.asociaciones?.nombre}</Text>
            <Text style={styles.apelacionMeta}>
              Responsable: {a.asociaciones?.nombre_responsable || 'No especificado'}
            </Text>
            <Text style={styles.apelacionMeta}>Correo: {a.asociaciones?.contacto_email}</Text>
            <Text style={styles.apelacionMotivo} numberOfLines={2}>
              Motivo de rechazo: {a.asociaciones?.motivo_rechazo}
            </Text>
            <TouchableOpacity onPress={() => onSelect(a)} style={styles.apelacionRevisarButton}>
              <Text style={styles.apelacionRevisarText}>Revisar expediente completo</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Bloque de contexto de apelación (se inyecta arriba del expediente) ──

function ApelacionContextBlock({
  apelacion,
  showToast,
}: {
  apelacion: Apelacion;
  showToast: ShowToastFn;
}) {
  return (
    <View style={styles.apelacionContextBlock}>
      <View style={styles.apelacionContextHeader}>
        <Ionicons name="alert-circle" size={16} color="#C48A00" />
        <Text style={styles.apelacionContextTitle}>Esta asociación está apelando su rechazo</Text>
      </View>

      {!!apelacion.asociaciones?.motivo_rechazo && (
        <Text style={styles.apelacionContextMotivo}>
          Motivo de rechazo original: {apelacion.asociaciones.motivo_rechazo}
        </Text>
      )}

      <Text style={styles.apelacionContextLabel}>Mensaje de la apelación</Text>
      <Text style={styles.apelacionContextMensaje}>{apelacion.mensaje}</Text>

      {apelacion.documentos_urls && apelacion.documentos_urls.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.apelacionContextLabel}>Documentos adjuntos</Text>
          {apelacion.documentos_urls.map((url, idx) =>
            esImagen(url) ? (
              <TouchableOpacity key={idx} onPress={() => abrirDocumento(url, showToast)}>
                <Image
                  source={{ uri: url }}
                  style={styles.apelacionDocImagePreview}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                key={idx}
                onPress={() => abrirDocumento(url, showToast)}
                style={styles.apelacionDocRow}
              >
                <Ionicons name="document-attach-outline" size={14} color={Brand.primary} />
                <Text style={styles.apelacionDocText}>Documento {idx + 1} (PDF) — Ver</Text>
              </TouchableOpacity>
            ),
          )}
        </View>
      )}
    </View>
  );
}

// ─── Barra de resolución de apelación (respuesta opcional, sin motivo
// obligatorio — a diferencia de ActionBar, que sí exige motivo al rechazar
// una solicitud nueva) ─────────────────────────────────────────────────────

function ApelacionResolverBar({
  respuesta,
  onChangeRespuesta,
  onAprobar,
  onRechazar,
  isResolviendo,
}: {
  respuesta: string;
  onChangeRespuesta: (v: string) => void;
  onAprobar: () => void;
  onRechazar: () => void;
  isResolviendo: boolean;
}) {
  return (
    <View style={styles.resolverBarContainer}>
      <Text style={styles.resolverBarLabel}>Respuesta para la asociación (opcional)</Text>
      <TextInput
        style={styles.resolverBarInput}
        multiline
        numberOfLines={2}
        placeholder="Explica tu decisión sobre la apelación…"
        placeholderTextColor={Brand.textFaint}
        value={respuesta}
        onChangeText={onChangeRespuesta}
      />
      <View style={styles.buttonsRow}>
        <AdminActionButton
          variant="aprobar"
          label="Aprobar apelación"
          icon="checkmark"
          onPress={onAprobar}
          disabled={isResolviendo}
          loading={isResolviendo}
        />
        <AdminActionButton
          variant="rechazar"
          label="Rechazar apelación"
          icon="close"
          onPress={onRechazar}
          disabled={isResolviendo}
        />
      </View>
    </View>
  );
}

// ─── Envoltura común del detalle: header + back + loading + children ────

function DetailShell({
  titulo,
  detalle,
  isLoading,
  isDesktop,
  onBack,
  children,
}: {
  titulo: string;
  detalle: AsociacionDetalle | null;
  isLoading: boolean;
  isDesktop: boolean;
  onBack: () => void;
  children: [(props: { detalle: AsociacionDetalle }) => React.ReactNode, React.ReactNode];
}) {
  const [renderBody, actionBar] = children;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.detailTopNav}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={18} color={Brand.textMuted} />
          <Text style={styles.backText}>{titulo}</Text>
        </TouchableOpacity>
      </View>

      {isLoading || !detalle ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Brand.primary} />
        </View>
      ) : (
        renderBody({ detalle })
      )}

      {detalle && actionBar}
    </View>
  );
}

// ─── Cuerpo del detalle: header + secciones (móvil y desktop) ────────────

function DetailHeader({ detalle }: { detalle: AsociacionDetalle }) {
  return (
    <View style={styles.detailHeaderBlock}>
      <AssocAvatar nombre={detalle.nombre} logoUrl={detalle.logo_url} size="lg" />
      <Text style={styles.detailNombre}>{detalle.nombre}</Text>
      <Text style={styles.detailResponsable}>
        {detalle.nombre_responsable?.trim() || 'Responsable no especificado'}
      </Text>
      <View style={{ marginTop: 8 }}>
        <PendingBadge />
      </View>
    </View>
  );
}

function UbicacionContent({ detalle }: { detalle: AsociacionDetalle }) {
  const tieneUbicacion = detalle.latitud != null && detalle.longitud != null;
  if (!tieneUbicacion) {
    return <Text style={styles.direccionVacia}>Ubicación no proporcionada</Text>;
  }
  return (
    <>
      <AssocLocationMap
        latitud={detalle.latitud as number}
        longitud={detalle.longitud as number}
        radioKm={detalle.radio_km}
      />
      <View style={{ marginTop: 10 }}>
        <Text style={styles.direccionText}>
          {[detalle.calle, detalle.colonia, detalle.municipio].filter(Boolean).join(', ') ||
            'Dirección no proporcionada'}
        </Text>
        <Text style={styles.radioText}>Radio de cobertura · {detalle.radio_km} km</Text>
      </View>
    </>
  );
}

function DetailMobileBody({
  detalle,
  extraTop,
}: {
  detalle: AsociacionDetalle;
  extraTop?: React.ReactNode;
}) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      <DetailHeader detalle={detalle} />
      {extraTop && <View style={styles.detailBody}>{extraTop}</View>}
      <View style={styles.detailBody}>
        <SectionBlock numero="01" titulo="Acerca de">
          <AboutBlock acercaDe={detalle.acerca_de} />
        </SectionBlock>
        <SectionBlock numero="02" titulo="Qué rescatan">
          <AnimalChips tipos={detalle.tipos_animales} />
        </SectionBlock>
        <SectionBlock numero="03" titulo="Ubicación">
          <UbicacionContent detalle={detalle} />
        </SectionBlock>
        <SectionBlock numero="04" titulo="Horario de atención">
          <View style={styles.horarioRow}>
            <Ionicons name="time-outline" size={16} color={Brand.primary} />
            <Text style={styles.horarioText}>
              {detalle.horario_atencion?.trim() || 'No especificado'}
            </Text>
          </View>
        </SectionBlock>
        <SectionBlock numero="05" titulo="Contacto">
          <ContactBlock telefono={detalle.contacto_telefono} email={detalle.contacto_email} />
        </SectionBlock>
        <SectionBlock numero="06" titulo="Galería del refugio" sinBorde>
          <PhotoGallery fotos={detalle.fotos} columnas={2} />
        </SectionBlock>
      </View>
    </ScrollView>
  );
}

function DetailDesktopBody({
  detalle,
  extraTop,
}: {
  detalle: AsociacionDetalle;
  extraTop?: React.ReactNode;
}) {
  return (
    <View style={styles.desktopDetailRow}>
      <ScrollView style={styles.desktopSidebar} contentContainerStyle={{ paddingBottom: 20 }}>
        <DetailHeader detalle={detalle} />
        <View style={styles.detailBody}>
          {extraTop}
          <SectionBlock numero="05" titulo="Contacto">
            <ContactBlock telefono={detalle.contacto_telefono} email={detalle.contacto_email} />
          </SectionBlock>
          <SectionBlock numero="04" titulo="Ubicación" sinBorde>
            <UbicacionContent detalle={detalle} />
          </SectionBlock>
        </View>
      </ScrollView>

      <ScrollView style={styles.desktopMain} contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={styles.desktopMainInner}>
          <SectionBlock numero="01" titulo="Acerca de">
            <AboutBlock acercaDe={detalle.acerca_de} />
          </SectionBlock>
          <SectionBlock numero="02" titulo="Qué rescatan">
            <AnimalChips tipos={detalle.tipos_animales} />
          </SectionBlock>
          <SectionBlock numero="03" titulo="Horario de atención">
            <View style={styles.horarioRow}>
              <Ionicons name="time-outline" size={16} color={Brand.primary} />
              <Text style={styles.horarioText}>
                {detalle.horario_atencion?.trim() || 'No especificado'}
              </Text>
            </View>
          </SectionBlock>
          <SectionBlock numero="06" titulo="Galería del refugio" sinBorde>
            <PhotoGallery fotos={detalle.fotos} columnas={3} />
          </SectionBlock>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.backgroundWarm },
  header: { backgroundColor: Brand.primary, paddingHorizontal: 20, paddingVertical: 16 },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 2 },
  tabsRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: Brand.cardWarm,
    borderBottomWidth: 1,
    borderBottomColor: '#E4D3B8',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActiva: { borderBottomColor: Brand.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Brand.textMuted },
  tabTextActiva: { color: Brand.primary, fontWeight: '800' },
  tabBadge: {
    backgroundColor: Brand.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 14, color: Brand.textMuted, textAlign: 'center' },

  listScrollContent: { padding: 16 },
  listCentered: { width: '100%', maxWidth: 640, alignSelf: 'center' },

  detailTopNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E4D3B8',
    backgroundColor: Brand.cardWarm,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 13, color: Brand.textMuted, fontWeight: '600' },

  detailHeaderBlock: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 20,
    backgroundColor: Brand.cardWarm,
  },
  detailNombre: {
    fontSize: 17,
    fontWeight: '800',
    color: Brand.textDark,
    marginTop: 10,
    textAlign: 'center',
  },
  detailResponsable: { fontSize: 13, color: Brand.textMuted, marginTop: 2 },
  detailBody: { paddingHorizontal: 18 },

  direccionText: { fontSize: 13, fontWeight: '800', color: Brand.textDark, lineHeight: 19 },
  direccionVacia: { fontSize: 13, color: Brand.textFaint },
  radioText: { fontSize: 11, color: Brand.secondary, fontWeight: '700', marginTop: 4 },

  horarioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  horarioText: { fontSize: 13, color: Brand.textDark, flex: 1, lineHeight: 19 },

  desktopDetailRow: { flex: 1, flexDirection: 'row' },
  desktopSidebar: { width: 300, borderRightWidth: 1, borderRightColor: '#E4D3B8' },
  desktopMain: { flex: 1 },
  desktopMainInner: { paddingHorizontal: 28, maxWidth: 760 },

  // Card de la lista de apelaciones
  apelacionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(60,35,16,0.09)',
  },
  apelacionNombre: { fontSize: 15, fontWeight: '700', color: Brand.textDark, marginBottom: 4 },
  apelacionMeta: { fontSize: 12, color: Brand.textMuted, marginBottom: 2 },
  apelacionMotivo: { fontSize: 12, color: Brand.danger, marginTop: 6, marginBottom: 10 },
  apelacionRevisarButton: {
    backgroundColor: Brand.primary,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  apelacionRevisarText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Bloque de contexto de apelación, inyectado arriba del expediente
  apelacionContextBlock: {
    backgroundColor: '#FDF8E8',
    borderWidth: 1,
    borderColor: '#EDC55B',
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
    marginBottom: 6,
  },
  apelacionContextHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  apelacionContextTitle: { fontSize: 13, fontWeight: '800', color: '#8A5F00', flex: 1 },
  apelacionContextMotivo: { fontSize: 12, color: Brand.danger, marginBottom: 10, lineHeight: 17 },
  apelacionContextLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8A7060',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  apelacionContextMensaje: { fontSize: 13, color: Brand.textDark, lineHeight: 18 },

  apelacionDocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  apelacionDocText: { fontSize: 12, color: Brand.primary, fontWeight: '600' },
  apelacionDocImagePreview: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#E2D0B8',
  },

  // Barra de resolución de apelación
  resolverBarContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E4D3B8',
    backgroundColor: Brand.cardWarm,
    padding: 16,
  },
  resolverBarLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Brand.textFaint,
    fontWeight: '700',
    marginBottom: 6,
  },
  resolverBarInput: {
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 12,
    padding: 10,
    fontSize: 13,
    minHeight: 56,
    textAlignVertical: 'top',
    color: Brand.textDark,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  buttonsRow: { flexDirection: 'row', gap: 12 },
});