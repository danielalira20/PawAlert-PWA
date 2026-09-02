import { EventTheme } from '../constants/eventTheme';
import {
  EVENT_STATE_META,
  EVENT_TYPE_META,
  formatEventCost,
  formatEventDate,
  formatEventSchedule,
  isEventImageUrlExpired,
} from '../utils/eventFormatters';

describe('eventFormatters', () => {
  it('presenta fechas y horarios usando la zona del evento', () => {
    const start = '2026-09-15T16:00:00+00:00';
    const end = '2026-09-15T18:00:00+00:00';

    expect(formatEventDate(start, 'America/Mexico_City')).toContain(
      '15 de septiembre de 2026',
    );
    expect(formatEventSchedule(start, end, 'America/Mexico_City')).toContain(
      '10:00–12:00',
    );
  });

  it('diferencia eventos gratuitos, con costo y por confirmar', () => {
    expect(formatEventCost(true, 0)).toBe('Gratuito');
    expect(formatEventCost(false, 12550)).toContain('$125.50');
    expect(formatEventCost(false, null)).toBe('Costo por confirmar');
  });

  it('trata fechas inválidas con un texto seguro para la interfaz', () => {
    expect(formatEventDate('fecha-invalida', 'America/Mexico_City')).toBe(
      'Fecha por confirmar',
    );
  });

  it('detecta expiración de imágenes firmadas', () => {
    const now = new Date('2026-08-30T20:00:00+00:00');

    expect(isEventImageUrlExpired('2026-08-30T19:59:00+00:00', now)).toBe(
      true,
    );
    expect(isEventImageUrlExpired('2026-08-30T20:01:00+00:00', now)).toBe(
      false,
    );
    expect(isEventImageUrlExpired(null, now)).toBe(false);
  });

  it('mantiene estados y tipos dentro de la identidad cálida existente', () => {
    expect(EVENT_TYPE_META.feria_adopcion.color).toBe(
      EventTheme.colors.primaryDark,
    );
    expect(EVENT_STATE_META.publicado.color).toBe('#347D78');
    expect(EVENT_STATE_META.suspendido_admin.color).toBe(
      EventTheme.colors.danger,
    );
    expect(EventTheme.typography.bold).toBe('Poppins_700Bold');
    expect(EventTheme.layout.maxContentWidth).toBe(900);
  });
});

