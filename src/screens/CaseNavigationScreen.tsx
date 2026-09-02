import { Ionicons } from "@expo/vector-icons";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import CaseNavigationMap from "../components/navigation/CaseNavigationMap";
import { Brand } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { useCaseNavigation } from "../hooks/useCaseNavigation";
import {
  buildExternalNavigationUrl,
  type ExternalNavigationProvider,
} from "../services/externalNavigationService";
import {
  formatNavigationAge,
  formatNavigationDistance,
  formatNavigationDuration,
} from "../utils/navigationPresentation";
import type { NavigationGeometry } from "../types/navigation";

interface Props {
  reportId: string | null;
  onClose: () => void;
}

const NAVIGATION_ACCESS_REFRESH_MS = 30_000;

export default function CaseNavigationScreen({ reportId, onClose }: Props) {
  const { width } = useWindowDimensions();
  const { isLoggedIn, isLoading: isLoadingSession } = useAuth();
  const isDesktop = width >= 900;
  const [fitRequestId, setFitRequestId] = useState(0);
  const startedForReportRef = useRef<string | null>(null);
  const attemptedDestinationRevisionRef = useRef<string | null>(null);
  const {
    capabilities,
    currentRoute,
    currentOrigin,
    destination,
    permissionState,
    isLoadingCapabilities,
    isCalculating,
    isRefreshing,
    destinationChanged,
    accessRevoked,
    error,
    start,
    recalculate,
    retryCapabilities,
    clearError,
  } = useCaseNavigation(reportId);

  useEffect(() => {
    if (
      !reportId ||
      !capabilities?.navigation_enabled ||
      startedForReportRef.current === reportId
    ) {
      return;
    }
    startedForReportRef.current = reportId;
    void start();
  }, [capabilities?.navigation_enabled, reportId, start]);

  useEffect(() => {
    if (!currentRoute || accessRevoked) return;

    const refreshAccess = () => {
      void retryCapabilities();
    };
    const interval = setInterval(refreshAccess, NAVIGATION_ACCESS_REFRESH_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshAccess();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [accessRevoked, currentRoute, retryCapabilities]);

  useEffect(() => {
    const latestRevision = capabilities?.destination_revision;
    if (
      !latestRevision ||
      !currentRoute ||
      currentRoute.destination.revision === latestRevision
    ) {
      attemptedDestinationRevisionRef.current = null;
      return;
    }
    if (
      isRefreshing ||
      attemptedDestinationRevisionRef.current === latestRevision
    ) {
      return;
    }

    attemptedDestinationRevisionRef.current = latestRevision;
    void recalculate();
  }, [
    capabilities?.destination_revision,
    currentRoute,
    isRefreshing,
    recalculate,
  ]);

  const openExternalNavigation = async (
    provider: ExternalNavigationProvider,
  ) => {
    if (!destination) return;
    try {
      await Linking.openURL(buildExternalNavigationUrl(provider, destination));
    } catch {
      Alert.alert(
        "No pudimos abrir el mapa",
        "Intenta nuevamente o usa otra aplicación de navegación.",
      );
    }
  };

  const retry = () => {
    clearError();
    if (!capabilities) {
      void retryCapabilities();
      return;
    }
    void start();
  };

  const loadingInitialRoute =
    isLoadingSession ||
    (isLoadingCapabilities && !currentRoute) ||
    (isCalculating && !currentRoute);
  const showExternalFallback =
    Boolean(destination) &&
    !accessRevoked &&
    (error?.code === "provider_timeout" ||
      error?.code === "provider_error" ||
      error?.code === "no_route" ||
      error?.code === "network_unavailable");
  const noRouteGeometry: NavigationGeometry | null =
    error?.code === "no_route" && currentOrigin && destination
      ? {
          type: "LineString",
          coordinates: [
            [currentOrigin.longitude, currentOrigin.latitude],
            [destination.longitude, destination.latitude],
          ],
        }
      : null;
  const routeUsesLatestDestination =
    !capabilities?.destination_revision ||
    currentRoute?.destination.revision === capabilities.destination_revision;
  const emptyStateTitle = accessRevoked
    ? "La navegación ya no está disponible"
    : error?.code === "no_route"
      ? "No encontramos una ruta vial"
      : error?.code === "gps_denied"
        ? "Necesitamos acceso a tu ubicación"
        : error?.code === "low_accuracy_origin"
          ? "La señal GPS es imprecisa"
          : error?.code === "network_unavailable"
            ? "Sin conexión para calcular la ruta"
            : "No pudimos preparar la ruta";

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Volver"
          onPress={onClose}
          style={styles.iconButton}
        >
          <Ionicons name="arrow-back" size={23} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Ruta del caso</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {reportId ? `Caso ${reportId.slice(0, 8)}` : "Caso no disponible"}
          </Text>
        </View>
        <View style={styles.modeBadge}>
          <Ionicons name="car-outline" size={16} color={Brand.secondary} />
          <Text style={styles.modeBadgeText}>Vehículo</Text>
        </View>
      </View>

      {!reportId ? (
        <NavigationMessage
          icon="alert-circle-outline"
          title="No encontramos el caso"
          message="Regresa a tus asignaciones y vuelve a abrir la navegación."
          actionLabel="Volver"
          onAction={onClose}
        />
      ) : !isLoadingSession && !isLoggedIn ? (
        <NavigationMessage
          icon="lock-closed-outline"
          title="Inicia sesión para continuar"
          message="La ruta exacta solo está disponible para el voluntario responsable."
          actionLabel="Volver"
          onAction={onClose}
        />
      ) : loadingInitialRoute ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={Brand.secondary} size="large" />
          <Text style={styles.loadingTitle}>
            {permissionState === "requesting"
              ? "Obteniendo tu ubicación…"
              : "Preparando la navegación…"}
          </Text>
          <Text style={styles.loadingText}>
            PawAlert validará tu asignación antes de mostrar el destino exacto.
          </Text>
        </View>
      ) : currentRoute ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mapBand}>
            <CaseNavigationMap
              origin={currentRoute.origin}
              destination={currentRoute.destination}
              geometry={currentRoute.route.geometry}
              height={isDesktop ? 500 : 380}
              fitRequestId={fitRequestId}
            />
            {isRefreshing && (
              <View style={styles.refreshingBadge}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.refreshingText}>Actualizando ruta</Text>
              </View>
            )}
          </View>

          <View style={[styles.details, isDesktop && styles.detailsDesktop]}>
            {destinationChanged && (
              <StatusNotice
                icon="location-outline"
                tone="warning"
                text={
                  routeUsesLatestDestination
                    ? "La ubicación confirmada cambió. La ruta ya usa el destino más reciente."
                    : "La ubicación confirmada cambió, pero la ruta dibujada todavía apunta al destino anterior. Usa el respaldo externo o vuelve a calcular."
                }
              />
            )}
            {error && (
              <StatusNotice
                icon="warning-outline"
                tone="error"
                text={`${error.message} La ruta anterior permanece visible.`}
              />
            )}

            <View style={styles.destinationRow}>
              <View style={styles.destinationIcon}>
                <Ionicons name="paw" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.destinationCopy}>
                <Text style={styles.sectionLabel}>Destino</Text>
                <Text style={styles.destinationTitle}>
                  Última ubicación confirmada
                </Text>
                <Text style={styles.destinationMeta}>
                  {currentRoute.destination.source === "validated_sighting"
                    ? `Confirmada ${formatNavigationAge(currentRoute.destination.confirmed_at)}`
                    : "Ubicación registrada al crear el reporte"}
                </Text>
              </View>
            </View>

            <View style={styles.metrics}>
              <Metric
                icon="time-outline"
                label="Tiempo estimado"
                value={formatNavigationDuration(
                  currentRoute.route.duration_seconds,
                )}
              />
              <View style={styles.metricDivider} />
              <Metric
                icon="navigate-outline"
                label="Distancia vial"
                value={formatNavigationDistance(
                  currentRoute.route.distance_meters,
                )}
              />
              <View style={styles.metricDivider} />
              <Metric
                icon="refresh-outline"
                label="Calculada"
                value={formatNavigationAge(currentRoute.calculated_at)}
              />
            </View>

            <Text style={styles.foregroundNotice}>
              {Platform.OS === "web"
                ? "Mantén PawAlert abierta para actualizar tu ubicación."
                : "La ubicación se actualiza solamente mientras usas esta pantalla."}
            </Text>

            <View style={styles.primaryActions}>
              <TouchableOpacity
                accessibilityLabel="Centrar toda la ruta"
                onPress={() => setFitRequestId((value) => value + 1)}
                style={styles.secondaryButton}
              >
                <Ionicons
                  name="scan-outline"
                  size={19}
                  color={Brand.textDark}
                />
                <Text style={styles.secondaryButtonText}>Centrar ruta</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Recalcular ruta desde mi ubicación"
                disabled={isRefreshing}
                onPress={() => void recalculate()}
                style={[
                  styles.primaryButton,
                  isRefreshing && styles.buttonDisabled,
                ]}
              >
                <Ionicons name="refresh" size={19} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Recalcular</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.externalSection}>
              <Text style={styles.externalLabel}>Abrir como respaldo</Text>
              <View style={styles.externalActions}>
                <TouchableOpacity
                  onPress={() => void openExternalNavigation("google")}
                  style={styles.externalButton}
                >
                  <Ionicons
                    name="map-outline"
                    size={18}
                    color={Brand.secondary}
                  />
                  <Text style={styles.externalButtonText}>Google Maps</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void openExternalNavigation("waze")}
                  style={styles.externalButton}
                >
                  <Ionicons
                    name="navigate-outline"
                    size={18}
                    color={Brand.secondary}
                  />
                  <Text style={styles.externalButtonText}>Waze</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      ) : noRouteGeometry && currentOrigin && destination ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mapBand}>
            <CaseNavigationMap
              origin={currentOrigin}
              destination={destination}
              geometry={noRouteGeometry}
              lineStyle="fallback"
              height={isDesktop ? 500 : 380}
              fitRequestId={fitRequestId}
            />
          </View>
          <View style={[styles.details, isDesktop && styles.detailsDesktop]}>
            <StatusNotice
              icon="warning-outline"
              tone="warning"
              text="La línea punteada solo orienta hacia el destino. No representa una calle ni permite confirmar la llegada."
            />
            <View style={styles.destinationRow}>
              <View style={styles.destinationIcon}>
                <Ionicons name="paw" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.destinationCopy}>
                <Text style={styles.sectionLabel}>Destino</Text>
                <Text style={styles.destinationTitle}>
                  Última ubicación confirmada
                </Text>
                <Text style={styles.destinationMeta}>
                  Tiempo y distancia vial no disponibles
                </Text>
              </View>
            </View>
            <View style={styles.externalSection}>
              <Text style={styles.externalLabel}>
                Continuar con otra aplicación
              </Text>
              <View style={styles.externalActions}>
                <TouchableOpacity
                  onPress={() => void openExternalNavigation("google")}
                  style={styles.externalButton}
                >
                  <Ionicons
                    name="map-outline"
                    size={18}
                    color={Brand.secondary}
                  />
                  <Text style={styles.externalButtonText}>Google Maps</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void openExternalNavigation("waze")}
                  style={styles.externalButton}
                >
                  <Ionicons
                    name="navigate-outline"
                    size={18}
                    color={Brand.secondary}
                  />
                  <Text style={styles.externalButtonText}>Waze</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.outlineCloseButton}
            >
              <Text style={styles.outlineCloseButtonText}>Volver al caso</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <NavigationMessage
          icon={accessRevoked ? "lock-closed-outline" : "navigate-outline"}
          title={emptyStateTitle}
          message={
            error?.message ??
            "Comprueba tu GPS y vuelve a intentarlo. Tu asignación no se modificó."
          }
          actionLabel={error?.retryable ? "Intentar nuevamente" : "Volver"}
          onAction={error?.retryable ? retry : onClose}
          showExternalFallback={showExternalFallback}
          onOpenGoogle={() => void openExternalNavigation("google")}
          onOpenWaze={() => void openExternalNavigation("waze")}
        />
      )}
    </SafeAreaView>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={Brand.secondary} />
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function StatusNotice({
  icon,
  tone,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: "warning" | "error";
  text: string;
}) {
  return (
    <View
      style={[
        styles.statusNotice,
        tone === "error" && styles.statusNoticeError,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={tone === "error" ? Brand.danger : "#9A6700"}
      />
      <Text
        style={[
          styles.statusNoticeText,
          tone === "error" && styles.statusNoticeTextError,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function NavigationMessage({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  showExternalFallback = false,
  onOpenGoogle,
  onOpenWaze,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  showExternalFallback?: boolean;
  onOpenGoogle?: () => void;
  onOpenWaze?: () => void;
}) {
  return (
    <View style={styles.messageState}>
      <View style={styles.messageIcon}>
        <Ionicons name={icon} size={34} color={Brand.primary} />
      </View>
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageText}>{message}</Text>
      <TouchableOpacity onPress={onAction} style={styles.messageButton}>
        <Text style={styles.messageButtonText}>{actionLabel}</Text>
      </TouchableOpacity>
      {showExternalFallback && onOpenGoogle && onOpenWaze && (
        <View style={styles.messageFallback}>
          <Text style={styles.messageFallbackLabel}>
            Continuar con otra aplicación
          </Text>
          <View style={styles.externalActions}>
            <TouchableOpacity
              onPress={onOpenGoogle}
              style={styles.externalButton}
            >
              <Ionicons name="map-outline" size={18} color={Brand.secondary} />
              <Text style={styles.externalButtonText}>Google Maps</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onOpenWaze}
              style={styles.externalButton}
            >
              <Ionicons
                name="navigate-outline"
                size={18}
                color={Brand.secondary}
              />
              <Text style={styles.externalButtonText}>Waze</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8F5F0" },
  header: {
    minHeight: 70,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E7DED4",
    backgroundColor: "#FFFFFF",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5EEE6",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: Brand.textDark, fontSize: 19, fontWeight: "800" },
  subtitle: { color: Brand.textMuted, fontSize: 11, marginTop: 1 },
  modeBadge: {
    height: 36,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    backgroundColor: "#EAF7F5",
  },
  modeBadgeText: { color: "#2F7771", fontSize: 11, fontWeight: "800" },
  scrollContent: { flexGrow: 1, paddingBottom: 48 },
  mapBand: { position: "relative", width: "100%", backgroundColor: "#E9ECE8" },
  refreshingBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    minHeight: 34,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 8,
    backgroundColor: "rgba(46,42,38,0.82)",
  },
  refreshingText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  details: { width: "100%", paddingHorizontal: 18, paddingTop: 20, gap: 18 },
  detailsDesktop: { maxWidth: 900, alignSelf: "center", paddingHorizontal: 24 },
  destinationRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  destinationIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.primary,
  },
  destinationCopy: { flex: 1 },
  sectionLabel: {
    color: Brand.textFaint,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  destinationTitle: {
    color: Brand.textDark,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  destinationMeta: { color: Brand.textMuted, fontSize: 11, marginTop: 2 },
  metrics: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#DED4C8",
  },
  metric: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  metricDivider: { width: 1, marginVertical: 14, backgroundColor: "#DED4C8" },
  metricValue: {
    width: "100%",
    color: Brand.textDark,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 4,
  },
  metricLabel: {
    color: Brand.textMuted,
    fontSize: 9,
    textAlign: "center",
    marginTop: 1,
  },
  foregroundNotice: {
    color: Brand.textMuted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
  primaryActions: { flexDirection: "row", gap: 10 },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CFC3B7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: {
    color: Brand.textDark,
    fontSize: 12,
    fontWeight: "800",
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Brand.secondary,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  buttonDisabled: { opacity: 0.6 },
  externalSection: { paddingTop: 2 },
  externalLabel: {
    color: Brand.textFaint,
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 8,
  },
  externalActions: { flexDirection: "row", gap: 9 },
  externalButton: {
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CFE3E0",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#FFFFFF",
  },
  externalButtonText: { color: "#2F7771", fontSize: 11, fontWeight: "700" },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  loadingTitle: {
    color: Brand.textDark,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 16,
    textAlign: "center",
  },
  loadingText: {
    color: Brand.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 380,
    textAlign: "center",
  },
  messageState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  messageIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0E4",
  },
  messageTitle: {
    color: Brand.textDark,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 16,
  },
  messageText: {
    color: Brand.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 400,
    marginTop: 6,
  },
  messageButton: {
    minHeight: 46,
    minWidth: 150,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.primary,
    marginTop: 20,
    paddingHorizontal: 18,
  },
  messageButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  messageFallback: { width: "100%", maxWidth: 430, marginTop: 4 },
  messageFallbackLabel: {
    color: Brand.textFaint,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  outlineCloseButton: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CFC3B7",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  outlineCloseButtonText: {
    color: Brand.textDark,
    fontSize: 12,
    fontWeight: "800",
  },
  statusNotice: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF3D6",
  },
  statusNoticeError: { backgroundColor: "#FCE9E5" },
  statusNoticeText: {
    flex: 1,
    color: "#7A5A13",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  statusNoticeTextError: { color: "#923422" },
});
