# Contrato de Cambios: Optimizaciones y Nuevas Características (Magui)


## Fase 1: Mejoras de Interfaz y UX Básicas

### 1. Detalle Ampliado de Asociación en el Mapa

**Objetivo:** 
Mostrar información más detallada ("Acerca de" y "Horario de Atención" de forma amigable) al seleccionar "Ver más" en una asociación desde el mapa, sin depender del formato JSON o texto plano de la base de datos de manera literal.

**Archivos Modificados:**
- `backend/app/api/associations.py`: 
  - Se modificó la consulta a Supabase en `get_associations` (endpoint `GET /associations`) para incluir el campo `acerca_de` en el `.select(...)`. 
  - Esto garantiza que el frontend reciba la descripción completa de cada asociación.
- `src/screens/LeafletMap.tsx`:
  - Se agregó la propiedad opcional `acerca_de?: string | null;` a la interfaz `AsociacionMapa` para asegurar la correcta tipificación en TypeScript.
- `src/screens/MapScreen.web.tsx`:
  - Se actualizó la función `renderAsociacionDetail()`.
  - El campo `horario_atencion` ahora se divide inteligentemente (por comas, punto y coma o saltos de línea) y se renderiza como una lista con viñetas estéticas utilizando los estilos globales del sistema (iconos, márgenes y tarjetas de color suave).
  - Se añadió un bloque para mostrar la información del campo `acerca_de` en forma de párrafo legible.


