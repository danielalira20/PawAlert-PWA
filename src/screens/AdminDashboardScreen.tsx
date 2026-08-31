import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
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
import { useAdminAliados, type PerfilAliadoAdmin } from '../hooks/useAdminAliados';
import { useAdminApelacionesAliados, type ApelacionAliado } from '../hooks/useAdminApelacionesAliados';
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
import { EventModerationWorkspace } from '../components/events/admin/EventModerationWorkspace';
import { ProblemasCanjesPanel } from '../components/admin-dashboard/ProblemasCanjesPanel';
import { AdminStatsPanel } from '../components/admin-dashboard/AdminStatsPanel';
import { DeceasedFollowupPanel } from '../components/association-dashboard/DeceasedFollowupPanel';
import { StatsRow, type StatItem } from '../components/staff-dashboard/StatsRow';
import { Brand } from '../constants/theme';
import type { AsociacionDetalle } from '../types/asociacionAdmin';

interface Props {
  onClose?: () => void;
}

type Tab = 'solicitudes' | 'apelaciones' | 'apelaciones-aliados' | 'aliados' | 'operativos' | 'fallecimientos' | 'moderacion' | 'problemas-canjes' | 'estadisticas';
type DetailScreenState = 'list' | 'detail';

interface CasoOperativo {
  id: string;
  reporte_id?: string | null;
  tipo: 'reporte_sin_coordinadora' | 'relevo_sin_respuesta' | 'cancelacion_en_atencion';
  prioridad: string;
  detalle?: string | null;
  estado: string;
  creado_at: string;
  reportes?: { estado_reporte?: string; municipio?: string; colonia?: string } | null;
}

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
  const [moderacionPendiente, setModeracionPendiente] = useState(0);
  const [casosOperativos, setCasosOperativos] = useState<CasoOperativo[]>([]);
  const [asociacionesOperativas, setAsociacionesOperativas] = useState<Array<{ id: string; nombre: string }>>([]);

  const cargarCasosOperativos = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [casos, asociacionesDisponibles] = await Promise.all([
        axios.get(`${API_URL}/admin/casos-operativos`, { headers }),
        axios.get(`${API_URL}/admin/casos-operativos/asociaciones`, { headers }),
      ]);
      setCasosOperativos(casos.data || []);
      setAsociacionesOperativas(asociacionesDisponibles.data || []);
    } catch {
      showToast({ type: 'error', title: 'No pudimos cargar la bandeja', message: 'Inténtalo nuevamente.' });
    }
  };

  useEffect(() => {
    if (tab === 'operativos') void cargarCasosOperativos();
  }, [tab]);

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

  // ── Problemas Canjes ──────────────────────────────────────
  const [problemasCanjes, setProblemasCanjes] = useState<any[]>([]);
  const [loadingProblemasCanjes, setLoadingProblemasCanjes] = useState(false);

  const cargarProblemasCanjes = async () => {
    if (!token) return;
    setLoadingProblemasCanjes(true);
    try {
      const res = await axios.get(`${API_URL}/recompensas/admin/canjes/problemas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProblemasCanjes(res.data);
    } catch (error) {
      console.log('Error al cargar problemas de canjes', error);
    } finally {
      setLoadingProblemasCanjes(false);
    }
  };

  useEffect(() => {
    if (tab === 'problemas-canjes') cargarProblemasCanjes();
  }, [tab]);


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

  // ── Aliados (FRONT06): lista ↔ detalle ──────
  const { pendientes: aliadosPendientes, isLoading: isLoadingAliados, cargarPendientes: cargarAliados, resolverPerfil } = useAdminAliados(showToast);

  // ── Apelaciones Aliados ──────────────────────────────────────
  const { apelaciones: apelacionesAliados, loading: loadingApelacionesAliados, fetchApelaciones: cargarApelacionesAliados, resolverApelacion: resolverApelacionAliado } = useAdminApelacionesAliados();
  const [apelacionAliadoScreen, setApelacionAliadoScreen] = useState<DetailScreenState>('list');
  const [apelacionAliadoSeleccionada, setApelacionAliadoSeleccionada] = useState<ApelacionAliado | null>(null);
  const [respuestaApelacionAliado, setRespuestaApelacionAliado] = useState('');
  const [isResolviendoApelacionAliado, setIsResolviendoApelacionAliado] = useState(false);

  useEffect(() => {
    if (tab === 'apelaciones-aliados') cargarApelacionesAliados();
  }, [tab, cargarApelacionesAliados]);

  const abrirApelacionAliado = (a: ApelacionAliado) => {
    setApelacionAliadoSeleccionada(a);
    setApelacionAliadoScreen('detail');
    setRespuestaApelacionAliado('');
  };

  const volverAApelacionesAliados = () => {
    setApelacionAliadoScreen('list');
    setApelacionAliadoSeleccionada(null);
    setRespuestaApelacionAliado('');
  };

  const handleResolverApelacionAliado = async (decision: 'aprobar' | 'rechazar') => {
    if (!apelacionAliadoSeleccionada) return;
    setIsResolviendoApelacionAliado(true);
    try {
      await resolverApelacionAliado(apelacionAliadoSeleccionada.id, decision, respuestaApelacionAliado);
      showToast({ type: 'success', title: 'Completado', message: decision === 'aprobar' ? 'Aliado verificado.' : 'Apelación rechazada.' });
      volverAApelacionesAliados();
    } catch (err) {
      showToast({ type: 'error', title: 'Error', message: 'No se pudo procesar la apelación.' });
    } finally {
      setIsResolviendoApelacionAliado(false);
    }
  };

  const [aliadosScreen, setAliadosScreen] = useState<DetailScreenState>('list');
  const [aliadoSeleccionado, setAliadoSeleccionado] = useState<PerfilAliadoAdmin | null>(null);
  const [razonRechazoAliado, setRazonRechazoAliado] = useState('');
  const [isResolviendoAliado, setIsResolviendoAliado] = useState(false);

  useEffect(() => {
    if (tab === 'aliados') cargarAliados();
  }, [tab, cargarAliados]);

  const abrirAliado = (a: PerfilAliadoAdmin) => {
    setAliadoSeleccionado(a);
    setAliadosScreen('detail');
    setRazonRechazoAliado('');
  };

  const volverAAliados = () => {
    setAliadosScreen('list');
    setAliadoSeleccionado(null);
    setRazonRechazoAliado('');
  };

  const handleResolverAliado = async (decision: 'aprobar' | 'rechazar') => {
    if (!aliadoSeleccionado) return;
    setIsResolviendoAliado(true);
    const ok = await resolverPerfil(aliadoSeleccionado.id, decision, razonRechazoAliado);
    setIsResolviendoAliado(false);
    if (ok) volverAAliados();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>PAWALERT ADMIN</Text>
        <Text style={styles.headerTitle}>Revisión de Asociaciones</Text>
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScrollContent}>
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

          <TouchableOpacity
            onPress={() => {
              setTab('apelaciones-aliados');
              setApelacionAliadoScreen('list');
            }}
            style={[styles.tab, tab === 'apelaciones-aliados' && styles.tabActiva]}
          >
            <Text style={[styles.tabText, tab === 'apelaciones-aliados' && styles.tabTextActiva]}>
              Apelaciones Aliados
            </Text>
            {apelacionesAliados.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{apelacionesAliados.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setTab('aliados');
              setAliadosScreen('list');
            }}
            style={[styles.tab, tab === 'aliados' && styles.tabActiva]}
          >
            <Text style={[styles.tabText, tab === 'aliados' && styles.tabTextActiva]}>
              Nuevos Aliados
            </Text>
            {aliadosPendientes.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{aliadosPendientes.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setTab('operativos')}
            style={[styles.tab, tab === 'operativos' && styles.tabActiva]}
          >
            <Text style={[styles.tabText, tab === 'operativos' && styles.tabTextActiva]}>
              Casos operativos
            </Text>
            {casosOperativos.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{casosOperativos.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setTab('moderacion')}
            style={[styles.tab, tab === 'moderacion' && styles.tabActiva]}
          >
            <Text style={[styles.tabText, tab === 'moderacion' && styles.tabTextActiva]}>
              Moderación
            </Text>
            {moderacionPendiente > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{moderacionPendiente}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setTab('fallecimientos')}
            style={[styles.tab, tab === 'fallecimientos' && styles.tabActiva]}
          >
            <Text style={[styles.tabText, tab === 'fallecimientos' && styles.tabTextActiva]}>
              Seguimientos sensibles
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setTab('problemas-canjes')}
            style={[styles.tab, tab === 'problemas-canjes' && styles.tabActiva]}
          >
            <Text style={[styles.tabText, tab === 'problemas-canjes' && styles.tabTextActiva]}>
              Problemas Canjes
            </Text>
            {problemasCanjes.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{problemasCanjes.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setTab('estadisticas')}
            style={[styles.tab, tab === 'estadisticas' && styles.tabActiva]}
          >
            <Text style={[styles.tabText, tab === 'estadisticas' && styles.tabTextActiva]}>
              Estadísticas
            </Text>
          </TouchableOpacity>
        </ScrollView>
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
      ) : tab === 'apelaciones' ? (
        apelacionScreen === 'list' ? (
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
        )
      ) : tab === 'apelaciones-aliados' ? (
        apelacionAliadoScreen === 'list' ? (
          <ApelacionesAliadosListScreen apelaciones={apelacionesAliados} isLoading={loadingApelacionesAliados} onSelect={abrirApelacionAliado} />) : (
          <View style={{ flex: 1, backgroundColor: Brand.backgroundWarm }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E4D3B8', backgroundColor: Brand.cardWarm }}>
              <TouchableOpacity onPress={volverAApelacionesAliados} style={styles.backButton}>
                <Ionicons name="chevron-back" size={18} color={Brand.textMuted} />
                <Text style={styles.backText}>Apelación de Aliado</Text>
              </TouchableOpacity>
            </View>

            <AliadoDetailBody
              aliado={{
                id: apelacionAliadoSeleccionada!.perfil_apoyo.id,
                usuario_id: apelacionAliadoSeleccionada!.perfil_apoyo.usuario_id,
                tipo: apelacionAliadoSeleccionada!.perfil_apoyo.tipo as any,
                datos_extra: apelacionAliadoSeleccionada!.perfil_apoyo.datos_extra,
                categorias: apelacionAliadoSeleccionada!.perfil_apoyo.categorias || [],
                zona_cobertura: null,
                disponibilidad: '',
                especies_atendidas: apelacionAliadoSeleccionada!.perfil_apoyo.especies_atendidas || [],
                niveles_urgencia_atendida: apelacionAliadoSeleccionada!.perfil_apoyo.niveles_urgencia_atendida || [],
                created_at: apelacionAliadoSeleccionada!.created_at,
                verificado_admin: false,
                usuarios: {
                  nombre: apelacionAliadoSeleccionada!.perfil_apoyo.usuarios.nombre,
                  email: apelacionAliadoSeleccionada!.perfil_apoyo.usuarios.email,
                  telefono: apelacionAliadoSeleccionada!.perfil_apoyo.usuarios.telefono || '',
                }
              }}
              extraTop={
                <ApelacionAliadoContextBlock apelacion={apelacionAliadoSeleccionada!} showToast={showToast} />
              }
            />

            <ApelacionResolverBar
              respuesta={respuestaApelacionAliado}
              onChangeRespuesta={setRespuestaApelacionAliado}
              onAprobar={() => handleResolverApelacionAliado('aprobar')}
              onRechazar={() => handleResolverApelacionAliado('rechazar')}
              isResolviendo={isResolviendoApelacionAliado}
              targetName="el aliado"
            />
          </View>
        )
      ) : tab === 'aliados' ? (
        aliadosScreen === 'list' ? (
          <AliadosListScreen aliados={aliadosPendientes} isLoading={isLoadingAliados} onSelect={abrirAliado} />
        ) : (
          <AliadoDetailScreen
            aliado={aliadoSeleccionado!}
            onBack={volverAAliados}
            respuesta={razonRechazoAliado}
            onChangeRespuesta={setRazonRechazoAliado}
            onAprobar={() => handleResolverAliado('aprobar')}
            onRechazar={() => handleResolverAliado('rechazar')}
            isResolviendo={isResolviendoAliado}
          />
        )
      ) : tab === 'operativos' ? (
        <CasosOperativosPanel
          casos={casosOperativos}
          asociaciones={asociacionesOperativas}
          token={token || ''}
          onUpdated={cargarCasosOperativos}
          showToast={showToast}
        />
      ) : tab === 'moderacion' ? (
        <EventModerationWorkspace
          onCountChange={setModeracionPendiente}
          showToast={showToast}
        />
      ) : tab === 'fallecimientos' ? (
        <ScrollView contentContainerStyle={styles.followupsContent}>
          <DeceasedFollowupPanel visible mode="admin" />
        </ScrollView>
      ) : tab === 'estadisticas' ? (
        <AdminStatsPanel />
      ) : (
        <ProblemasCanjesPanel
          problemas={problemasCanjes}
          isLoading={loadingProblemasCanjes}
          token={token || ''}
          onRefresh={cargarProblemasCanjes}
          showToast={showToast}
        />
      )}

      <Toast toast={toast} translateY={translateY} />
    </View>
  );
}

const PRIORIDAD_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  alta: { bg: '#FBE2DC', text: Brand.danger, label: 'Prioridad alta' },
  media: { bg: '#FBEFD6', text: '#B4790E', label: 'Prioridad media' },
  baja: { bg: '#E4F3EF', text: Brand.secondary, label: 'Prioridad baja' },
};

function formatCasoTitulo(tipo: string): string {
  const texto = tipo.replaceAll('_', ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function AsociacionSelector({
  asociaciones,
  value,
  onChange,
}: {
  asociaciones: Array<{ id: string; nombre: string }>;
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const seleccionada = asociaciones.find((a) => a.id === value);
  const filtradas = query.trim()
    ? asociaciones.filter((a) => a.nombre.toLowerCase().includes(query.trim().toLowerCase()))
    : asociaciones;

  const cerrar = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <TouchableOpacity style={styles.casoSelector} onPress={() => setOpen(true)}>
        <Ionicons name="business-outline" size={16} color={seleccionada ? Brand.secondary : Brand.textFaint} />
        <Text
          style={[styles.casoSelectorText, !seleccionada && styles.casoSelectorPlaceholder]}
          numberOfLines={1}
        >
          {seleccionada ? seleccionada.nombre : 'Toca para elegir una asociación'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={Brand.textFaint} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={cerrar}>
        <View style={styles.casoModalOverlay}>
          <View style={styles.casoModalSheet}>
            <View style={styles.casoModalHeader}>
              <Text style={styles.casoModalTitle}>Asociación coordinadora</Text>
              <TouchableOpacity onPress={cerrar} hitSlop={10}>
                <Ionicons name="close" size={22} color={Brand.textFaint} />
              </TouchableOpacity>
            </View>
            <View style={styles.casoModalSearchBox}>
              <Ionicons name="search-outline" size={16} color={Brand.textFaint} />
              <TextInput
                style={styles.casoModalSearchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar asociación…"
                placeholderTextColor={Brand.textFaint}
                autoFocus={Platform.OS === 'web'}
              />
            </View>
            <ScrollView style={styles.casoModalList} showsVerticalScrollIndicator={false}>
              {filtradas.length === 0 ? (
                <Text style={styles.casoModalEmpty}>Sin resultados para “{query}”.</Text>
              ) : (
                filtradas.map((asociacion) => {
                  const activa = asociacion.id === value;
                  return (
                    <TouchableOpacity
                      key={asociacion.id}
                      style={styles.casoModalRow}
                      onPress={() => {
                        onChange(asociacion.id);
                        cerrar();
                      }}
                    >
                      <Text style={[styles.casoModalRowText, activa && styles.casoModalRowTextActive]} numberOfLines={1}>
                        {asociacion.nombre}
                      </Text>
                      {activa && <Ionicons name="checkmark" size={18} color={Brand.secondary} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function CasosOperativosPanel({
  casos,
  asociaciones,
  token,
  onUpdated,
  showToast,
}: {
  casos: CasoOperativo[];
  asociaciones: Array<{ id: string; nombre: string }>;
  token: string;
  onUpdated: () => Promise<void>;
  showToast: ShowToastFn;
}) {
  const [selecciones, setSelecciones] = useState<Record<string, string>>({});
  const [resoluciones, setResoluciones] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);

  const resolver = async (caso: CasoOperativo) => {
    const asignacion = selecciones[caso.id];
    const resolucion = (resoluciones[caso.id] || '').trim();
    if (caso.tipo === 'reporte_sin_coordinadora' && !asignacion) {
      showToast({ type: 'warning', title: 'Selecciona una coordinadora', message: 'El reporte necesita una asociación verificada.' });
      return;
    }
    if (!resolucion) {
      showToast({ type: 'warning', title: 'Falta la resolución', message: 'Describe brevemente la acción aplicada.' });
      return;
    }
    setEnviando(caso.id);
    try {
      await axios.patch(
        `${API_URL}/admin/casos-operativos/${caso.id}`,
        {
          accion: caso.tipo === 'reporte_sin_coordinadora' ? 'asignar_asociacion' : 'resolver',
          asociacion_id: asignacion || null,
          resolucion,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      showToast({ type: 'success', title: 'Caso resuelto', message: 'La bandeja, el reporte y la asociación fueron actualizados.' });
      await onUpdated();
    } catch (error: any) {
      showToast({ type: 'error', title: 'No pudimos resolverlo', message: error?.response?.data?.detail || 'Inténtalo nuevamente.' });
    } finally {
      setEnviando(null);
    }
  };

  if (casos.length === 0) {
    return (
      <View style={styles.centered}>
        <AlDiaMascota
          titulo="Vas al día"
          subtitulo="No hay casos operativos pendientes por revisar."
        />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.listScrollContent}>
      <View style={styles.listCentered}>
        {casos.map((caso) => {
          const prioridad = PRIORIDAD_STYLE[caso.prioridad] || PRIORIDAD_STYLE.media;
          const seleccionActual = selecciones[caso.id];
          return (
            <View key={caso.id} style={styles.casoCard}>
              <View style={styles.casoHeaderRow}>
                <Text style={styles.casoTitulo}>{formatCasoTitulo(caso.tipo)}</Text>
                <View style={[styles.casoBadge, { backgroundColor: prioridad.bg }]}>
                  <Text style={[styles.casoBadgeText, { color: prioridad.text }]}>{prioridad.label}</Text>
                </View>
              </View>
              <Text style={styles.apelacionMeta}>{new Date(caso.creado_at).toLocaleString('es-MX')}</Text>

              <View style={styles.casoAlerta}>
                <Ionicons name="alert-circle-outline" size={16} color={Brand.danger} />
                <Text style={styles.casoAlertaTexto}>{caso.detalle || 'Requiere seguimiento administrativo.'}</Text>
              </View>

              {!!caso.reportes && (
                <View style={styles.casoZonaRow}>
                  <Ionicons name="location-outline" size={14} color={Brand.textMuted} />
                  <Text style={styles.apelacionMeta}>
                    {[caso.reportes.colonia, caso.reportes.municipio].filter(Boolean).join(', ') || 'Sin zona confirmada'}
                  </Text>
                </View>
              )}

              {caso.tipo === 'reporte_sin_coordinadora' && (
                <View style={styles.casoSection}>
                  <Text style={styles.casoSectionLabel}>Asociación coordinadora</Text>
                  <AsociacionSelector
                    asociaciones={asociaciones}
                    value={seleccionActual}
                    onChange={(id) => setSelecciones((actual) => ({ ...actual, [caso.id]: id }))}
                  />
                </View>
              )}

              <View style={styles.casoSection}>
                <Text style={styles.casoSectionLabel}>Describe la resolución aplicada</Text>
                <TextInput
                  style={styles.adminTextArea}
                  value={resoluciones[caso.id] || ''}
                  onChangeText={(valor) => setResoluciones((actual) => ({ ...actual, [caso.id]: valor }))}
                  placeholder="Ej. Se asignó por cercanía y disponibilidad de la asociación…"
                  placeholderTextColor={Brand.textFaint}
                  multiline
                />
                {caso.tipo === 'reporte_sin_coordinadora' && (
                  <Text style={styles.casoHint}>Esta nota se enviará a la asociación junto con la asignación.</Text>
                )}
              </View>

              <TouchableOpacity
                style={[styles.apelacionRevisarButton, styles.casoResolverButton]}
                disabled={enviando === caso.id}
                onPress={() => void resolver(caso)}
              >
                <Ionicons name="checkmark-done-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.apelacionRevisarText}>{enviando === caso.id ? 'Guardando…' : 'Resolver caso'}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        <View style={styles.casoListaFooter}>
          <AlDiaMascota compact titulo="Eso es todo por ahora" subtitulo="No hay más casos operativos pendientes." />
        </View>
      </View>
    </ScrollView>
  );
}

function AlDiaMascota({
  titulo,
  subtitulo,
  compact,
}: {
  titulo: string;
  subtitulo: string;
  compact?: boolean;
}) {
  const size = compact ? 120 : 180;
  return (
    <View style={styles.mascotaWrap}>
      <Image
        source={require('../assets/images/gato_img.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
      <Text style={styles.mascotaTitulo}>{titulo}</Text>
      <Text style={styles.mascotaSubtitulo}>{subtitulo}</Text>
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
  targetName = 'la asociación',
}: {
  respuesta: string;
  onChangeRespuesta: (v: string) => void;
  onAprobar: () => void;
  onRechazar: () => void;
  isResolviendo: boolean;
  hideButtons?: boolean;
  targetName?: string;
}) {
  return (
    <View style={styles.resolverBarContainer}>
      <Text style={styles.resolverBarLabel}>Respuesta para {targetName} (opcional)</Text>
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

const AVATAR_COLORS_BRAND = [Brand.primary, Brand.secondary, Brand.accent, Brand.danger, Brand.primaryDark];

function DetailHeader({ detalle, isDesktop }: { detalle: AsociacionDetalle; isDesktop: boolean }) {
  const avatar = (
    <AssocAvatar
      nombre={detalle.nombre}
      logoUrl={detalle.logo_url}
      size="lg"
      colors={AVATAR_COLORS_BRAND}
      zoomable
    />
  );

  if (isDesktop) {
    return (
      <View style={[styles.detailHeaderBlock, styles.detailHeaderBlockDesktop]}>
        {avatar}
        <View style={styles.detailHeaderTextCol}>
          <Text style={[styles.detailNombre, styles.detailNombreDesktop]}>{detalle.nombre}</Text>
          <Text style={styles.detailResponsable}>
            {detalle.nombre_responsable?.trim() || 'Responsable no especificado'}
          </Text>
          <View style={{ marginTop: 8 }}>
            <PendingBadge />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.detailHeaderBlock}>
      {avatar}
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

function buildAdminStats(detalle: AsociacionDetalle): StatItem[] {
  return [
    { label: 'Radio de cobertura', value: detalle.radio_km, icon: 'resize-outline', color: Brand.secondary },
    { label: 'Tipos de animales', value: detalle.tipos_animales.length, icon: 'paw-outline', color: Brand.primary, primary: true },
    { label: 'Fotos', value: detalle.fotos.length, icon: 'images-outline', color: Brand.accent },
  ];
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
      <DetailHeader detalle={detalle} isDesktop={false} />
      <View style={[styles.detailBody, styles.statsRowWrap]}>
        <StatsRow stats={buildAdminStats(detalle)} size="compact" />
      </View>
      {extraTop && <View style={styles.detailBody}>{extraTop}</View>}
      <View style={styles.detailBody}>
        <SectionBlock icon="information-circle-outline" titulo="Acerca de">
          <AboutBlock acercaDe={detalle.acerca_de} />
        </SectionBlock>
        <SectionBlock icon="paw-outline" titulo="Qué rescatan">
          <AnimalChips tipos={detalle.tipos_animales} />
        </SectionBlock>
        <SectionBlock icon="location-outline" titulo="Ubicación">
          <UbicacionContent detalle={detalle} />
        </SectionBlock>
        <SectionBlock icon="time-outline" titulo="Horario de atención">
          <View style={styles.horarioRow}>
            <Ionicons name="time-outline" size={16} color={Brand.primary} />
            <Text style={styles.horarioText}>
              {detalle.horario_atencion?.trim() || 'No especificado'}
            </Text>
          </View>
        </SectionBlock>
        <SectionBlock icon="call-outline" titulo="Contacto">
          <ContactBlock telefono={detalle.contacto_telefono} email={detalle.contacto_email} />
        </SectionBlock>
        <SectionBlock icon="images-outline" titulo="Galería del refugio" sinBorde>
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
        <DetailHeader detalle={detalle} isDesktop />
        <View style={[styles.detailBody, styles.statsRowWrap]}>
          <StatsRow stats={buildAdminStats(detalle)} size="compact" />
        </View>
        <View style={styles.detailBody}>
          {extraTop}
          <SectionBlock icon="call-outline" titulo="Contacto">
            <ContactBlock telefono={detalle.contacto_telefono} email={detalle.contacto_email} />
          </SectionBlock>
          <SectionBlock icon="location-outline" titulo="Ubicación" sinBorde>
            <UbicacionContent detalle={detalle} />
          </SectionBlock>
        </View>
      </ScrollView>

      <ScrollView style={styles.desktopMain} contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={styles.desktopMainInner}>
          <SectionBlock icon="information-circle-outline" titulo="Acerca de">
            <AboutBlock acercaDe={detalle.acerca_de} />
          </SectionBlock>
          <SectionBlock icon="paw-outline" titulo="Qué rescatan">
            <AnimalChips tipos={detalle.tipos_animales} />
          </SectionBlock>
          <SectionBlock icon="time-outline" titulo="Horario de atención">
            <View style={styles.horarioRow}>
              <Ionicons name="time-outline" size={16} color={Brand.primary} />
              <Text style={styles.horarioText}>
                {detalle.horario_atencion?.trim() || 'No especificado'}
              </Text>
            </View>
          </SectionBlock>
          <SectionBlock icon="images-outline" titulo="Galería del refugio" sinBorde>
            <PhotoGallery fotos={detalle.fotos} columnas={3} />
          </SectionBlock>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.backgroundWarm },
  followupsContent: { padding: 20, paddingBottom: 40 },
  header: { backgroundColor: Brand.primary, paddingHorizontal: 20, paddingVertical: 16 },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 2 },
  tabsContainer: {
    backgroundColor: Brand.cardWarm,
    borderBottomWidth: 1,
    borderBottomColor: '#E4D3B8',
  },
  tabsScrollContent: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 10,
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
    borderRadius: 24,
    marginHorizontal: 18,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  detailHeaderBlockDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  detailHeaderTextCol: { flex: 1, alignItems: 'flex-start' },
  detailNombre: {
    fontSize: 17,
    fontWeight: '800',
    color: Brand.textDark,
    marginTop: 10,
    textAlign: 'center',
  },
  detailNombreDesktop: { marginTop: 0, textAlign: 'left' },
  detailResponsable: { fontSize: 13, color: Brand.textMuted, marginTop: 2 },
  detailBody: { paddingHorizontal: 18 },
  statsRowWrap: { marginTop: 16 },

  direccionText: { fontSize: 13, fontWeight: '800', color: Brand.textDark, lineHeight: 19 },
  direccionVacia: { fontSize: 13, color: Brand.textFaint },
  radioText: { fontSize: 11, color: Brand.secondary, fontWeight: '700', marginTop: 4 },

  horarioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  horarioText: { fontSize: 13, color: Brand.textDark, flex: 1, lineHeight: 19 },

  desktopDetailRow: { flex: 1, flexDirection: 'row' },
  desktopSidebar: { width: 300, backgroundColor: Brand.cardWarm },
  desktopMain: { flex: 1, backgroundColor: Brand.backgroundWarm },
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
    flexDirection: 'row',
    justifyContent: 'center',
  },
  apelacionRevisarText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Card de casos operativos
  casoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(60,35,16,0.09)',
    shadowColor: '#3C2310',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  casoHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 },
  casoTitulo: { flex: 1, fontSize: 16, fontWeight: '700', color: Brand.textDark },
  casoBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  casoBadgeText: { fontSize: 11, fontWeight: '700' },
  casoAlerta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FBEAE6',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  casoAlertaTexto: { flex: 1, fontSize: 12, color: Brand.danger, lineHeight: 17 },
  casoZonaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  casoSection: { marginTop: 14 },
  casoSectionLabel: { fontSize: 12, fontWeight: '700', color: Brand.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 },
  casoHint: { fontSize: 11, color: Brand.textFaint, marginTop: 6 },
  casoSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Brand.cardWarm,
    borderWidth: 1,
    borderColor: '#E4D3B8',
  },
  casoSelectorText: { flex: 1, fontSize: 13, fontWeight: '600', color: Brand.textDark },
  casoSelectorPlaceholder: { fontWeight: '400', color: Brand.textFaint },
  casoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(46,42,38,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  casoModalSheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: 22,
    padding: 18,
    backgroundColor: '#fff',
  },
  casoModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  casoModalTitle: { fontSize: 16, fontWeight: '700', color: Brand.textDark },
  casoModalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#E4D3B8',
    backgroundColor: Brand.cardWarm,
    paddingHorizontal: 11,
    marginBottom: 10,
  },
  casoModalSearchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: Brand.textDark },
  casoModalList: { maxHeight: 340 },
  casoModalEmpty: { fontSize: 12, color: Brand.textFaint, textAlign: 'center', paddingVertical: 16 },
  casoModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(60,35,16,0.07)',
  },
  casoModalRowText: { flex: 1, fontSize: 13, color: Brand.textDark },
  casoModalRowTextActive: { color: Brand.secondary, fontWeight: '700' },
  adminTextArea: { minHeight: 70, borderRadius: 11, borderWidth: 1, borderColor: '#E4D3B8', backgroundColor: '#fff', color: Brand.textDark, padding: 10, textAlignVertical: 'top' },
  casoResolverButton: { marginTop: 16 },
  casoListaFooter: { alignItems: 'center', paddingTop: 12, paddingBottom: 32 },
  mascotaWrap: { alignItems: 'center', gap: 10 },
  mascotaTitulo: { fontSize: 15, fontWeight: '800', color: Brand.textDark, textAlign: 'center' },
  mascotaSubtitulo: { fontSize: 12, color: Brand.textFaint, textAlign: 'center', maxWidth: 260 },

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

  // Estilos añadidos para AliadoDetailScreen
  cardsGrid: {
    marginTop: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  infoCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(60,35,16,0.06)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FCF7F0',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(60,35,16,0.06)',
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Brand.textDark,
  },
  infoCardBody: {
    padding: 16,
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  infoBlock: {
    gap: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: Brand.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    color: Brand.textDark,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: Brand.secondary + '20', // 20% opacity
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.secondary + '40',
  },
  chipText: {
    fontSize: 12,
    color: Brand.secondary,
    fontWeight: '700',
  },
  chipUrgencia: {
    backgroundColor: Brand.danger + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.danger + '30',
  },
  chipTextUrgencia: {
    fontSize: 12,
    color: Brand.danger,
    fontWeight: '700',
  },
});

// ─── Pantalla: lista de Aliados Pendientes ────────────────────────────────
function AliadosListScreen({
  aliados,
  isLoading,
  onSelect,
}: {
  aliados: PerfilAliadoAdmin[];
  isLoading: boolean;
  onSelect: (a: PerfilAliadoAdmin) => void;
}) {
  if (isLoading) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Brand.primary} />
      </View>
    );
  }

  if (aliados.length === 0) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <Text style={styles.emptyText}>No hay nuevos perfiles de aliados pendientes de revisión.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.listScrollContent}>
      <View style={styles.listCentered}>
        {aliados.map((a) => (
          <View key={a.id} style={styles.apelacionCard}>
            <Text style={styles.apelacionNombre}>{a.usuarios?.nombre} ({a.tipo.replace('_', ' ')})</Text>
            <Text style={styles.apelacionMeta}>Correo: {a.usuarios?.email} | Tel: {a.usuarios?.telefono || 'N/A'}</Text>
            <Text style={styles.apelacionMotivo} numberOfLines={1}>Categorías: {a.categorias?.join(', ')}</Text>

            <TouchableOpacity onPress={() => onSelect(a)} style={styles.apelacionRevisarButton}>
              <Text style={styles.apelacionRevisarText}>Revisar perfil completo</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}



function AliadoDetailBody({ aliado, extraTop }: { aliado: PerfilAliadoAdmin, extraTop?: React.ReactNode }) {
  const datosExtra = aliado.datos_extra || {};
  return (

    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, maxWidth: 800, alignSelf: 'center', width: '100%' }}>
      {extraTop}
      <View style={styles.detailHeaderBlock}>
        <View style={[styles.detailHeaderBlockDesktop, { width: '100%' }]}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: Brand.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={32} color="#FFF" />
          </View>
          <View style={styles.detailHeaderTextCol}>
            <Text style={styles.detailNombreDesktop}>{aliado.usuarios?.nombre}</Text>
            <Text style={styles.detailResponsable}>{aliado.tipo.replace('_', ' ').toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardsGrid}>
        {/* Card de Contacto */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardHeader}>
            <Ionicons name="mail" size={20} color={Brand.primary} />
            <Text style={styles.infoCardTitle}>Contacto</Text>
          </View>
          <View style={styles.infoCardBody}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Correo Electrónico</Text>
              <Text style={styles.infoValue}>{aliado.usuarios?.email}</Text>
            </View>
            {aliado.usuarios?.telefono && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Teléfono</Text>
                <Text style={styles.infoValue}>{aliado.usuarios?.telefono}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Card de Cobertura y Servicios */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardHeader}>
            <Ionicons name="paw" size={20} color={Brand.primary} />
            <Text style={styles.infoCardTitle}>Servicios y Cobertura</Text>
          </View>
          <View style={styles.infoCardBody}>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Categorías que ofrece</Text>
              <View style={styles.chipContainer}>
                {aliado.categorias?.map((cat, idx) => (
                  <View key={idx} style={styles.chip}>
                    <Text style={styles.chipText}>{cat}</Text>
                  </View>
                ))}
              </View>
            </View>

            {aliado.especies_atendidas && aliado.especies_atendidas.length > 0 && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>Especies atendidas</Text>
                <View style={styles.chipContainer}>
                  {aliado.especies_atendidas.map((esp, idx) => (
                    <View key={idx} style={styles.chip}>
                      <Text style={styles.chipText}>{esp}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {aliado.niveles_urgencia_atendida && aliado.niveles_urgencia_atendida.length > 0 && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>Niveles de Urgencia</Text>
                <View style={styles.chipContainer}>
                  {aliado.niveles_urgencia_atendida.map((urg, idx) => (
                    <View key={idx} style={styles.chipUrgencia}>
                      <Text style={styles.chipTextUrgencia}>{urg}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Card de Datos Legales / Profesionales */}
        {(datosExtra.razon_social || datosExtra.rfc || datosExtra.medico_responsable || datosExtra.cedula_profesional || datosExtra.documento_verificacion_url) && (
          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <Ionicons name="business" size={20} color={Brand.primary} />
              <Text style={styles.infoCardTitle}>Datos Legales y Profesionales</Text>
            </View>
            <View style={styles.infoCardBody}>
              {datosExtra.razon_social && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Razón Social</Text>
                  <Text style={styles.infoValue}>{datosExtra.razon_social}</Text>
                </View>
              )}
              {datosExtra.rfc && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>RFC</Text>
                  <Text style={styles.infoValue}>{datosExtra.rfc}</Text>
                </View>
              )}
              {datosExtra.medico_responsable && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Médico Responsable</Text>
                  <Text style={styles.infoValue}>{datosExtra.medico_responsable}</Text>
                </View>
              )}
              {datosExtra.cedula_profesional && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Cédula Profesional</Text>
                  <Text style={styles.infoValue}>{datosExtra.cedula_profesional}</Text>
                </View>
              )}

              <View style={{ marginTop: 12 }}>
                <Text style={[styles.infoLabel, { marginBottom: 8 }]}>Documento de verificación adjunto</Text>
                {typeof datosExtra.documento_verificacion_url === 'string' && datosExtra.documento_verificacion_url.startsWith('http') ? (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(datosExtra.documento_verificacion_url)}
                    style={styles.apelacionDocRow}
                  >
                    <Ionicons name="document-text" size={20} color={Brand.primary} />
                    <Text style={styles.apelacionDocText}>Ver documento de verificación</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.infoValue, { color: Brand.textFaint, fontStyle: 'italic' }]}>
                    No se adjuntó ningún documento o el formato es inválido.
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    </ScrollView>);
}

// ─── Pantalla: Detalle del Aliado ────────────────────────────────
function AliadoDetailScreen({
  aliado,
  onBack,
  respuesta,
  onChangeRespuesta,
  onAprobar,
  onRechazar,
  isResolviendo
}: {
  aliado: PerfilAliadoAdmin;
  onBack: () => void;
  respuesta: string;
  onChangeRespuesta: (text: string) => void;
  onAprobar: () => void;
  onRechazar: () => void;
  isResolviendo: boolean;
  hideButtons?: boolean;
}) {
  const datosExtra = aliado.datos_extra || {};

  return (
    <View style={{ flex: 1, backgroundColor: Brand.backgroundWarm }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E4D3B8', backgroundColor: Brand.cardWarm }}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={Brand.textMuted} />
          <Text style={styles.backText}>Volver a Aliados</Text>
        </TouchableOpacity>
      </View>

      <AliadoDetailBody aliado={aliado} />


      <View style={styles.resolverBarContainer}>
        <Text style={styles.resolverBarLabel}>Resolución del administrador</Text>
        <TextInput
          style={styles.resolverBarInput}
          placeholder="Motivo de rechazo (obligatorio si vas a rechazar)..."
          placeholderTextColor={Brand.textFaint}
          value={respuesta}
          onChangeText={onChangeRespuesta}
          multiline
        />
        <View style={styles.buttonsRow}>
          <AdminActionButton
            label="Rechazar"
            variant="rechazar"
            icon="close-circle"
            onPress={onRechazar}
            disabled={isResolviendo || !respuesta.trim()}
          />
          <AdminActionButton
            label="Aprobar Aliado"
            variant="aprobar"
            icon="checkmark-circle"
            onPress={onAprobar}
            disabled={isResolviendo}
          />
        </View>
      </View>
    </View>
  );
}

function ApelacionesAliadosListScreen({ apelaciones, isLoading, onSelect }: { apelaciones: ApelacionAliado[], isLoading: boolean, onSelect: (a: ApelacionAliado) => void }) {
  if (isLoading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={Brand.primary} /></View>;
  }
  if (apelaciones.length === 0) {
    return <View style={styles.centered}><Text style={styles.emptyText}>No hay apelaciones de aliados pendientes.</Text></View>;
  }
  return (
    <ScrollView contentContainerStyle={styles.listScrollContent}>
      <View style={styles.listCentered}>
        {apelaciones.map((a) => (
          <View key={a.id} style={styles.apelacionCard}>
            <Text style={styles.apelacionNombre}>{a.perfil_apoyo.usuarios.nombre} {a.perfil_apoyo.usuarios.apellido_paterno}</Text>
            <Text style={styles.apelacionMeta}>Tipo: {a.perfil_apoyo.tipo === 'donante_comunitario' ? 'Donante Comunitario' : (a.perfil_apoyo.tipo === 'veterinario' ? 'Veterinario' : 'Empresa/Negocio')}</Text>
            <Text style={styles.apelacionMeta}>Correo: {a.perfil_apoyo.usuarios.email}</Text>
            <Text style={styles.apelacionMotivo} numberOfLines={2}>Mensaje: {a.mensaje}</Text>
            <TouchableOpacity onPress={() => onSelect(a)} style={styles.apelacionRevisarButton}>
              <Text style={styles.apelacionRevisarText}>Revisar apelación</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function ApelacionAliadoContextBlock({ apelacion, showToast }: { apelacion: ApelacionAliado, showToast: ShowToastFn }) {
  return (
    <View style={styles.apelacionContextBlock}>
      <View style={styles.apelacionContextHeader}>
        <Ionicons name="alert-circle" size={16} color="#C48A00" />
        <Text style={styles.apelacionContextTitle}>Este aliado está apelando su rechazo</Text>
      </View>
      <Text style={styles.apelacionContextLabel}>Mensaje de la apelación</Text>
      <Text style={styles.apelacionContextMensaje}>{apelacion.mensaje}</Text>
      {apelacion.documentos_urls && apelacion.documentos_urls.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.apelacionContextLabel}>Documentos adjuntos</Text>
          {apelacion.documentos_urls.map((url, idx) =>
            esImagen(url) ? (
              <TouchableOpacity key={idx} onPress={() => abrirDocumento(url, showToast)}>
                <Image source={{ uri: url }} style={styles.apelacionDocImagePreview} resizeMode="cover" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity key={idx} onPress={() => abrirDocumento(url, showToast)} style={styles.apelacionDocRow}>
                <Ionicons name="document-attach-outline" size={14} color={Brand.primary} />
                <Text style={styles.apelacionDocText}>Documento {idx + 1} (PDF) — Ver</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      )}
    </View>
  );
}
