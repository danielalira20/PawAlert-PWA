from app.models.report import (
    ESTADOS_REPORTE_OPERATIVOS,
    ESTADOS_REPORTE_TERMINALES,
    EstadoReporteEnum,
)


def test_seguimiento_fallecimiento_es_un_estado_pausado() -> None:
    estado = EstadoReporteEnum.pendiente_seguimiento_fallecimiento.value

    assert estado not in ESTADOS_REPORTE_OPERATIVOS
    assert estado not in ESTADOS_REPORTE_TERMINALES
