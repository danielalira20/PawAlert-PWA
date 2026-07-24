import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.home_verification_service import generar_resumen_expediente
from app.services import home_verification_service


def test_generar_resumen_expediente_organiza_respuestas_con_etiquetas():
    perfil = {
        "municipio": "Toluca",
        "estado_ubicacion": "Estado de México",
        "tipo_vivienda": "casa",
        "subcategoria_vivienda": "propia",
        "acepta_visita": "si",
        "autorizacion_propietario": "si",
        "puede_aislar": "si",
        "otros_animales": "no",
        "identificacion_url": "https://example.test/identificacion.jpg",
        "video_recorrido_url": "https://example.test/recorrido.mp4",
        "consentimiento_evidencia": True,
        "preferencia_especies": ["perro"],
        "preferencia_tamanios": ["pequeno"],
        "horarios_visita": [{"dia": "lun", "hora": "10:00"}],
    }
    capacidades = {
        "disponibilidad": {
            "dias": ["lun", "mie"],
            "franjas": ["matutino"],
        },
        "tiempo_reaccion": "inmediata",
        "disponibilidad_urgencias": "ocasional",
        "max_casos_simultaneos": 1,
        "radio_max_km": 10,
        "medios_transporte": ["automovil"],
        "vehiculo_apto_traslado": True,
        "tamanios_traslado": ["pequeno"],
        "especies_manejo": ["perro", "gato"],
        "tamanios_manejo": ["pequeno"],
        "primeros_auxilios_nivel": "basico",
        "experiencias_campo": ["cachorros_neonatos"],
        "vias_tratamiento": ["oral"],
        "trayectoria_tipos": ["mascotas_propias"],
        "experiencia_anios": "entre_1_3",
        "equipamiento": ["transportadora_chica"],
        "restricciones_fisicas": ["ninguna"],
        "canal_contacto": "whatsapp",
        "proyeccion_colaboracion": "continua",
        "motivaciones": ["salvar_animales"],
    }

    resumen = generar_resumen_expediente(perfil, capacidades)

    assert resumen["version"] == 1
    assert resumen["disponibilidad"]["dias"] == ["Lunes", "Miércoles"]
    assert resumen["disponibilidad"]["urgencias"] == "Solo en algunas ocasiones"
    assert resumen["movilidad"]["medios_transporte"] == ["Automóvil"]
    assert resumen["manejo_animal"]["especies"] == ["Perros", "Gatos"]
    assert resumen["contacto_y_compromisos"]["proyeccion"] == "Participación continua"
    assert resumen["evidencias"]["video_recibido"] is True
    assert resumen["alertas"] == []


def test_generar_resumen_expediente_senala_respuestas_a_revisar_sin_decidir():
    perfil = {
        "acepta_visita": "no",
        "autorizacion_propietario": "no",
        "puede_aislar": "no",
        "otros_animales": "si",
        "animales_vacunados": "no",
        "identificacion_url": "https://example.test/identificacion.jpg",
        "video_recorrido_url": None,
    }

    resumen = generar_resumen_expediente(perfil, {"disponibilidad": {}})
    claves = {alerta["clave"] for alerta in resumen["alertas"]}

    assert claves == {
        "no_acepta_visita",
        "sin_autorizacion",
        "sin_aislamiento",
        "animales_sin_vacunas",
        "sin_video",
    }
    assert "recomendacion" not in resumen
    assert "decision" not in resumen


def test_obtener_verificacion_recarga_candidatos_pendientes(make_query):
    verificaciones = make_query(data=[{
        "id": "ver-1",
        "perfil_casa_temporal_id": "perfil-1",
        "estado": "pendiente_asignacion",
    }])
    perfiles = make_query(data=[{
        "id": "perfil-1",
        "municipio": "Apizaco",
    }])
    asignaciones = make_query(data=[])
    candidatos = make_query(data=[{
        "voluntario_id": "vol-zenaida",
        "nombre": "Zenaida Huerta",
        "distancia_km": 2.41,
    }])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "verificaciones_hogar": verificaciones,
        "perfil_casa_temporal": perfiles,
        "asignaciones_verificacion_hogar": asignaciones,
    }[tabla]
    cliente.rpc.return_value = candidatos

    with patch.object(home_verification_service, "supabase_admin", cliente):
        resultado = (
            home_verification_service.obtener_verificacion_postulacion(
                "post-1",
                "asoc-1",
            )
        )

    assert resultado["candidatos"][0]["voluntario_id"] == "vol-zenaida"
    cliente.rpc.assert_called_once_with(
        "candidatos_verificacion_hogar",
        {"p_verificacion_hogar_id": "ver-1"},
    )


