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
  isWithinInterval,
  startOfDay,
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
  minDate?: Date | null;
}

// Mismo patrón de calendario-popover que DatePickerChip, pero de rango
// (estilo Airbnb: tocas el día de inicio, luego el final, y se ilumina
// todo lo de en medio) — reemplaza tener dos DatePickerChip separados
// ("desde" y "hasta") por un solo selector. Si el segundo toque cae antes
// del inicio, se invierten solos (nunca deja el rango a medias).
export function DateRangePickerChip({ label, startDate, endDate, onChange, required, error, minDate = new Date() }: Props) {
  const [open, setOpen] = useState(false);
  const [mes, setMes] = useState(startDate || new Date());

  const minDia = minDate ? startOfDay(minDate) : null;
  const esDeshabilitado = (dia: Date) => !!minDia && isBefore(startOfDay(dia), minDia);

  const handlePickDay = (dia: Date) => {
    if (esDeshabilitado(dia)) return;

    if (!startDate || (startDate && endDate)) {
      // Sin selección, o ya había un rango completo: empieza uno nuevo.
      onChange(dia, null);
      return;
    }

    // Ya hay inicio, falta el final — si el toque cae antes, se invierten.
    if (isBefore(dia, startDate)) {
      onChange(dia, startDate);
    } else {
      onChange(startDate, dia);
    }
    setOpen(false);
  };

  const triggerTexto = () => {
    if (startDate && endDate) {
      return `${format(startDate, 'd MMM', { locale: es })} – ${format(endDate, 'd MMM yyyy', { locale: es })}`;
    }
    if (startDate) return `${format(startDate, "d 'de' MMM", { locale: es })} → elige la fecha final`;
    return 'Elegir fechas';
  };

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
        <Text style={[styles.triggerText, startDate && styles.triggerTextActive]}>{triggerTexto()}</Text>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {startDate && !endDate && (
        <Text style={styles.hintText}>Ahora toca la fecha en la que termina</Text>
      )}

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
                const deshabilitado = esDeshabilitado(dia);

                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => handlePickDay(dia)}
                    disabled={deshabilitado}
                    style={styles.diaCell}
                  >
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
                            deshabilitado && styles.diaTextoDeshabilitado,
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

            {(startDate || endDate) && (
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
  hintText: { color: Brand.textMuted, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
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
  diaTextoDeshabilitado: { color: '#E5DCCC', textDecorationLine: 'line-through' },
  diaTextoSeleccionado: { color: '#fff', fontWeight: '800' },
  limpiarBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: `${Brand.primary}22` },
  limpiarText: { fontSize: 11, fontWeight: '700', color: Brand.primaryDark },
});
