import type {
  PendingReport,
  QueueReportOptions,
  QueueSyncResult,
} from './offlineReportQueue';

const DB_NAME = 'pawalert-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-reports';
const CHANGE_EVENT = 'pawalert:pending-reports-changed';
const SYNC_TAG = 'pawalert-sync-reports';

interface StoredReport extends PendingReport {
  endpoint: string;
  authorization?: string;
  entries: Array<[string, string | Blob]>;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

function announceChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

async function registerBackgroundSync() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const syncManager = (registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    }).sync;
    await syncManager?.register(SYNC_TAG);
  } catch {
    // Algunos navegadores no implementan Background Sync; el evento online
    // y el botón de reintento siguen cubriendo la recuperación.
  }
}

export function isOfflineError(error: unknown): boolean {
  if (!navigator.onLine) return true;
  const candidate = error as { response?: unknown; code?: string; message?: string };
  return !candidate?.response && (
    candidate?.code === 'ERR_NETWORK'
    || candidate?.message === 'Network Error'
    || error instanceof TypeError
  );
}

export async function queueReport(options: QueueReportOptions): Promise<PendingReport> {
  const now = new Date().toISOString();
  const report: StoredReport = {
    id: globalThis.crypto?.randomUUID?.() || `offline-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    attempts: 0,
    animalSummary: options.animalSummary,
    photoCount: options.photoCount,
    endpoint: options.endpoint,
    authorization: options.authorization,
    entries: Array.from(options.formData.entries()).map(([key, value]) => [key, value]),
  };
  await transact('readwrite', (store) => store.put(report));
  await registerBackgroundSync();
  announceChange();
  return report;
}

export async function listPendingReports(): Promise<PendingReport[]> {
  const reports = await transact<StoredReport[]>('readonly', (store) => store.getAll());
  return reports
    .map(({ endpoint: _endpoint, authorization: _authorization, entries: _entries, ...report }) => report)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function syncStoredReport(report: StoredReport): Promise<boolean> {
  const syncing: StoredReport = {
    ...report,
    status: 'syncing',
    attempts: report.attempts + 1,
    updatedAt: new Date().toISOString(),
    lastError: undefined,
  };
  await transact('readwrite', (store) => store.put(syncing));
  announceChange();

  try {
    const body = new FormData();
    syncing.entries.forEach(([key, value]) => body.append(key, value));
    const response = await fetch(syncing.endpoint, {
      method: 'POST',
      body,
      headers: syncing.authorization ? { Authorization: syncing.authorization } : undefined,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const responseData = await response.clone().json().catch(() => null);
    if (responseData?.posible_duplicado) {
      const duplicate: StoredReport = {
        ...syncing,
        status: 'duplicate',
        updatedAt: new Date().toISOString(),
        lastError: undefined,
        duplicateReportId: responseData.reporte_existente?.id,
        duplicateScenario: responseData.escenario === 2 ? 2 : 1,
      };
      await transact('readwrite', (store) => store.put(duplicate));
      announceChange();
      return false;
    }
    await transact('readwrite', (store) => store.delete(syncing.id));
    announceChange();
    return true;
  } catch (error) {
    const failed: StoredReport = {
      ...syncing,
      status: 'failed',
      updatedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : 'No se pudo sincronizar',
    };
    await transact('readwrite', (store) => store.put(failed));
    await registerBackgroundSync();
    announceChange();
    return false;
  }
}

export async function retryPendingReports(): Promise<QueueSyncResult> {
  if (!navigator.onLine) return { synced: 0, failed: 0 };
  const reports = await transact<StoredReport[]>('readonly', (store) => store.getAll());
  let synced = 0;
  let failed = 0;
  for (const report of reports) {
    if (report.status === 'duplicate') continue;
    if (await syncStoredReport(report)) synced += 1;
    else failed += 1;
  }
  return { synced, failed };
}

export async function removePendingReport(id: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(id));
  announceChange();
}

export async function resolvePendingDuplicate(id: string, action: 'link' | 'new'): Promise<boolean> {
  const report = await transact<StoredReport | undefined>('readonly', (store) => store.get(id));
  if (!report || report.status !== 'duplicate') return false;

  const entries = report.entries.filter(
    ([key]) => key !== 'es_duplicado_confirmado' && key !== 'reporte_original_id',
  );
  entries.push(['es_duplicado_confirmado', 'true']);
  if (action === 'link' && report.duplicateReportId) {
    entries.push(['reporte_original_id', report.duplicateReportId]);
  }

  const ready: StoredReport = {
    ...report,
    entries,
    status: 'pending',
    updatedAt: new Date().toISOString(),
    lastError: undefined,
    duplicateReportId: undefined,
    duplicateScenario: undefined,
  };
  await transact('readwrite', (store) => store.put(ready));
  announceChange();
  return syncStoredReport(ready);
}

export function watchPendingReports(listener: () => void): () => void {
  const onWorkerMessage = (event: MessageEvent) => {
    if (event.data?.type === 'PAWALERT_QUEUE_UPDATED') listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('online', listener);
  navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('online', listener);
    navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
  };
}