def test_finalizar_postulacion_externa_asigna_asociacion_y_crea_verificacion(
    make_query,
):
    perfil = make_query(data=[{
        "id": "perfil-1",
        "voluntario_id": "vol-1",
        "latitud": 19.28,
        "longitud": -99.65,
        "acepta_visita": "si",
        "autorizacion_propietario": "si",
        "puede_aislar": "si",
        "otros_animales": "no",
        "identificacion_url": "id.jpg",
        "video_recorrido_url": "video.mp4",
    }])
    capacidades = make_query(data=[{
        "voluntario_id": "vol-1",
        "disponibilidad": {"dias": ["lun"], "franjas": ["matutino"]},
    }])
    postulaciones = make_query(execute_results=[
        [],
        [],
        [{"id": "post-1", "numero_intento": 1}],
    ])
    verificaciones = make_query(data=[{"id": "ver-1"}])
    voluntarios = make_query(data=[{"id": "vol-1"}])
    rpc = make_query(data=[{
        "id": "asoc-1",
        "nombre": "Patitas Toluca",
        "distancia_km": "7.25",
    }])

    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "perfil_casa_temporal": perfil,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
        "verificaciones_hogar": verificaciones,
        "voluntarios": voluntarios,
    }[tabla]
    cliente.rpc.return_value = rpc

    with patch.object(home_verification_service, "supabase_admin", cliente):
        resultado = asyncio.run(
            home_verification_service.finalizar_postulacion_externa("vol-1")
        )

    post_creada = postulaciones.insert.call_args.args[0]
    verificacion_creada = verificaciones.insert.call_args.args[0]

    assert post_creada["asociacion_id"] == "asoc-1"
    assert post_creada["tipo"] == "externo"
    assert verificacion_creada["postulacion_id"] == "post-1"
    assert verificacion_creada["distancia_asociacion_km"] == 7.25
    assert verificacion_creada["resumen_expediente"]["version"] == 1
    assert resultado["asociacion_nombre"] == "Patitas Toluca"
    assert resultado["ya_existia"] is False


def test_finalizar_postulacion_externa_es_idempotente(make_query):
    perfil = make_query(data=[{
        "id": "perfil-1",
        "latitud": 19.28,
        "longitud": -99.65,
    }])
    capacidades = make_query(data=[{
        "voluntario_id": "vol-1",
        "disponibilidad": {},
    }])
    postulaciones = make_query(data=[{
        "id": "post-1",
        "asociacion_id": "asoc-1",
        "numero_intento": 1,
        "tipo": "externo",
    }])
    verificaciones = make_query(data=[{
        "id": "ver-1",
        "postulacion_id": "post-1",
        "asociacion_id": "asoc-1",
        "estado": "pendiente_revision",
        "modalidad": "por_definir",
        "distancia_asociacion_km": 7.25,
        "asociaciones": {"nombre": "Patitas Toluca"},
    }])

    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "perfil_casa_temporal": perfil,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
        "verificaciones_hogar": verificaciones,
    }[tabla]

    with patch.object(home_verification_service, "supabase_admin", cliente):
        resultado = asyncio.run(
            home_verification_service.finalizar_postulacion_externa("vol-1")
        )

    assert resultado["verificacion_id"] == "ver-1"
    assert resultado["ya_existia"] is True
    cliente.rpc.assert_not_called()


