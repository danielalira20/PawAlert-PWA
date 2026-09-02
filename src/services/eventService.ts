import axios from 'axios';
import * as Crypto from 'expo-crypto';

import { API_URL } from '../constants/api';
import type {
  EventAction,
  EventAdminIncidentFilters,
  EventAdminIncidentPage,
  EventAdminRestore,
  EventAdminSuspend,
  EventAssociationFilters,
  EventAssociationView,
  EventCancel,
  EventDraftCreate,
  EventImageOperationResponse,
  EventMapFilters,
  EventMapItem,
  EventOperationResponse,
  EventPause,
  EventPublicDetail,
  EventPublicFilters,
  EventPublicPage,
  EventReportCreate,
  EventReportResponse,
  EventSavedOperationResponse,
  EventSavedView,
  EventUpdate,
} from '../types/event';

export type EventOperationName =
  | 'create'
  | 'update'
  | 'image'
  | 'remove-image'
  | 'publish'
  | 'pause'
  | 'cancel'
  | 'save'
  | 'unsave'
  | 'report'
  | 'suspend'
  | 'restore';

export class EventApiError extends Error {
  readonly status: number | null;
  readonly detail: unknown;

  constructor(message: string, status: number | null, detail?: unknown) {
    super(message);
    this.name = 'EventApiError';
    this.status = status;
    this.detail = detail;
  }
}

function detailMessage(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (!Array.isArray(detail)) return null;

  const messages = detail
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const validation = item as { loc?: unknown; msg?: unknown };
      const message =
        typeof validation.msg === 'string'
          ? validation.msg.replace(/^Value error,\s*/i, '')
          : null;
      if (!message) return null;
      const field = Array.isArray(validation.loc)
        ? validation.loc.filter((part) => part !== 'body').join('.')
        : '';
      return field ? `${field}: ${message}` : message;
    })
    .filter((message): message is string => Boolean(message));

  return messages.length ? messages.join('\n') : null;
}

export function normalizeEventApiError(error: unknown): EventApiError {
  if (error instanceof EventApiError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? null;
    const detail = error.response?.data?.detail;
    const message =
      detailMessage(detail) ??
      (status === 401
        ? 'Tu sesión expiró. Inicia sesión nuevamente.'
        : status === 403
          ? 'No tienes permisos para realizar esta acción.'
          : status === 404
            ? 'El evento ya no está disponible.'
            : 'No se pudo completar la operación de eventos. Intenta nuevamente.');
    return new EventApiError(message, status, detail);
  }
  return new EventApiError(
    'No se pudo completar la operación de eventos. Intenta nuevamente.',
    null,
  );
}

async function eventRequest<T>(request: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await request()).data;
  } catch (error) {
    throw normalizeEventApiError(error);
  }
}

function authHeaders(token: string) {
  if (!token.trim()) {
    throw new EventApiError('Inicia sesión para continuar.', 401);
  }
  return { Authorization: `Bearer ${token}` };
}

export function createEventIdempotencyKey(
  operation: EventOperationName,
  eventId = 'new',
): string {
  // La pantalla debe conservar esta clave mientras reintenta la misma acción;
  // solo una intención nueva debe solicitar otra clave.
  return `event:${operation}:${eventId}:${Crypto.randomUUID()}`;
}

export function listPublicEvents(
  filters: EventPublicFilters = {},
): Promise<EventPublicPage> {
  return eventRequest(() =>
    axios.get<EventPublicPage>(`${API_URL}/events`, { params: filters }),
  );
}

export function listMapEvents(
  filters: EventMapFilters = {},
): Promise<EventMapItem[]> {
  return eventRequest(() =>
    axios.get<EventMapItem[]>(`${API_URL}/events/map`, { params: filters }),
  );
}

export function getPublicEvent(eventId: string): Promise<EventPublicDetail> {
  return eventRequest(() =>
    axios.get<EventPublicDetail>(`${API_URL}/events/${eventId}`),
  );
}

export function listAssociationEvents(
  token: string,
  filters: EventAssociationFilters = {},
): Promise<EventAssociationView[]> {
  return eventRequest(() =>
    axios.get<EventAssociationView[]>(`${API_URL}/associations/me/events`, {
      params: filters,
      headers: authHeaders(token),
    }),
  );
}

export function createAssociationEvent(
  token: string,
  body: EventDraftCreate,
): Promise<EventOperationResponse> {
  return eventRequest(() =>
    axios.post<EventOperationResponse>(
      `${API_URL}/associations/me/events`,
      body,
      { headers: authHeaders(token) },
    ),
  );
}

