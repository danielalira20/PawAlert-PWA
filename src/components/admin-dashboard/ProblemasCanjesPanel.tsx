import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../../constants/api';
import { Brand } from '../../constants/theme';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface ProblemaCanje {
  id: string;
  canje_id: string;
  usuario_id: string;
  motivo: string;
  estado: string;
  creado_at: string;
  usuarios: { nombre: string; apellido_paterno: string };
  canjes_recompensa: {
    codigo: string;
    costo_snapshot: number;
    estado: string;
    recompensas: { nombre: string; nivel: string; propietario_id: string };
  };
}

interface Props {
  problemas: ProblemaCanje[];
  isLoading: boolean;
  token: string;
  onRefresh: () => void;
  showToast?: (toast: { type: 'success' | 'error' | 'warning' | 'info'; title: string; message: string; }) => void;
}

export function ProblemasCanjesPanel({ problemas, isLoading, token, onRefresh, showToast }: Props) {
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [motivoReembolso, setMotivoReembolso] = useState('');
  const [problemaSeleccionado, setProblemaSeleccionado] = useState<ProblemaCanje | null>(null);

  const handleReembolsar = async (problema: ProblemaCanje) => {
    if (!motivoReembolso.trim()) {
      if (showToast) showToast({ type: 'warning', title: 'Faltan datos', message: 'Ingresa un motivo para el reembolso' });
      else alert('Ingresa un motivo para el reembolso');
      return;
    }
    setProcesandoId(problema.id);
    try {
      await axios.post(`${API_URL}/recompensas/canjes/${problema.canje_id}/reembolso`, {
        motivo: motivoReembolso
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (showToast) showToast({ type: 'success', title: 'Reembolso exitoso', message: 'Los puntos han sido devueltos al usuario.' });
      else alert('Canje reembolsado correctamente. Los puntos han sido devueltos al usuario.');
      setProblemaSeleccionado(null);
      setMotivoReembolso('');
      onRefresh();
    } catch (error: any) {
      if (showToast) showToast({ type: 'error', title: 'Error', message: error.response?.data?.detail || 'Error al reembolsar canje' });
      else alert(error.response?.data?.detail || 'Error al reembolsar canje');
    } finally {
      setProcesandoId(null);
    }
  };

  const handleRechazar = async (problema: ProblemaCanje) => {
    if (confirm('¿Estás seguro de rechazar este reporte? No se devolverán los puntos.')) {
      setProcesandoId(problema.id);
      try {
        await axios.post(`${API_URL}/recompensas/admin/canjes/problemas/${problema.id}/rechazar`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (showToast) showToast({ type: 'success', title: 'Reporte rechazado', message: 'El reporte fue rechazado correctamente.' });
        else alert('Reporte rechazado correctamente.');
        onRefresh();
      } catch (error: any) {
        if (showToast) showToast({ type: 'error', title: 'Error', message: error.response?.data?.detail || 'Error al rechazar reporte' });
        else alert(error.response?.data?.detail || 'Error al rechazar reporte');
      } finally {
        setProcesandoId(null);
      }
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Brand.primary} />
        <Text style={styles.loadingText}>Cargando problemas reportados...</Text>
      </View>
    );
  }

  if (problemas.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="checkmark-circle-outline" size={64} color={Brand.textFaint} />
        <Text style={styles.emptyText}>No hay problemas de canjes pendientes por revisar.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Problemas Reportados en Canjes ({problemas.length})</Text>
      
      {problemas.map(problema => (
        <View key={problema.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>
                {problema.canjes_recompensa.recompensas.nombre}
              </Text>
              <Text style={styles.cardSubtitle}>
                Código: {problema.canjes_recompensa.codigo} • {problema.canjes_recompensa.costo_snapshot} pts
              </Text>
            </View>
            <View style={styles.dateBadge}>
              <Text style={styles.dateText}>
                {format(parseISO(problema.creado_at), "dd MMM, HH:mm", { locale: es })}
              </Text>
            </View>
          </View>
          
          <View style={styles.userInfo}>
            <Ionicons name="person-circle-outline" size={20} color={Brand.textMuted} />
            <Text style={styles.userText}>
              Reportado por: {problema.usuarios.nombre} {problema.usuarios.apellido_paterno}
            </Text>
          </View>
          
          <View style={styles.motivoBox}>
            <Text style={styles.motivoLabel}>Motivo del reporte:</Text>
            <Text style={styles.motivoText}>{problema.motivo}</Text>
          </View>
          
          {problemaSeleccionado?.id === problema.id ? (
            <View style={styles.reembolsoForm}>
              <Text style={styles.motivoLabel}>Motivo del reembolso (interno):</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ej. Local cerrado, confirmado por admin"
                value={motivoReembolso}
                onChangeText={setMotivoReembolso}
                multiline
              />
              <View style={styles.actionRow}>
                <TouchableOpacity 
                  style={[styles.btn, styles.btnCancel]} 
                  onPress={() => setProblemaSeleccionado(null)}
                  disabled={procesandoId === problema.id}
                >
                  <Text style={styles.btnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.btn, styles.btnConfirm]} 
                  onPress={() => handleReembolsar(problema)}
                  disabled={procesandoId === problema.id || !motivoReembolso.trim()}
                >
                  {procesandoId === problema.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.btnConfirmText}>Confirmar Reembolso</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.actionRow}>
              <TouchableOpacity 
                style={[styles.btn, styles.btnReject]} 
                onPress={() => handleRechazar(problema)}
                disabled={procesandoId === problema.id}
              >
                <Ionicons name="close-circle-outline" size={18} color={Brand.danger} />
                <Text style={styles.btnRejectText}>Rechazar Reporte</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.btn, styles.btnApprove]} 
                onPress={() => setProblemaSeleccionado(problema)}
                disabled={procesandoId === problema.id}
              >
                <Ionicons name="cash-outline" size={18} color="#fff" />
                <Text style={styles.btnApproveText}>Aprobar y Reembolsar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.backgroundWarm,
  },
  content: {
    padding: 24,
    gap: 20,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: Brand.backgroundWarm,
  },
  loadingText: {
    marginTop: 16,
    color: Brand.textMuted,
    fontSize: 15,
  },
  emptyText: {
    marginTop: 16,
    color: Brand.textMuted,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Brand.textDark,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.textDark,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: Brand.primary,
    fontWeight: '600',
  },
  dateBadge: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dateText: {
    fontSize: 12,
    color: Brand.textMuted,
    fontWeight: '600',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  userText: {
    fontSize: 14,
    color: Brand.textDark,
    fontWeight: '500',
  },
  motivoBox: {
    backgroundColor: Brand.backgroundWarm,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  motivoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  motivoText: {
    fontSize: 15,
    color: Brand.textDark,
    lineHeight: 22,
  },
  reembolsoForm: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: Brand.textDark,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  btnReject: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Brand.danger,
  },
  btnRejectText: {
    color: Brand.danger,
    fontWeight: '600',
    fontSize: 14,
  },
  btnApprove: {
    backgroundColor: Brand.primary,
  },
  btnApproveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  btnCancel: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  btnCancelText: {
    color: Brand.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  btnConfirm: {
    backgroundColor: Brand.primary,
  },
  btnConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
