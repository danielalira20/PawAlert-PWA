/** Un punto del recorrido de un caso: el reporte original, o un avistamiento
 * validado. Compartido entre las tres variantes de plataforma del mapa
 * (shim / .native / .web + Leaflet) para no arrastrar react-native-maps ni
 * react-leaflet a un archivo que no los necesita solo por el tipo. */
export interface PuntoRecorrido {
  latitud: number;
  longitud: number;
  esOrigen: boolean;
  esMasReciente: boolean;
  etiqueta: string;
}
