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

### 7. Selector de Avatares Prediseñados en los Perfiles

**Objetivo:**
Permitir que cualquier usuario registrado personalice su perfil eligiendo un avatar de una galería local (20 opciones prediseñadas), priorizando este avatar sobre las iniciales automáticas.

**Archivos Modificados:**
- `backend/app/api/users.py`:
  - Se agregó el campo `avatar_id` en la consulta del endpoint `GET /me`.
  - Se creó un nuevo endpoint `PUT /me/avatar` para guardar la selección del usuario en Supabase (tabla `usuarios`).
- `src/context/AuthContext.tsx`:
  - Se actualizó la interfaz de TypeScript `Usuario` agregando el campo `avatar_id?: string | null;` para resolver errores de tipado en el frontend.
- `src/components/profile/AvatarSelector.tsx` *(Nuevo)*:
  - Componente modal (React Native Modal) que renderiza las 20 imágenes de manera estática usando `require()` para evitar problemas con Metro Bundler en la web y móvil.
- `src/components/admin-dashboard/AssocAvatar.tsx`:
  - Se modificó para recibir la propiedad `avatarId` (opcional).
  - Ahora verifica en el diccionario de imágenes estáticas de `AvatarSelector` si el ID existe y renderiza esa imagen, teniendo prioridad sobre las iniciales (pero no sobre logos institucionales `logoUrl`).
- `src/components/profile/LoggedInProfile.tsx`:
  - Se integró el modal `<AvatarSelector />` en ambas versiones del perfil (Web y Móvil).
  - Se envolvió el componente `<AssocAvatar />` en un `TouchableOpacity` (con el mismo tamaño) y se añadió un ícono superpuesto (`editAvatarBadge` con un ícono de cámara y `zIndex: 10`) para indicar que es interactivo.
