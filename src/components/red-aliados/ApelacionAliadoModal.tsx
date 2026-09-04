import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useApelacionAliado } from '../../hooks/useApelacionAliado';

const COLORS = {
  primary: '#EC802B',
  bgWhite: '#FFFFFF',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  danger: '#E74C3C',
  bgTeal: '#66BCB4',
  inputBorder: '#EFE5D9',
  inputBg: '#FAF3EA'
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ApelacionAliadoModal({ visible, onClose, onSuccess }: Props) {
  const { enviarApelacion } = useApelacionAliado();
  const [mensaje, setMensaje] = useState('');
  const [documentos, setDocumentos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pickDocument = async () => {
    if (documentos.length >= 3) {
      setError('Máximo 3 documentos permitidos.');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: false,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      if (file.size && file.size > 5 * 1024 * 1024) {
        setError('El archivo no debe pesar más de 5MB');
        return;
      }

      // Convert URI to File object for FormData
      const response = await fetch(file.uri);
      const blob = await response.blob();
      const fileObj = new File([blob], file.name, { type: file.mimeType });

      setDocumentos(prev => [...prev, fileObj]);
      setError('');
    } catch (err) {
      console.log('Error al seleccionar documento', err);
    }
  };

  const removeDocument = (index: number) => {
    setDocumentos(prev => prev.filter((_, i) => i !== index));
  };

  const handleEnviar = async () => {
    if (!mensaje.trim()) {
      setError('Por favor, escribe un mensaje justificando tu apelación.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await enviarApelacion(mensaje, documentos);
      setMensaje('');
      setDocumentos([]);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ocurrió un error al enviar tu apelación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>

            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons name="document-text" size={32} color={COLORS.primary} />
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>

            <Text style={styles.title}>Apelar Rechazo</Text>
            <Text style={styles.subtitle}>
              Si deseas volver a aplicar como aliado de PawAlerta, explícanos la razón o justificación y adjunta documentos que avalen tu identidad o experiencia.
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={20} color={COLORS.danger} style={{ marginRight: 8 }} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Tu mensaje <Text style={{ color: COLORS.danger }}>*</Text></Text>
            <TextInput
              style={styles.textArea}
              placeholder="Ej. Soy voluntario activo en mi comunidad desde hace 2 años..."
              placeholderTextColor="#B0A090"
              multiline
              numberOfLines={4}
          value={mensaje}
          maxLength={2000}
              onChangeText={(text) => {
                setMensaje(text);
                if (error) setError('');
              }}
            />

            <Text style={styles.label}>Documentos de soporte (Opcional, máx 3)</Text>
            <Text style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 12 }}>
              Puedes subir PDFs o imágenes (JPG/PNG).
            </Text>

            {documentos.map((doc, index) => (
              <View key={index} style={styles.docItem}>
                <Ionicons name="document-attach-outline" size={20} color={COLORS.bgTeal} />
                <Text style={styles.docText} numberOfLines={1}>{doc.name}</Text>
                <TouchableOpacity onPress={() => removeDocument(index)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            ))}

            {documentos.length < 3 && (
              <TouchableOpacity style={styles.uploadBtn} onPress={pickDocument}>
                <Ionicons name="cloud-upload-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
                <Text style={styles.uploadText}>Seleccionar Archivo</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, (!mensaje.trim() || loading) && { opacity: 0.7 }]}
              onPress={handleEnviar}
              disabled={!mensaje.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.bgWhite} />
              ) : (
                <Text style={styles.submitText}>Enviar Apelación</Text>
              )}
            </TouchableOpacity>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: COLORS.bgWhite,
    borderRadius: 32,
    width: '100%',
    maxWidth: 550,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF4EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    padding: 8,
    backgroundColor: '#F7F2ED',
    borderRadius: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.textDark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textLight,
    lineHeight: 22,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: COLORS.textDark,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 24,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    marginBottom: 32,
  },
  uploadText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F8F7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  docText: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 13,
    color: COLORS.textDark,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  submitText: {
    color: COLORS.bgWhite,
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: '#FDEDEC',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    flex: 1,
  }
});
