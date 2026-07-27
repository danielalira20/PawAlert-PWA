import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Brand } from '../../constants/theme';

interface Props {
  label: string;
  startDate: Date | null;
  endDate: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
  required?: boolean;
  error?: string;
}

// Mismo calendario-popover que DatePickerChip.tsx, adaptado para elegir dos
// fechas (inicio y fin) en vez de una — primer toque fija el inicio, segundo
// toque fija el final (se invierten solas si el segundo toque cae antes del
// inicio). El popover se queda abierto entre el primer y segundo toque para
// no obligar a reabrirlo.
export function DateRangePickerChip({ label, startDate, endDate, onChange, required, error }: Props) {
  const [open, setOpen] = useState(false);
  const [mes, setMes] = useState(startDate || new Date());

  const handlePickDay = (dia: Date) => {
    if (!startDate || (startDate && endDate)) {
      onChange(dia, null);
      return;
    }
    if (dia < startDate) {
      onChange(dia, startDate);
    } else {
      onChange(startDate, dia);
    }
    setOpen(false);
  };

  const triggerText = startDate && endDate
    ? `${format(startDate, "d 'de' MMM", { locale: es })} — ${format(endDate, "d 'de' MMM, yyyy", { locale: es })}`
    : startDate
      ? `${format(startDate, "d 'de' MMM", { locale: es })} → elige la fecha final`
      : 'Elegir fechas';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>

      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        style={[styles.trigger, error && styles.triggerError]}
      >
        <Ionicons name="calendar-outline" size={16} color={startDate ? '#fff' : Brand.textMuted} />
        <Text style={[styles.triggerText, startDate && styles.triggerTextActive]}>
          {triggerText}
        </Text>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.popover}>
            <View style={styles.popoverHeader}>
              <TouchableOpacity onPress={() => setMes((m) => subMonths(m, 1))} style={styles.navBtn}>
                <Feather name="chevron-left" size={16} color={Brand.textDark} />
              </TouchableOpacity>
              <Text style={styles.popoverMes}>{format(mes, 'MMMM yyyy', { locale: es })}</Text>
              <TouchableOpacity onPress={() => setMes((m) => addMonths(m, 1))} style={styles.navBtn}>
                <Feather name="chevron-right" size={16} color={Brand.textDark} />
              </TouchableOpacity>
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
                const esInicio = startDate ? isSameDay(dia, startDate) : false;
                const esFin = endDate ? isSameDay(dia, endDate) : false;
                const esExtremo = esInicio || esFin;
                const esEnRango = startDate && endDate
                  ? isWithinInterval(dia, { start: startDate, end: endDate })
                  : false;
                const esHoy = isSameDay(dia, new Date());

                return (
                  <TouchableOpacity key={i} onPress={() => handlePickDay(dia)} style={styles.diaCell}>
                    <View style={[styles.diaCeldaFondo, esEnRango && styles.diaCeldaFondoRango]}>
                      <View
                        style={[
                          styles.diaCirculo,
                          esExtremo && styles.diaCirculoSeleccionado,
                          esHoy && !esExtremo && styles.diaCirculoHoy,
                        ]}
                      >
                        <Text
                          style={[
                            styles.diaTexto,
                            !enEsteMes && styles.diaTextoFuera,
                            esExtremo && styles.diaTextoSeleccionado,
                          ]}
                        >
                          {format(dia, 'd')}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {startDate && (
              <TouchableOpacity onPress={() => { onChange(null, null); setOpen(false); }} style={styles.limpiarBtn}>
                <Text style={styles.limpiarText}>Quitar fechas</Text>
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
  triggerError: { borderColor: Brand.danger },
  triggerText: { fontSize: 13, fontWeight: '600', color: Brand.textMuted },
  triggerTextActive: { color: '#fff' },
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
  navBtn: { padding: 4 },
  popoverMes: { fontSize: 13, fontWeight: '700', color: Brand.textDark, textTransform: 'capitalize' },
  diasSemanaRow: { flexDirection: 'row', marginBottom: 4 },
  diaSemanaCell: { flex: 1, alignItems: 'center' },
  diaSemanaText: { fontSize: 10, color: Brand.textMuted, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  diaCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  // Franja de fondo del rango — mismo criterio de opacidad-por-sufijo que ya
  // usa limpiarBtn (`${Brand.primary}22`) en DatePickerChip.tsx.
  diaCeldaFondo: { width: '100%', alignItems: 'center', borderRadius: 14 },
  diaCeldaFondoRango: { backgroundColor: `${Brand.secondary}22` },
  diaCirculo: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  diaCirculoSeleccionado: { backgroundColor: Brand.secondary },
  diaCirculoHoy: { borderWidth: 1.5, borderColor: Brand.secondary },
  diaTexto: { fontSize: 12, fontWeight: '500', color: Brand.textDark },
  diaTextoFuera: { color: '#D8D0C4' },
  diaTextoSeleccionado: { color: '#fff', fontWeight: '800' },
  limpiarBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: `${Brand.primary}22` },
  limpiarText: { fontSize: 11, fontWeight: '700', color: Brand.primaryDark },
});
