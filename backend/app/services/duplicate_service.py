"""Deteccion geoespacial de reportes duplicados (reemplaza la comparacion
por texto de municipio/colonia que hacia verificar_duplicados)."""

from __future__ import annotations

from pydantic import ValidationError

from app.db.supabase import supabase_admin
from app.models.urgency import DuplicateCandidate, DuplicateSearchInput
from app.services.report_service import obtener_id_catalogo


def _resolver_tipo_animal_ids(especies: list[str]) -> list[str]:
    return [
        tid
        for tid in (obtener_id_catalogo("tipo_animal_catalogo", especie) for especie in especies)
        if tid
    ]


def find_geographic_duplicates(search: DuplicateSearchInput) -> list[DuplicateCandidate]:
    """Busca reportes activos cercanos en espacio y tiempo que compartan
    especie, delegando el filtro geoespacial (radio 150m, ventana
    +-120min, estados excluidos) a la funcion SQL
    buscar_duplicados_geograficos (migracion 0060), en vez de comparar
    municipio/colonia como texto.

    verificar_duplicados (report_service.py, ya eliminada por este mismo
    cambio) no tenia manejo de errores explicito: un fallo de Supabase se
    propagaba sin capturar y tumbaba por completo la creacion del reporte.
    Aqui se decide lo contrario a proposito -- un reporte real nunca debe
    dejar de crearse solo porque la deteccion de duplicados no pudo
    ejecutarse -- asi que cualquier fallo de la RPC se degrada a "sin
    duplicados encontrados" en vez de propagarse.
    """
    tipo_animal_ids = _resolver_tipo_animal_ids(search.species)
    if not tipo_animal_ids:
        return []

    try:
        resultado = supabase_admin.rpc(
            "buscar_duplicados_geograficos",
            {
                "p_latitud": search.latitude,
                "p_longitud": search.longitude,
                "p_created_at": search.created_at.isoformat(),
                "p_tipo_animal_ids": tipo_animal_ids,
                "p_reporte_id": search.report_id,
            },
        ).execute()
    except Exception as error:
        print(
            "[WARN] find_geographic_duplicates: fallo la RPC "
            f"buscar_duplicados_geograficos: {error}"
        )
        return []

    candidatos: list[DuplicateCandidate] = []
    for fila in resultado.data or []:
        try:
            candidatos.append(
                DuplicateCandidate(
                    existing_report_id=fila["existing_report_id"],
                    distance_m=fila["distance_m"],
                    time_difference_minutes=fila["time_difference_minutes"],
                    shared_species=fila.get("shared_species") or [],
                )
            )
        except (ValidationError, KeyError) as error:
            # La funcion SQL ya garantiza radio/ventana/especie compartida
            # -- esto es una red de seguridad ante una fila inesperada, no
            # el camino esperado. Se descarta la fila en vez de tumbar la
            # creacion del reporte por un dato mal formado.
            print(
                "[WARN] find_geographic_duplicates: fila de RPC invalida, "
                f"se descarta: {error}"
            )
            continue

    return candidatos
