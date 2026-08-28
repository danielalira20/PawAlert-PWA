import pytest
from pydantic import ValidationError

from app.models.voluntario import CapacidadesDraftRequest, CapacidadesRequest


def test_capacidades_v2_acepta_radio_maximo_de_30_km():
    capacidades = CapacidadesRequest(
        disponibilidad={
            "dias": ["lun", "mie"],
            "franjas": ["matutino", "vespertino"],
        },
        radio_max_km=30,
        vehiculo_apto_traslado=True,
        tamanios_traslado=["pequeno", "mediano"],
        especies_manejo=["perro", "gato"],
        max_casos_simultaneos=3,
    )

    datos = capacidades.model_dump(mode="json")

    assert datos["radio_max_km"] == 30
    assert datos["disponibilidad"]["franjas"] == ["matutino", "vespertino"]
    assert datos["tamanios_traslado"] == ["pequeno", "mediano"]


@pytest.mark.parametrize("radio", [0, 15, 31, 50])
def test_capacidades_v2_rechaza_radios_fuera_del_catalogo(radio):
    with pytest.raises(ValidationError, match="radio_max_km"):
        CapacidadesRequest(radio_max_km=radio)


def test_capacidades_v2_admite_horario_legado_durante_transicion():
    capacidades = CapacidadesRequest(
        disponibilidad={
            "dias": ["mar"],
            "horarios": [{"de": "09:00", "a": "18:00"}],
        }
    )

    datos = capacidades.model_dump(mode="json")

    assert datos["disponibilidad"]["horarios"] == [
        {"de": "09:00", "a": "18:00"}
    ]


def test_capacidades_v2_no_permite_tamanios_de_traslado_sin_vehiculo_apto():
    with pytest.raises(ValidationError, match="vehículo apto"):
        CapacidadesRequest(
            vehiculo_apto_traslado=False,
            tamanios_traslado=["grande"],
        )


@pytest.mark.parametrize(
    ("campo", "valores", "mensaje"),
    [
        (
            "restricciones_fisicas",
            ["ninguna", "evitar_escaleras"],
            "'ninguna'",
        ),
        (
            "equipamiento",
            ["sin_equipo", "correas_arneses"],
            "'sin_equipo'",
        ),
        (
            "trayectoria_tipos",
            ["sin_experiencia", "mascotas_propias"],
            "'sin_experiencia'",
        ),
        (
            "experiencias_campo",
            ["sin_experiencia", "docil_estable"],
            "'sin_experiencia'",
        ),
    ],
)
def test_capacidades_v2_respeta_opciones_excluyentes(campo, valores, mensaje):
    with pytest.raises(ValidationError, match=mensaje):
        CapacidadesRequest(**{campo: valores})


def test_capacidades_v2_acepta_sin_experiencia_en_campo():
    capacidades = CapacidadesRequest(
        experiencias_campo=["sin_experiencia"],
    )

    assert capacidades.experiencias_campo == ["sin_experiencia"]


def test_capacidades_v2_exige_otro_para_detallar_otras_especies():
    with pytest.raises(ValidationError, match="Selecciona 'otro'"):
        CapacidadesRequest(
            especies_manejo=["perro"],
            otras_especies_manejo=["aves"],
        )


def test_capacidades_v2_limita_comentarios_a_250_caracteres():
    with pytest.raises(ValidationError):
        CapacidadesRequest(comentarios_adicionales="x" * 251)


def test_capacidades_v2_no_sobrescribe_campos_legado_si_no_llegan_en_payload():
    capacidades = CapacidadesRequest(
        disponibilidad={"dias": ["lun"], "franjas": ["matutino"]},
        radio_max_km=10,
        acepto_terminos=True,
    )

    datos = capacidades.model_dump(mode="json", exclude_unset=True)

    assert "ofrece_casa_hogar" not in datos
    assert "capacidad_animales" not in datos
    assert "otros_animales_en_casa" not in datos
    assert "ninos_en_casa" not in datos


def test_borrador_capacidades_admite_un_formulario_incompleto():
    borrador = CapacidadesDraftRequest(
        contexto="interno",
        paso=3,
        ubicacion_confirmada=False,
        datos={
            "disponibilidad": {"dias": ["lun"], "franjas": []},
            "acepto_terminos": False,
        },
    )

    assert borrador.paso == 3
    assert borrador.datos.disponibilidad.dias == ["lun"]
    assert borrador.datos.acepto_terminos is False


def test_borrador_capacidades_rechaza_versiones_desconocidas():
    with pytest.raises(ValidationError, match="version"):
        CapacidadesDraftRequest(contexto="perfil", version=2)
