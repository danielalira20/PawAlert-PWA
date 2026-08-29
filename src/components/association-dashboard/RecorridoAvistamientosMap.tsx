// Metro (nativo) resuelve RecorridoAvistamientosMap.native.tsx automaticamente
// y nunca llega a este archivo. Web cae aqui, que reexporta la variante que
// carga Leaflet -- mismo patron que VisitSafetyMap.tsx en home-verification.
export { default } from './RecorridoAvistamientosMap.web';
