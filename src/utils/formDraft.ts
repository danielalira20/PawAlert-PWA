export interface FormDraftEnvelope<T> {
  version: number;
  updatedAt: string;
  expiresAt: string;
  data: T;
}

export type ParsedFormDraft<T> =
  | { status: 'valid'; draft: FormDraftEnvelope<T> }
  | { status: 'expired' | 'invalid' };

export function createFormDraftEnvelope<T>(
  data: T,
  version: number,
  ttlMs: number,
  nowMs: number = Date.now(),
): FormDraftEnvelope<T> {
  return {
    version,
    updatedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    data,
  };
}

export function parseFormDraftEnvelope<T>(
  raw: string,
  expectedVersion: number,
  nowMs: number = Date.now(),
): ParsedFormDraft<T> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { status: 'invalid' };

    const candidate = parsed as Partial<FormDraftEnvelope<T>>;
    if (
      candidate.version !== expectedVersion
      || typeof candidate.updatedAt !== 'string'
      || typeof candidate.expiresAt !== 'string'
      || !('data' in candidate)
    ) {
      return { status: 'invalid' };
    }

    const expiresAtMs = new Date(candidate.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) return { status: 'invalid' };
    if (expiresAtMs <= nowMs) return { status: 'expired' };

    return {
      status: 'valid',
      draft: candidate as FormDraftEnvelope<T>,
    };
  } catch {
    return { status: 'invalid' };
  }
}
