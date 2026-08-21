# Contrato de similitud visual antifraude

Este contrato incorpora CLIP como una señal adicional de validación. No
reemplaza PostGIS, pHash, Gemini Vision, EXIF ni la revisión humana.

## Límites de esta fase

- Modelo inicial: `openai/clip-vit-base-patch32`.
- Dimensiones: 512.
- Proveedor inicial: Hugging Face desde el backend.
- La función inicia apagada mediante `CLIP_VALIDATION_ENABLED=false`.
- El token pertenece únicamente a Railway y nunca se expone en Expo o Vercel.
- Una caída del proveedor no rechaza, cierra ni marca como normal un reporte.
- CLIP mide similitud; no certifica fraude ni identidad del animal.

## Umbrales provisionales

- Menor a `CLIP_GRAY_THRESHOLD`: señal baja.
- Desde `CLIP_GRAY_THRESHOLD` y menor a `CLIP_HIGH_THRESHOLD`: zona gris.
- Desde `CLIP_HIGH_THRESHOLD`: similitud alta y revisión manual.

Los valores iniciales `0.88` y `0.94` son configurables y deben calibrarse
antes de habilitar la decisión operativa. Todas las comparaciones deben usar
el mismo modelo y versión.

## Combinación aprobada

| PostGIS | pHash | CLIP | Resultado futuro |
| --- | --- | --- | --- |
| Sí | Sí | Alta | Revisión manual prioritaria |
| Sí | No | Alta | Revisión manual por posible duplicado |
| No | Sí | Cualquiera | Revisión manual por fotografía repetida |
| No | No | Alta | Revisión manual por similitud visual |
| No | No | Media | Zona gris por 15 minutos |
| No | No | Baja | Sin bloqueo adicional por CLIP |
| Cualquiera | No | No disponible | Continuar y registrar fallo técnico |

La activación automática a los 15 minutos solo podrá ocurrir cuando la única
causa pendiente sea `clip_zona_gris`. Alertas de pHash, EXIF, Gemini, Trust
Score o CLIP alto siempre requieren una resolución explícita.

## Orden de integración

1. Crear persistencia pgvector y RPC privada.
2. Implementar el cliente de Hugging Face con timeout y degradación segura.
3. Generar y guardar embeddings después del saneamiento de la fotografía.
4. Consultar coincidencias sin incluir fotografías del mismo reporte.
5. Integrar la combinación en la compuerta única de validación.
6. Exponer las coincidencias en moderación y agregar el vencimiento idempotente.

Hasta completar el punto 5, estos contratos no modifican el flujo vigente.
