
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
from app.db.supabase import supabase, supabase_admin, get_fresh_client
from app.services.storage_service import subir_foto
from app.services.report_service import obtener_id_catalogo
from app.utils.validators import validar_telefono, validar_email
from app.models.voluntario import (
    AsignarVerificadorRequest,
    ResolverPostulacionRequest,
)
from app.services.voluntario_service import (
    obtener_postulaciones_asociacion,
    resolver_postulacion,
    dar_de_baja_voluntario,
    reactivar_voluntario,
    listar_voluntarios_asociacion,
)
from app.services.home_verification_service import (
    asignar_verificador_hogar,
    obtener_verificacion_postulacion,
)
from app.models.association import NuevoRepresentante
from app.utils.animal_shaping import shape_animal_embed, shape_animal_response, condicion_mas_grave
import json
from app.services.email_service import email_bienvenida_staff

router = APIRouter()

MODOS_ASIGNACION_VALIDOS = ("manual", "semi_automatico", "automatico")


def _obtener_usuario_autenticado(authorization: str | None) -> dict:
    """Valida el JWT de Supabase mandado en el header Authorization y regresa
    el registro correspondiente en la tabla usuarios (incluye asociacion_id
    y el nombre del rol, vía join a roles — mismo patrón que asignaciones.py)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select(
        "id, asociacion_id, roles(nombre)"
    ).eq("auth_user_id", auth_response.user.id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "asociacion_id": fila.get("asociacion_id"),
        "rol": (fila.get("roles") or {}).get("nombre"),
    }

def _verificar_rol(usuario: dict, roles_permitidos: tuple[str, ...]) -> None:
    """Bloquea el acceso si el rol del usuario no está entre los permitidos.
    Necesario desde que voluntario_interno/externo también reciben
    asociacion_id al ser aceptados — sin este check, cualquier voluntario
    pasaría la validación de 'está vinculado a una asociación'."""
    if usuario.get("rol") not in roles_permitidos:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para realizar esta acción"
        )
    
def _verificar_asociacion_aprobada(asociacion_id: str) -> None:
    asociacion = supabase.table("asociaciones").select("verificado, nombre").eq(
        "id", asociacion_id
    ).execute()
 
    if not asociacion.data or not asociacion.data[0]["verificado"]:
        raise HTTPException(status_code=403, detail="Tu asociación todavía no ha sido aprobada")

@router.post("", status_code=201)
async def create_association(
    nombre: str = Form(...),
    nombre_responsable: str = Form(...),
    apellido_responsable: str = Form(...),
    contacto_telefono: str = Form(...),
    contacto_email: str = Form(...),
    password: str = Form(...),
    tipos_animales: str = Form(...),
    latitud: float = Form(...),
    longitud: float = Form(...),
    radio_km: int = Form(...),
    acerca_de: Optional[str] = Form(None),
    horario_atencion: Optional[str] = Form(None),
    calle: Optional[str] = Form(None),
    numero: Optional[str] = Form(None),
    colonia: Optional[str] = Form(None),
    municipio: Optional[str] = Form(None),
    estado: Optional[str] = Form(None),
    referencia: Optional[str] = Form(None),
    logo: Optional[UploadFile] = File(None),
    fotos: Optional[List[UploadFile]] = File(None),
    fotos_descripciones: Optional[str] = Form(None),
    fotos_ordenes: Optional[str] = Form(None),
):
    if not validar_telefono(contacto_telefono):
        raise HTTPException(
            status_code=422,
            detail="El teléfono debe tener exactamente 10 dígitos numéricos."
        )

    if not validar_email(contacto_email):
        raise HTTPException(
            status_code=422,
            detail="Ingresa un correo electrónico válido."
        )

    if len(password) < 6:
        raise HTTPException(
            status_code=422,
            detail="La contraseña debe tener al menos 6 caracteres."
        )

    # Subir logo si existe
    logo_url = None
    if logo and logo.filename:
        if logo.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/webp"]:
            raise HTTPException(status_code=422, detail="El logo debe ser una imagen JPG, PNG o WEBP")
        logo_url = await subir_foto(logo, carpeta="asociaciones/logos")

    # Parsear tipos de animales — acepta JSON array o string separado por comas
    if not tipos_animales or not tipos_animales.strip():
        raise HTTPException(status_code=422, detail="Debes seleccionar al menos un tipo de animal")

    try:
        tipos = json.loads(tipos_animales)
    except json.JSONDecodeError:
        tipos = [t.strip() for t in tipos_animales.split(",") if t.strip()]

    # Insertar asociación
    resultado = supabase.table("asociaciones").insert({
        "nombre": nombre,
        "nombre_responsable": f"{nombre_responsable} {apellido_responsable}".strip(),
        "contacto_telefono": contacto_telefono,
        "contacto_email": contacto_email,
        "tipos_animales": tipos,
        "latitud": latitud,
        "longitud": longitud,
        "radio_km": radio_km,
        "acerca_de": acerca_de,
        "horario_atencion": horario_atencion,
        "calle": calle,
        "numero": numero,
        "colonia": colonia,
        "municipio": municipio,
        "estado": estado,
        "referencia": referencia,
        "logo_url": logo_url,
        "verificado": False,
        "activo": True,
    }).execute()

    asociacion_id = resultado.data[0]["id"]

    # Crear la cuenta del primer representante (el responsable que registra
    # la asociación), vinculada vía usuarios.asociacion_id. Si falla, se
    # revierte la creación de la asociación para no dejar datos huérfanos.
    try:
        auth_response = supabase_admin.auth.admin.create_user({
            "email": contacto_email,
            "password": password,
            "email_confirm": True,
        })
    except Exception as e:
        supabase.table("asociaciones").delete().eq("id", asociacion_id).execute()
        msg = str(e).lower()
        if "already" in msg or "exists" in msg:
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo")
        raise HTTPException(status_code=400, detail=f"Error al crear cuenta del responsable: {e}")

    auth_user_id = auth_response.user.id
    telefono_limpio = contacto_telefono.replace(" ", "").replace("-", "")

    # Obtener rol de asociacion
    rol_asociacion = supabase.table("roles").select("id").eq("nombre", "asociacion").execute()
    rol_asociacion_id = rol_asociacion.data[0]["id"] if rol_asociacion.data else None
    
    try:
        existente = supabase.table("usuarios").select("id, auth_user_id").eq(
            "telefono", telefono_limpio
        ).execute()

        if existente.data and not existente.data[0].get("auth_user_id"):
            usuario_id = existente.data[0]["id"]
            supabase.table("usuarios").update({
                "auth_user_id": auth_user_id,
                "nombre": nombre_responsable,
                "apellido_paterno": apellido_responsable,
                "email": contacto_email,
                "asociacion_id": asociacion_id,
                "rol_id": rol_asociacion_id,
            }).eq("id", usuario_id).execute()
        else:
            usuario_insertado = supabase.table("usuarios").insert({
                "auth_user_id": auth_user_id,
                "nombre": nombre_responsable,
                "apellido_paterno": apellido_responsable,
                "email": contacto_email,
                "telefono": telefono_limpio,
                "asociacion_id": asociacion_id,
                "rol_id": rol_asociacion_id,
            }).execute()
            usuario_id = usuario_insertado.data[0]["id"]
    except Exception:
        supabase_admin.auth.admin.delete_user(auth_user_id)
        supabase.table("asociaciones").delete().eq("id", asociacion_id).execute()
        raise HTTPException(status_code=500, detail="Error al guardar datos del responsable")

    login_response = get_fresh_client().auth.sign_in_with_password({
        "email": contacto_email,
        "password": password,
    })

    for tipo_clave in tipos:
        tipo_id = obtener_id_catalogo("tipo_animal_catalogo", tipo_clave)
        if tipo_id:
            supabase.table("asociacion_tipo_animal").insert({
                "asociacion_id": asociacion_id,
                "tipo_animal_id": tipo_id,
            }).execute()

    if fotos:
        descripciones = json.loads(fotos_descripciones) if fotos_descripciones and fotos_descripciones.strip() else []
        ordenes = json.loads(fotos_ordenes) if fotos_ordenes and fotos_ordenes.strip() else []

        for i, foto in enumerate(fotos):
            if foto and foto.filename:
                foto_url = await subir_foto(foto, carpeta="asociaciones/fotos")
                supabase.table("asociacion_fotos").insert({
                    "asociacion_id": asociacion_id,
                    "foto_url": foto_url,
                    "descripcion": descripciones[i] if i < len(descripciones) else None,
                    "orden": ordenes[i] if i < len(ordenes) else i + 1,
                }).execute()

    return {
        "mensaje": "Asociación registrada. Tu cuenta quedará activa para recibir reportes cuando sea aprobada.",
        "access_token": login_response.session.access_token,
        "refresh_token": login_response.session.refresh_token,
        "usuario": {
            "id": usuario_id,
            "nombre": nombre_responsable,
            "apellido_paterno": apellido_responsable,
            "email": contacto_email,
            "telefono": telefono_limpio,
            "asociacion_id": asociacion_id,
            "rol": "asociacion",
        },
    }


@router.get("", status_code=200)
async def get_associations():
    resultado = supabase.table("asociaciones").select(
        "id, nombre, contacto_telefono, contacto_email, "
        "latitud, longitud, radio_km, horario_atencion, activo, "
        "asociacion_tipo_animal(tipo_animal_catalogo(clave, descripcion))"
    ).eq("verificado", True).eq("activo", True).execute()

    asociaciones = []
    for a in resultado.data:
        tipos = []
        if a.get("asociacion_tipo_animal"):
            tipos = [
                t["tipo_animal_catalogo"]["clave"]
                for t in a["asociacion_tipo_animal"]
                if t.get("tipo_animal_catalogo")
            ]

        asociaciones.append({
            "id": a["id"],
            "nombre": a["nombre"],
            "contacto_telefono": a["contacto_telefono"],
            "contacto_email": a["contacto_email"],
            "tipos_animales": tipos,
            "latitud": a["latitud"],
            "longitud": a["longitud"],
            "radio_km": a["radio_km"],
            "horario_atencion": a.get("horario_atencion"),
            "activo": a["activo"],
        })

    return asociaciones


@router.get("/me", status_code=200)
async def get_mi_asociacion(authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)

    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")

    resultado = supabase.table("asociaciones").select(
        "id, nombre, verificado, motivo_rechazo"
    ).eq("id", usuario["asociacion_id"]).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Asociación no encontrada")

    asociacion = resultado.data[0]

    if asociacion["verificado"]:
        estado = "aprobada"
    elif asociacion.get("motivo_rechazo"):
        estado = "rechazada"
    else:
        estado = "pendiente"

    return {
        "id": asociacion["id"],
        "nombre": asociacion["nombre"],
        "estado": estado,
        "motivo_rechazo": asociacion.get("motivo_rechazo"),
    }

@router.post("/{asociacion_id}/representantes", status_code=201)
async def agregar_representante(asociacion_id: str, body: NuevoRepresentante, authorization: str = Header(None)):
    """Permite a un representante ya logueado agregar a alguien más como
    representante de la misma asociación. No crea contraseña aquí — solo deja
    la fila lista para que esa persona reclame su cuenta vía el correo de
    bienvenida (mismo flujo de verificación SMS que usan los invitados)."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion",))

    if usuario.get("asociacion_id") != asociacion_id:
        raise HTTPException(status_code=403, detail="No tienes permiso sobre esta asociación")

    asociacion = supabase.table("asociaciones").select("verificado, nombre").eq("id", asociacion_id).execute()
    if not asociacion.data or not asociacion.data[0]["verificado"]:
        raise HTTPException(status_code=403, detail="Tu asociación todavía no ha sido aprobada")

    telefono_limpio = body.telefono.replace(" ", "").replace("-", "")
    if not validar_telefono(telefono_limpio):
        raise HTTPException(status_code=422, detail="El teléfono debe tener exactamente 10 dígitos numéricos.")
    if not validar_email(body.email):
        raise HTTPException(status_code=422, detail="Ingresa un correo electrónico válido.")

    rol_nombre = "staff" if body.es_staff else "asociacion"
    rol_result = supabase.table("roles").select("id").eq("nombre", rol_nombre).execute()
    rol_id = rol_result.data[0]["id"] if rol_result.data else None

    existente = supabase.table("usuarios").select("id, auth_user_id").eq(
        "telefono", telefono_limpio
    ).execute()

    if existente.data:
        if existente.data[0].get("auth_user_id"):
            raise HTTPException(status_code=409, detail="Ese teléfono ya pertenece a una cuenta con acceso")
        supabase.table("usuarios").update({
            "asociacion_id": asociacion_id,
            "rol_id": rol_id,
            "email": body.email,
        }).eq("id", existente.data[0]["id"]).execute()
    else:
        # Validar que el correo no esté ya en uso por otra cuenta
        existente_email = supabase.table("usuarios").select("id").eq("email", body.email).execute()
        if existente_email.data:
            raise HTTPException(status_code=409, detail="Ese correo ya pertenece a otra cuenta")

        supabase.table("usuarios").insert({
            "nombre": body.nombre,
            "apellido_paterno": body.apellido_paterno,
            "apellido_materno": body.apellido_materno,
            "telefono": telefono_limpio,
            "email": body.email,
            "asociacion_id": asociacion_id,
            "rol_id": rol_id,
        }).execute()

    import secrets
    from datetime import datetime, timedelta, timezone
    from app.services.email_service import email_bienvenida_staff

    token = secrets.token_urlsafe(24)
    supabase.table("tokens_invitacion").insert({
        "token": token,
        "telefono": telefono_limpio,
        "expira_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    }).execute()
    email_bienvenida_staff(nombre=body.nombre, email=body.email, token=token, nombre_asociacion=asociacion.data[0]["nombre"])

    return {"mensaje": "Representante agregado. Le enviamos un correo con las instrucciones para crear su cuenta."}
@router.get("/me/reportes", status_code=200)
async def get_reportes_asignados(authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))

    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")

    asociacion = supabase.table("asociaciones").select("verificado").eq(
        "id", usuario["asociacion_id"]
    ).execute()

    if not asociacion.data or not asociacion.data[0]["verificado"]:
        raise HTTPException(status_code=403, detail="Tu asociación todavía no ha sido aprobada")

    resultado = supabase.table("reporte_asignaciones").select(
    "id, assigned_at, accepted_at, closed_at, notas, "
    "asignacion_estados!reporte_asignaciones_estado_id_fkey(clave, descripcion), "
    "reportes(id, estado_reporte, confirmacion_voluntario, municipio, colonia, calle, latitud, longitud, created_at, "  # ← agregar latitud, longitud
    "animal(id, orden, es_grupo, cantidad, trae_crias_nacidas, numero_crias_nacidas, "
    "sexo, edad_aproximada, descripcion, "
    "tipo_animal_catalogo(clave), condicion_catalogo(clave), tamanio_catalogo(clave), "
    "animal_fotos(foto_url, orden)))"
    ).eq("asociacion_id", usuario["asociacion_id"]).order("assigned_at", desc=True).execute()

    reporte_ids_sin_asignar = [
        r["reportes"]["id"] for r in resultado.data
        if r.get("reportes")
        and r["reportes"].get("estado_reporte") == "asignado"
        and r["reportes"].get("confirmacion_voluntario") is None
    ]
    ultimos_rechazos = {}
    if reporte_ids_sin_asignar:
        eventos = supabase.table("historial_reporte").select(
            "reporte_id, created_at, usuarios(nombre, apellido_paterno)"
        ).in_("reporte_id", reporte_ids_sin_asignar).eq(
            "tipo_evento", "voluntario_rechaza"
        ).order("created_at", desc=True).execute()
        for ev in eventos.data or []:
            rid = ev["reporte_id"]
            if rid not in ultimos_rechazos:
                vol = ev.get("usuarios") or {}
                ultimos_rechazos[rid] = {
                    "nombre_voluntario": f"{vol.get('nombre', '')} {vol.get('apellido_paterno', '')}".strip(),
                    "creado_at": str(ev["created_at"]),
                }

    reportes = []
    for r in resultado.data:
        rep = r.get("reportes")
        if not rep:
            continue
            
        estado_asignacion_clave = "notificada"
        if r.get("asignacion_estados"):
            estado_asignacion_clave = r["asignacion_estados"].get("clave", "notificada")
        elif r.get("closed_at"):
            estado_asignacion_clave = "rechazada"
        elif r.get("accepted_at"):
            estado_asignacion_clave = "aceptada"

        animales_crudos, animal_legado = shape_animal_embed(rep.get("animal"))
        fotos = (animal_legado or {}).get("animal_fotos") or []
        foto_url = None
        fotos_urls = []
        if fotos:
            fotos_ordenadas = sorted(fotos, key=lambda f: f.get("orden", 0))
            foto_url = fotos_ordenadas[0]["foto_url"]
            fotos_urls = [f["foto_url"] for f in fotos_ordenadas if f.get("foto_url")]

        reportes.append({
            "asignacion_id": r["id"],
            "reporte_id": rep["id"],
            "estado_asignacion_clave": estado_asignacion_clave,
            "estado_reporte": rep.get("estado_reporte"),
            "confirmacion_voluntario": rep.get("confirmacion_voluntario"),
            "ultimo_rechazo": ultimos_rechazos.get(rep["id"]),
            "municipio": rep.get("municipio"),
            "colonia": rep.get("colonia"),
            "calle": rep.get("calle"),
            "latitud": rep.get("latitud"),
            "longitud": rep.get("longitud"),
            "created_at": str(rep["created_at"]),
            "foto_url": foto_url,
            "fotos_urls": fotos_urls,
            "animales": [shape_animal_response(a) for a in animales_crudos],
        })

    return reportes


# Tipos de evento que la línea de tiempo del panel de asociación necesita
# mostrar además del evento de creación. Los valores reales que escribe
# POST /reports/{id}/hitos son "hito_{tipo_hito}" (ver reports.py), es decir
# "hito_encontre_animal" y "hito_llegue_refugio" — no "hito_encontrado"/
# "hito_refugio". "caso_cerrado" lo escribe cambiar_estado_reporte()
# (report_service.py) cuando nuevo_estado == "cerrado".
TIPOS_HITO_TIMELINE = ["hito_encontre_animal", "hito_llegue_refugio", "caso_cerrado"]


@router.get("/me/reportes/{reporte_id}/historial", status_code=200)
async def get_historial_reporte(reporte_id: str, authorization: str = Header(None)):
    """Línea de tiempo de un reporte para el panel de asociación: creación
    del caso (foto + reportante) y los hitos de campo registrados por
    staff/voluntario, en orden cronológico. Solo lee de historial_reporte
    (más los datos del reporte para foto/reportante) — no escribe nada."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))

    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")

    asociacion = supabase.table("asociaciones").select("verificado").eq(
        "id", usuario["asociacion_id"]
    ).execute()

    if not asociacion.data or not asociacion.data[0]["verificado"]:
        raise HTTPException(status_code=403, detail="Tu asociación todavía no ha sido aprobada")

    reporte = supabase.table("reportes").select(
        "id, created_at, asociacion_asignada_id, usuario_id, "
        "reportante_nombre, reportante_apellido_paterno, "
        "animal(orden, descripcion, condicion_catalogo(clave), animal_fotos(foto_url, orden))"
    ).eq("id", reporte_id).execute()

    if not reporte.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    reporte = reporte.data[0]

    if reporte.get("asociacion_asignada_id") != usuario["asociacion_id"]:
        raise HTTPException(status_code=403, detail="Este reporte no pertenece a tu asociación")

    animales_crudos, animal_legado = shape_animal_embed(reporte.get("animal"))
    fotos = (animal_legado or {}).get("animal_fotos") or []
    foto_reporte = None
    if fotos:
        fotos_ordenadas = sorted(fotos, key=lambda f: f.get("orden", 0))
        foto_reporte = fotos_ordenadas[0]["foto_url"]
    nota_reporte = (animal_legado or {}).get("descripcion")

    if reporte.get("usuario_id"):
        usuario_reportante = supabase.table("usuarios").select(
            "nombre, apellido_paterno"
        ).eq("id", reporte["usuario_id"]).execute()
        datos_reportante = usuario_reportante.data[0] if usuario_reportante.data else {}
    else:
        datos_reportante = {
            "nombre": reporte.get("reportante_nombre"),
            "apellido_paterno": reporte.get("reportante_apellido_paterno"),
        }

    reportante_nombre = f"{datos_reportante.get('nombre') or ''} {datos_reportante.get('apellido_paterno') or ''}".strip()

    eventos = [{
        "tipo_evento": "reporte_creado",
        "created_at": str(reporte["created_at"]),
        "foto_url": foto_reporte,
        "reportante_nombre": reportante_nombre or "anónimo",
        "nota": nota_reporte,
    }]

    hitos = supabase.table("historial_reporte").select(
        "tipo_evento, created_at, datos_extra, usuarios(nombre, apellido_paterno)"
    ).eq("reporte_id", reporte_id).in_(
        "tipo_evento", TIPOS_HITO_TIMELINE
    ).order("created_at").execute()

    for hito in hitos.data or []:
        datos_extra = hito.get("datos_extra") or {}
        vol = hito.get("usuarios") or {}
        usuario_nombre = f"{vol.get('nombre') or ''} {vol.get('apellido_paterno') or ''}".strip()

        # `historial_reporte.descripcion` es un texto genérico fijo ("Hito
        # registrado: encontre_animal"), no la nota del voluntario — la nota
        # real vive en datos_extra: la opción elegida (condicion_observada)
        # y/o el comentario libre. Para "caso_cerrado" los campos equivalentes
        # son conclusion/notas (ver cambiar_estado_reporte).
        if hito["tipo_evento"] == "caso_cerrado":
            nota_partes = [p for p in (datos_extra.get("conclusion"), datos_extra.get("notas")) if p]
        else:
            nota_partes = [p for p in (datos_extra.get("condicion_observada"), datos_extra.get("comentario")) if p]
        nota_hito = " — ".join(nota_partes) if nota_partes else None

        eventos.append({
            "tipo_evento": hito["tipo_evento"],
            "created_at": str(hito["created_at"]),
            "foto_url": datos_extra.get("foto_url"),
            "usuario_nombre": usuario_nombre or None,
            "nota": nota_hito,
        })

    eventos.sort(key=lambda e: e["created_at"])

    return {"reporte_id": reporte_id, "eventos": eventos}


@router.get("/me/staff", status_code=200)
async def get_staff_asociacion(authorization: str = Header(None)):
    """Devuelve la lista de miembros del staff de la asociacion del usuario logueado,
    indicando si cada uno esta disponible para recibir nuevos casos."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))

    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")

    asociacion = supabase.table("asociaciones").select("verificado").eq(
        "id", usuario["asociacion_id"]
    ).execute()

    if not asociacion.data or not asociacion.data[0]["verificado"]:
        raise HTTPException(status_code=403, detail="Tu asociación todavía no ha sido aprobada")

    # Obtener rol de staff
    rol_staff = supabase.table("roles").select("id").eq("nombre", "staff").execute()
    if not rol_staff.data:
        return []
    rol_staff_id = rol_staff.data[0]["id"]

    # Obtener miembros del staff de la asociacion
    staff = supabase.table("usuarios").select(
        "id, nombre, apellido_paterno, email, telefono"
    ).eq("asociacion_id", usuario["asociacion_id"]).eq("rol_id", rol_staff_id).execute()

    if not staff.data:
        return []

    # Verificar disponibilidad de cada miembro
    resultado = []
    for miembro in staff.data:
        # Contar casos activos del miembro
        casos_activos = supabase.table("reportes").select(
            "id, estado_reporte, animal(condicion_catalogo(clave))"
        ).eq("staff_asignado_id", miembro["id"]).in_(
            "estado_reporte", ["en_camino", "en_atencion"]
        ).execute()

        casos = casos_activos.data or []
        tiene_caso_grave = any(
            condicion_mas_grave(shape_animal_embed(c.get("animal"))[0]) == "grave"
            for c in casos
        )
        total_casos_activos = len(casos)

        disponible = not tiene_caso_grave and total_casos_activos < 2
        motivo_no_disponible = None
        if tiene_caso_grave:
            motivo_no_disponible = "Tiene un caso grave activo"
        elif total_casos_activos >= 2:
            motivo_no_disponible = "Tiene 2 o más casos activos"

        resultado.append({
            "id": miembro["id"],
            "nombre": miembro["nombre"],
            "apellido_paterno": miembro["apellido_paterno"],
            "email": miembro.get("email"),
            "telefono": miembro.get("telefono"),
            "disponible": disponible,
            "casos_activos": total_casos_activos,
            "motivo_no_disponible": motivo_no_disponible,
        })

    return resultado

### Endpoint: POST para APELAR
@router.post("/me/apelar", status_code=201)
async def apelar_rechazo(
    mensaje: str = Form(...),
    documentos: Optional[List[UploadFile]] = File(None),
    authorization: str = Header(None)
):

    """Permite a una asociación rechazada enviar una apelación con mensaje y documentos."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion",))
    
    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")

    asociacion = supabase.table("asociaciones").select(
        "id, nombre, verificado, motivo_rechazo"
    ).eq("id", usuario["asociacion_id"]).execute()

    if not asociacion.data:
        raise HTTPException(status_code=404, detail="Asociación no encontrada")

    asociacion = asociacion.data[0]

    if asociacion["verificado"]:
        raise HTTPException(status_code=400, detail="Tu asociación ya está aprobada")

    if not asociacion.get("motivo_rechazo"):
        raise HTTPException(status_code=400, detail="Tu asociación no ha sido rechazada")

    # Verificar que no tenga apelación pendiente
    apelacion_existente = supabase.table("apelaciones").select("id, estado").eq(
        "asociacion_id", usuario["asociacion_id"]
    ).eq("estado", "pendiente").execute()

    if apelacion_existente.data:
        raise HTTPException(status_code=409, detail="Ya tienes una apelación en revisión")

    # Validar mensaje
    if not mensaje.strip():
        raise HTTPException(status_code=422, detail="El mensaje de apelación es obligatorio")

    if len(mensaje) > 300:
        raise HTTPException(status_code=422, detail="El mensaje no puede superar 300 caracteres")

    # Subir documentos si existen
    documentos_urls = []
    if documentos:
        if len(documentos) > 3:
            raise HTTPException(status_code=422, detail="Puedes subir máximo 3 documentos")

        for doc in documentos:
            if doc and doc.filename:
                if doc.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/webp", "application/pdf"]:
                    raise HTTPException(status_code=422, detail="Solo se permiten imágenes JPG, PNG, WEBP o PDF")
                doc_url = await subir_foto(doc, carpeta="asociaciones/apelaciones")
                documentos_urls.append(doc_url)

    # Guardar apelación
    supabase.table("apelaciones").insert({
        "asociacion_id": usuario["asociacion_id"],
        "mensaje": mensaje.strip(),
        "documentos_urls": documentos_urls,
        "estado": "pendiente",
    }).execute()

    return {
        "mensaje": "Tu apelación fue enviada correctamente. El equipo de PawAlert la revisará y te notificará por correo.",
        "documentos_subidos": len(documentos_urls),
        "estado": "pendiente"
    }

### FIN: POST apelar 

### Endpoind: Para que el representante sepa elstatus de su apelacion 
@router.get("/me/apelacion", status_code=200)
async def get_apelacion(authorization: str = Header(None)):
    """Devuelve la apelación más reciente de la asociación si existe."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion",))
    
    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")

    apelacion = supabase.table("apelaciones").select(
        "id, estado, mensaje, created_at"
    ).eq("asociacion_id", usuario["asociacion_id"]).order(
        "created_at", desc=True
    ).limit(1).execute()

    if not apelacion.data:
        return {"tiene_apelacion": False}

    return {
        "tiene_apelacion": True,
        "estado": apelacion.data[0]["estado"],
        "mensaje": apelacion.data[0]["mensaje"],
        "created_at": str(apelacion.data[0]["created_at"])
    }

