import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import voluntario_service


def _datos_hogar(**overrides):
    datos = {
        "latitud": 19.31,
        "longitud": -98.24,
        "tipoVivienda": "Casa",
        "autorizacion": "Sí",
        "ubicacionAnimal": "Interior",
        "aceptaVisita": "Sí",
        "numAdultos": "2",
        "horasSolo": "3",
        "ninosEdades": "No",
        "otrosAnimales": "No",
        "vacunados": "No aplica (No tengo)",
        "puedeSeparar": "Sí",
        "preferenciaEspecie": ["Perros"],
        "preferenciaTamanio": ["Pequeño"],
        "tiempoResguardo": "Un mes",
        "nombreEmergencia": "Ana López",
        "telEmergencia": "2221234567",
        "horariosVisita": [{"dia": "Lunes", "hora": "10:00 AM"}],
        "consentimiento": True,
    }
    datos.update(overrides)
    return datos


def test_actualizar_perfil_externo_conserva_evidencias_existentes(make_query):
    perfil = make_query(data=[{
        "id": "perfil-1",
        "identificacion_url": "https://storage.test/identificacion.jpg",
        "video_recorrido_url": "https://storage.test/recorrido.mp4",
    }])
    voluntarios = make_query(data=[{"id": "vol-1"}])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "perfil_casa_temporal": perfil,
        "voluntarios": voluntarios,
    }[tabla]

    with (
        patch.object(voluntario_service, "supabase_admin", cliente),
        patch.object(
            voluntario_service.storage_service,
            "subir_foto",
            new=AsyncMock(),
        ) as subir_foto,
    ):
        asyncio.run(
            voluntario_service.crear_perfil_externo(
                "vol-1",
                _datos_hogar(),
            )
        )

    guardado = perfil.update.call_args.args[0]
    assert guardado["identificacion_url"] == "https://storage.test/identificacion.jpg"
    assert guardado["video_recorrido_url"] == "https://storage.test/recorrido.mp4"
    assert guardado["adultos_hogar"] == 2
    subir_foto.assert_not_awaited()


def test_actualizar_perfil_externo_permite_retirar_video(make_query):
    perfil = make_query(data=[{
        "id": "perfil-1",
        "identificacion_url": "https://storage.test/identificacion.jpg",
        "video_recorrido_url": "https://storage.test/recorrido.mp4",
    }])
    voluntarios = make_query(data=[{"id": "vol-1"}])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "perfil_casa_temporal": perfil,
        "voluntarios": voluntarios,
    }[tabla]

    with patch.object(voluntario_service, "supabase_admin", cliente):
        asyncio.run(
            voluntario_service.crear_perfil_externo(
                "vol-1",
                _datos_hogar(eliminarVideo=True),
            )
        )

    assert perfil.update.call_args.args[0]["video_recorrido_url"] is None

