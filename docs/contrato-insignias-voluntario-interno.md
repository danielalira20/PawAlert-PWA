# Contrato de insignias — voluntariado interno

Este documento entrega a la persona responsable del Centro de reputación
los datos necesarios para integrar las insignias del voluntariado interno
sin duplicar reglas del backend.

## Responsabilidades

- Persona 2 mantiene las reglas, evaluación, progreso y recursos PNG del
  voluntariado interno.
- El Centro de reputación consume este contrato y presenta las insignias
  separadas por rol.
- El frontend no debe calcular si una insignia fue obtenida. El backend es
  la fuente de verdad.

## Consulta

Usar el hook existente:

```ts
useMisInsignias('voluntario_interno')
```

Este hook consume:

```http
GET /reputacion/me/insignias?rol=voluntario_interno
Authorization: Bearer <token>
```

La respuesta tiene esta forma:

```json
[
  {
    "id": "uuid",
    "rol": "voluntario_interno",
    "codigo_insignia": "rescatista_pawalert",
    "nivel": "plata",
    "progreso": 7,
    "obtenido_at": "2026-08-01T12:00:00+00:00",
    "mejorado_at": "2026-08-08T12:00:00+00:00"
  }
]
```

Una lista vacía es un estado válido: significa que todavía no se ha
alcanzado ninguna meta para ese rol.

## Catálogo visual

Todos los recursos viven en `assets/insignias/voluntarios/`.

| Código | Nombre visible | Tipo | Meta | PNG |
|---|---|---|---:|---|
| `rescatista_pawalert` | Rescatista PawAlert | Dinámica | 1 / 5 / 15 rescates | `rescatista_pawalert_cobre.png`, `rescatista_pawalert_plata.png`, `rescatista_pawalert_oro.png` |
| `compromiso_cumplido` | Compromiso Cumplido | Fija | 10 casos concluidos sin abandono confirmado | `compromiso_cumplido.png` |
| `verificador_de_confianza` | Verificador de Confianza | Fija | 5 hogares verificados y aprobados | `verificador_de_confianza.png` |

## Interpretación del progreso

`progreso` siempre contiene el total confirmado por el backend:

- `rescatista_pawalert`: cantidad de rescates concluidos válidos.
- `compromiso_cumplido`: casos concluidos sin abandono confirmado.
- `verificador_de_confianza`: visitas presenciales completadas con resultado
  aprobado.

Para mostrar la siguiente meta de `rescatista_pawalert`:

- Sin insignia: `0 de 1` para Cobre.
- Cobre: `progreso de 5` para Plata.
- Plata: `progreso de 15` para Oro.
- Oro: meta completada; no existe otro nivel.

Las insignias fijas no cambian de nivel. Su campo `nivel` llega como `null`.

## Fechas

- `obtenido_at` indica cuándo se alcanzó por primera vez la insignia.
- `mejorado_at` cambia cuando una insignia dinámica sube de nivel.
- En insignias fijas ambas fechas pueden coincidir.

## Recuperación histórica

La recuperación de insignias anteriores al lanzamiento es una operación
interna y nunca debe ejecutarse desde el frontend. Existe una ruta protegida
por `X-Cron-Secret` y su valor predeterminado es `dry_run=true`:

```http
POST /internal/gamificacion/reevaluar-insignias-historicas/voluntarios-internos
```

Primero se revisa la simulación y únicamente después se autoriza una
ejecución con `dry_run=false`.

## Reglas de integración

- No mostrar insignias de `reportante` dentro del bloque de
  `voluntario_interno`; deben permanecer separadas por rol.
- No inferir niveles a partir de puntos o Trust Score.
- No exponer el valor numérico del Trust Score.
- Conservar estados de carga, vacío y error sin bloquear el resto del perfil.
- Un código desconocido debe ignorarse de forma segura y registrarse para
  actualizar el catálogo visual, no romper la pantalla.