def test_revision_remota_puede_solicitar_nueva_evidencia(make_query):
    verificaciones = make_query(data=[{
        "id": "ver-1",
        "postulacion_id": "post-1",
        "voluntario_postulante_id": "vol-1",
        "asociacion_id": "asoc-1",
        "estado": "revision_remota",
        "modalidad": "remota",
    }])
    postulaciones = make_query(data=[{"id": "post-1", "estado": "pendiente"}])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "verificaciones_hogar": verificaciones,
        "postulaciones": postulaciones,
    }[tabla]

    with patch.object(home_verification_service, "supabase_admin", cliente):
        resultado = home_verification_service.resolver_verificacion_remota(
            "ver-1",
            "asoc-1",
            "solicitar_evidencia",
            "Muestra accesos y ventanas.",
        )

    actualizacion = verificaciones.update.call_args.args[0]
    assert resultado["estado"] == "requiere_cambios"
    assert actualizacion["estado"] == "requiere_cambios"
    assert actualizacion["motivo_resultado"] == "Muestra accesos y ventanas."
    postulaciones.update.assert_not_called()


def test_aprobar_revision_remota_activa_nivel_2(make_query):
    verificaciones = make_query(data=[{
        "id": "ver-1",
        "postulacion_id": "post-1",
        "voluntario_postulante_id": "vol-1",
        "asociacion_id": "asoc-1",
        "estado": "revision_remota",
        "modalidad": "remota",
    }])
    postulaciones = make_query(data=[{"id": "post-1", "estado": "pendiente"}])
    voluntarios = make_query(data=[{"id": "vol-1", "usuario_id": "user-1"}])
    roles = make_query(data=[{"id": "rol-externo"}])
    usuarios = make_query(data=[{"id": "user-1"}])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "verificaciones_hogar": verificaciones,
        "postulaciones": postulaciones,
        "voluntarios": voluntarios,
        "roles": roles,
        "usuarios": usuarios,
    }[tabla]

    with patch.object(home_verification_service, "supabase_admin", cliente):
        resultado = home_verification_service.resolver_verificacion_remota(
            "ver-1",
            "asoc-1",
            "aprobar",
        )

    assert resultado["estado"] == "aprobada"
    assert voluntarios.update.call_args.args[0]["estado"] == "activo_nivel_2"
    assert postulaciones.update.call_args.args[0]["estado"] == "aceptada"
    assert usuarios.update.call_args.args[0]["rol_id"] == "rol-externo"
    assert verificaciones.update.call_args.args[0]["estado"] == "aprobada"


def test_reemplazar_video_devuelve_expediente_a_revision_remota(make_query):
    postulaciones = make_query(data=[{"id": "post-1"}])
    verificaciones = make_query(data=[{
        "id": "ver-1",
        "perfil_casa_temporal_id": "perfil-1",
        "estado": "requiere_cambios",
        "modalidad": "remota",
    }])
    perfiles = make_query(data=[{"id": "perfil-1"}])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "postulaciones": postulaciones,
        "verificaciones_hogar": verificaciones,
        "perfil_casa_temporal": perfiles,
    }[tabla]
    video = MagicMock()
    video.content_type = "video/mp4"

    with (
        patch.object(home_verification_service, "supabase_admin", cliente),
        patch.object(
            home_verification_service.storage_service,
            "subir_foto",
            new=AsyncMock(return_value="https://storage.test/nuevo.mp4"),
        ),
    ):
        resultado = asyncio.run(
            home_verification_service.reemplazar_video_solicitado(
                "vol-1",
                video,
            )
        )

    assert resultado["estado"] == "revision_remota"
    assert perfiles.update.call_args.args[0]["video_recorrido_url"].endswith(
        "nuevo.mp4"
    )
    actualizacion = verificaciones.update.call_args.args[0]
    assert actualizacion["estado"] == "revision_remota"
    assert actualizacion["analisis_video_estado"] == "pendiente"
    assert actualizacion["analisis_video"] is None


