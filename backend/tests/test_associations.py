from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

BASE_DATA = {
    "nombre": "Rescate Animal AC",
    "nombre_responsable": "Ana",
    "apellido_responsable": "López",
    "contacto_telefono": "5512345678",
    "contacto_email": "ana@rescate.com",
    "password": "Segura123",
    "tipos_animales": '["perro"]',
    "latitud": "19.04",
    "longitud": "-98.19",
    "radio_km": "10",
}


def test_association_telefono_invalido():
    data = {**BASE_DATA, "contacto_telefono": "123"}
    response = client.post("/associations", data=data)
    assert response.status_code == 422
    assert "10 dígitos" in response.json()["detail"]


def test_association_email_invalido():
    data = {**BASE_DATA, "contacto_email": "no-es-un-email"}
    response = client.post("/associations", data=data)
    assert response.status_code == 422
    assert "correo" in response.json()["detail"].lower()


def test_association_password_corta():
    data = {**BASE_DATA, "password": "123"}
    response = client.post("/associations", data=data)
    assert response.status_code == 422
    assert "6 caracteres" in response.json()["detail"]


def test_associations_me_reportes_sin_token():
    response = client.get("/associations/me/reportes")
    assert response.status_code == 401


def test_associations_me_reportes_token_invalido():
    # El fallo se simula localmente: nunca se envía el token falso a Supabase.
    with patch("app.api.associations.supabase.auth.get_user", side_effect=Exception("token inválido")):
        response = client.get(
            "/associations/me/reportes",
            headers={"Authorization": "Bearer token_falso_invalido"}
        )
    assert response.status_code == 401


def test_registro_asociacion_devuelve_access_y_refresh_token(make_query):
    tablas = {
        "asociaciones": make_query(data=[{"id": "aso-1"}]),
        "roles": make_query(data=[{"id": "rol-asociacion"}]),
        "usuarios": make_query(execute_results=[
            SimpleNamespace(data=[], count=None),
            SimpleNamespace(data=[{"id": "user-aso-1"}], count=None),
        ]),
        "asociacion_tipo_animal": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    auth_creado = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))
    login = SimpleNamespace(session=SimpleNamespace(
        access_token="access-asociacion",
        refresh_token="refresh-asociacion",
    ))

    with (
        patch("app.api.associations.supabase", supabase),
        patch("app.api.associations.supabase_admin") as admin,
        patch("app.api.associations.get_fresh_client") as fresh_client,
        patch("app.api.associations.obtener_id_catalogo", return_value="tipo-perro-id"),
    ):
        admin.auth.admin.create_user.return_value = auth_creado
        fresh_client.return_value.auth.sign_in_with_password.return_value = login
        response = client.post("/associations", data=BASE_DATA)

    assert response.status_code == 201
    body = response.json()
    assert body["access_token"] == "access-asociacion"
    assert body["refresh_token"] == "refresh-asociacion"
    assert body["usuario"]["id"] == "user-aso-1"


def _mock_usuario_autenticado(tablas: dict, make_query) -> None:
    """Fila de `usuarios` que resuelve `_obtener_usuario_autenticado`: rol
    'asociacion' vinculado a 'aso-1' — reusada por las pruebas del
    historial de reporte."""
    tablas["usuarios"] = make_query(data=[{
        "id": "user-1",
        "asociacion_id": "aso-1",
        "roles": {"nombre": "asociacion"},
    }])


