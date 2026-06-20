import axios from 'axios';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

interface AsociacionInfo {
  id: string;
  nombre: string;
  estado: 'pendiente' | 'rechazada' | 'aprobada';
  motivo_rechazo: string | null;
}

export default function AssociationStatusScreen() {
  const { token, logout } = useAuth();
  const [info, setInfo] = useState<AsociacionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [nombreRep, setNombreRep] = useState('');
  const [apellidoRep, setApellidoRep] = useState('');
  const [telefonoRep, setTelefonoRep] = useState('');
  const [emailRep, setEmailRep] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const cargarEstado = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInfo(res.data);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'No pudimos cargar el estado de tu asociación.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarEstado();
  }, []);

  const handleAgregarRepresentante = async () => {
    if (!nombreRep.trim() || !apellidoRep.trim() || !telefonoRep.trim()) {
      Alert.alert('Datos incompletos', 'Nombre, apellido y teléfono son obligatorios.');
      return;
    }
    if (!info) return;
    setIsAdding(true);
    try {
      await axios.post(
        `${API_URL}/associations/${info.id}/representantes`,
        {
          nombre: nombreRep.trim(),
          apellido_paterno: apellidoRep.trim(),
          telefono: telefonoRep.replace(/\s|-/g, ''),
          email: emailRep.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert('¡Listo!', 'Esa persona ya puede registrarse con ese mismo teléfono para tener acceso.');
      setNombreRep('');
      setApellidoRep('');
      setTelefonoRep('');
      setEmailRep('');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'No pudimos agregar al representante.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5' }}>
        <ActivityIndicator size="large" color="#3498DB" />
      </View>
    );
  }

  if (!info) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5', padding: 24 }}>
        <Text style={{ fontSize: 14, color: '#7F8C8D', textAlign: 'center', marginBottom: 16 }}>
          No pudimos cargar la información de tu asociación.
        </Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={{ color: '#E74C3C', fontWeight: '600' }}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F5F5F5' }} contentContainerStyle={{ padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>{info.nombre}</Text>
      <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 24 }}>Estado de tu asociación</Text>

      {info.estado === 'pendiente' && (
        <Card>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#F39C12', marginBottom: 8 }}>
            En revisión
          </Text>
          <Text style={{ fontSize: 14, color: '#566573', lineHeight: 20 }}>
            Tu asociación está siendo revisada por nuestro equipo. Te avisaremos en cuanto sea aprobada
            y puedas empezar a recibir reportes.
          </Text>
        </Card>
      )}

      {info.estado === 'rechazada' && (
        <Card>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#E74C3C', marginBottom: 8 }}>
            Solicitud rechazada
          </Text>
          <Text style={{ fontSize: 14, color: '#566573', lineHeight: 20 }}>
            {info.motivo_rechazo || 'No se especificó un motivo. Contáctanos para más información.'}
          </Text>
        </Card>
      )}

      {info.estado === 'aprobada' && (
        <>
          <Card>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#27AE60', marginBottom: 8 }}>
              Asociación activa
            </Text>
            <Text style={{ fontSize: 14, color: '#566573', lineHeight: 20 }}>
              Tu asociación ya puede recibir reportes de animales en tu zona.
            </Text>
          </Card>

          <Card>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>
              Agregar representante
            </Text>
            <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>
              Esa persona podrá iniciar sesión registrándose con el mismo teléfono que pongas aquí.
            </Text>
            <Input label="Nombre(s)" placeholder="Ej. Ana" value={nombreRep} onChangeText={setNombreRep} />
            <Input label="Apellido" placeholder="Ej. Pérez" value={apellidoRep} onChangeText={setApellidoRep} />
            <Input label="Teléfono" placeholder="Ej. 2221234567" value={telefonoRep} onChangeText={setTelefonoRep} keyboardType="numeric" maxLength={10} />
            <Input label="Correo (Opcional)" placeholder="Ej. correo@ejemplo.com" value={emailRep} onChangeText={setEmailRep} keyboardType="email-address" autoCapitalize="none" />
            <Button label="Agregar representante" onPress={handleAgregarRepresentante} isLoading={isAdding} />
          </Card>
        </>
      )}

      <TouchableOpacity onPress={handleLogout} style={{ alignItems: 'center', marginTop: 8, marginBottom: 24 }}>
        <Text style={{ color: '#95A5A6', fontSize: 14 }}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}