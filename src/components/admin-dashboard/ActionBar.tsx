import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, useWindowDimensions } from 'react-native';
import { Brand } from '../../constants/theme';
import { AdminActionButton } from './AdminActionButton';

const DESKTOP_BREAKPOINT = 900;

interface Props {
  onAprobar: () => void;
  onRechazar: (motivo: string) => void;
  isSubmitting: boolean;
}

export function ActionBar({ onAprobar, onRechazar, isSubmitting }: Props) {
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const puedeConfirmarRechazo = motivo.trim().length > 0;
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const handleRechazarPress = () => {
    if (!rechazando) {
      setRechazando(true);
      return;
    }
    if (puedeConfirmarRechazo) onRechazar(motivo.trim());
  };

  return (
    <View style={styles.container}>
      {rechazando && (
        <View style={[styles.motivoBlock, isDesktop && styles.motivoBlockDesktop]}>
          <Text style={styles.motivoLabel}>
            Motivo de rechazo <Text style={{ color: Brand.danger }}>*</Text>
          </Text>
          <TextInput
            style={styles.motivoInput}
            multiline
            numberOfLines={3}
            placeholder="Describe el motivo por el cual se rechaza esta solicitud…"
            placeholderTextColor={Brand.textFaint}
            value={motivo}
            onChangeText={setMotivo}
            maxLength={1000}
            autoFocus
          />
        </View>
      )}

      <View style={[styles.buttonsRow, isDesktop && styles.buttonsRowDesktop]}>
        <AdminActionButton
          variant={rechazando ? 'secundario' : 'aprobar'}
          label={rechazando ? 'Cancelar' : 'Aprobar'}
          icon={rechazando ? 'close-circle' : 'checkmark'}
          onPress={() => {
            if (rechazando) {
              setRechazando(false);
              setMotivo('');
            } else {
              onAprobar();
            }
          }}
          disabled={isSubmitting}
          loading={isSubmitting && !rechazando}
        />
        <AdminActionButton
          variant="rechazar"
          label={rechazando ? 'Confirmar rechazo' : 'Rechazar'}
          icon="close"
          onPress={handleRechazarPress}
          disabled={isSubmitting || (rechazando && !puedeConfirmarRechazo)}
          loading={isSubmitting && rechazando}
          enfatizado={rechazando && puedeConfirmarRechazo}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, borderTopColor: '#E4D3B8', backgroundColor: Brand.cardWarm },
  motivoBlock: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  motivoBlockDesktop: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  motivoLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Brand.textFaint,
    fontWeight: '700',
    marginBottom: 6,
  },
  motivoInput: {
    borderWidth: 1.5,
    borderColor: Brand.danger,
    borderRadius: 12,
    padding: 10,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
    color: Brand.textDark,
    backgroundColor: '#fff',
  },
  buttonsRow: { flexDirection: 'row', gap: 12, padding: 16 },
  buttonsRowDesktop: { width: '100%', maxWidth: 760, alignSelf: 'center' },
});
