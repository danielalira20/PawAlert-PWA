// Se registra antes que Firebase para conservar el destino personalizado.
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async function() {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      if ('navigate' in existing) await existing.navigate(destination);
      return existing.focus();
    }
    return clients.openWindow(destination);
  })());
});
// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const eventId = payload.data?.evento_id;
  const eventType = payload.data?.tipo_evento;
  const eventTitle = payload.data?.titulo;
  const notificationTitle = payload.notification?.title
    || (eventType === 'evento_recordatorio_24h' ? 'Tu evento es mañana' : null)
    || (eventType === 'evento_finalizado' ? 'El evento ha finalizado' : null)
    || 'PawAlert';
  const notificationOptions = {
    body: payload.notification?.body
      || payload.data?.mensaje
      || eventTitle
      || 'Tienes una actualización.',
    icon: '/pawalert-icon-192.png',
    data: {
      url: eventId
        ? `/map?event_id=${encodeURIComponent(eventId)}`
        : payload.data?.reporte_id
          ? '/notificaciones'
          : '/',
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
