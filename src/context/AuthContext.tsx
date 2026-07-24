import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
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
  setSession: (usuario: Usuario, accessToken: string, refreshToken?: string) => Promise<void>;
  refreshUser: () => Promise<Usuario | null>;
  logout: () => void;
}

interface RefreshSubscriber {
  resolve: (newToken: string) => void;
  reject: (error: unknown) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY_TOKEN = '@pawalert_token';
const STORAGE_KEY_REFRESH = '@pawalert_refresh_token';
const STORAGE_KEY_USER = '@pawalert_user';

export function shouldAttemptTokenRefresh(
  status: number | undefined,
  requestUrl: string,
  alreadyRetried: boolean,
) {
  const isAuthEndpoint = ['/auth/login', '/auth/register', '/auth/refresh']
    .some((path) => requestUrl.includes(path));

  return status === 401 && !alreadyRetried && !isAuthEndpoint;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refs para que el interceptor de axios (que vive fuera del ciclo de render)
  // siempre lea el valor más reciente sin tener que re-registrarse en cada cambio.
  const tokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const isRefreshingRef = useRef(false);
  const refreshSubscribersRef = useRef<RefreshSubscriber[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedRefresh, storedUser] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_TOKEN),
          AsyncStorage.getItem(STORAGE_KEY_REFRESH),
          AsyncStorage.getItem(STORAGE_KEY_USER),
        ]);
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          tokenRef.current = storedToken;
        }
        if (storedRefresh) {
          refreshTokenRef.current = storedRefresh;
        }
      } catch {
        // Si falla la lectura, simplemente no se restaura sesión automática.
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setSession = async (usuario: Usuario, accessToken: string, refreshTokenValue?: string) => {
    setUser(usuario);
    setToken(accessToken);
    tokenRef.current = accessToken;
    if (refreshTokenValue) {
      refreshTokenRef.current = refreshTokenValue;
    }
    try {
      await AsyncStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
      await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(usuario));
      if (refreshTokenValue) {
        await AsyncStorage.setItem(STORAGE_KEY_REFRESH, refreshTokenValue);
      }
    } catch {
      // Si falla el storage local, la sesión sigue activa en memoria
    }
  };

  const login = async (email: string, password: string) => {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    await setSession(res.data.usuario, res.data.access_token, res.data.refresh_token);
    return res.data.usuario as Usuario;
  };

  const register = async (data: RegisterData) => {
    const res = await axios.post(`${API_URL}/auth/register`, data);
    await setSession(res.data.usuario, res.data.access_token, res.data.refresh_token);
    return res.data.usuario as Usuario;
  };

    // Vuelve a consultar GET /users/me y reemplaza el usuario en memoria +
  // AsyncStorage. Necesario porque el rol (u otros datos) pueden cambiar
  // DESPUÉS del login/registro — por ejemplo, cuando una asociación acepta
  // la postulación de un voluntario, su rol pasa de 'reportante' a
  // 'voluntario_interno'/'voluntario_externo' en la base de datos, pero
  // el objeto `user` guardado localmente sigue siendo el viejo hasta que
  // se llama a esta función explícitamente.
  const refreshUser = async (): Promise<Usuario | null> => {
    const currentToken = tokenRef.current;
    if (!currentToken) return null;
    try {
      const res = await axios.get(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const usuarioActualizado = res.data as Usuario;
      setUser(usuarioActualizado);
      try {
        await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(usuarioActualizado));
      } catch {
        // Si falla el storage local, el usuario actualizado sigue en memoria
      }
      return usuarioActualizado;
    } catch {
      return null;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    tokenRef.current = null;
    refreshTokenRef.current = null;
    AsyncStorage.removeItem(STORAGE_KEY_TOKEN).catch(() => {});
    AsyncStorage.removeItem(STORAGE_KEY_REFRESH).catch(() => {});
    AsyncStorage.removeItem(STORAGE_KEY_USER).catch(() => {});
  };

  // ─── Interceptor global de axios: refresh automático en 401 ─────────────────
  // Se registra UNA sola vez. Usa refs para siempre ver el token más actual
  // sin necesidad de re-suscribirse cada vez que cambia el estado.
  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        const requestUrl = String(originalRequest?.url ?? '');

        // Los propios endpoints de autenticación nunca deben intentar renovarse:
        // si /auth/refresh responde 401 y vuelve a entrar aquí, se produce una
        // espera circular que deja cualquier formulario cargando para siempre.
        if (
          !originalRequest
          || !shouldAttemptTokenRefresh(
            error.response?.status,
            requestUrl,
            Boolean(originalRequest._retry),
          )
        ) {
          return Promise.reject(error);
        }

        originalRequest._retry = true;

        // Si ya hay un refresh en curso, esta petición espera a que termine
        // en lugar de disparar otro refresh en paralelo.
        if (isRefreshingRef.current) {
          return new Promise((resolve, reject) => {
            refreshSubscribersRef.current.push({
              resolve: (newToken: string) => {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                resolve(axios(originalRequest));
              },
              reject,
            });
          });
        }

        isRefreshingRef.current = true;

        try {
          // Releemos el refresh_token directo de AsyncStorage (no solo la ref en memoria).
          // Supabase rota el refresh_token cada vez que se usa: si otra pestaña/sesión
          // ya lo refrescó mientras tanto, la ref en memoria de esta instancia quedaría
          // desactualizada y el refresh fallaría con un token ya invalidado.
          const freshRefreshToken = (await AsyncStorage.getItem(STORAGE_KEY_REFRESH)) ?? refreshTokenRef.current;

          if (!freshRefreshToken) {
            throw new Error('No hay refresh_token disponible');
          }

          const refreshResponse = await axios.post(`${API_URL}/auth/refresh`, {
            refresh_token: freshRefreshToken,
          });

          const newAccessToken = refreshResponse.data.access_token;
          const newRefreshToken = refreshResponse.data.refresh_token;

          tokenRef.current = newAccessToken;
          refreshTokenRef.current = newRefreshToken;
          setToken(newAccessToken);

          await AsyncStorage.setItem(STORAGE_KEY_TOKEN, newAccessToken);
          if (newRefreshToken) {
            await AsyncStorage.setItem(STORAGE_KEY_REFRESH, newRefreshToken);
          }

          // Avisamos a todas las peticiones que esperaban este refresh
          refreshSubscribersRef.current.forEach((subscriber) => {
            subscriber.resolve(newAccessToken);
          });
          refreshSubscribersRef.current = [];

          // Reintentamos la petición original con el token nuevo
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return axios(originalRequest);
        } catch (refreshError) {
          // El refresh_token también expiró — la sesión realmente terminó.
          // Limpiamos todo y dejamos que la app redirija a login de forma natural
          // (isLoggedIn pasará a false).
          refreshSubscribersRef.current.forEach((subscriber) => {
            subscriber.reject(refreshError);
          });
          refreshSubscribersRef.current = [];
          logout();
          return Promise.reject(refreshError);
        } finally {
          isRefreshingRef.current = false;
        }
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptorId);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoggedIn: !!user, isLoading, login, register, setSession, refreshUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
