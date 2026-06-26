// API endpoint URLs
//
// Mientras no tengamos el backend desplegado (Railway, pendiente para el sábado),
// el backend corre LOCALMENTE en la laptop de quien lo esté probando.
// Para que el resto del equipo pueda conectarse a ese backend desde su teléfono
// o desde su propio navegador, hay que apuntar a la IP de RED LOCAL de esa laptop
// (no "localhost", porque localhost solo significa "esta misma laptop").
//
// PASOS PARA ACTUALIZAR ESTE ARCHIVO:
// 1. La persona que va a correr el backend (uvicorn) obtiene su IP local:
//      Mac:     ipconfig getifaddr en0
//      Windows: ipconfig  (buscar "Dirección IPv4" del adaptador WiFi activo)
// 2. Esa persona comparte esa IP con el equipo (ej. por WhatsApp).
// 3. TODOS (incluyendo quien corre el backend) reemplazan el valor de LOCAL_IP
//    abajo con esa IP compartida.
// 4. Todos deben estar conectados a la MISMA red WiFi que la laptop del backend.
// 5. Si la laptop del backend se desconecta/reconecta de la red, la IP puede
//    cambiar — hay que repetir el paso 1 y volver a compartir.
//
// Esto es temporal: cuando el backend esté en Railway (este sábado), este
// archivo se simplifica a una sola URL pública que ya no cambia.

import { Platform } from 'react-native'

const LOCAL_IP = '192.168.100.9'

const DEV_URL = Platform.select({
  ios: `http://${LOCAL_IP}:8000`,
  android: `http://${LOCAL_IP}:8000`,
  default: 'http://localhost:8000'
})

const PROD_URL = 'https://pawalert-pwa-production.up.railway.app'

//export const API_URL = __DEV__ ? DEV_URL : PROD_URL
export const API_URL = PROD_URL // forzar Railway para demo
// export const API_URL = __DEV__ ? DEV_URL : PROD_URL