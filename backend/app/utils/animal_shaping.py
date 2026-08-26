"""Aplanado del embed `animal(...)` que PostgREST anida bajo `reportes`.

Antes de la migración multi-animal, `animal.reporte_id` tenía un UNIQUE y
PostgREST devolvía `animal` como un objeto único. Al quitar ese constraint,
el mismo `select(...)` empieza a devolver una lista — este módulo centraliza
el aplanado para que los sitios de lectura no repitan la lógica, y expone
tanto la lista completa (`animales`) como un `animal` legado (compatibilidad
temporal, Fases 2-6) para no romper al frontend a medias durante la
migración.
"""

CONDICION_SEVERIDAD = {"grave": 3, "herido": 2, "estable": 1}


def _condicion_de(animal: dict) -> str | None:
    """Extrae la clave de condición, venga con el catálogo embebido
    (`condicion_catalogo.clave`) o ya aplanada (`condicion`)."""
    catalogo = animal.get("condicion_catalogo")
    if catalogo:
        return catalogo.get("clave")
    return animal.get("condicion")


def _severidad(animal: dict) -> int:
    return CONDICION_SEVERIDAD.get(_condicion_de(animal), 0)


def shape_animal_embed(embed) -> tuple[list[dict], dict | None]:
    """Normaliza lo que PostgREST devuelve para un `animal(...)` embebido:
    `None`, un dict suelto, o una lista. Regresa (animales ordenados por
    `orden`, animal legado = el de condición más grave; empate -> menor
    `orden`)."""
    if embed is None:
        animales = []
    elif isinstance(embed, dict):
        animales = [embed]
    else:
        animales = embed

    animales_ordenados = sorted(animales, key=lambda a: a.get("orden") or 1)
    if not animales_ordenados:
        return [], None

    animal_legado = min(
        animales_ordenados,
        key=lambda a: (-_severidad(a), a.get("orden") or 1),
    )
    return animales_ordenados, animal_legado


def condicion_mas_grave(animales: list[dict]) -> str | None:
    """Condición más grave entre animales ya en forma de dict (con catálogo
    embebido o aplanado). Reusado por el color del pin (Fase 4) y el timeout
    de escalamiento (Fase 7)."""
    if not animales:
        return None
    return _condicion_de(max(animales, key=_severidad))


def shape_animal_response(animal: dict) -> dict:
    """Aplana un registro `animal` (con catálogos embebidos) a la forma que
    ya devolvían los endpoints de listado de reportes, más los 5 campos
    nuevos de multi-animal."""
    fotos_raw = animal.get("animal_fotos") or []
    fotos_ordenadas = sorted(fotos_raw, key=lambda f: f.get("orden", 0))
    fotos = [f["foto_url"] for f in fotos_ordenadas]
    foto_url = fotos[0] if fotos else None
    return {
        "id": animal.get("id"),
        "tipo_animal": (animal.get("tipo_animal_catalogo") or {}).get("clave"),
        "condicion": _condicion_de(animal),
        "tamanio": (animal.get("tamanio_catalogo") or {}).get("clave"),
        "sexo": animal.get("sexo"),
        "edad_aproximada": animal.get("edad_aproximada"),
        "descripcion": animal.get("descripcion"),
        "orden": animal.get("orden"),
        "es_grupo": animal.get("es_grupo"),
        "cantidad": animal.get("cantidad"),
        "trae_crias_nacidas": animal.get("trae_crias_nacidas"),
        "numero_crias_nacidas": animal.get("numero_crias_nacidas"),
        "fotos": fotos,
        "foto_url": foto_url,
    }
