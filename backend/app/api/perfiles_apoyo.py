from fastapi import APIRouter, Header, HTTPException, File, Form, UploadFile
from pydantic import BaseModel
from typing import List, Optional
from app.db.supabase import supabase
from app.services.storage_service import subir_foto
from app.utils.validators import validar_nombre

router = APIRouter()

def _obtener_usuario_autenticado(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select("id, telefono, roles(nombre)").eq("auth_user_id", auth_response.user.id).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    fila = resultado.data[0]
    fila["rol"] = fila["roles"]["nombre"] if fila.get("roles") else None
    return fila


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

class DonanteComunitarioRequest(BaseModel):
    categorias: List[str]
    subcategorias: Optional[List[str]] = []
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    radio_km: Optional[int] = None
    disponibilidad: str = "disponible"
    preferencia_visibilidad: Optional[str] = None
    consentimiento_mural: Optional[bool] = False
    telefono: Optional[str] = None

@router.post("/donante-comunitario", status_code=201)
async def crear_donante_comunitario(body: DonanteComunitarioRequest, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("reportante", "voluntario_interno", "voluntario_externo", "staff"))
    usuario_id = usuario["id"]

    # Verificar si ya tiene un perfil
    existente = supabase.table("perfil_apoyo").select("id").eq("usuario_id", usuario_id).execute()
    if existente.data:
        raise HTTPException(status_code=409, detail="El usuario ya cuenta con un perfil de aliado.")

    # Si proporcionaron telefono y el usuario no tenia, actualizar usuario
    if body.telefono and not usuario.get("telefono"):
        supabase.table("usuarios").update({"telefono": body.telefono}).eq("id", usuario_id).execute()

    # Preparar el insert.
    data = {
        "usuario_id": usuario_id,
        "tipo": "donante_comunitario",
        "categorias": body.categorias,
        "disponibilidad": body.disponibilidad,
        "preferencia_visibilidad": body.preferencia_visibilidad,
        "radio_km": body.radio_km,
        "datos_extra": {
            "consentimiento_mural": body.consentimiento_mural,
            "subcategorias": body.subcategorias
        }
    }

    if body.latitud is not None and body.longitud is not None:
        data["zona_cobertura"] = f"POINT({body.longitud} {body.latitud})"
        
    resultado = supabase.table("perfil_apoyo").insert(data).execute()
    return resultado.data[0]

class RegistroAliadoDirectoRequest(BaseModel):
    tipo: str
    categorias: List[str]
    subcategorias: Optional[List[str]] = []
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    radio_km: Optional[int] = None
    disponibilidad: str = "disponible"
    preferencia_visibilidad: Optional[str] = None
    
    # Base
    nombre_negocio: Optional[str] = None
    forma_colaboracion: Optional[str] = None
    logistica: Optional[str] = None
    horario_contacto: Optional[str] = None
    logo_url: Optional[str] = None
    descripcion: Optional[str] = None
    acepta_terminos: bool = False
    tipo_establecimiento: Optional[str] = None
    
    # Veterinaria
    medico_responsable: Optional[str] = None
    cedula_profesional: Optional[str] = None
    documento_verificacion_url: Optional[str] = None
    requiere_cita: Optional[bool] = None
    niveles_urgencia_atendida: Optional[List[str]] = []
    especies_atendidas: Optional[List[str]] = []
    
    # Difusion
    tipo_apoyo_difusion: Optional[List[str]] = []
    area_servicio_profesional: Optional[str] = None
    nombre_contacto_campana: Optional[str] = None
    cargo_contacto_campana: Optional[str] = None
    
    # Institucional
    razon_social: Optional[str] = None
    tipo_institucion: Optional[str] = None
    nombre_representante: Optional[str] = None
    cargo_representante: Optional[str] = None
    rfc: Optional[str] = None
    tipo_documento_verificacion: Optional[str] = None

@router.post("/registro-directo", status_code=201)
async def registro_directo_aliado(
    payload: str = Form(...),
    documento: Optional[UploadFile] = File(None),
    logo: Optional[UploadFile] = File(None),
    authorization: str = Header(None)
):
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, (None,))
    usuario_id = usuario["id"]

    body = RegistroAliadoDirectoRequest.parse_raw(payload)

    # nombre_representante solo es obligatorio para patrocinador_institucional
    # (aliado_local no lo captura en el formulario — ver RegistroAliadoLocalScreen.tsx
    # validarPaso2, rama institucional).
    nombre_representante_valido, nombre_representante_mensaje = validar_nombre(
        body.nombre_representante or "",
        requerido=(body.tipo == "patrocinador_institucional"),
        campo="nombre del representante",
    )
    if not nombre_representante_valido:
        raise HTTPException(status_code=422, detail=nombre_representante_mensaje)

    nombre_contacto_campana_valido, nombre_contacto_campana_mensaje = validar_nombre(
        body.nombre_contacto_campana or "", requerido=False, campo="nombre del responsable de campaña"
    )
    if not nombre_contacto_campana_valido:
        raise HTTPException(status_code=422, detail=nombre_contacto_campana_mensaje)

    # Verificar si ya tiene un perfil
    existente = supabase.table("perfil_apoyo").select("id").eq("usuario_id", usuario_id).execute()
    if existente.data:
        raise HTTPException(status_code=409, detail="El usuario ya cuenta con un perfil de aliado.")

    subcarpeta_base = "patrocinadores institucionales" if body.tipo == "patrocinador_institucional" else "aliados locales"
    carpeta_docs = f"documentos_aliados/{subcarpeta_base}/documentos_institucionales"
    carpeta_logos = f"documentos_aliados/{subcarpeta_base}/logos"

    # Upload document if provided
    if documento and documento.filename:
        body.documento_verificacion_url = await subir_foto(documento, carpeta=carpeta_docs)
        
    # Upload logo if provided
    if logo and logo.filename:
        body.logo_url = await subir_foto(logo, carpeta=carpeta_logos)

    # Preparar el insert.
    datos_extra = {
        "subcategorias": body.subcategorias,
        "nombre_negocio": body.nombre_negocio,
        "forma_colaboracion": body.forma_colaboracion,
        "logistica": body.logistica,
        "horario_contacto": body.horario_contacto,
        "logo_url": body.logo_url,
        "descripcion": body.descripcion,
        "acepta_terminos": body.acepta_terminos,
        "tipo_establecimiento": body.tipo_establecimiento,
        "medico_responsable": body.medico_responsable,
        "cedula_profesional": body.cedula_profesional,
        "documento_verificacion_url": body.documento_verificacion_url,
        "requiere_cita": body.requiere_cita,
        "tipo_apoyo_difusion": body.tipo_apoyo_difusion,
        "area_servicio_profesional": body.area_servicio_profesional,
        "nombre_contacto_campana": body.nombre_contacto_campana,
        "cargo_contacto_campana": body.cargo_contacto_campana,
        "razon_social": body.razon_social,
        "tipo_institucion": body.tipo_institucion,
        "nombre_representante": body.nombre_representante,
        "cargo_representante": body.cargo_representante,
        "rfc": body.rfc,
        "tipo_documento_verificacion": body.tipo_documento_verificacion,
    }
    
    # Remove None values from datos_extra
    datos_extra = {k: v for k, v in datos_extra.items() if v is not None}

    data = {
        "usuario_id": usuario_id,
        "tipo": body.tipo,
        "categorias": body.categorias,
        "disponibilidad": body.disponibilidad,
        "preferencia_visibilidad": body.preferencia_visibilidad,
        "radio_km": body.radio_km,
        "datos_extra": datos_extra
    }
    
    if body.niveles_urgencia_atendida:
        data["niveles_urgencia_atendida"] = body.niveles_urgencia_atendida
    if body.especies_atendidas:
        data["especies_atendidas"] = body.especies_atendidas

    if body.latitud is not None and body.longitud is not None:
        data["zona_cobertura"] = f"POINT({body.longitud} {body.latitud})"
        
    resultado = supabase.table("perfil_apoyo").insert(data).execute()
    return resultado.data[0]
