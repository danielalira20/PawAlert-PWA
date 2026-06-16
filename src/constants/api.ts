
// API endpoint URLs
import { Platform } from 'react-native'

const DEV_URL = Platform.select({
  ios: 'http://192.168.100.9:8000',
  android: 'http://192.168.100.9:8000',
  default: 'http://localhost:8000'
})

const PROD_URL = '' // url for production environment

export const API_URL = __DEV__ ? DEV_URL : PROD_URL