### Fin: endpoint para status apleacion


class ConfigAsignacionUpdate(BaseModel):
    modo_asignacion: str | None = None
    timeout_grave: int | None = None
    timeout_herido: int | None = None
    timeout_estable: int | None = None


@router.get("/me/config-asignacion", status_code=200)
async def get_config_asignacion(authorization: str = Header(None)):
    """Devuelve la configuración de asignación de voluntarios de la asociación
    del usuario logueado (modo manual/semi_automatico/automatico + timeouts)."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion",))

    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")

    resultado = supabase.table("asociaciones").select(
        "modo_asignacion, timeout_grave, timeout_herido, timeout_estable"
    ).eq("id", usuario["asociacion_id"]).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Asociación no encontrada")

    return resultado.data[0]


@router.patch("/me/config-asignacion", status_code=200)
async def patch_config_asignacion(body: ConfigAsignacionUpdate, authorization: str = Header(None)):
    """Actualiza el modo de asignación y/o los timeouts. Solo valida y guarda
    los campos que vengan en el body (los demás quedan sin tocar)."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion",))

    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")

    if body.modo_asignacion is not None and body.modo_asignacion not in MODOS_ASIGNACION_VALIDOS:
        raise HTTPException(
            status_code=422,
            detail=f"modo_asignacion debe ser uno de: {', '.join(MODOS_ASIGNACION_VALIDOS)}",
        )

    for campo, valor in (
        ("timeout_grave", body.timeout_grave),
        ("timeout_herido", body.timeout_herido),
        ("timeout_estable", body.timeout_estable),
    ):
        if valor is not None and not (1 <= valor <= 240):
            raise HTTPException(status_code=422, detail=f"{campo} debe estar entre 1 y 240 minutos")

    actualizacion = {k: v for k, v in body.model_dump().items() if v is not None}
    if not actualizacion:
        raise HTTPException(status_code=422, detail="No se enviaron campos para actualizar")

    resultado = supabase.table("asociaciones").update(actualizacion).eq(
        "id", usuario["asociacion_id"]
    ).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Asociación no encontrada")

    return resultado.data[0]

 
