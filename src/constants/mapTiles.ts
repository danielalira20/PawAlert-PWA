const cartoApiKey = process.env.EXPO_PUBLIC_CARTO_API_KEY;

export const CARTO_LIGHT_TILE_URL = cartoApiKey
  ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoApiKey)}`
  : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
