import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  startOfDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Brand } from '../../constants/theme';

interface Props {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  required?: boolean;
  error?: string;
  // Por default no deja elegir fechas pasadas (hoy es el mínimo) — se
  // puede desactivar pasando null si algún caso sí lo necesita.
  minDate?: Date | null;
  allowNotApplicable?: boolean;
  notApplicable?: boolean;
  onNotApplicableChange?: (value: boolean) => void;
}

// Calendario-popover extraído del patrón ya usado en MisReportesScreen.tsx
// (mismo grid mensual, misma navegación) — se quita la lógica de "días con
// reportes" (puntos de color) porque aquí no hay eventos que marcar, solo
// se elige una fecha.
export function DatePickerChip({
  label,
  value,
  onChange,
  required,
  error,
  minDate = new Date(),
  allowNotApplicable = false,
  notApplicable = false,
  onNotApplicableChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mes, setMes] = useState(value || new Date());

  const minDia = minDate ? startOfDay(minDate) : null;
  const esDeshabilitado = (dia: Date) => !!minDia && isBefore(startOfDay(dia), minDia);

  const handlePickDay = (dia: Date) => {
    if (esDeshabilitado(dia)) return;
    onChange(dia);
    setOpen(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={() => {
            onNotApplicableChange?.(false);
            setOpen((v) => !v);
          }}
          style={[styles.trigger, value && styles.triggerSelected, error && styles.triggerError]}
        >
          <Ionicons name="calendar-outline" size={16} color={value ? '#fff' : Brand.textMuted} />
          <Text style={[styles.triggerText, value && styles.triggerTextActive]}>
            {value ? format(value, "d 'de' MMMM, yyyy", { locale: es }) : 'Elegir fecha'}
          </Text>
        </TouchableOpacity>
        {allowNotApplicable && (
          <TouchableOpacity
            onPress={() => {
              onChange(null);
              onNotApplicableChange?.(!notApplicable);
              setOpen(false);
            }}
            style={[styles.notApplicableButton, notApplicable && styles.notApplicableButtonActive]}
          >
            <Ionicons
              name={notApplicable ? 'checkmark-circle' : 'remove-circle-outline'}
              size={16}
              color={notApplicable ? '#fff' : Brand.textMuted}
            />
            <Text style={[styles.notApplicableText, notApplicable && styles.notApplicableTextActive]}>
              No aplica
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.popover}>
            <View style={styles.popoverHeader}>
              <View style={styles.navGroup}>
                <TouchableOpacity onPress={() => setMes((m) => subMonths(m, 12))} style={styles.navBtn}>
                  <Feather name="chevrons-left" size={16} color={Brand.textDark} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMes((m) => subMonths(m, 1))} style={styles.navBtn}>
                  <Feather name="chevron-left" size={16} color={Brand.textDark} />
                </TouchableOpacity>
              </View>
              <Text style={styles.popoverMes}>{format(mes, 'MMMM yyyy', { locale: es })}</Text>
              <View style={styles.navGroup}>
                <TouchableOpacity onPress={() => setMes((m) => addMonths(m, 1))} style={styles.navBtn}>
                  <Feather name="chevron-right" size={16} color={Brand.textDark} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMes((m) => addMonths(m, 12))} style={styles.navBtn}>
                  <Feather name="chevrons-right" size={16} color={Brand.textDark} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.diasSemanaRow}>
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <View key={i} style={styles.diaSemanaCell}>
                  <Text style={styles.diaSemanaText}>{d}</Text>
                </View>
              ))}
            </View>

            <View style={styles.grid}>
              {eachDayOfInterval({
                start: startOfWeek(startOfMonth(mes), { weekStartsOn: 1 }),
                end: endOfWeek(endOfMonth(mes), { weekStartsOn: 1 }),
              }).map((dia, i) => {
                const enEsteMes = isSameMonth(dia, mes);
                const esSeleccionado = value ? isSameDay(dia, value) : false;
                const esHoy = isSameDay(dia, new Date());
                const esDeshabilitado = minDate ? isBefore(startOfDay(dia), startOfDay(minDate)) : false;

                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => handlePickDay(dia)}
                    disabled={esDeshabilitado}
                    style={styles.diaCell}
                  >
                    <View
                      style={[
                        styles.diaCirculo,
                        esSeleccionado && styles.diaCirculoSeleccionado,
                        esHoy && !esSeleccionado && styles.diaCirculoHoy,
                      ]}
                    >
                      <Text
                        style={[
                          styles.diaTexto,
                          (!enEsteMes || esDeshabilitado) && styles.diaTextoFuera,
                          esSeleccionado && styles.diaTextoSeleccionado,
                         
                        ]}
                      >
                        {format(dia, 'd')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {value && (
              <TouchableOpacity onPress={() => { onChange(null); setOpen(false); }} style={styles.limpiarBtn}>
                <Text style={styles.limpiarText}>Quitar fecha</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: Brand.textDark, marginBottom: 8 },
  required: { color: Brand.danger },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 100,
    backgroundColor: Brand.cardWarm,
    borderWidth: 1,
    borderColor: '#E4D3B8',
  },
  triggerSelected: { backgroundColor: Brand.secondary, borderColor: Brand.secondary },
  triggerError: { borderColor: Brand.danger },
  triggerText: { fontSize: 13, fontWeight: '600', color: Brand.textMuted },
  triggerTextActive: { color: '#fff' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  notApplicableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 100,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E2E3E6',
  },
  notApplicableButtonActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  notApplicableText: { fontSize: 13, fontWeight: '600', color: Brand.textMuted },
  notApplicableTextActive: { color: '#fff' },
  errorText: { color: Brand.danger, fontSize: 12, marginTop: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  popover: {
    width: 260,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 14,
    borderWidth: 1,
    borderColor: '#F0EBE3',
  },
  popoverHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navGroup: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  navBtn: { padding: 4 },
  popoverMes: { fontSize: 13, fontWeight: '700', color: Brand.textDark, textTransform: 'capitalize' },
  diasSemanaRow: { flexDirection: 'row', marginBottom: 4 },
  diaSemanaCell: { flex: 1, alignItems: 'center' },
  diaSemanaText: { fontSize: 10, color: Brand.textMuted, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  diaCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  diaCirculo: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  diaCirculoSeleccionado: { backgroundColor: Brand.secondary },
  diaCirculoHoy: { borderWidth: 1.5, borderColor: Brand.secondary },
  diaTexto: { fontSize: 12, fontWeight: '500', color: Brand.textDark },
  diaTextoFuera: { color: '#D8D0C4' },
  diaTextoDeshabilitado: { color: '#E5DCCC', textDecorationLine: 'line-through' },
  diaTextoSeleccionado: { color: '#fff', fontWeight: '800' },
  limpiarBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: `${Brand.primary}22` },
  limpiarText: { fontSize: 11, fontWeight: '700', color: Brand.primaryDark },
});
