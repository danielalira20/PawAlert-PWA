from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import adoptions
from app.main import app
from app.services import adoption_service


client = TestClient(app)
PROFILE_ID = "60000000-0000-0000-0000-000000000006"
HIDDEN_PROFILE_ID = "60000000-0000-0000-0000-000000000007"
ASSOCIATION_ID = "20000000-0000-0000-0000-000000000002"
HIDDEN_ASSOCIATION_ID = "20000000-0000-0000-0000-000000000003"
PHOTO_ID = "70000000-0000-0000-0000-000000000007"


def _profile(**overrides) -> dict:
    result = {
        "id": PROFILE_ID,
        "asociacion_id": ASSOCIATION_ID,
        "nombre_publico": "Sol",
        "tipo_animal_id": "tipo-perro",
        "tipo_animal_otro_id": None,
        "tamanio_id": "tam-mediano",
        "raza_id": "raza-mestiza",
        "sexo": "hembra",
        "edad_aproximada": "joven",
        "descripcion": "Busca un hogar paciente.",
        "personalidad": "Sociable y tranquila.",
        "salud_conocida": "Estable.",
        "tratamientos": None,
        "necesidades_especiales": None,
        "vacunacion_estado": "parcial",
        "esterilizacion_estado": "pendiente",
        "revision_medica_estado": "verificada",
        "compatibilidad": {"niños": "sí", "gatos": "por_confirmar"},
        "zona_general": "Puebla capital",
        "estado": "publicado",
        "estado_moderacion": "visible",
        "requisitos_base_version": "pawalert-v1",
        "plantilla_requisitos_id": "80000000-0000-0000-0000-000000000008",
        "plantilla_version": 1,
        "publicado_at": "2026-08-29T12:00:00+00:00",
        "actualizado_at": "2026-08-29T12:30:00+00:00",
        "custodia_id": "dato-que-no-debe-salir",
    }
    result.update(overrides)
    return result


def _admin_for_public_profiles(make_query, profiles: list[dict]):
    queries = {
        "perfiles_adopcion": make_query(data=profiles),
        "asociaciones": make_query(
            data=[
                {
                    "id": ASSOCIATION_ID,
                    "nombre": "Patitas Puebla",
                    "acerca_de": "Rescate y adopción responsable.",
                    "logo_url": "https://assets.test/logo.jpg",
                    "activo": True,
                    "verificado": True,
                    "contacto_telefono": "dato privado",
                }
            ]
        ),
        "tipo_animal_catalogo": make_query(
            data=[
                {"id": "tipo-perro", "clave": "perro", "descripcion": "Perro"}
            ]
        ),
        "tipo_animal_otro": make_query(data=[]),
        "tamanio_catalogo": make_query(
            data=[
                {
                    "id": "tam-mediano",
                    "clave": "mediano",
                    "descripcion": "Mediano",
                }
            ]
        ),
        "raza_catalogo": make_query(
            data=[
                {
                    "id": "raza-mestiza",
                    "clave": "mestiza",
                    "descripcion": "Mestiza",
                }
            ]
        ),
        "fotos_perfil_adopcion": make_query(
            data=[
                {
                    "id": PHOTO_ID,
                    "perfil_adopcion_id": PROFILE_ID,
                    "storage_path": f"adopciones/perfiles/{PROFILE_ID}/sol.jpg",
                    "orden": 1,
                    "texto_alternativo": "Sol mirando a la cámara",
                    "aprobada_publicacion": True,
                },
                {
                    "id": "70000000-0000-0000-0000-000000000008",
                    "perfil_adopcion_id": PROFILE_ID,
                    "storage_path": f"adopciones/perfiles/{PROFILE_ID}/privada.jpg",
                    "orden": 2,
                    "texto_alternativo": "Foto pendiente",
                    "aprobada_publicacion": False,
                },
            ]
        ),
        "requisitos_base_adopcion": make_query(
            data=[
                {
                    "clave": "identidad_mayoria_edad",
                    "titulo": "Identidad y mayoría de edad",
                    "descripcion": "Documento para validar identidad.",
                    "tipo_respuesta": "documento",
                    "opciones": [],
                    "obligatorio": True,
                    "es_sensible": True,
                    "orden": 10,
                    "activo": True,
                }
            ]
        ),
        "plantillas_requisitos_adopcion": make_query(
            data=[{"id": "80000000-0000-0000-0000-000000000008"}]
        ),
        "preguntas_requisito_adopcion": make_query(
            data=[
                {
                    "plantilla_id": "80000000-0000-0000-0000-000000000008",
                    "clave": "patio_seguro",
                    "titulo": "Patio seguro",
                    "descripcion": "Describe las medidas de seguridad.",
                    "tipo_respuesta": "texto_largo",
                    "opciones": [],
                    "obligatorio": True,
                    "es_sensible": False,
                    "orden": 1,
                }
            ]
        ),
    }
    admin = MagicMock()
    admin.table.side_effect = lambda table: queries[table]
    return admin, queries