def test_verificador_acepta_propuesta_sin_marcar_visita_programada(make_query):
    asignaciones = make_query(data=[{
        "id": "asig-1",
        "verificacion_hogar_id": "ver-1",
        "estado": "propuesta",
    }])
    verificaciones = make_query(data=[{"id": "ver-1"}])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "asignaciones_verificacion_hogar": asignaciones,
        "verificaciones_hogar": verificaciones,
    }[tabla]

    with patch.object(home_verification_service, "supabase_admin", cliente):
        resultado = (
            home_verification_service.responder_propuesta_verificacion_hogar(
                "asig-1",
                "vol-verificador",
                "aceptar",
            )
        )

    assert resultado["estado"] == "aceptada"
    assert resultado["estado_verificacion"] == "visita_aceptada"
    assert asignaciones.update.call_args.args[0]["estado"] == "aceptada"
    assert (
        verificaciones.update.call_args.args[0]["estado"]
        == "visita_aceptada"
    )


def test_verificador_rechaza_y_caso_regresa_a_asignacion(make_query):
    asignaciones = make_query(data=[{
        "id": "asig-1",
        "verificacion_hogar_id": "ver-1",
        "estado": "propuesta",
    }])
    verificaciones = make_query(data=[{"id": "ver-1"}])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "asignaciones_verificacion_hogar": asignaciones,
        "verificaciones_hogar": verificaciones,
    }[tabla]

    with patch.object(home_verification_service, "supabase_admin", cliente):
        resultado = (
            home_verification_service.responder_propuesta_verificacion_hogar(
                "asig-1",
                "vol-verificador",
                "rechazar",
                "No tengo disponibilidad esta semana.",
            )
        )

    assert resultado["estado"] == "rechazada"
    assert resultado["estado_verificacion"] == "pendiente_asignacion"
    assert asignaciones.update.call_args.args[0]["motivo_rechazo"]
    assert (
        verificaciones.update.call_args.args[0]["estado"]
        == "pendiente_asignacion"
    )


def test_verificador_propone_horario_sin_programar_visita(make_query):
    asignaciones = make_query(data=[{
        "id": "asig-1",
        "verificacion_hogar_id": "ver-1",
        "estado": "aceptada",
        "horario_estado": "sin_propuesta",
    }])
    verificaciones = make_query(data=[{"id": "ver-1"}])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "asignaciones_verificacion_hogar": asignaciones,
        "verificaciones_hogar": verificaciones,
    }[tabla]
    horario = datetime.now(timezone.utc) + timedelta(days=2)

    with patch.object(home_verification_service, "supabase_admin", cliente):
        resultado = (
            home_verification_service.proponer_horario_verificacion_hogar(
                "asig-1",
                "vol-verificador",
                horario,
            )
        )

    cambio = asignaciones.update.call_args.args[0]
    assert cambio["horario_estado"] == "pendiente_postulante"
    assert cambio["visita_programada_at"] is None
    assert resultado["estado_verificacion"] == "coordinando_visita"
    assert (
        verificaciones.update.call_args.args[0]["estado"]
        == "coordinando_visita"
    )


def test_postulante_confirma_y_programa_visita(make_query):
    asignaciones = make_query(data=[{"id": "asig-1"}])
    verificaciones = make_query(data=[{"id": "ver-1"}])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "asignaciones_verificacion_hogar": asignaciones,
        "verificaciones_hogar": verificaciones,
    }[tabla]
    coordinacion = {
        "id": "asig-1",
        "verificacion_hogar_id": "ver-1",
        "horario_estado": "pendiente_postulante",
        "horario_propuesto_at": "2026-08-10T16:00:00+00:00",
    }

    with (
        patch.object(home_verification_service, "supabase_admin", cliente),
        patch.object(
            home_verification_service,
            "obtener_coordinacion_visita_postulante",
            return_value=coordinacion,
        ),
    ):
        resultado = home_verification_service.responder_horario_como_postulante(
            "vol-postulante",
            "confirmar",
        )

    cambio = asignaciones.update.call_args.args[0]
    assert cambio["horario_estado"] == "confirmado"
    assert cambio["visita_programada_at"] == coordinacion["horario_propuesto_at"]
    assert resultado["estado_verificacion"] == "visita_programada"


