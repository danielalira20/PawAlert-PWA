from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services import assignment_service


def test_asignar_asociacion_envia_todas_las_especies_y_exclusiones():
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(data=[{"id": "asociacion-2", "nombre": "Patitas"}])

    with patch.object(assignment_service, "supabase") as supabase:
        supabase.rpc.return_value = rpc
        resultado = assignment_service.asignar_asociacion(
            19.041, -98.206,
            excluir_ids=["asociacion-1"],
            tipos_animales=["perro", "gato"],
        )

    supabase.rpc.assert_called_once_with(
        "encontrar_asociacion_cercana",
        {
            "reporte_lat": 19.041,
            "reporte_lng": -98.206,
            "excluir_ids": ["asociacion-1"],
            "p_tipos_animales": ["perro", "gato"],
        },
    )
    assert resultado == {"id": "asociacion-2", "nombre": "Patitas"}


def test_asignar_asociacion_usa_listas_vacias_por_default():
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(data=[])

    with patch.object(assignment_service, "supabase") as supabase:
        supabase.rpc.return_value = rpc
        resultado = assignment_service.asignar_asociacion(19.0, -98.0)

    payload = supabase.rpc.call_args.args[1]
    assert payload["excluir_ids"] == []
    assert payload["p_tipos_animales"] is None
    assert resultado is None


def test_asignar_asociacion_devuelve_solo_la_mas_cercana():
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(data=[
        {"id": "cercana", "distancia_km": 1.2},
        {"id": "lejana", "distancia_km": 3.5},
    ])

    with patch.object(assignment_service, "supabase") as supabase:
        supabase.rpc.return_value = rpc
        resultado = assignment_service.asignar_asociacion(19.0, -98.0, tipos_animales=["perro"])

    assert resultado["id"] == "cercana"


def test_obtener_contactos_emergencia_respeta_especie_y_prioriza_municipio():
    contactos = [
        {"id": "1", "activo": True, "tipos_animales": ["gato"], "municipio": "Puebla", "estado": None},
        {"id": "2", "activo": True, "tipos_animales": ["perro"], "municipio": "Puebla", "estado": None},
        {"id": "3", "activo": True, "tipos_animales": None, "municipio": None, "estado": "Puebla"},
    ]

    with patch.object(assignment_service, "supabase") as supabase:
        query = MagicMock()
        query.select.return_value = query
        query.eq.return_value = query
        query.execute.return_value = SimpleNamespace(data=contactos)
        supabase.table.return_value = query
        resultado = assignment_service.obtener_contactos_emergencia("perro", "Puebla", "Puebla")

    assert [c["id"] for c in resultado] == ["2"]
