# PawAlert Backend

API REST construida con FastAPI para la coordinación de rescates animales.

## Requisitos

- Python 3.13+
- pip

## Instalación

1. Clona el repositorio y entra a la carpeta del backend:

```bash
cd PawAlert/backend
```

2. Crea el entorno virtual:

```bash
python -m venv venv
```

3. Activa el entorno virtual:

Windows:
```bash
venv\Scripts\activate
```

Mac/Linux:
```bash
source venv/bin/activate
```

4. Instala las dependencias:

```bash
pip install -r requirements.txt
```

5. Crea tu archivo `.env` basándote en `.env.example`:

```bash
cp .env.example .env
```

6. Llena el `.env` con tus credenciales de Supabase:

```
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-service-role-key
SUPABASE_BUCKET=pawalert-fotos
```

Para generar observaciones automáticas de los recorridos de casas temporales,
agrega una clave de Gemini únicamente en el entorno del backend:

```
GEMINI_API_KEY=tu-clave-de-google-ai-studio
GEMINI_MODEL=gemini-3.5-flash-lite
```

La clave nunca debe guardarse en el frontend ni subirse al repositorio. Si no
se configura, el video permanece disponible para revisión manual y la
validación local de metadatos de ubicación continúa funcionando.

## Correr el servidor

```bash
uvicorn app.main:app --reload
```

El servidor corre en http://127.0.0.1:8000

Documentación automática: http://127.0.0.1:8000/docs

## Estructura de carpetas

```
backend/
├── app/
│   ├── main.py                   # Punto de entrada de FastAPI
│   ├── config.py                 # Variables de entorno
│   ├── api/
│   │   ├── reports.py            # POST /reports, hitos, rechazo, estado
│   │   ├── associations.py       # POST /associations, listado, staff
│   │   ├── asignaciones.py       # Candidatos, asignar/confirmar/rechazar voluntario
│   │   ├── voluntarios.py        # Postulaciones, capacidades, /me/reportes
│   │   ├── auth.py               # Login/registro/refresh de sesión
│   │   ├── staff.py               # Endpoints del panel de staff
│   │   ├── admin.py              # Panel de administración
│   │   ├── catalogos.py          # Catálogos (tipo_animal, condicion, tamanio, etc.)
│   │   ├── stats.py              # GET /stats/generales (públicas)
│   │   ├── users.py              # /users/me, /users/phone/{telefono}
│   │   ├── report_acceptance.py  # Aceptación de reportes
│   │   └── internal.py           # Endpoints internos (cron de escalamiento, etc.)
│   ├── services/
│   │   ├── report_service.py     # Lógica de crear/leer reportes, duplicados
│   │   ├── assignment_service.py # Asignación de asociación por radio + contactos de emergencia
│   │   ├── matching.py           # Scoring de candidatos (voluntarios) por caso
│   │   ├── escalamiento.py       # Timeouts y reasignación automática
│   │   ├── voluntario_service.py # Lógica de voluntarios/capacidades
│   │   ├── email_service.py      # Envío de correos (caso grave, etc.)
│   │   └── storage_service.py    # Subir fotos a Supabase Storage
│   ├── models/
│   │   ├── report.py             # Esquemas de reporte y AnimalInput/AnimalResponse
│   │   ├── association.py        # Esquemas de asociación
│   │   └── voluntario.py         # Esquemas de voluntario/capacidades
│   ├── utils/
│   │   ├── animal_shaping.py     # Aplanado del embed multi-animal, condición más grave
│   │   └── validators.py         # Validadores (teléfono, email)
│   └── db/
│       └── supabase.py           # Cliente de Supabase
├── migrations/                   # Respaldo versionado de SQL (no se ejecuta automático)
│   ├── 0001_multi_animal.sql     # Migración de esquema a multi-animal por reporte
│   └── 0002_matching_functions.sql # Funciones SQL de matching (viven en Supabase)
├── .env                          # Credenciales locales (no se sube a git)
├── .env.example                  # Plantilla de variables
├── requirements.txt              # Dependencias
└── README.md
```

