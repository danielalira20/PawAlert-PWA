import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  listPendingReports,
  PendingReport,
  removePendingReport,
  resolvePendingDuplicate,
  retryPendingReports,
  watchPendingReports,
} from '../services/offlineReportQueue';

interface PendingSyncScreenProps {
  onClose?: () => void;
}

export default function PendingSyncScreen({ onClose }: PendingSyncScreenProps) {
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setReports(await listPendingReports());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    return watchPendingReports(refresh);
  }, [refresh]);

  const retry = async () => {
    setSyncing(true);
    await retryPendingReports();
    await refresh();
    setSyncing(false);
  };

  const confirmRemove = (report: PendingReport) => {
    Alert.alert(
      'Eliminar reporte pendiente',
      'También se eliminarán las fotografías guardadas en este dispositivo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => removePendingReport(report.id).then(refresh) },
      ],
    );
  };

  const resolveDuplicate = async (report: PendingReport, action: 'link' | 'new') => {
    setSyncing(true);
    await resolvePendingDuplicate(report.id, action);
    await refresh();
    setSyncing(false);
  };

  const close = () => {
    if (onClose) {
      onClose();
      return;
    }
    router.back();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={close} accessibilityLabel={onClose ? 'Cerrar pendientes de sincronización' : 'Volver'} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#5C4B3A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Pendientes de sincronización</Text>
          <Text style={styles.subtitle}>Reportes conservados en este dispositivo</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {Platform.OS !== 'web' ? (
          <View style={styles.empty}>
            <Ionicons name="cloud-done-outline" size={48} color="#EC802B" />
            <Text style={styles.emptyTitle}>La cola offline está disponible en la PWA</Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color="#EC802B" size="large" />
        ) : reports.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cloud-done-outline" size={52} color="#2FA66A" />
            <Text style={styles.emptyTitle}>Todo está sincronizado</Text>
            <Text style={styles.emptyText}>No tienes reportes ni fotografías pendientes.</Text>
          </View>
        ) : (
          <>
            <View style={styles.notice}>
              <Ionicons name="information-circle-outline" size={21} color="#A65A18" />
              <Text style={styles.noticeText}>Se enviarán automáticamente cuando vuelva internet.</Text>
            </View>
            {reports.map((report) => (
              <View key={report.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="paw" size={22} color="#EC802B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.animal}>{report.animalSummary || 'Reporte animal'}</Text>
                    <Text style={styles.meta}>
                      {new Date(report.createdAt).toLocaleString()} · {report.photoCount} foto{report.photoCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={[styles.badge, (report.status === 'failed' || report.status === 'duplicate') && styles.badgeFailed]}>
                    <Text style={[styles.badgeText, (report.status === 'failed' || report.status === 'duplicate') && styles.badgeTextFailed]}>
                      {report.status === 'syncing' ? 'Enviando' : report.status === 'duplicate' ? 'Decisión necesaria' : report.status === 'failed' ? 'Reintentar' : 'Pendiente'}
                    </Text>
                  </View>
                </View>
                {report.status === 'duplicate' && (
                  <View style={styles.duplicateBox}>
                    <Text style={styles.duplicateTitle}>
                      {report.duplicateScenario === 2 ? '¿Es parte del grupo encontrado?' : 'Encontramos un posible duplicado'}
                    </Text>
                    <Text style={styles.duplicateText}>El reporte se conservó en este dispositivo. Elige cómo deseas enviarlo.</Text>
                    <View style={styles.duplicateActions}>
                      <TouchableOpacity disabled={syncing} onPress={() => resolveDuplicate(report, 'link')} style={styles.linkButton}>
                        <Text style={styles.linkButtonText}>{report.duplicateScenario === 2 ? 'Vincular al grupo' : 'Vincular al existente'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity disabled={syncing} onPress={() => resolveDuplicate(report, 'new')} style={styles.newButton}>
                        <Text style={styles.newButtonText}>Crear uno nuevo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {!!report.lastError && <Text style={styles.error}>{report.lastError}</Text>}
                <TouchableOpacity onPress={() => confirmRemove(report)} style={styles.removeButton}>
                  <Ionicons name="trash-outline" size={17} color="#C74B42" />
                  <Text style={styles.removeText}>Eliminar del dispositivo</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity disabled={syncing} onPress={retry} style={styles.retryButton}>
              {syncing ? <ActivityIndicator color="#FFF" /> : <Ionicons name="sync" size={20} color="#FFF" />}
              <Text style={styles.retryText}>{syncing ? 'Sincronizando…' : 'Intentar ahora'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF9F2' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 18, backgroundColor: '#FFF' },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF3E7' },
  title: { color: '#352A20', fontSize: 21, fontWeight: '800' },
  subtitle: { color: '#8D7C6C', fontSize: 12, marginTop: 2 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: 100, gap: 14 },
  empty: { alignItems: 'center', paddingVertical: 90, paddingHorizontal: 24 },
  emptyTitle: { marginTop: 16, color: '#352A20', fontSize: 19, fontWeight: '800', textAlign: 'center' },
  emptyText: { marginTop: 6, color: '#8D7C6C', textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 14, borderRadius: 16, backgroundColor: '#FFF0D9' },
  noticeText: { flex: 1, color: '#7B4B20', fontSize: 13, fontWeight: '600' },
  card: { backgroundColor: '#FFF', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: '#F0E2D2' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF0E3', alignItems: 'center', justifyContent: 'center' },
  animal: { color: '#352A20', fontSize: 15, fontWeight: '800' },
  meta: { color: '#8D7C6C', fontSize: 11, marginTop: 3 },
  badge: { backgroundColor: '#FFF0D9', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  badgeFailed: { backgroundColor: '#FFE9E6' },
  badgeText: { color: '#A65A18', fontSize: 10, fontWeight: '800' },
  badgeTextFailed: { color: '#C74B42' },
  error: { color: '#C74B42', fontSize: 11, marginTop: 10 },
  duplicateBox: { marginTop: 14, padding: 13, borderRadius: 14, backgroundColor: '#FFF5E9' },
  duplicateTitle: { color: '#7B4B20', fontSize: 13, fontWeight: '800' },
  duplicateText: { color: '#8D6B4D', fontSize: 11, lineHeight: 16, marginTop: 3 },
  duplicateActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  linkButton: { backgroundColor: '#EC802B', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12 },
  linkButtonText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  newButton: { borderWidth: 1, borderColor: '#D7BFA7', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12 },
  newButtonText: { color: '#6B513B', fontSize: 11, fontWeight: '800' },
  removeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 13 },
  removeText: { color: '#C74B42', fontSize: 12, fontWeight: '600' },
  retryButton: { minHeight: 52, borderRadius: 18, backgroundColor: '#EC802B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 4 },
  retryText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
