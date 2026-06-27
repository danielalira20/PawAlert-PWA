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
  asociacion_id?: string | null;
  es_admin?: boolean;
  rol?: string;
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
  isLoading: boolean;
  login: (email: string, password: string) => Promise<Usuario>;
  register: (data: RegisterData) => Promise<Usuario>;
  setSession: (usuario: Usuario, accessToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY_TOKEN = '@pawalert_token';
const STORAGE_KEY_USER = '@pawalert_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
      } finally {
        setIsLoading(false); // ← siempre se ejecuta al terminar
      }
    })();
  }, []);

  const setSession = async (usuario: Usuario, accessToken: string) => {
  setUser(usuario);
  setToken(accessToken);
  try {
    await AsyncStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
    await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(usuario));
  } catch {
    // Si falla el storage local, la sesión sigue activa en memoria
  }
};

  const login = async (email: string, password: string) => {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    await setSession(res.data.usuario, res.data.access_token);
    return res.data.usuario as Usuario;
  };

  const register = async (data: RegisterData) => {
    const res = await axios.post(`${API_URL}/auth/register`, data);
    await setSession(res.data.usuario, res.data.access_token);
    return res.data.usuario as Usuario;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    AsyncStorage.removeItem(STORAGE_KEY_TOKEN).catch(() => {});
    AsyncStorage.removeItem(STORAGE_KEY_USER).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoggedIn: !!user, isLoading, login, register, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