export function updateAssociationEvent(
  token: string,
  eventId: string,
  body: EventUpdate,
): Promise<EventOperationResponse> {
  return eventRequest(() =>
    axios.patch<EventOperationResponse>(
      `${API_URL}/associations/me/events/${eventId}`,
      body,
      { headers: authHeaders(token) },
    ),
  );
}

export function replaceAssociationEventImage(
  token: string,
  eventId: string,
  formData: FormData,
): Promise<EventImageOperationResponse> {
  return eventRequest(() =>
    axios.put<EventImageOperationResponse>(
      `${API_URL}/associations/me/events/${eventId}/image`,
      formData,
      {
        headers: {
          ...authHeaders(token),
          'Content-Type': 'multipart/form-data',
        },
      },
    ),
  );
}

export function removeAssociationEventImage(
  token: string,
  eventId: string,
  body: EventAction,
): Promise<EventImageOperationResponse> {
  return eventRequest(() =>
    axios.delete<EventImageOperationResponse>(
      `${API_URL}/associations/me/events/${eventId}/image`,
      { headers: authHeaders(token), data: body },
    ),
  );
}

export function publishAssociationEvent(
  token: string,
  eventId: string,
  body: EventAction,
): Promise<EventOperationResponse> {
  return eventRequest(() =>
    axios.post<EventOperationResponse>(
      `${API_URL}/associations/me/events/${eventId}/publish`,
      body,
      { headers: authHeaders(token) },
    ),
  );
}

export function pauseAssociationEvent(
  token: string,
  eventId: string,
  body: EventPause,
): Promise<EventOperationResponse> {
  return eventRequest(() =>
    axios.post<EventOperationResponse>(
      `${API_URL}/associations/me/events/${eventId}/pause`,
      body,
      { headers: authHeaders(token) },
    ),
  );
}

export function cancelAssociationEvent(
  token: string,
  eventId: string,
  body: EventCancel,
): Promise<EventOperationResponse> {
  return eventRequest(() =>
    axios.post<EventOperationResponse>(
      `${API_URL}/associations/me/events/${eventId}/cancel`,
      body,
      { headers: authHeaders(token) },
    ),
  );
}

export function saveEvent(
  token: string,
  eventId: string,
  body: EventAction,
): Promise<EventSavedOperationResponse> {
  return eventRequest(() =>
    axios.post<EventSavedOperationResponse>(
      `${API_URL}/events/${eventId}/save`,
      body,
      { headers: authHeaders(token) },
    ),
  );
}

export function unsaveEvent(
  token: string,
  eventId: string,
  body: EventAction,
): Promise<EventSavedOperationResponse> {
  return eventRequest(() =>
    axios.delete<EventSavedOperationResponse>(
      `${API_URL}/events/${eventId}/save`,
      { headers: authHeaders(token), data: body },
    ),
  );
}

export function listSavedEvents(
  token: string,
  limit = 100,
): Promise<EventSavedView[]> {
  return eventRequest(() =>
    axios.get<EventSavedView[]>(`${API_URL}/me/saved-events`, {
      params: { limite: limit },
      headers: authHeaders(token),
    }),
  );
}

export function reportEvent(
  token: string,
  eventId: string,
  body: EventReportCreate,
): Promise<EventReportResponse> {
  return eventRequest(() =>
    axios.post<EventReportResponse>(
      `${API_URL}/events/${eventId}/report`,
      body,
      { headers: authHeaders(token) },
    ),
  );
}

export function listAdminEventIncidents(
  token: string,
  filters: EventAdminIncidentFilters = {},
): Promise<EventAdminIncidentPage> {
  return eventRequest(() =>
    axios.get<EventAdminIncidentPage>(`${API_URL}/admin/events/incidents`, {
      params: filters,
      headers: authHeaders(token),
    }),
  );
}

export function suspendEventAsAdmin(
  token: string,
  eventId: string,
  body: EventAdminSuspend,
): Promise<EventOperationResponse> {
  return eventRequest(() =>
    axios.post<EventOperationResponse>(
      `${API_URL}/admin/events/${eventId}/suspend`,
      body,
      { headers: authHeaders(token) },
    ),
  );
}

export function restoreEventAsAdmin(
  token: string,
  eventId: string,
  body: EventAdminRestore,
): Promise<EventOperationResponse> {
  return eventRequest(() =>
    axios.post<EventOperationResponse>(
      `${API_URL}/admin/events/${eventId}/restore`,
      body,
      { headers: authHeaders(token) },
    ),
  );
}
