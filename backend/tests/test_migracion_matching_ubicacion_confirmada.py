from pathlib import Path

MIGRACIONES_DIR = Path(__file__).resolve().parents[1] / "migrations"

MIGRACION_0073 = (MIGRACIONES_DIR / "0073_matching_ultima_ubicacion.sql").read_text(
    encoding="utf-8"
)


def _ultima_migracion_de_candidatos_para_reporte() -> Path:
    """Resuelve dinamicamente cual es la migracion MAS RECIENTE que define
    ``candidatos_para_reporte``, en vez de apuntar a un archivo fijo.

    Por que existe esto: el test que validaba el uso de
    ``ultima_latitud_confirmada``/``ultima_longitud_confirmada`` comparaba el
    patron esperado contra el texto de 0073_matching_ultima_ubicacion.sql --
    el archivo que introdujo el fix. Cuando 0074_radio_max_km_null_sin_limite.sql
    reemplazo la funcion completa (CREATE OR REPLACE) sin incluir ese patron,
    el test siguio en verde para siempre: nunca miraba mas alla de 0073, asi
    que no le importaba lo que la funcion realmente vigente hiciera. La
    regresion vivio sin deteccion a traves de 0074 y 0075
    (0077_candidatos_para_reporte_ubicacion_confirmada.sql la corrige).

    Para que esto no vuelva a pasar, cualquier test que valide "que hace hoy
    candidatos_para_reporte" debe resolver primero cual es su definicion
    vigente -- la ultima migracion que la toca, ordenando por nombre de
    archivo (los prefijos numericos de 4 digitos son consistentes y
    monotonos con el tiempo) -- y comparar contra ESA, no contra un nombre de
    archivo hardcodeado. Asi, si una futura migracion (0078, 0090, ...)
    vuelve a reemplazar el cuerpo de la funcion sin este patron, el test
    falla de inmediato sin necesitar mantenimiento.
    """
    candidatas = sorted(
        migracion
        for migracion in MIGRACIONES_DIR.glob("*.sql")
        if "FUNCTION public.candidatos_para_reporte"
        in migracion.read_text(encoding="utf-8")
    )
    assert candidatas, "Ninguna migracion define candidatos_para_reporte"
    return candidatas[-1]


def test_migracion_persiste_ultima_ubicacion_operativa():
    """Evento historico de una sola vez (agregar las columnas y hacer el
    backfill): esto solo pasa en 0073, por lo que seguir pinneado a ese
    archivo es correcto -- no es el mismo caso que el comportamiento vigente
    de la funcion, cubierto abajo."""
    assert "ultima_latitud_confirmada double precision" in MIGRACION_0073
    assert "ultima_longitud_confirmada double precision" in MIGRACION_0073
    assert "FROM public.avistamientos_animal AS av" in MIGRACION_0073
    assert "av.estado_validacion = 'validado'" in MIGRACION_0073


def test_candidatos_para_reporte_usa_ultima_ubicacion_confirmada():
    """Guardia de regresion contra exactamente el fallo descrito en
    _ultima_migracion_de_candidatos_para_reporte: la definicion VIGENTE de
    candidatos_para_reporte (no un archivo historico) debe seguir calculando
    distancia_km y el filtro de radio a partir de
    COALESCE(rep.ultima_latitud_confirmada, rep.latitud) /
    COALESCE(rep.ultima_longitud_confirmada, rep.longitud), no del pin
    original del reporte."""
    migracion = _ultima_migracion_de_candidatos_para_reporte()
    contenido = migracion.read_text(encoding="utf-8")

    assert "COALESCE(rep.ultima_latitud_confirmada, rep.latitud)" in contenido, (
        f"{migracion.name} (definicion vigente de candidatos_para_reporte) "
        "calcula distancia/radio sin usar la ultima ubicacion confirmada "
        "del reporte -- regresion de 0073/0074, ver "
        "0077_candidatos_para_reporte_ubicacion_confirmada.sql"
    )
    assert "COALESCE(rep.ultima_longitud_confirmada, rep.longitud)" in contenido, (
        f"{migracion.name} (definicion vigente de candidatos_para_reporte) "
        "calcula distancia/radio sin usar la ultima ubicacion confirmada "
        "del reporte -- regresion de 0073/0074, ver "
        "0077_candidatos_para_reporte_ubicacion_confirmada.sql"
    )


def test_matching_conserva_limites_y_contrato_operativo():
    assert "LEAST(c.radio_max_km, 30) * 1000" in MIGRACION_0073
    assert "v.estado IN ('activo_nivel_1', 'activo_nivel_2')" in MIGRACION_0073
    assert "c.max_casos_simultaneos" in MIGRACION_0073
    assert "r.nombre = 'voluntario_externo'" in MIGRACION_0073
