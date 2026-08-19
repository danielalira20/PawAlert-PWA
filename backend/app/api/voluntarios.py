from fastapi import (
    APIRouter,
    BackgroundTasks,
    HTTPException,
    Header,
    UploadFile,
    File,
    Form,
)
from app.db.supabase import supabase
from app.models.voluntario import (
    CapacidadesDraftContextEnum,
    CapacidadesDraftRequest,
    CapacidadesRequest,
    CheckInVisitaRequest,
    ChecklistVisitaRequest,
    DisponibilidadOperativaRequest,
    FinalizarPostulacionInternoRequest,
    PostulacionRequest,
    ProponerHorarioVisitaRequest,
    ResponderHorarioPostulanteRequest,
    ResponderPropuestaVerificacionRequest,
    ResultadoVisitaRequest,
)
import json

from app.services.voluntario_service import (
    asegurar_perfil_voluntario_interno,
    finalizar_postulacion_interno,
    obtener_mi_voluntario,
    obtener_capacidades,
    guardar_capacidades,
    obtener_borrador_capacidades,
    guardar_borrador_capacidades,
    eliminar_borrador_capacidades,
    obtener_disponibilidad_operativa,
    actualizar_disponibilidad_operativa,
    obtener_reportes_voluntario,
    crear_perfil_externo,
    obtener_perfil_externo,
)
from app.services.home_verification_service import (
    enviar_evidencia_solicitada,
    finalizar_postulacion_externa,
    confirmar_horario_como_verificador,
    guardar_checklist_visita,
    listar_propuestas_verificacion_hogar,
    obtener_coordinacion_visita_postulante,
    obtener_propuesta_verificacion_hogar,
    proponer_horario_verificacion_hogar,
    registrar_check_in_visita,
    registrar_check_out_visita,
    registrar_actualizacion_formulario_solicitada,
    responder_horario_como_postulante,
    responder_propuesta_verificacion_hogar,
    resolver_resultado_visita,
)
from app.services.video_evidence_service import procesar_evidencia_verificacion
from app.services.whatsapp_notification_service import (
    notificar_evento_asignacion,
)

router = APIRouter()


