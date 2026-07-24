import asyncio
from unittest.mock import MagicMock, patch

from app.services import voluntario_service


def test_guardar_capacidades_v2_separa_datos_del_perfil(make_query):
    voluntarios = make_query(
        data=[{"estado": "postulacion_pendiente", "disponible_operativamente": True}]
    )
    capacidades = make_query(data=[])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
    }[tabla]

    datos = {
        "disponibilidad": {"dias": ["lun"], "franjas": ["matutino"]},
        "radio_max_km": 30,
        "max_casos_simultaneos": 2,
        "contacto_emergencia_nombre": "María López",
        "contacto_emergencia_telefono": "2221234567",
        "acepto_terminos": True,
        "latitud": 19.04,
        "longitud": -98.20,
    }

    with patch.object(voluntario_service, "supabase", supabase):
        resultado = asyncio.run(
            voluntario_service.guardar_capacidades("vol-1", datos)
        )

    perfil_guardado = voluntarios.update.call_args.args[0]
    capacidad_guardada = capacidades.insert.call_args.args[0]

    assert perfil_guardado["contacto_emergencia_nombre"] == "María López"
    assert perfil_guardado["contacto_emergencia_telefono"] == "2221234567"
    assert "contacto_emergencia_nombre" not in capacidad_guardada
    assert capacidad_guardada["radio_max_km"] == 30
    assert capacidad_guardada["voluntario_id"] == "vol-1"
    assert resultado == {"mensaje": "Capacidades guardadas correctamente"}


def test_guardar_capacidades_permite_preparar_repostulacion_rechazada(make_query):
    voluntarios = make_query(
        data=[{"estado": "rechazado", "disponible_operativamente": False}]
    )
    capacidades = make_query(data=[{"voluntario_id": "vol-1"}])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
    }[tabla]

    datos = {
        "radio_max_km": 10,
        "acepto_terminos": True,
        "latitud": 19.04,
        "longitud": -98.20,
    }

    with patch.object(voluntario_service, "supabase", supabase):
        resultado = asyncio.run(
            voluntario_service.guardar_capacidades("vol-1", datos)
        )

    capacidades.update.assert_called_once()
    assert resultado == {"mensaje": "Capacidades guardadas correctamente"}