def test_historial_reporte_caso_feliz(make_query):
    tablas = {
        "asociaciones": make_query(data=[{"verificado": True}]),
        "reportes": make_query(data=[{
            "id": "reporte-1",
            "created_at": "2026-07-20T10:00:00+00:00",
            "asociacion_asignada_id": "aso-1",
            "usuario_id": None,
            "reportante_nombre": "Juan",
            "reportante_apellido_paterno": "Pérez",
            "animal": [{
                "orden": 1,
                "descripcion": "Cojea de la pata trasera derecha",
                "condicion_catalogo": {"clave": "grave"},
                "animal_fotos": [{"foto_url": "https://x/foto-reporte.jpg", "orden": 1}],
            }],
        }]),
        "historial_reporte": make_query(data=[
            {
                "tipo_evento": "hito_llegue_refugio",
                "created_at": "2026-07-20T11:00:00+00:00",
                "datos_extra": {"foto_url": "https://x/foto-refugio.jpg", "condicion_observada": "Igual que en el reporte"},
                "usuarios": {"nombre": "Carlos", "apellido_paterno": "Ruiz"},
            },
            {
                "tipo_evento": "hito_encontre_animal",
                "created_at": "2026-07-20T10:30:00+00:00",
                "datos_extra": {
                    "foto_url": "https://x/foto-encontrado.jpg",
                    "condicion_observada": "Peor de lo esperado",
                    "comentario": "Tiene una herida en la pata",
                },
                "usuarios": {"nombre": "Carlos", "apellido_paterno": "Ruiz"},
            },
            {
                "tipo_evento": "caso_cerrado",
                "created_at": "2026-07-20T12:00:00+00:00",
                "datos_extra": {
                    "estado_anterior": "rescatado",
                    "estado_nuevo": "cerrado",
                    "conclusion": "Animal rescatado y estable",
                    "notas": "Se quedó en el refugio",
                },
                "usuarios": {"nombre": "Ana", "apellido_paterno": "Gómez"},
            },
        ]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    with patch("app.api.associations.supabase", supabase):
        response = client.get(
            "/associations/me/reportes/reporte-1/historial",
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["reporte_id"] == "reporte-1"
    tipos = [e["tipo_evento"] for e in body["eventos"]]
    # Orden cronológico (created_at asc), sin importar el orden en que
    # historial_reporte haya regresado los hitos. "caso_cerrado" queda al
    # final porque su created_at es el más reciente, no por un caso especial.
    assert tipos == ["reporte_creado", "hito_encontre_animal", "hito_llegue_refugio", "caso_cerrado"]

    creado = body["eventos"][0]
    assert creado["foto_url"] == "https://x/foto-reporte.jpg"
    assert creado["reportante_nombre"] == "Juan Pérez"
    assert creado["nota"] == "Cojea de la pata trasera derecha"

    encontrado = body["eventos"][1]
    assert encontrado["foto_url"] == "https://x/foto-encontrado.jpg"
    assert encontrado["usuario_nombre"] == "Carlos Ruiz"
    # condicion_observada (opción elegida) + comentario (texto libre), no el
    # "descripcion" genérico que escribe registrar_historial() para hitos.
    assert encontrado["nota"] == "Peor de lo esperado — Tiene una herida en la pata"

    refugio = body["eventos"][2]
    assert refugio["foto_url"] == "https://x/foto-refugio.jpg"
    assert refugio["usuario_nombre"] == "Carlos Ruiz"
    assert refugio["nota"] == "Igual que en el reporte"

    cierre = body["eventos"][3]
    assert cierre["foto_url"] is None
    assert cierre["usuario_nombre"] == "Ana Gómez"
    # conclusion (elegida en "¿Cómo concluyó el rescate?") + notas libres,
    # no condicion_observada/comentario — esos campos son de los hitos.
    assert cierre["nota"] == "Animal rescatado y estable — Se quedó en el refugio"


def test_historial_reporte_sin_hitos(make_query):
    tablas = {
        "asociaciones": make_query(data=[{"verificado": True}]),
        "reportes": make_query(data=[{
            "id": "reporte-2",
            "created_at": "2026-07-21T09:00:00+00:00",
            "asociacion_asignada_id": "aso-1",
            "usuario_id": None,
            "reportante_nombre": None,
            "reportante_apellido_paterno": None,
            "animal": [],
        }]),
        "historial_reporte": make_query(data=[]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    with patch("app.api.associations.supabase", supabase):
        response = client.get(
            "/associations/me/reportes/reporte-2/historial",
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body["eventos"]) == 1
    assert body["eventos"][0]["tipo_evento"] == "reporte_creado"
    assert body["eventos"][0]["nota"] is None
    assert body["eventos"][0]["foto_url"] is None
    assert body["eventos"][0]["reportante_nombre"] == "anónimo"


def test_historial_reporte_incluye_hitos_canonicos_externos(make_query):
    tablas = {
        "asociaciones": make_query(data=[{"verificado": True}]),
        "reportes": make_query(data=[{
            "id": "reporte-externo-1",
            "created_at": "2026-07-21T09:00:00+00:00",
            "asociacion_asignada_id": "aso-1",
            "usuario_id": None,
            "reportante_nombre": "María",
            "reportante_apellido_paterno": "Luna",
            "animal": [],
        }]),
        "historial_reporte": make_query(data=[
            {
                "tipo_evento": "llegada_zona_reporte",
                "created_at": "2026-07-21T09:30:00+00:00",
                "datos_extra": {
                    "latitud": 19.43,
                    "longitud": -99.13,
                    "distancia_reporte_metros": 18,
                },
                "usuarios": {"nombre": "Rafael", "apellido_paterno": "Jude"},
            },
            {
                "tipo_evento": "animal_no_localizado",
                "created_at": "2026-07-21T10:10:00+00:00",
                "datos_extra": {
                    "tiempo_busqueda_minutos": 40,
                    "comentario": "Recorrí la calle y pregunté a vecinos.",
                },
                "usuarios": {"nombre": "Rafael", "apellido_paterno": "Jude"},
            },
        ]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id="auth-user-1")
    )

    with patch("app.api.associations.supabase", supabase):
        response = client.get(
            "/associations/me/reportes/reporte-externo-1/historial",
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 200
    eventos = response.json()["eventos"]
    assert [evento["tipo_evento"] for evento in eventos] == [
        "reporte_creado",
        "llegada_zona_reporte",
        "animal_no_localizado",
    ]
    assert eventos[2]["usuario_nombre"] == "Rafael Jude"
    assert (
        eventos[2]["nota"]
        == "40 min de búsqueda — Recorrí la calle y pregunté a vecinos."
    )


# ─── Regresión: contribuciones.necesidad_id es nullable desde hace varias
# migraciones — una contribución también puede venir de un reporte (Ruta 1)
# o de un lote. necesidades!inner las excluía silenciosamente de estos 3
# endpoints; ahora se resuelven con _asociacion_id_contribucion en Python. ──

def test_get_ofertas_incluye_contribuciones_de_reporte_y_lote(make_query):
    tablas = {
        "contribuciones": make_query(data=[
            {
                "id": "contrib-reporte",
                "cantidad_valor": 1,
                "cantidad_unidad": "consulta",
                "estado": "comprometida",
                "created_at": "2026-07-24T10:00:00+00:00",
                "detalle": {"origen": "sugerencia_ruta1"},
                "necesidades": None,
                "reportes": {"id": "reporte-1", "asociacion_asignada_id": "aso-1"},
                "lote_asociaciones": None,
                "subcategoria_recurso": {"clave": "consulta", "descripcion": "Consulta", "categoria_recurso": {"clave": "servicios_veterinarios", "descripcion": "Servicios veterinarios"}},
                "usuarios": {"id": "aliado-1", "nombre": "Vet", "apellido_paterno": "Cercano", "telefono": "555", "email": "vet@x.com", "perfil_apoyo": None},
            },
            {
                "id": "contrib-lote",
                "cantidad_valor": 20,
                "cantidad_unidad": "kg",
                "estado": "comprometida",
                "created_at": "2026-07-24T09:00:00+00:00",
                "detalle": None,
                "necesidades": None,
                "reportes": None,
                "lote_asociaciones": {"id": "la-1", "asociacion_id": "aso-1"},
                "subcategoria_recurso": {"clave": "croquetas", "descripcion": "Croquetas", "categoria_recurso": {"clave": "alimentos", "descripcion": "Alimentos"}},
                "usuarios": {"id": "aliado-2", "nombre": "Aliado", "apellido_paterno": "Lote", "telefono": "555", "email": "a@x.com", "perfil_apoyo": None},
            },
            {
                "id": "contrib-otra-asociacion",
                "cantidad_valor": 5,
                "cantidad_unidad": "kg",
                "estado": "comprometida",
                "created_at": "2026-07-24T08:00:00+00:00",
                "detalle": None,
                "necesidades": {"id": "necesidad-2", "categoria": "alimentos", "asociacion_id": "aso-2", "subcategoria_id": "subcat-9"},
                "reportes": None,
                "lote_asociaciones": None,
                "subcategoria_recurso": None,
                "usuarios": {"id": "aliado-3", "nombre": "Otro", "apellido_paterno": "Aliado", "telefono": "555", "email": "o@x.com", "perfil_apoyo": None},
            },
        ]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    with patch("app.api.associations.supabase", supabase):
        response = client.get("/associations/me/ofertas?tab=pendientes", headers={"Authorization": "Bearer token-valido"})

    assert response.status_code == 200
    ids = [fila["id"] for fila in response.json()]
    assert "contrib-reporte" in ids
    assert "contrib-lote" in ids
    assert "contrib-otra-asociacion" not in ids  # sigue filtrando por asociación correctamente


def test_resolver_oferta_de_reporte_sin_necesidad_no_da_404(make_query):
    tablas = {
        "contribuciones": make_query(execute_results=[
            [{
                "id": "contrib-reporte",
                "estado": "comprometida",
                "necesidades": None,
                "reportes": {"asociacion_asignada_id": "aso-1"},
                "lote_asociaciones": None,
            }],
            [{"id": "contrib-reporte", "estado": "confirmada"}],
        ]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    with patch("app.api.associations.supabase", supabase):
        response = client.patch(
            "/associations/me/ofertas/contrib-reporte/resolver",
            json={"accion": "aceptar"},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 200
    assert response.json()["oferta"]["estado"] == "confirmada"


def test_verificar_aliado_con_solo_contribucion_de_lote_confirmada(make_query):
    tablas = {
        "contribuciones": make_query(data=[{
            "id": "contrib-lote",
            "necesidades": None,
            "reportes": None,
            "lote_asociaciones": {"asociacion_id": "aso-1"},
        }]),
        "perfil_apoyo": make_query(execute_results=[
            [{"id": "perfil-1", "aliado_verificado_por": None}],
            [{"id": "perfil-1", "aliado_verificado_por": "aso-1"}],
        ]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    with patch("app.api.associations.supabase", supabase):
        response = client.patch(
            "/associations/me/aliados/usuario/aliado-lote/verificar",
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 200
    assert response.json()["perfil"]["aliado_verificado_por"] == "aso-1"
