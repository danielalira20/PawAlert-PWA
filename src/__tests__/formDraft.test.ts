import {
  createFormDraftEnvelope,
  parseFormDraftEnvelope,
} from '../utils/formDraft';

describe('borradores de formulario', () => {
  const now = Date.parse('2026-08-18T12:00:00.000Z');

  it('crea y recupera un borrador vigente de la versión esperada', () => {
    const envelope = createFormDraftEnvelope(
      { paso: 2, nombre: 'Dani' },
      1,
      60_000,
      now,
    );

    const parsed = parseFormDraftEnvelope<typeof envelope.data>(
      JSON.stringify(envelope),
      1,
      now + 30_000,
    );

    expect(parsed.status).toBe('valid');
    if (parsed.status === 'valid') {
      expect(parsed.draft.data).toEqual({ paso: 2, nombre: 'Dani' });
      expect(parsed.draft.updatedAt).toBe('2026-08-18T12:00:00.000Z');
    }
  });

  it('descarta borradores vencidos, corruptos o de otra versión', () => {
    const envelope = createFormDraftEnvelope({ paso: 1 }, 1, 1_000, now);

    expect(
      parseFormDraftEnvelope(JSON.stringify(envelope), 1, now + 1_001).status,
    ).toBe('expired');
    expect(
      parseFormDraftEnvelope(JSON.stringify(envelope), 2, now).status,
    ).toBe('invalid');
    expect(parseFormDraftEnvelope('{mal json', 1, now).status).toBe('invalid');
  });
});
