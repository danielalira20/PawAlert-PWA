import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import {
  fetchCurrentUser,
  shouldAttemptTokenRefresh,
  shouldSyncGoogleSession,
} from '../context/AuthContext';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const STORAGE_KEY_TOKEN = '@pawalert_token';
const STORAGE_KEY_USER = '@pawalert_user';

const usuarioMock = {
  id: 'user-123',
  nombre: 'Juan',
  apellido_paterno: 'Pérez',
  email: 'juan@test.com',
  telefono: '5512345678',
};

describe('AuthContext — comportamiento de login/logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('login llama al endpoint correcto y guarda token en AsyncStorage', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'token-abc', usuario: usuarioMock },
    });

    const res = await axios.post('/auth/login', { email: 'juan@test.com', password: 'Segura123' });
    await AsyncStorage.setItem(STORAGE_KEY_TOKEN, res.data.access_token);
    await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(res.data.usuario));

    expect(mockedAxios.post).toHaveBeenCalledWith('/auth/login', {
      email: 'juan@test.com',
      password: 'Segura123',
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY_TOKEN, 'token-abc');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY_USER, JSON.stringify(usuarioMock));
  });

  it('login devuelve los datos del usuario', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'token-abc', usuario: usuarioMock },
    });

    const res = await axios.post('/auth/login', { email: 'juan@test.com', password: 'Segura123' });

    expect(res.data.access_token).toBe('token-abc');
    expect(res.data.usuario.nombre).toBe('Juan');
  });

  it('logout limpia token y usuario de AsyncStorage', async () => {
    await AsyncStorage.removeItem(STORAGE_KEY_TOKEN);
    await AsyncStorage.removeItem(STORAGE_KEY_USER);

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY_TOKEN);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY_USER);
  });

  it('no intenta renovar nuevamente cuando falla /auth/refresh', () => {
    expect(
      shouldAttemptTokenRefresh(401, 'http://localhost:8000/auth/refresh', false),
    ).toBe(false);
  });

  it('sí intenta renovar una petición protegida con sesión vencida', () => {
    expect(
      shouldAttemptTokenRefresh(
        401,
        'http://localhost:8000/voluntarios/externo/postular',
        false,
      ),
    ).toBe(true);
  });

  it('consulta el usuario vigente para actualizar un rol almacenado', async () => {
    const usuarioActualizado = {
      ...usuarioMock,
      rol: 'voluntario_interno',
    };
    mockedAxios.get.mockResolvedValueOnce({ data: usuarioActualizado });

    const resultado = await fetchCurrentUser('token-abc');

    expect(resultado.rol).toBe('voluntario_interno');
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/users/me'),
      { headers: { Authorization: 'Bearer token-abc' } },
    );
  });

  it('sincroniza Google al restaurar la sesión después del redirect', () => {
    expect(
      shouldSyncGoogleSession('INITIAL_SESSION', 'google-token', null, null),
    ).toBe(true);
  });

  it('no duplica la sincronización si Supabase repite el evento', () => {
    expect(
      shouldSyncGoogleSession('SIGNED_IN', 'google-token', null, 'google-token'),
    ).toBe(false);
    expect(
      shouldSyncGoogleSession('SIGNED_IN', 'google-token', 'google-token', null),
    ).toBe(false);
  });
});
