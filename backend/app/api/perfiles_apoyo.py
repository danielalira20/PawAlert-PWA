from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.db.supabase import supabase

router = APIRouter()

def _obtener_usuario_autenticado(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select("id, telefono").eq("auth_user_id", auth_response.user.id).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return resultado.data[0]

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
    contacto_responsable_campana: Optional[str] = None
    
    # Institucional
    razon_social: Optional[str] = None
    tipo_institucion: Optional[str] = None
    nombre_representante: Optional[str] = None
    rfc: Optional[str] = None

@router.post("/registro-directo", status_code=201)
async def registro_directo_aliado(body: RegistroAliadoDirectoRequest, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    usuario_id = usuario["id"]

    # Verificar si ya tiene un perfil
    existente = supabase.table("perfil_apoyo").select("id").eq("usuario_id", usuario_id).execute()
    if existente.data:
        raise HTTPException(status_code=409, detail="El usuario ya cuenta con un perfil de aliado.")

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
        "contacto_responsable_campana": body.contacto_responsable_campana,
        "razon_social": body.razon_social,
        "tipo_institucion": body.tipo_institucion,
        "nombre_representante": body.nombre_representante,
        "rfc": body.rfc,
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