## Endpoints disponibles

### GET /health

Verifica que el servidor está en línea. Usado por UptimeRobot para evitar que Railway duerma el backend.

- **Auth:** ninguna
- **URL producción:** `https://pawalert-pwa-production.up.railway.app/health`

**Response 200:**
```json
{ "status": "ok" }
```

---

### POST /reports

Crea un nuevo reporte de animal en riesgo. Soporta usuarios registrados e invitados.
Un reporte es un caso (un pin, una ubicación) que puede contener **uno o
varios animales** — el contrato es multi-animal desde la migración
`0001_multi_animal.sql`.

- **Auth:** ninguna (opcional — si mandas `Authorization: Bearer <token>`, el
  backend resuelve `usuario_id` automáticamente y no hace falta mandar
  `nombre`/`telefono`)
- **Content-Type:** multipart/form-data

**Campos comunes (con o sin sesión):**
| Campo | Tipo | Requerido |
|---|---|---|
| animales | string (JSON array, ver abajo) | Sí |
| fotos | archivo[] | No |
| fotos_ordenes | string (JSON array de ints, mismo largo que `fotos`) | No |
| fotos_animal_index | string (JSON array de ints, mismo largo que `fotos` — a qué animal del arreglo `animales` pertenece cada foto, por posición) | No |
| latitud | float | No* |
| longitud | float | No* |
| municipio | string | No* |
| colonia | string | No |
| calle | string | No |
| referencia | string | No |
| estado_ubicacion | string | No |
| es_duplicado_confirmado | bool | No (ver "Reporte duplicado" abajo) |
| reporte_original_id | string (UUID) | No (ver "Reporte duplicado" abajo) |

*Se requiere `latitud`+`longitud` **o** `municipio` como mínimo.

**Con sesión (usuario registrado):** solo hace falta `usuario_id` (o el
header `Authorization`) además de los campos comunes.

**Sin sesión (invitado):**
| Campo | Tipo | Requerido |
|---|---|---|
| nombre | string | Sí |
| apellido_paterno | string | Sí |
| apellido_materno | string | No |
| telefono | string (10 dígitos) | Sí |
| email | string | No |

**Forma de `animales`** — string JSON, arreglo de objetos con la forma de
`AnimalInput` (`app/models/report.py`). Campos por animal:

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| tipo_animal | `perro` \| `gato` \| `otro` | Sí | |
| condicion | `estable` \| `herido` \| `grave` | Sí | |
| tamanio | `pequeno` \| `mediano` \| `grande` | Sí | |
| sexo | `macho` \| `hembra` \| `desconocido` | No | |
| edad_aproximada | `cachorro` \| `joven` \| `adulto` \| `senior` \| `desconocido` | No | |
| tiene_collar | bool | No | |
| esta_prenada | bool | No | solo aplica si `sexo=hembra` |
| es_agresivo | bool | No | |
| es_domestico_probable | bool | No | |
| raza_clave | string | No | |
| tipo_animal_otro_clave | string | No | subcategoría cuando `tipo_animal=otro` |
| especie_descripcion | string | No | |
| descripcion | string (máx. 300) | No | |
| orden | int | No (default 1) | posición del animal dentro del caso |
| es_grupo | bool | No (default false) | **modo grupo**: captura datos generales del grupo (tipo/condición/tamaño/edad), no pide `sexo` individual |
| cantidad | int (≥1) | No (default 1) | debe ser >1 si `es_grupo=true` |
| trae_crias_nacidas | bool | No | |
| numero_crias_nacidas | int | No | |

Ejemplo con **1 animal**:
```json
"animales": "[{\"tipo_animal\":\"perro\",\"condicion\":\"herido\",\"tamanio\":\"mediano\",\"sexo\":\"macho\",\"edad_aproximada\":\"adulto\",\"descripcion\":\"Cojea de la pata trasera derecha\",\"orden\":1}]"
```