### Endpoints: gestión de postulaciones y voluntarios de la asociación (Sprint Voluntarios)
 
@router.get("/me/postulaciones", status_code=200)
async def get_postulaciones_asociacion(estado: str | None = None, authorization: str = Header(None)):
    """Lista las postulaciones recibidas por la asociación del usuario logueado.
    Filtro opcional por estado: pendiente | aceptada | rechazada."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))

    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")
 
    _verificar_asociacion_aprobada(usuario["asociacion_id"])
 
    return await obtener_postulaciones_asociacion(usuario["asociacion_id"], estado)
 
 
@router.patch("/me/postulaciones/{postulacion_id}", status_code=200)
async def patch_resolver_postulacion(
    postulacion_id: str,
    body: ResolverPostulacionRequest,
    authorization: str = Header(None),
):
    """El staff de la asociación acepta o rechaza una postulación de voluntario."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))
    
    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")
 
    _verificar_asociacion_aprobada(usuario["asociacion_id"])
 
    return await resolver_postulacion(
        postulacion_id=postulacion_id,
        usuario_staff_id=usuario["id"],
        asociacion_id=usuario["asociacion_id"],
        accion=body.accion.value,
        motivo=body.motivo,
    )


@router.get(
    "/me/postulaciones/{postulacion_id}/verificacion",
    status_code=200,
)
async def get_verificacion_postulacion(
    postulacion_id: str,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))
    if not usuario.get("asociacion_id"):
        raise HTTPException(
            status_code=404,
            detail="Este usuario no está vinculado a ninguna asociación",
        )
    _verificar_asociacion_aprobada(usuario["asociacion_id"])
    return obtener_verificacion_postulacion(
        postulacion_id,
        usuario["asociacion_id"],
    )


