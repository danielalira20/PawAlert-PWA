import axios from 'axios';

import { API_URL } from '../constants/api';
import {
  EventApiError,
  cancelAssociationEvent,
  createAssociationEvent,
  createEventIdempotencyKey,
  listAdminEventIncidents,
  listMapEvents,
  normalizeEventApiError,
  unsaveEvent,
} from '../services/eventService';

jest.mock('axios');
jest.mock('expo-crypto', () => ({
  randomUUID: () => '12345678-1234-4234-9234-123456789012',
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('eventService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consulta el mapa público con filtros sin enviar autenticación', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });

    await listMapEvents({
      tipo: 'vacunacion',
      municipio: 'Puebla',
      limite: 50,
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(`${API_URL}/events/map`, {
      params: {
        tipo: 'vacunacion',
        municipio: 'Puebla',
        limite: 50,
      },
    });
  });

  it('crea un borrador con el token y el contrato esperado', async () => {
    const body = {
      datos: { titulo: 'Jornada comunitaria' },
      idempotency_key: 'event-create-test-001',
    };
    mockedAxios.post.mockResolvedValueOnce({
      data: { id: 'event-1', estado: 'borrador' },
    });

    await createAssociationEvent('token-asociacion', body);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${API_URL}/associations/me/events`,
      body,
      { headers: { Authorization: 'Bearer token-asociacion' } },
    );
  });

  it('conserva el cuerpo idempotente en operaciones DELETE', async () => {
    const action = { idempotency_key: 'event-unsave-test-001' };
    mockedAxios.delete.mockResolvedValueOnce({
      data: { evento_id: 'event-1', guardado: false },
    });

    await unsaveEvent('token-reportante', 'event-1', action);

    expect(mockedAxios.delete).toHaveBeenCalledWith(
      `${API_URL}/events/event-1/save`,
      {
        headers: { Authorization: 'Bearer token-reportante' },
        data: action,
      },
    );
  });

  it('conecta cancelación e incidentes administrativos a sus rutas reales', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: {} });
    mockedAxios.get.mockResolvedValueOnce({ data: { items: [] } });

    await cancelAssociationEvent('token-asociacion', 'event-1', {
      motivo_publico: 'El recinto ya no se encuentra disponible.',
      idempotency_key: 'event-cancel-test-001',
    });
    await listAdminEventIncidents('token-admin', {
      estado: 'pendiente',
      evento_id: 'event-1',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${API_URL}/associations/me/events/event-1/cancel`,
      expect.objectContaining({ motivo_publico: expect.any(String) }),
      { headers: { Authorization: 'Bearer token-asociacion' } },
    );
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${API_URL}/admin/events/incidents`,
      {
        params: { estado: 'pendiente', evento_id: 'event-1' },
        headers: { Authorization: 'Bearer token-admin' },
      },
    );
  });

  it('genera claves legibles y suficientemente únicas por operación', () => {
    expect(createEventIdempotencyKey('publish', 'event-1')).toBe(
      'event:publish:event-1:12345678-1234-4234-9234-123456789012',
    );
  });

  it('rechaza localmente una operación protegida sin token', async () => {
    await expect(
      createAssociationEvent('', {
        datos: {},
        idempotency_key: 'event-create-test-002',
      }),
    ).rejects.toMatchObject({ status: 401, message: 'Inicia sesión para continuar.' });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('normaliza errores del backend sin exponer detalles técnicos', () => {
    (mockedAxios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
    const normalized = normalizeEventApiError({
      response: {
        status: 409,
        data: { detail: 'Ya tienes un reporte abierto para este evento.' },
      },
    });

    expect(normalized).toBeInstanceOf(EventApiError);
    expect(normalized.status).toBe(409);
    expect(normalized.message).toBe(
      'Ya tienes un reporte abierto para este evento.',
    );
  });
});

