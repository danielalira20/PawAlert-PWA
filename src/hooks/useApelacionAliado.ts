import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

export function useApelacionAliado() {
  const { token } = useAuth();
  const [apelacionActiva, setApelacionActiva] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkApelacionActiva = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/red-aliados/apelaciones/activa`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setApelacionActiva(response.data.activa);
    } catch (error) {
      console.error('Error al verificar apelación activa:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      checkApelacionActiva();
    }
  }, [checkApelacionActiva, token]);

  const enviarApelacion = async (mensaje: string, documentos: File[]) => {
    const formData = new FormData();
    formData.append('mensaje', mensaje);

    documentos.forEach((doc) => {
      formData.append('documentos', doc);
    });

    await axios.post(`${API_URL}/red-aliados/apelaciones`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`
      },
    });

    await checkApelacionActiva();
  };

  return { apelacionActiva, loading, enviarApelacion, checkApelacionActiva };
}
