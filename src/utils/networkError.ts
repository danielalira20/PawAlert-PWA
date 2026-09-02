export function isNetworkUnavailable(error?: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const candidate = error as {
    code?: string;
    message?: string;
    response?: unknown;
    request?: unknown;
  } | undefined;
  return Boolean(
    candidate
    && !candidate.response
    && (
      candidate.code === 'ERR_NETWORK'
      || candidate.message === 'Network Error'
      || candidate.message === 'Failed to fetch'
      || candidate.request
    )
  );
}