Ejemplo con **2+ animales** (un grupo y un individual en el mismo caso):
```json
"animales": "[
  {\"tipo_animal\":\"gato\",\"condicion\":\"estable\",\"tamanio\":\"pequeno\",\"es_grupo\":true,\"cantidad\":4,\"orden\":1,\"descripcion\":\"Camada encontrada bajo un auto\"},
  {\"tipo_animal\":\"perro\",\"condicion\":\"grave\",\"tamanio\":\"grande\",\"sexo\":\"hembra\",\"trae_crias_nacidas\":true,\"numero_crias_nacidas\":3,\"orden\":2}
]"
```
(El gato del grupo no lleva `sexo` a propósito — el modo grupo captura datos
generales del grupo, no ficha individual por animal.)

**Response 201:**
```json
{
  "id": "uuid",
  "estado": "pendiente",
  "asociacion_asignada": "Nombre de la asociación o null",
  "contactos_emergencia": "[{...}] o null",
  "created_at": "timestamp"
}
```

**Response 200** (posible duplicado detectado — mismo municipio/colonia y
especie(s) compatibles con un reporte activo reciente): en vez de crear el
reporte, regresa el candidato a duplicado para que el frontend le pregunte
al usuario si es el mismo caso. El flujo se resuelve reenviando el mismo
`POST /reports` con `es_duplicado_confirmado=true` (y `reporte_original_id`
si el usuario confirma que es el mismo caso — el nuevo reporte se crea
igual, pero enlazado al original, sin fusionar animales).
```json
{
  "posible_duplicado": true,
  "escenario": 1,
  "reporte_existente": {
    "id": "uuid",
    "municipio": "...",
    "colonia": "...",
    "created_at": "timestamp",
    "tipo_animal": "perro",
    "condicion": "grave",
    "foto_url": "url o null",
    "animales": [
      { "tipo_animal": "perro", "condicion": "grave", "cantidad": 1, "foto_url": "url o null" }
    ]
  },
  "total_duplicados": 1
}
```
`escenario` es `1` (coincidencia simple) o `2` (el reporte existente ya es
un grupo que cubre la(s) especie(s) del caso nuevo).

---

### POST /associations

Registra una nueva asociación. Queda pendiente de verificación manual.

- **Auth:** ninguna
- **Content-Type:** application/json
- **Campos obligatorios:** nombre, nombre_responsable, contacto_telefono, contacto_email, tipos_animales, latitud, longitud, radio_km
- **Campos opcionales:** acerca_de, horario_atencion

**Response 201:**
```json
{
  "mensaje": "Asociación registrada. Tu cuenta quedará activa para recibir reportes cuando sea aprobada.",
  "access_token": "jwt",
  "refresh_token": "jwt",
  "usuario": {
    "id": "uuid",
    "nombre": "...",
    "apellido_paterno": "...",
    "email": "...",
    "telefono": "...",
    "asociacion_id": "uuid",
    "rol": "asociacion"
  }
}
```
La cuenta queda activa (`access_token`/`refresh_token` funcionan de inmediato),
pero la asociación (`verificado: false`) no recibirá reportes hasta que el
equipo la apruebe manualmente en Supabase.

## Variables de entorno

| Variable | Descripción | Requerida |
|---|---|---|
| SUPABASE_URL | URL del proyecto en Supabase | Sí |
| SUPABASE_KEY | service_role key de Supabase | Sí |
| SUPABASE_BUCKET | Nombre del bucket en Storage | No (default: pawalert-fotos) |

## Notas importantes

- Usar siempre la `service_role key` de Supabase, no la `anon key`
- El archivo `.env` nunca se sube a git
- El bucket `pawalert-fotos` debe existir en Supabase Storage antes de subir fotos
- La verificación de asociaciones se hace manualmente en Supabase por el equipo PawAlert
:3
