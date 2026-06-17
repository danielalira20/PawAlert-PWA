
// API endpoint URLs
import { Platform } from 'react-native'

const DEV_URL = Platform.select({
  ios: 'http://192.168.56.1:8000',
  android: 'http://10.0.2.2:8000',
  default: 'http://localhost:8000'
})

const PROD_URL = '' // url for production environment

export const API_URL = __DEV__ ? DEV_URL : PROD_URL