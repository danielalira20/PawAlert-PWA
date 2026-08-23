import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../constants/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (avatarId: string) => void;
  currentAvatarId?: string | null;
  token: string | null;
}

// Mapeo estático de imágenes requerido por React Native (bundler)
export const AVATARS: Record<string, any> = {
  avatar1: require('../../assets/images/avatars/avatar1.png'),
  avatar2: require('../../assets/images/avatars/avatar2.png'),
  avatar3: require('../../assets/images/avatars/avatar3.png'),
  avatar4: require('../../assets/images/avatars/avatar4.png'),
  avatar5: require('../../assets/images/avatars/avatar5.png'),
  avatar6: require('../../assets/images/avatars/avatar6.png'),
  avatar7: require('../../assets/images/avatars/avatar7.png'),
  avatar8: require('../../assets/images/avatars/avatar8.png'),
  avatar9: require('../../assets/images/avatars/avatar9.png'),
  avatar10: require('../../assets/images/avatars/avatar10.png'),
  avatar11: require('../../assets/images/avatars/avatar11.png'),
  avatar12: require('../../assets/images/avatars/avatar12.png'),
  avatar13: require('../../assets/images/avatars/avatar13.png'),
  avatar14: require('../../assets/images/avatars/avatar14.png'),
  avatar15: require('../../assets/images/avatars/avatar15.png'),
  avatar16: require('../../assets/images/avatars/avatar16.png'),
  avatar17: require('../../assets/images/avatars/avatar17.png'),
  avatar18: require('../../assets/images/avatars/avatar18.png'),
  avatar19: require('../../assets/images/avatars/avatar19.png'),
  avatar20: require('../../assets/images/avatars/avatar20.png'),
};

const AVATAR_KEYS = Object.keys(AVATARS);

export function AvatarSelector({ visible, onClose, onSelect, currentAvatarId, token }: Props) {
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(currentAvatarId || null);

  const handleSave = async () => {
    if (!selectedId || !token) {
      onClose();
      return;
    }
    
    setLoading(true);
    try {
      await axios.put(`${API_URL}/users/me/avatar`, { avatar_id: selectedId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onSelect(selectedId);
      // Actualizar la memoria global para que el cambio persista
      refreshUser();
      onClose();
    } catch (error) {
      console.error('Error al guardar avatar:', error);
      alert('No se pudo guardar el avatar. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: string }) => {
    const isSelected = selectedId === item;
    
    return (
      <TouchableOpacity 
        onPress={() => setSelectedId(item)}
        activeOpacity={0.7}
        style={[styles.avatarWrapper, isSelected && styles.selectedWrapper]}
      >
        <Image source={AVATARS[item]} style={styles.avatarImage} />
        {isSelected && (
          <View style={styles.checkmark}>
            <Ionicons name="checkmark" size={14} color="#FFF" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Elige tu Avatar</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Brand.textFaint} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={AVATAR_KEYS}
            keyExtractor={item => item}
            renderItem={renderItem}
            numColumns={4}
            contentContainerStyle={styles.listContainer}
            columnWrapperStyle={styles.columnWrapper}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.footer}>
            <TouchableOpacity 
              style={[styles.saveBtn, loading && styles.saveBtnDisabled]} 
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.saveText}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
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
  modalContent: {
    backgroundColor: Brand.backgroundWarm,
    borderRadius: 24,
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)'
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Brand.textDark
  },
  closeBtn: {
    padding: 4
  },
  listContainer: {
    padding: 16,
    paddingBottom: 24
  },
  columnWrapper: {
    justifyContent: 'space-evenly',
    marginBottom: 16
  },
  avatarWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 2,
    position: 'relative'
  },
  selectedWrapper: {
    borderColor: Brand.primary
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    resizeMode: 'cover'
  },
  checkmark: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: Brand.primary,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF'
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 10
  },
  saveBtn: {
    backgroundColor: Brand.primary,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveBtnDisabled: {
    opacity: 0.7
  },
  saveText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700'
  }
});
