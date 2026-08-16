// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Configuración predeterminada, se puede anular o instanciar de forma dinámica,
// pero debe estar presente para que el SW se inicialice correctamente.
const firebaseConfig = {
  // Los valores reales de apiKey, projectId, etc., deben ser configurados aquí
  // o inyectados al construir si es posible.
  // Nota: Estas credenciales públicas de Firebase Web pueden ser visibles.
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification ? payload.notification.title : 'PawAlert';
  const notificationOptions = {
    body: payload.notification ? payload.notification.body : '',
    icon: '/favicon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