def _obtener_usuario_autenticado(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select("id, asociacion_id, roles(nombre)").eq(
        "auth_user_id", auth_response.user.id
    ).execute()

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


@router.post("/postulaciones", status_code=201)
async def postularse_como_voluntario(body: PostulacionRequest, authorization: str = Header(None)):
    """Prepara el perfil de voluntario interno (fila `voluntarios` en estado
    'postulacion_pendiente') para que el usuario pueda llenar su formulario de
    capacidades. La fila en `postulaciones` todavía NO se crea aquí — se crea
    al terminar ese formulario, en POST /voluntarios/interno/finalizar, para
    no dejar una postulación sin capacidades si el usuario abandona a medias."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("reportante",))
    resultado = await asegurar_perfil_voluntario_interno(usuario["id"])
    return {**resultado, "asociacion_id": body.asociacion_id}


@router.post("/interno/finalizar", status_code=201)
async def finalizar_postulacion_voluntario_interno(
    body: FinalizarPostulacionInternoRequest, authorization: str = Header(None)
):
    """Crea la postulación de voluntario interno — el paso que de verdad
    compromete. Solo se llama al guardar con éxito el formulario de
    capacidades (ver CapacidadesFormScreen.tsx)."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await finalizar_postulacion_interno(usuario["id"], body.asociacion_id)


@router.get("/me", status_code=200)
async def get_mi_voluntario(authorization: str = Header(None)):
    """Estado actual del perfil de voluntario del usuario logueado (para la
    pantalla 'Mi postulación')."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_mi_voluntario(usuario["id"])


def _obtener_voluntario_id_propio(usuario_id: str) -> str:
    """Resuelve el id de voluntarios a partir del usuario logueado. Se usa en
    los endpoints de capacidades, que operan sobre el perfil de voluntario,
    no directamente sobre el usuario."""
    resultado = supabase.table("voluntarios").select("id").eq(
        "usuario_id", usuario_id
    ).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="No tienes un perfil de voluntario")

    return resultado.data[0]["id"]


@router.get("/me/verificaciones", status_code=200)
async def get_mis_verificaciones_hogar(
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return listar_propuestas_verificacion_hogar(voluntario_id)


@router.get("/me/verificaciones/{asignacion_id}", status_code=200)
async def get_mi_verificacion_hogar(
    asignacion_id: str,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return obtener_propuesta_verificacion_hogar(
        asignacion_id,
        voluntario_id,
    )


@router.patch(
    "/me/verificaciones/{asignacion_id}/responder",
    status_code=200,
)
async def patch_responder_verificacion_hogar(
    asignacion_id: str,
    body: ResponderPropuestaVerificacionRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    resultado = responder_propuesta_verificacion_hogar(
        asignacion_id=asignacion_id,
        verificador_voluntario_id=voluntario_id,
        respuesta=body.respuesta.value,
        motivo=body.motivo,
    )
    if body.respuesta.value == "aceptar":
        background_tasks.add_task(
            notificar_evento_asignacion,
            "verificador_asignado",
            asignacion_id,
        )
    return resultado


@router.patch(
    "/me/verificaciones/{asignacion_id}/horario",
    status_code=200,
)
async def patch_proponer_horario_verificacion(
    asignacion_id: str,
    body: ProponerHorarioVisitaRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    resultado = proponer_horario_verificacion_hogar(
        asignacion_id=asignacion_id,
        verificador_voluntario_id=voluntario_id,
        horario=body.horario,
        motivo=body.motivo,
    )
    background_tasks.add_task(
        notificar_evento_asignacion,
        "horario_propuesto_postulante",
        asignacion_id,
    )
    return resultado


@router.patch(
    "/me/verificaciones/{asignacion_id}/horario/confirmar",
    status_code=200,
)
async def patch_confirmar_horario_verificacion(
    asignacion_id: str,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    resultado = confirmar_horario_como_verificador(
        asignacion_id=asignacion_id,
        verificador_voluntario_id=voluntario_id,
    )
    background_tasks.add_task(
        notificar_evento_asignacion,
        "horario_confirmado",
        asignacion_id,
    )
    return resultado


@router.patch(
    "/me/verificaciones/{asignacion_id}/check-in",
    status_code=200,
)
async def patch_check_in_verificacion(
    asignacion_id: str,
    body: CheckInVisitaRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    resultado = registrar_check_in_visita(
        asignacion_id=asignacion_id,
        verificador_voluntario_id=voluntario_id,
        latitud=body.latitud,
        longitud=body.longitud,
    )
    background_tasks.add_task(
        notificar_evento_asignacion,
        "check_in_asociacion",
        asignacion_id,
    )
    return resultado


@router.put(
    "/me/verificaciones/{asignacion_id}/checklist",
    status_code=200,
)
async def put_checklist_verificacion(
    asignacion_id: str,
    body: ChecklistVisitaRequest,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return guardar_checklist_visita(
        asignacion_id=asignacion_id,
        verificador_voluntario_id=voluntario_id,
        checklist=body.model_dump(mode="json"),
    )


@router.patch(
    "/me/verificaciones/{asignacion_id}/check-out",
    status_code=200,
)
async def patch_check_out_verificacion(
    asignacion_id: str,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    resultado = registrar_check_out_visita(
        asignacion_id=asignacion_id,
        verificador_voluntario_id=voluntario_id,
    )
    background_tasks.add_task(
        notificar_evento_asignacion,
        "check_out_asociacion",
        asignacion_id,
    )
    background_tasks.add_task(
        notificar_evento_asignacion,
        "visita_finalizada_postulante",
        asignacion_id,
    )
    return resultado


@router.patch(
    "/me/verificaciones/{asignacion_id}/resultado",
    status_code=200,
)
async def patch_resultado_verificacion(
    asignacion_id: str,
    body: ResultadoVisitaRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    resultado = resolver_resultado_visita(
        asignacion_id=asignacion_id,
        verificador_voluntario_id=voluntario_id,
        resultado=body.resultado.value,
        motivo=body.motivo,
    )
    background_tasks.add_task(
        notificar_evento_asignacion,
        "resultado_actualizado",
        asignacion_id,
    )
    return resultado


@router.get("/me/coordinacion-visita", status_code=200)
async def get_coordinacion_visita_postulante(
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return obtener_coordinacion_visita_postulante(voluntario_id)


@router.patch("/me/coordinacion-visita/responder", status_code=200)
async def patch_responder_horario_postulante(
    body: ResponderHorarioPostulanteRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    resultado = responder_horario_como_postulante(
        voluntario_postulante_id=voluntario_id,
        respuesta=body.respuesta.value,
        horario=body.horario,
        motivo=body.motivo,
    )
    asignacion_id = resultado.get("asignacion_id")
    if asignacion_id:
        background_tasks.add_task(
            notificar_evento_asignacion,
            (
                "horario_confirmado"
                if body.respuesta.value == "confirmar"
                else "horario_propuesto_verificador"
            ),
            asignacion_id,
        )
    return resultado


@router.get("/me/capacidades/borrador", status_code=200)
async def get_mi_borrador_capacidades(
    contexto: CapacidadesDraftContextEnum = CapacidadesDraftContextEnum.perfil,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_borrador_capacidades(usuario["id"], contexto.value)


@router.put("/me/capacidades/borrador", status_code=200)
async def put_mi_borrador_capacidades(
    body: CapacidadesDraftRequest,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    return await guardar_borrador_capacidades(
        usuario["id"],
        body.contexto.value,
        body.model_dump(mode="json"),
    )


@router.delete("/me/capacidades/borrador", status_code=200)
async def delete_mi_borrador_capacidades(
    contexto: CapacidadesDraftContextEnum = CapacidadesDraftContextEnum.perfil,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    return await eliminar_borrador_capacidades(usuario["id"], contexto.value)


@router.get("/me/capacidades", status_code=200)
async def get_mis_capacidades(authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return await obtener_capacidades(voluntario_id)


@router.put("/me/capacidades", status_code=200)
async def put_mis_capacidades(body: CapacidadesRequest, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    # mode="json" convierte los Enum del contrato v2 a las claves de texto
    # que se persisten en PostgreSQL.
    return await guardar_capacidades(
        voluntario_id,
        body.model_dump(mode="json", exclude_unset=True),
    )


@router.get("/me/disponibilidad-operativa", status_code=200)
async def get_mi_disponibilidad_operativa(authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return await obtener_disponibilidad_operativa(voluntario_id)


@router.patch("/me/disponibilidad-operativa", status_code=200)
async def patch_mi_disponibilidad_operativa(
    body: DisponibilidadOperativaRequest,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return await actualizar_disponibilidad_operativa(
        voluntario_id=voluntario_id,
        disponible=body.disponible,
        pausa_hasta=body.pausa_hasta,
    )


@router.get("/me/reportes", status_code=200)
async def get_mis_reportes_voluntario(authorization: str = Header(None)):
    """Reemplaza GET /staff/me/reportes (migración staff -> voluntario_interno).
    Mismos 4 buckets (pendientes/en_accion/completados/historial).
    Se ha unificado la lógica para permitir acceso al rol 'staff' consultando directamente su staff_asignado_id."""
    usuario = _obtener_usuario_autenticado(authorization)
    
    # 1. Ampliamos la validación para dejar entrar al staff
    _verificar_rol(usuario, ("voluntario_interno", "voluntario_externo", "staff"))

    # 2. Pasamos el ID del usuario y su rol al servicio
    return await obtener_reportes_voluntario(usuario["id"], usuario["rol"])


# ---------------------------------------------------------------------------
# NUEVO ENDPOINT: POSTULACIÓN VOLUNTARIO EXTERNO (CASA TEMPORAL)
# ---------------------------------------------------------------------------
@router.get("/externo/perfil", status_code=200)
async def get_perfil_voluntario_externo(
    authorization: str = Header(None),
):
    """Devuelve el borrador de casa temporal para editar o re-postular."""
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return await obtener_perfil_externo(voluntario_id)


@router.post("/externo/postular", status_code=201)
async def postular_voluntario_externo(
    background_tasks: BackgroundTasks,
    datos: str = Form(...),
    identificacion: UploadFile | None = File(None),
    video: UploadFile | None = File(None),
    foto_accesos: UploadFile | None = File(None),
    foto_bardas: UploadFile | None = File(None),
    foto_balcones: UploadFile | None = File(None),
    foto_espacio: UploadFile | None = File(None),
    authorization: str = Header(None)
):
    """Crea o actualiza el formulario de casa temporal y sus evidencias."""

    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("reportante",))

    # 1. Asegurar que el usuario tenga un registro base en "voluntarios"
    resultado = supabase.table("voluntarios").select("id").eq("usuario_id", usuario["id"]).execute()
    
    if resultado.data:
        voluntario_id = resultado.data[0]["id"]
    else:
        nuevo = supabase.table("voluntarios").insert({
            "usuario_id": usuario["id"],
            "estado": "postulacion_pendiente"
        }).execute()
        voluntario_id = nuevo.data[0]["id"]

    # 2. Parsear el string JSON a diccionario de Python
    try:
        datos_json = json.loads(datos)
    except Exception:
        raise HTTPException(status_code=400, detail="El campo 'datos' no tiene un formato válido.")

    # 3. Enviar todo al servicio de lógica
    try:
        perfil = await crear_perfil_externo(
            voluntario_id=voluntario_id,
            datos_json=datos_json,
            identificacion_file=identificacion,
            video_file=video,
            foto_accesos=foto_accesos,
            foto_bardas=foto_bardas,
            foto_balcones=foto_balcones,
            foto_espacio=foto_espacio
        )
        correccion = registrar_actualizacion_formulario_solicitada(
            voluntario_id,
            perfil,
            identificacion_actualizada=identificacion is not None,
            video_actualizado=video is not None,
        )
        if correccion and correccion.get("reanalisar_video"):
            background_tasks.add_task(
                procesar_evidencia_verificacion,
                correccion["verificacion_id"],
                True,
            )
        return {
            "message": "Postulación como casa temporal recibida con éxito", 
            "perfil_id": perfil["id"],
            "correccion": correccion,
        }
    except HTTPException:
        raise
    except Exception as e:
        # Esto atrapará errores de Supabase (como intentar postularse dos veces) o de storage
        raise HTTPException(status_code=400, detail=f"Error al guardar postulación: {str(e)}")


@router.post("/externo/finalizar", status_code=201)
async def finalizar_postulacion_voluntario_externo(
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
):
    """Finaliza el expediente después de guardar casa y capacidades.

    Asigna la postulación a la asociación activa y verificada más cercana y
    crea el proceso de verificación de hogar. Repetir la petición no duplica
    el expediente.
    """
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    resultado = await finalizar_postulacion_externa(voluntario_id)
    background_tasks.add_task(
        procesar_evidencia_verificacion,
        resultado["verificacion_id"],
    )
    return resultado


@router.post("/externo/evidencia-solicitada", status_code=202)
async def post_evidencia_solicitada_voluntario_externo(
    background_tasks: BackgroundTasks,
    video: UploadFile | None = File(None),
    identificacion: UploadFile | None = File(None),
    fotos: list[UploadFile] | None = File(None),
    correcciones_json: str | None = Form(None),
    authorization: str = Header(None),
):
    """Entrega los elementos solicitados en la ronda de correcciones activa."""
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    try:
        correcciones = (
            json.loads(correcciones_json)
            if correcciones_json
            else {}
        )
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=422,
            detail="Las correcciones enviadas no tienen un formato válido",
        )
    resultado = await enviar_evidencia_solicitada(
        voluntario_id,
        video_file=video,
        identificacion_file=identificacion,
        fotos_files=fotos or [],
        correcciones=correcciones,
    )
    if resultado.get("reanalisar_video"):
        background_tasks.add_task(
            procesar_evidencia_verificacion,
            resultado["verificacion_id"],
            True,
        )
    return resultado
