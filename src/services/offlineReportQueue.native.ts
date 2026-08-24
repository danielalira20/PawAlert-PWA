import type {
  PendingReport,
  QueueReportOptions,
  QueueSyncResult,
} from './offlineReportQueue';

export function isOfflineError(): boolean {
  return false;
}

export async function queueReport(_options: QueueReportOptions): Promise<PendingReport> {
  throw new Error('offline_queue_web_only');
}

export async function listPendingReports(): Promise<PendingReport[]> {
  return [];
}

export async function retryPendingReports(): Promise<QueueSyncResult> {
  return { synced: 0, failed: 0 };
}

export async function removePendingReport(_id: string): Promise<void> {}

export async function resolvePendingDuplicate(_id: string, _action: 'link' | 'new'): Promise<boolean> {
  return false;
}

export function watchPendingReports(_listener: () => void): () => void {
  return () => undefined;
}
