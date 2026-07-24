import asyncio
from unittest.mock import MagicMock, patch

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
