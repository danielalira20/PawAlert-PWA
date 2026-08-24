// Service Worker unificado: shell PWA, sincronización offline y Firebase Messaging.
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const CACHE_NAME = 'pawalert-shell-v1';
const DB_NAME = 'pawalert-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-reports';
const SYNC_TAG = 'pawalert-sync-reports';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['/'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match('/')),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      if (cached) return cached;
      return network.catch(() => new Response('', {
        status: 503,
        statusText: 'Sin conexión y recurso no disponible en caché',
      }));
    }),
  );
});

function openQueueDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getQueuedReports() {
  const database = await openQueueDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function saveQueuedReport(report) {
  const database = await openQueueDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(report);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteQueuedReport(id) {
  const database = await openQueueDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function syncQueuedReports() {
  const reports = await getQueuedReports();
  let shouldRetry = false;
  for (const report of reports) {
    if (report.status === 'duplicate') continue;
    try {
      const body = new FormData();
      report.entries.forEach(([key, value]) => body.append(key, value));
      const response = await fetch(report.endpoint, {
        method: 'POST',
        body,
        headers: report.authorization ? { Authorization: report.authorization } : undefined,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const responseData = await response.clone().json().catch(() => null);
      if (responseData?.posible_duplicado) {
        await saveQueuedReport({
          ...report,
          status: 'duplicate',
          attempts: (report.attempts || 0) + 1,
          updatedAt: new Date().toISOString(),
          lastError: undefined,
          duplicateReportId: responseData.reporte_existente?.id,
          duplicateScenario: responseData.escenario === 2 ? 2 : 1,
        });
        continue;
      }
      await deleteQueuedReport(report.id);
    } catch (error) {
      shouldRetry = true;
      await saveQueuedReport({
        ...report,
        status: 'failed',
        attempts: (report.attempts || 0) + 1,
        updatedAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : 'No se pudo sincronizar',
      });
    }
  }
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'PAWALERT_QUEUE_UPDATED' }));
  if (shouldRetry) throw new Error('pending_reports_remain');
}

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(syncQueuedReports());
});

const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

const messaging = firebaseConfig.projectId
  ? (firebase.initializeApp(firebaseConfig), firebase.messaging())
  : null;

messaging?.onBackgroundMessage(function(payload) {
  const notificationTitle = payload.notification?.title || 'PawAlert';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.mensaje || 'Tienes una actualización.',
    icon: '/favicon.png',
    data: {
      url: payload.data?.reporte_id ? '/notificaciones' : '/',
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});
