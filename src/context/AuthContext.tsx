import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { API_URL } from '../constants/api';

interface Usuario {
  id: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno?: string;
  email: string;
  telefono: string;
}

interface RegisterData {
  email: string;
  password: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno?: string;
  telefono: string;
}

interface AuthContextType {
  user: Usuario | null;
  token: string | null;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY_TOKEN = '@pawalert_token';
const STORAGE_KEY_USER = '@pawalert_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Al abrir la app (o recargar la página en web), restaura la sesión
  // guardada si existe — antes esto vivía solo en useState, así que
  // cualquier recarga la borraba por completo.
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_TOKEN),
          AsyncStorage.getItem(STORAGE_KEY_USER),
        ]);
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch {
        // Si falla la lectura, simplemente no se restaura sesión automática.
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    setUser(res.data.usuario);
    setToken(res.data.access_token);
    await AsyncStorage.setItem(STORAGE_KEY_TOKEN, res.data.access_token);
    await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(res.data.usuario));
  };

  const register = async (data: RegisterData) => {
    const res = await axios.post(`${API_URL}/auth/register`, data);
    setUser(res.data.usuario);
    setToken(res.data.access_token);
    await AsyncStorage.setItem(STORAGE_KEY_TOKEN, res.data.access_token);
    await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(res.data.usuario));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    AsyncStorage.multiRemove([STORAGE_KEY_TOKEN, STORAGE_KEY_USER]);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoggedIn: !!user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