def test_galeria_publica_no_requiere_autenticacion_y_envia_filtros():
    result = {
        "items": [],
        "pagina": 2,
        "limite": 10,
        "total": 0,
        "tiene_mas": False,
    }
    with patch.object(
        adoption_service,
        "listar_adopciones_publicas",
        return_value=result,
    ) as list_public:
        response = client.get(
            "/adoptions?especie=perro&tamanio=mediano&edad=joven"
            "&zona=Puebla&compatible_con=ni%C3%B1os&pagina=2&limite=10"
        )

    assert response.status_code == 200
    assert response.json() == result
    assert list_public.call_args.kwargs == {
        "especie": "perro",
        "tamanio": "mediano",
        "edad": "joven",
        "zona": "Puebla",
        "compatible_con": "niños",
        "pagina": 2,
        "limite": 10,
    }


def test_galeria_rechaza_edad_y_paginacion_invalidas():
    assert client.get("/adoptions?edad=anciano").status_code == 422
    assert client.get("/adoptions?limite=51").status_code == 422
    assert client.get("/adoptions?pagina=0").status_code == 422


def test_servicio_publico_filtra_y_no_expone_datos_privados(make_query):
    hidden = _profile(
        id=HIDDEN_PROFILE_ID,
        asociacion_id=HIDDEN_ASSOCIATION_ID,
        nombre_publico="Oculto",
    )
    admin, queries = _admin_for_public_profiles(make_query, [_profile(), hidden])
    with (
        patch.object(adoption_service, "supabase_admin", admin),
        patch.object(
            adoption_service,
            "crear_url_firmada_adopcion",
            return_value={
                "url": "https://signed.test/sol",
                "expira_at": "2026-08-29T13:00:00+00:00",
            },
        ) as sign,
    ):
        result = adoption_service.listar_adopciones_publicas(
            especie="PERRO",
            tamanio="mediano",
            edad="joven",
            zona="puebla",
            compatible_con="ninos",
            pagina=1,
            limite=20,
        )

    assert result["total"] == 1
    assert result["tiene_mas"] is False
    assert result["items"][0]["nombre_publico"] == "Sol"
    assert result["items"][0]["foto_portada"]["foto_url"] == (
        "https://signed.test/sol"
    )
    assert sign.call_count == 1
    serialized = str(result)
    assert "storage_path" not in serialized
    assert "dato-que-no-debe-salir" not in serialized
    assert "dato privado" not in serialized
    queries["asociaciones"].eq.assert_any_call("activo", True)
    queries["asociaciones"].eq.assert_any_call("verificado", True)
    queries["fotos_perfil_adopcion"].eq.assert_called_with(
        "aprobada_publicacion", True
    )


def test_detalle_publico_incluye_solo_fotos_aprobadas(make_query):
    admin, _ = _admin_for_public_profiles(make_query, [_profile()])
    with (
        patch.object(adoption_service, "supabase_admin", admin),
        patch.object(
            adoption_service,
            "crear_url_firmada_adopcion",
            return_value={
                "url": "https://signed.test/sol",
                "expira_at": "2026-08-29T13:00:00+00:00",
            },
        ),
    ):
        result = adoption_service.obtener_adopcion_publica(PROFILE_ID)

    assert result["descripcion"] == "Busca un hogar paciente."
    assert len(result["fotos"]) == 1
    assert result["fotos"][0]["id"] == PHOTO_ID
    assert [requirement["origen"] for requirement in result["requisitos"]] == [
        "pawalert",
        "asociacion",
    ]
    assert "storage_path" not in str(result)


def test_detalle_oculta_perfil_de_asociacion_no_operativa(make_query):
    profile_query = make_query(data=[_profile()])
    association_query = make_query(data=[])
    admin = MagicMock()
    admin.table.side_effect = lambda table: (
        profile_query if table == "perfiles_adopcion" else association_query
    )
    with patch.object(adoption_service, "supabase_admin", admin):
        try:
            adoption_service.obtener_adopcion_publica(PROFILE_ID)
        except adoption_service.AdoptionServiceError as error:
            assert error.code == "adopcion_publica_no_encontrada"
            assert error.status_code == 404
        else:
            raise AssertionError("Se esperaba ocultar la adopción")
