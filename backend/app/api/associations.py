
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
from app.db.supabase import supabase, supabase_admin, get_fresh_client
from app.services.storage_service import subir_foto
from app.services.report_service import obtener_id_catalogo
from app.utils.validators import validar_telefono, validar_email
import json

router = APIRouter()


def _obtener_usuario_autenticado(authorization: str | None) -> dict:
    """Valida el JWT de Supabase mandado en el header Authorization y regresa
    el registro correspondiente en la tabla usuarios (incluye asociacion_id)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select("id, asociacion_id").eq(
        "auth_user_id", auth_response.user.id
    ).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return resultado.data[0]


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
    colonia: Optional[str] = Form(None),
    municipio: Optional[str] = Form(None),
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
        "colonia": colonia,
        "municipio": municipio,
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
            }).eq("id", usuario_id).execute()
        else:
            usuario_insertado = supabase.table("usuarios").insert({
                "auth_user_id": auth_user_id,
                "nombre": nombre_responsable,
                "apellido_paterno": apellido_responsable,
                "email": contacto_email,
                "telefono": telefono_limpio,
                "asociacion_id": asociacion_id,
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
        "usuario": {
            "id": usuario_id,
            "nombre": nombre_responsable,
            "apellido_paterno": apellido_responsable,
            "email": contacto_email,
            "telefono": telefono_limpio,
            "asociacion_id": asociacion_id,
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


class NuevoRepresentante(BaseModel):
    nombre: str
    apellido_paterno: str
    apellido_materno: str | None = None
    telefono: str
    email: str | None = None


@router.post("/{asociacion_id}/representantes", status_code=201)
async def agregar_representante(asociacion_id: str, body: NuevoRepresentante, authorization: str = Header(None)):
    """Permite a un representante ya logueado agregar a alguien más como
    representante de la misma asociación. No crea contraseña aquí — solo deja
    la fila lista para que esa persona se registre normal en /auth/register
    con el mismo teléfono, momento en el que el flujo de reclamo de cuenta
    de invitado (ya existente) la vincula automáticamente."""
    usuario = _obtener_usuario_autenticado(authorization)

    if usuario.get("asociacion_id") != asociacion_id:
        raise HTTPException(status_code=403, detail="No tienes permiso sobre esta asociación")

    asociacion = supabase.table("asociaciones").select("verificado").eq("id", asociacion_id).execute()
    if not asociacion.data or not asociacion.data[0]["verificado"]:
        raise HTTPException(status_code=403, detail="Tu asociación todavía no ha sido aprobada")

    telefono_limpio = body.telefono.replace(" ", "").replace("-", "")
    if not validar_telefono(telefono_limpio):
        raise HTTPException(status_code=422, detail="El teléfono debe tener exactamente 10 dígitos numéricos.")
    if body.email and not validar_email(body.email):
        raise HTTPException(status_code=422, detail="Ingresa un correo electrónico válido.")

    existente = supabase.table("usuarios").select("id, auth_user_id").eq(
        "telefono", telefono_limpio
    ).execute()

    if existente.data:
        if existente.data[0].get("auth_user_id"):
            raise HTTPException(status_code=409, detail="Ese teléfono ya pertenece a una cuenta con acceso")
        supabase.table("usuarios").update({
            "asociacion_id": asociacion_id,
        }).eq("id", existente.data[0]["id"]).execute()
    else:
        supabase.table("usuarios").insert({
            "nombre": body.nombre,
            "apellido_paterno": body.apellido_paterno,
            "apellido_materno": body.apellido_materno,
            "telefono": telefono_limpio,
            "email": body.email,
            "asociacion_id": asociacion_id,
        }).execute()

    return {"mensaje": "Representante agregado. Podrá iniciar sesión registrándose con ese mismo teléfono."}
