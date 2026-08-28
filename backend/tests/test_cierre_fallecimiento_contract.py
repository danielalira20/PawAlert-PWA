from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models.report import CerrarSeguimientoFallecimientoRequest


MIGRACION = (
    Path(__file__).parents[1]
    / "migrations"
    / "0082_cerrar_seguimiento_fallecimiento.sql"
)


def test_contrato_cierre_normaliza_clave_y_nota() -> None:
    solicitud = CerrarSeguimientoFallecimientoRequest(
        resultado_final="contacto_realizado",
        idempotency_key=" cierre-fallecimiento-123 ",
        nota_cierre=" Se confirmó la gestión con la asociación. ",
    )

    assert solicitud.idempotency_key == "cierre-fallecimiento-123"
    assert solicitud.nota_cierre == "Se confirmó la gestión con la asociación."


def test_contrato_cierre_exige_nota_documentada() -> None:
    with pytest.raises(ValidationError, match="nota_cierre"):
        CerrarSeguimientoFallecimientoRequest(
            resultado_final="contacto_realizado",
            idempotency_key="cierre-fallecimiento-123",
            nota_cierre="   ",
        )


def test_migracion_impide_cierre_automatico_y_dudas() -> None:
    sql = MIGRACION.read_text(encoding="utf-8")

    assert "p_tipo_actor NOT IN ('asociacion', 'administracion')" in sql
    assert "duda_critica_impide_cierre_fallecimiento" in sql
    assert "revision_fallecimiento_pendiente" in sql
    assert "seguimiento_retiro_requerido_para_cierre" in sql
    assert "estado_reporte = 'muerto'" in sql
    assert "reporte_cerrado_fallecimiento" in sql


def test_retiro_confirmado_exige_evidencia_del_lugar() -> None:
    sql = MIGRACION.read_text(encoding="utf-8")
    bloque = sql.split("WHEN 'retiro_confirmado'", maxsplit=1)[1].split(
        "WHEN 'sin_contacto_disponible'",
        maxsplit=1,
    )[0]

    assert "evidencia_lugar_id IS NOT NULL" in bloque
