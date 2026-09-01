export type PendingReportStatus = 'pending' | 'syncing' | 'failed' | 'duplicate';

export interface PendingReport {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: PendingReportStatus;
  attempts: number;
  lastError?: string;
  animalSummary: string;
  photoCount: number;
  duplicateReportId?: string;
  duplicateScenario?: 1 | 2;
}

export interface QueueReportOptions {
  endpoint: string;
  formData: FormData;
  authorization?: string;
  animalSummary: string;
  photoCount: number;
}

export interface QueueSyncResult {
  synced: number;
  failed: number;
}

export function isOfflineError(error: unknown): boolean;
export function queueReport(options: QueueReportOptions): Promise<PendingReport>;
export function listPendingReports(): Promise<PendingReport[]>;
export function retryPendingReports(): Promise<QueueSyncResult>;
export function removePendingReport(id: string): Promise<void>;
export function resolvePendingDuplicate(id: string, action: 'link' | 'new'): Promise<boolean>;
export function watchPendingReports(listener: () => void): () => void;
