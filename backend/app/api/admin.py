from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from app.db.supabase import supabase, supabase_admin
from datetime import datetime, timezone
from app.models.association import RespuestaApelacionBody
from app.services.email_service import (email_asociacion_aprobada, email_asociacion_rechazada, email_apelacion_aprobada, email_apelacion_rechazada)
router = APIRouter()


def _verificar_admin(authorization: str | None) -> dict:
    """Valida el JWT y confirma que el usuario tiene el rol 'admin'."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select(
        "id, roles(nombre)"
    ).eq("auth_user_id", auth_response.user.id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    usuario = resultado.data[0]
    rol = usuario.get("roles")
    if not rol or rol.get("nombre") != "admin":
        raise HTTPException(status_code=403, detail="No tienes permisos de administrador")

    return usuario


@router.get("/asociaciones-pendientes", status_code=200)
async def listar_asociaciones_pendientes(authorization: str = Header(None)):
    _verificar_admin(authorization)

    resultado = supabase.table("asociaciones").select(
        "id, nombre, nombre_responsable, contacto_telefono, contacto_email, logo_url,created_at, asociacion_fotos(id)"
    ).eq("verificado", False).is_("motivo_rechazo", "null").execute()

    data = resultado.data

    for item in data:
        item["fotos_count"] = len(item.pop("asociacion_fotos", []))

    return resultado.data


class RechazoBody(BaseModel):
    motivo: str


@router.post("/asociaciones/{asociacion_id}/aprobar", status_code=200)
async def aprobar_asociacion(asociacion_id: str, authorization: str = Header(None)):
    _verificar_admin(authorization)

    # Obtener datos de la asociación para el email
    asociacion = supabase.table("asociaciones").select(
        "nombre, contacto_email"
    ).eq("id", asociacion_id).execute()

    supabase.table("asociaciones").update({"verificado": True}).eq("id", asociacion_id).execute()
    
    # Enviar email
    if asociacion.data:
        email_asociacion_aprobada(
            nombre_asociacion=asociacion.data[0]["nombre"],
            email=asociacion.data[0]["contacto_email"]
        )

    return {"mensaje": "Asociación aprobada"}


@router.post("/asociaciones/{asociacion_id}/rechazar", status_code=200)
async def rechazar_asociacion(asociacion_id: str, body: RechazoBody, authorization: str = Header(None)):
    _verificar_admin(authorization)

    #obtener datos de la asocacion para el email 
    asociacion = supabase.table("asociaciones").select(
        "nombre, contacto_email"
    ).eq("id", asociacion_id).execute()

    supabase.table("asociaciones").update({"motivo_rechazo": body.motivo}).eq("id", asociacion_id).execute()
    
    #Enviar Email 
    if asociacion.data:
        email_asociacion_rechazada(
            nombre_asociacion=asociacion.data[0]["nombre"],
            email=asociacion.data[0]["contacto_email"],
            motivo=body.motivo
        )

    return {"mensaje": "Asociación rechazada"}


### Endpoint: listar asociaciones con apleacion pedniente 
@router.get("/apelaciones", status_code=200)
async def listar_apelaciones(authorization: str = Header(None)):
    """Lista todas las apelaciones pendientes con datos de la asociación."""
    _verificar_admin(authorization)

    resultado = supabase.table("apelaciones").select(
        "id, mensaje, documentos_urls, estado, created_at, "
        "asociaciones(id, nombre, nombre_responsable, contacto_email, motivo_rechazo)"
    ).eq("estado", "pendiente").order("created_at", desc=False).execute()

    return resultado.data
### FIN: apelaciones pendientes 

### ENDPOINT: Admin aprueba o rechaza apelacion 
@router.patch("/apelaciones/{apelacion_id}", status_code=200)
async def resolver_apelacion(apelacion_id: str, body: RespuestaApelacionBody, authorization: str = Header(None)):
    """El admin aprueba o rechaza una apelación."""
    _verificar_admin(authorization)

    if body.decision not in ["aprobar", "rechazar"]:
        raise HTTPException(status_code=422, detail="La decisión debe ser 'aprobar' o 'rechazar'")

    # Obtener apelación
    apelacion = supabase.table("apelaciones").select(
        "id, asociacion_id, estado"
    ).eq("id", apelacion_id).execute()

    if not apelacion.data:
        raise HTTPException(status_code=404, detail="Apelación no encontrada")

    if apelacion.data[0]["estado"] != "pendiente":
        raise HTTPException(status_code=400, detail="Esta apelación ya fue resuelta")

    asociacion_id = apelacion.data[0]["asociacion_id"]

    # Obtener datos de la asociación
    asociacion = supabase.table("asociaciones").select(
        "nombre, contacto_email"
    ).eq("id", asociacion_id).execute()

    if body.decision == "aprobar":
        # Aprobar asociación
        supabase.table("asociaciones").update({
            "verificado": True,
            "motivo_rechazo": None,
        }).eq("id", asociacion_id).execute()

        supabase.table("apelaciones").update({
            "estado": "aprobada",
            "respuesta_admin": body.respuesta,
        }).eq("id", apelacion_id).execute()

        #envio de email
        if asociacion.data:
            email_apelacion_aprobada(
                nombre_asociacion=asociacion.data[0]["nombre"],
                email=asociacion.data[0]["contacto_email"]
            )

        return {"mensaje": "Apelación aprobada. La asociación ha sido verificada."}

    else:
        # Rechazar apelación
        supabase.table("apelaciones").update({
            "estado": "rechazada",
            "respuesta_admin": body.respuesta,
        }).eq("id", apelacion_id).execute()

        #rechazo email
        if asociacion.data:
            email_apelacion_rechazada(
                nombre_asociacion=asociacion.data[0]["nombre"],
                email=asociacion.data[0]["contacto_email"],
                respuesta=body.respuesta
            )

        return {"mensaje": "Apelación rechazada."}
    
### FIN: admin rechaza o acepta apelacion 

### INICIO: apelaciones aliados
@router.get("/apelaciones-aliados", status_code=200)
async def listar_apelaciones_aliados(authorization: str = Header(None)):
    """Lista todas las apelaciones pendientes de aliados."""
    _verificar_admin(authorization)

    resultado = supabase.table("apelaciones_aliados").select(
        "id, mensaje, documentos_urls, created_at, "
        "perfil_apoyo(id, datos_extra, tipo, usuario_id, "
        "usuarios(nombre, apellido_paterno, email))"
    ).eq("estado", "pendiente").order("created_at").execute()

    return resultado.data

@router.patch("/apelaciones-aliados/{apelacion_id}", status_code=200)
async def resolver_apelacion_aliado(apelacion_id: str, body: RespuestaApelacionBody, authorization: str = Header(None)):
    """El admin aprueba o rechaza una apelación de un aliado."""
    _verificar_admin(authorization)

    if body.decision not in ["aprobar", "rechazar"]:
        raise HTTPException(status_code=422, detail="La decisión debe ser 'aprobar' o 'rechazar'")

    apelacion = supabase.table("apelaciones_aliados").select(
        "id, perfil_apoyo_id, estado"
    ).eq("id", apelacion_id).execute()

    if not apelacion.data:
        raise HTTPException(status_code=404, detail="Apelación de aliado no encontrada")

    if apelacion.data[0]["estado"] != "pendiente":
        raise HTTPException(status_code=400, detail="Esta apelación ya fue resuelta")

    perfil_apoyo_id = apelacion.data[0]["perfil_apoyo_id"]

    if body.decision == "aprobar":
        supabase.table("perfil_apoyo").update({
            "verificado_admin": True,
            "razon_rechazo": None,
        }).eq("id", perfil_apoyo_id).execute()

        supabase.table("apelaciones_aliados").update({
            "estado": "aprobada",
            "respuesta_admin": body.respuesta,
        }).eq("id", apelacion_id).execute()

        return {"mensaje": "Apelación aprobada. El aliado ha sido verificado."}

    else:
        supabase.table("apelaciones_aliados").update({
            "estado": "rechazada",
            "respuesta_admin": body.respuesta,
        }).eq("id", apelacion_id).execute()

        return {"mensaje": "Apelación rechazada."}
### FIN: apelaciones aliados

@router.get("/asociaciones/{asociacion_id}", status_code=200)
async def obtener_detalle_asociacion(asociacion_id: str, authorization: str = Header(None)):
    """Detalle completo de una asociación para que el admin pueda revisar
    a fondo antes de aprobar/rechazar: datos de contacto, ubicación, logo,
    fotos del refugio y tipos de animales que rescatan."""
    _verificar_admin(authorization)

    resultado = supabase.table("asociaciones").select(
        "id, nombre, nombre_responsable, contacto_telefono, contacto_email, "
        "acerca_de, logo_url, horario_atencion, radio_km, tipos_animales, "
        "calle, colonia, municipio, referencia, latitud, longitud, "
        "verificado, motivo_rechazo, created_at, "
        "asociacion_fotos(id, foto_url, descripcion, orden)"
    ).eq("id", asociacion_id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Asociación no encontrada")

    asociacion = resultado.data[0]

    # Ordenar las fotos por el campo `orden` que ya captura el formulario
    fotos = sorted(asociacion.get("asociacion_fotos", []), key=lambda f: f.get("orden", 0))
    asociacion["fotos"] = fotos
    asociacion.pop("asociacion_fotos", None)

    return asociacion


class ResolverPerfilApoyoBody(BaseModel):
    decision: str
    razon_rechazo: str | None = None

@router.get("/perfiles-aliados-pendientes", status_code=200)
async def listar_perfiles_aliados_pendientes(authorization: str = Header(None)):
    _verificar_admin(authorization)

    # Buscar perfiles donde razon_rechazo es nulo y el tipo es aliado_local o patrocinador_institucional
    resultado = supabase.table("perfil_apoyo").select(
        "id, tipo, categorias, zona_cobertura, disponibilidad, niveles_urgencia_atendida, especies_atendidas, datos_extra, verificado_admin, created_at, usuario_id, usuarios(nombre, email, telefono)"
    ).in_("tipo", ["aliado_local", "patrocinador_institucional"]).is_("razon_rechazo", "null").execute()

    # Filtrar en python para estar 100% seguros de que verificado_admin no sea True
    pendientes = [p for p in resultado.data if p.get("verificado_admin") is not True]
    
    return pendientes


@router.patch("/perfiles-aliados/{perfil_id}/resolver", status_code=200)
async def resolver_perfil_aliado(perfil_id: str, body: ResolverPerfilApoyoBody, authorization: str = Header(None)):
    _verificar_admin(authorization)

    if body.decision not in ["aprobar", "rechazar"]:
        raise HTTPException(status_code=400, detail="Decisión inválida")

    if body.decision == "aprobar":
        from datetime import datetime, timezone
        
        update_data = {
            "verificado_admin": True,
            "verificado_admin_at": datetime.now(timezone.utc).isoformat(),
            "razon_rechazo": None
        }
    else:
        if not body.razon_rechazo or not body.razon_rechazo.strip():
            raise HTTPException(status_code=400, detail="Debe proveer una razón de rechazo")
        update_data = {
            "verificado_admin": False,
            "razon_rechazo": body.razon_rechazo.strip()
        }

    resultado = supabase.table("perfil_apoyo").update(update_data).eq("id", perfil_id).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    return {"message": f"Perfil {body.decision}d exitosamente", "data": resultado.data[0]}


class ResolverModeracionReporteBody(BaseModel):
    decision: str
    notas: str | None = None


@router.get("/reportes-moderacion", status_code=200)
async def listar_reportes_moderacion(authorization: str = Header(None)):
    """Cola de casos ocultos por denuncias y alertas perceptuales."""
    _verificar_admin(authorization)
    resultado = (
        supabase_admin.table("reportes")
        .select(
            "id, usuario_id, estado_reporte, estado_moderacion, moderacion_origen, "
            "moderacion_actualizada_at, calle, colonia, municipio, estado_ubicacion, "
            "referencia, latitud, longitud, ubicacion_fuente, created_at, "
            "reportante_nombre, reportante_apellido_paterno, reportante_apellido_materno, "
            "reportante_telefono, "
            "phash_alerta, phash_coincidencia_reporte_id, phash_distancia, "
            "animal(id, orden, cantidad, es_grupo, sexo, edad_aproximada, descripcion, "
            "especie_descripcion, tiene_collar, esta_prenada, es_agresivo, "
            "es_domestico_probable, trae_crias_nacidas, numero_crias_nacidas, "
            "tipo_animal_catalogo(clave), condicion_catalogo(clave), "
            "tamanio_catalogo(clave), animal_fotos(id, foto_url, orden)), "
            "reporte_denuncias(id, motivo, detalle, created_at, resuelta_at, resolucion)"
        )
        .or_("estado_moderacion.eq.en_revision,phash_alerta.eq.true")
        .order("moderacion_actualizada_at", desc=False)
        .execute()
    )
    reportes = resultado.data or []
    usuarios_ids = list({r.get("usuario_id") for r in reportes if r.get("usuario_id")})
    usuarios_por_id = {}
    if usuarios_ids:
        usuarios = supabase_admin.table("usuarios").select(
            "id, nombre, apellido_paterno, apellido_materno, email, telefono"
        ).in_("id", usuarios_ids).execute()
        usuarios_por_id = {u["id"]: u for u in (usuarios.data or [])}
    for reporte in reportes:
        reporte["reportante"] = usuarios_por_id.get(reporte.get("usuario_id"))
    return reportes


@router.patch("/reportes-moderacion/{reporte_id}", status_code=200)
async def resolver_moderacion_reporte(
    reporte_id: str,
    body: ResolverModeracionReporteBody,
    authorization: str = Header(None),
):
    admin = _verificar_admin(authorization)
    if body.decision not in ("aprobar", "rechazar"):
        raise HTTPException(status_code=422, detail="La decisión debe ser aprobar o rechazar")
    if body.decision == "rechazar" and not (body.notas or "").strip():
        raise HTTPException(status_code=422, detail="Indica el motivo del rechazo")

    consulta = supabase_admin.table("reportes").select(
        "id, usuario_id, estado_moderacion, estado_reporte"
    ).eq("id", reporte_id).limit(1).execute()
    if not consulta.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    ahora = datetime.now(timezone.utc).isoformat()
    estado = "aprobado" if body.decision == "aprobar" else "rechazado"
    supabase_admin.table("reportes").update({
        "estado_moderacion": estado,
        "moderacion_revisada_por": admin["id"],
        "moderacion_notas": (body.notas or "").strip() or None,
        "moderacion_actualizada_at": ahora,
        "phash_alerta": False,
    }).eq("id", reporte_id).execute()
    supabase_admin.table("reporte_denuncias").update({
        "resuelta_at": ahora,
        "resolucion": estado,
    }).eq("reporte_id", reporte_id).is_("resuelta_at", "null").execute()

    reportante_id = consulta.data[0].get("usuario_id")
    if reportante_id:
        mensaje = (
            "Revisamos tu reporte y volvió a estar visible."
            if estado == "aprobado"
            else f"Tu reporte fue retirado después de una revisión. Motivo: {(body.notas or '').strip()}"
        )
        supabase_admin.table("notificaciones_moderacion").insert({
            "usuario_id": reportante_id,
            "reporte_id": reporte_id,
            "tipo": estado,
            "mensaje": mensaje,
        }).execute()

    from app.services.report_service import registrar_historial
    registrar_historial(
        reporte_id=reporte_id,
        usuario_id=admin["id"],
        tipo_evento=f"moderacion_{estado}",
        descripcion=f"El administrador marcó el reporte como {estado}",
        datos_extra={"notas": (body.notas or "").strip() or None},
    )
    return {"mensaje": "Moderación resuelta", "estado_moderacion": estado}
