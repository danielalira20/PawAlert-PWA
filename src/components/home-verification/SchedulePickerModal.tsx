import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

const COLORS = {
  primary: '#EC802B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  card: '#FAF3EA',
  border: '#F0E6D6',
  danger: '#E74C3C',
};

type HorarioDeclarado = {
  dia?: string;
  hora?: string;
};

interface Props {
  visible: boolean;
  title: string;
  description: string;
  horariosDeclarados?: HorarioDeclarado[];
  requireReason?: boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (horarioIso: string, motivo: string) => void;
}

const DAY_INDEX: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');
}

function parseHour(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function nextOccurrence(option: HorarioDeclarado) {
  if (!option.dia || !option.hora) return null;
  const targetDay = DAY_INDEX[normalize(option.dia)];
  const parsedHour = parseHour(option.hora);
  if (targetDay === undefined || !parsedHour) return null;

  const now = new Date();
  const date = new Date(now);
  let difference = (targetDay - now.getDay() + 7) % 7;
  date.setDate(now.getDate() + difference);
  date.setHours(parsedHour.hour, parsedHour.minute, 0, 0);
  if (date <= now) {
    difference += 7;
    date.setDate(now.getDate() + difference);
  }
  return date;
}

function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inputTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatOption(date: Date) {
  return date.toLocaleString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function SchedulePickerModal({
  visible,
  title,
  description,
  horariosDeclarados = [],
  requireReason = false,
  isSubmitting = false,
  submitLabel = 'Enviar horario',
  onClose,
  onSubmit,
}: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < 620;
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const suggested = useMemo(
    () => horariosDeclarados
      .map((option) => ({ option, date: nextOccurrence(option) }))
      .filter((item): item is { option: HorarioDeclarado; date: Date } => !!item.date),
    [horariosDeclarados],
  );

  useEffect(() => {
    if (!visible) return;
    const first = suggested[0]?.date;
    setDate(first ? inputDate(first) : '');
    setTime(first ? inputTime(first) : '');
    setReason('');
    setError('');
  }, [visible, suggested]);

  const chooseSuggestion = (value: Date) => {
    setDate(inputDate(value));
    setTime(inputTime(value));
    setError('');
  };

  const submit = () => {
    if (!date || !time) {
      setError('Selecciona o escribe una fecha y hora.');
      return;
    }
    const selected = new Date(`${date}T${time}:00`);
    if (Number.isNaN(selected.getTime()) || selected <= new Date()) {
      setError('Selecciona una fecha y hora futura.');
      return;
    }
    if (requireReason && !reason.trim()) {
      setError('Cuéntanos brevemente por qué necesitas cambiar el horario.');
      return;
    }
    setError('');
    onSubmit(selected.toISOString(), reason.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{
        flex: 1,
        padding: isMobile ? 16 : 24,
        backgroundColor: 'rgba(38,29,22,0.58)',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <View style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '90%',
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: COLORS.white,
        }}>
          <ScrollView contentContainerStyle={{ padding: isMobile ? 20 : 26, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ color: COLORS.textDark, fontSize: isMobile ? 19 : 22, fontWeight: '900' }}>
                {title}
              </Text>
              <Text style={{ color: COLORS.textLight, fontSize: 13, lineHeight: 20 }}>
                {description}
              </Text>
            </View>

            {!!suggested.length && (
              <View style={{ gap: 9 }}>
                <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '800' }}>
                  Horarios que indicó el postulante
                </Text>
                {suggested.map(({ option, date: suggestedDate }, index) => {
                  const selected = date === inputDate(suggestedDate)
                    && time === inputTime(suggestedDate);
                  return (
                    <TouchableOpacity
                      key={`${option.dia}-${option.hora}-${index}`}
                      onPress={() => chooseSuggestion(suggestedDate)}
                      style={{
                        padding: 13,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: selected ? COLORS.accent : COLORS.border,
                        backgroundColor: selected ? '#EAF7F6' : COLORS.card,
                      }}
                    >
                      <Text style={{ color: selected ? COLORS.accent : COLORS.textDark, fontSize: 13, fontWeight: '800' }}>
                        {formatOption(suggestedDate)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={{ gap: 9 }}>
              <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '800' }}>
                Elegir otra fecha
              </Text>
              <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ color: COLORS.textLight, fontSize: 11 }}>Fecha</Text>
                  <TextInput
                    value={date}
                    maxLength={10}
                    onChangeText={(value) => {
                      setDate(value);
                      setError('');
                    }}
                    placeholder="AAAA-MM-DD"
                    placeholderTextColor={COLORS.textLight}
                    style={{
                      paddingHorizontal: 13,
                      paddingVertical: 12,
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      color: COLORS.textDark,
                    }}
                  />
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ color: COLORS.textLight, fontSize: 11 }}>Hora</Text>
                  <TextInput
                    value={time}
                    maxLength={5}
                    onChangeText={(value) => {
                      setTime(value);
                      setError('');
                    }}
                    placeholder="HH:MM"
                    placeholderTextColor={COLORS.textLight}
                    style={{
                      paddingHorizontal: 13,
                      paddingVertical: 12,
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      color: COLORS.textDark,
                    }}
                  />
                </View>
              </View>
            </View>

            {requireReason && (
              <View style={{ gap: 5 }}>
                <Text style={{ color: COLORS.textLight, fontSize: 11 }}>
                  Motivo del cambio
                </Text>
                <TextInput
                  value={reason}
                  onChangeText={(value) => {
                    setReason(value);
                    setError('');
                  }}
                  multiline
                  maxLength={250}
                  placeholder="Ej. Ese día no habrá nadie en casa."
                  placeholderTextColor={COLORS.textLight}
                  style={{
                    minHeight: 90,
                    padding: 13,
                    borderRadius: 13,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    color: COLORS.textDark,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            )}

            {!!error && (
              <Text style={{ color: COLORS.danger, fontSize: 12, lineHeight: 18 }}>
                {error}
              </Text>
            )}

            <View style={{
              flexDirection: isMobile ? 'column-reverse' : 'row',
              justifyContent: 'flex-end',
              gap: 10,
            }}>
              <TouchableOpacity
                onPress={onClose}
                disabled={isSubmitting}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: COLORS.textDark, fontWeight: '800' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submit}
                disabled={isSubmitting}
                style={{
                  minWidth: isMobile ? undefined : 180,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderRadius: 13,
                  backgroundColor: COLORS.primary,
                  alignItems: 'center',
                  opacity: isSubmitting ? 0.65 : 1,
                }}
              >
                {isSubmitting
                  ? <ActivityIndicator color={COLORS.white} />
                  : <Text style={{ color: COLORS.white, fontWeight: '800' }}>{submitLabel}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