def test_check_in_inicia_visita_programada(make_query):
    asignaciones = make_query(data=[{
        "id": "asig-1",
        "verificacion_hogar_id": "ver-1",
        "estado": "aceptada",
        "horario_estado": "confirmado",
        "visita_programada_at": "2026-08-10T16:00:00+00:00",
        "check_in_at": None,
        "check_out_at": None,
        "checklist": {},
        "resultado_visita": None,
    }])
    verificaciones = make_query(data=[{
        "id": "ver-1",
        "postulacion_id": "post-1",
        "perfil_casa_temporal_id": "perfil-1",
        "asociacion_id": "asoc-1",
        "voluntario_postulante_id": "vol-postulante",
        "estado": "visita_programada",
        "modalidad": "presencial",
    }])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "asignaciones_verificacion_hogar": asignaciones,
        "verificaciones_hogar": verificaciones,
    }[tabla]

    with patch.object(home_verification_service, "supabase_admin", cliente):
        resultado = home_verification_service.registrar_check_in_visita(
            "asig-1",
            "vol-verificador",
        )

    assert resultado["estado_verificacion"] == "visita_en_curso"
    assert asignaciones.update.call_args.args[0]["check_in_at"]
    assert verificaciones.update.call_args.args[0]["estado"] == "visita_en_curso"


def test_checklist_completo_permite_registrar_salida(make_query):
    checklist = {
        campo: "cumple"
        for campo in home_verification_service.CHECKLIST_VISITA_CAMPOS
    }
    asignaciones = make_query(data=[{
        "id": "asig-1",
        "verificacion_hogar_id": "ver-1",
        "estado": "aceptada",
        "horario_estado": "confirmado",
        "visita_programada_at": "2026-08-10T16:00:00+00:00",
        "check_in_at": "2026-08-10T16:02:00+00:00",
        "check_out_at": None,
        "checklist": checklist,
        "resultado_visita": None,
    }])
    verificaciones = make_query(data=[{
        "id": "ver-1",
        "postulacion_id": "post-1",
        "perfil_casa_temporal_id": "perfil-1",
        "asociacion_id": "asoc-1",
        "voluntario_postulante_id": "vol-postulante",
        "estado": "visita_en_curso",
        "modalidad": "presencial",
    }])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "asignaciones_verificacion_hogar": asignaciones,
        "verificaciones_hogar": verificaciones,
    }[tabla]

    with patch.object(home_verification_service, "supabase_admin", cliente):
        resultado = home_verification_service.registrar_check_out_visita(
            "asig-1",
            "vol-verificador",
        )

    assert resultado["estado_verificacion"] == "visita_realizada"
    assert asignaciones.update.call_args.args[0]["check_out_at"]
    assert verificaciones.update.call_args.args[0]["estado"] == "visita_realizada"


def test_resultado_presencial_puede_solicitar_ajustes(make_query):
    checklist = {
        campo: "cumple"
        for campo in home_verification_service.CHECKLIST_VISITA_CAMPOS
    }
    checklist["ventanas_balcones"] = "no_cumple"
    asignaciones = make_query(data=[{
        "id": "asig-1",
        "verificacion_hogar_id": "ver-1",
        "estado": "aceptada",
        "horario_estado": "confirmado",
        "visita_programada_at": "2026-08-10T16:00:00+00:00",
        "check_in_at": "2026-08-10T16:02:00+00:00",
        "check_out_at": "2026-08-10T16:40:00+00:00",
        "checklist": checklist,
        "resultado_visita": None,
    }])
    verificaciones = make_query(data=[{
        "id": "ver-1",
        "postulacion_id": "post-1",
        "perfil_casa_temporal_id": "perfil-1",
        "asociacion_id": "asoc-1",
        "voluntario_postulante_id": "vol-postulante",
        "estado": "visita_realizada",
        "modalidad": "presencial",
    }])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "asignaciones_verificacion_hogar": asignaciones,
        "verificaciones_hogar": verificaciones,
    }[tabla]

    with patch.object(home_verification_service, "supabase_admin", cliente):
        resultado = home_verification_service.resolver_resultado_visita(
            "asig-1",
            "vol-verificador",
            "solicitar_ajustes",
            "Colocar protección en el balcón.",
        )

    assert resultado["estado"] == "requiere_cambios"
    assert asignaciones.update.call_args.args[0]["estado"] == "completada"
    cambio = verificaciones.update.call_args.args[0]
    assert cambio["estado"] == "requiere_cambios"
    assert cambio["modalidad"] == "remota"
