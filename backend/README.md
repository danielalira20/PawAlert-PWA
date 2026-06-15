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
│   │   ├── reports.py            # POST /reports
│   │   └── associations.py       # POST /associations
│   ├── services/
│   │   ├── report_service.py     # Lógica de crear reporte
│   │   ├── assignment_service.py # Lógica de asignación por radio
│   │   └── storage_service.py    # Subir fotos a Supabase Storage
│   ├── models/
│   │   ├── report.py             # Esquemas de reporte
│   │   └── association.py        # Esquemas de asociación
│   └── db/
│       └── supabase.py           # Cliente de Supabase
├── .env                          # Credenciales locales (no se sube a git)
├── .env.example                  # Plantilla de variables
├── requirements.txt              # Dependencias
└── README.md
```

## Endpoints disponibles

### POST /reports

Crea un nuevo reporte de animal en riesgo.

- **Auth:** ninguna
- **Content-Type:** multipart/form-data
- **Campos obligatorios:** nombre, apellido_paterno, contacto, foto, condicion
- **Campos opcionales:** apellido_materno, latitud, longitud, ubicacion_texto, descripcion

**Response 201:**
```json
{
  "id": "uuid",
  "estado": "pendiente",
  "asociacion_asignada": "Nombre de la asociación o null",
  "created_at": "timestamp"
}
```

### POST /associations

Registra una nueva asociación. Queda pendiente de verificación manual.

- **Auth:** ninguna
- **Content-Type:** application/json
- **Campos obligatorios:** nombre, nombre_responsable, contacto_telefono, contacto_email, tipos_animales, latitud, longitud, radio_km
- **Campos opcionales:** acerca_de, horario_atencion

**Response 201:**
```json
{
  "verificado": false,
  "mensaje": "Solicitud recibida. Te contactaremos en 48 horas."
}
```

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