@router.post(
    "/me/verificaciones/{verificacion_id}/asignar",
    status_code=201,
)
async def post_asignar_verificador(
    verificacion_id: str,
    body: AsignarVerificadorRequest,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))
    if not usuario.get("asociacion_id"):
        raise HTTPException(
            status_code=404,
            detail="Este usuario no está vinculado a ninguna asociación",
        )
    _verificar_asociacion_aprobada(usuario["asociacion_id"])
    return asignar_verificador_hogar(
        verificacion_id=verificacion_id,
        verificador_voluntario_id=body.voluntario_id,
        asociacion_id=usuario["asociacion_id"],
    )
 
 
@router.patch("/me/voluntarios/{voluntario_id}/baja", status_code=200)
async def patch_dar_de_baja_voluntario(voluntario_id: str, authorization: str = Header(None)):
    """El staff de la asociación da de baja a uno de sus voluntarios activos."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))

    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")
 
    _verificar_asociacion_aprobada(usuario["asociacion_id"])
 
    return await dar_de_baja_voluntario(
        voluntario_id=voluntario_id,
        asociacion_id=usuario["asociacion_id"],
    )
 
### FIN: endpoints de postulaciones y voluntarios de la asociación

@router.get("/me/voluntarios", status_code=200)
async def get_voluntarios_asociacion(authorization: str = Header(None)):
    """Lista los voluntarios de la asociación del usuario logueado, para la
    vista de gestión donde se puede dar de baja o reactivar."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))

    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")

    _verificar_asociacion_aprobada(usuario["asociacion_id"])

    return await listar_voluntarios_asociacion(usuario["asociacion_id"])


@router.patch("/me/voluntarios/{voluntario_id}/reactivar", status_code=200)
async def patch_reactivar_voluntario(voluntario_id: str, authorization: str = Header(None)):
    """El staff de la asociación reactiva a un voluntario previamente dado de baja."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))

    if not usuario.get("asociacion_id"):
        raise HTTPException(status_code=404, detail="Este usuario no está vinculado a ninguna asociación")

    _verificar_asociacion_aprobada(usuario["asociacion_id"])

    return await reactivar_voluntario(
        voluntario_id=voluntario_id,
        asociacion_id=usuario["asociacion_id"],
    )
