import type {
  EventAccessMode,
  EventCapacityState,
  EventReportReason,
  EventReportState,
  EventState,
  EventType,
} from '../types/event';
import { EventTheme } from '../constants/eventTheme';

export interface EventVisualMeta {
  label: string;
  color: string;
  backgroundColor: string;
  icon: string;
}

export const EVENT_TYPE_META: Record<EventType, EventVisualMeta> = {
  vacunacion: {
    label: 'Vacunación',
    color: '#347D78',
    backgroundColor: '#E3F4F2',
    icon: 'medkit-outline',
  },
  esterilizacion: {
    label: 'Esterilización',
    color: '#347D78',
    backgroundColor: '#E3F4F2',
    icon: 'fitness-outline',
  },
  feria_adopcion: {
    label: 'Feria de adopción',
    color: EventTheme.colors.primaryDark,
    backgroundColor: '#FFF0E2',
    icon: 'paw-outline',
  },
  identificacion: {
    label: 'Identificación',
    color: '#7A5AA6',
    backgroundColor: '#F1EAF8',
    icon: 'qr-code-outline',
  },
  acopio: {
    label: 'Centro de acopio',
    color: '#A06C24',
    backgroundColor: '#FFF4D8',
    icon: 'cube-outline',
  },
  capacitacion: {
    label: 'Capacitación',
    color: '#2E6FA8',
    backgroundColor: '#EAF4FF',
    icon: 'school-outline',
  },
  bienestar_animal: {
    label: 'Bienestar animal',
    color: '#347D78',
    backgroundColor: '#E3F4F2',
    icon: 'heart-outline',
  },
  otro: {
    label: 'Otro evento',
    color: EventTheme.colors.textMuted,
    backgroundColor: EventTheme.colors.surfaceWarm,
    icon: 'calendar-outline',
  },
};

export const EVENT_STATE_META: Record<EventState, EventVisualMeta> = {
  borrador: {
    label: 'Borrador',
    color: EventTheme.colors.textMuted,
    backgroundColor: '#EFE9E2',
    icon: 'document-text-outline',
  },
  publicado: {
    label: 'Publicado',
    color: '#347D78',
    backgroundColor: '#E3F4F2',
    icon: 'checkmark-circle-outline',
  },
  pausado: {
    label: 'Pausado',
    color: '#8C6818',
    backgroundColor: '#FFF4D8',
    icon: 'pause-circle-outline',
  },
  cancelado: {
    label: 'Cancelado',
    color: EventTheme.colors.danger,
    backgroundColor: '#FCE8E4',
    icon: 'close-circle-outline',
  },
  finalizado: {
    label: 'Finalizado',
    color: '#5D6B78',
    backgroundColor: '#EAF0F4',
    icon: 'flag-outline',
  },
  archivado: {
    label: 'Archivado',
    color: EventTheme.colors.textFaint,
    backgroundColor: '#F1EDE8',
    icon: 'archive-outline',
  },
  suspendido_admin: {
    label: 'Suspendido por administración',
    color: EventTheme.colors.danger,
    backgroundColor: '#FCE8E4',
    icon: 'shield-outline',
  },
};

export const EVENT_CAPACITY_META: Record<EventCapacityState, EventVisualMeta> = {
  no_aplica: {
    label: 'Sin límite informado',
    color: EventTheme.colors.textMuted,
    backgroundColor: '#EFE9E2',
    icon: 'people-outline',
  },
  disponible: {
    label: 'Cupo disponible',
    color: '#347D78',
    backgroundColor: '#E3F4F2',
    icon: 'people-circle-outline',
  },
  agotado: {
    label: 'Cupo agotado',
    color: EventTheme.colors.danger,
    backgroundColor: '#FCE8E4',
    icon: 'remove-circle-outline',
  },
};

export const EVENT_ACCESS_LABELS: Record<EventAccessMode, string> = {
  sin_registro: 'Acceso sin registro',
  registro_externo: 'Registro en sitio externo',
  contacto_institucional: 'Registro con la asociación',
};

export const EVENT_REPORT_REASON_LABELS: Record<EventReportReason, string> = {
  informacion_falsa: 'Información falsa',
  servicio_riesgoso: 'Servicio riesgoso',
  ubicacion_incorrecta: 'Ubicación incorrecta',
  cobro_no_informado: 'Cobro no informado',
  otro: 'Otro motivo',
};

export const EVENT_REPORT_STATE_LABELS: Record<EventReportState, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  requiere_informacion: 'Requiere información',
  resuelto: 'Resuelto',
  descartado: 'Descartado',
};

function asDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateParts(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(value);
}

export function formatEventDate(
  value: string | Date,
  timeZone: string,
): string {
  const date = asDate(value);
  if (!date) return 'Fecha por confirmar';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatEventTime(
  value: string | Date,
  timeZone: string,
): string {
  const date = asDate(value);
  if (!date) return '--:--';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatEventSchedule(
  startsAt: string | Date,
  endsAt: string | Date,
  timeZone: string,
): string {
  const start = asDate(startsAt);
  const end = asDate(endsAt);
  if (!start || !end) return 'Horario por confirmar';

  const startDate = formatEventDate(start, timeZone);
  if (dateParts(start, timeZone) === dateParts(end, timeZone)) {
    return `${startDate} · ${formatEventTime(start, timeZone)}–${formatEventTime(end, timeZone)}`;
  }
  return `${startDate}, ${formatEventTime(start, timeZone)} – ${formatEventDate(end, timeZone)}, ${formatEventTime(end, timeZone)}`;
}

export function formatEventCost(
  isFree: boolean | null | undefined,
  costInCents: number | null | undefined,
  currency = 'MXN',
): string {
  if (isFree === true) return 'Gratuito';
  if (costInCents == null) return 'Costo por confirmar';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: costInCents % 100 === 0 ? 0 : 2,
  }).format(costInCents / 100);
}

export function isEventImageUrlExpired(
  expiresAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (!expiresAt) return false;
  const expiration = asDate(expiresAt);
  return expiration ? expiration.getTime() <= now.getTime() : true;
}

