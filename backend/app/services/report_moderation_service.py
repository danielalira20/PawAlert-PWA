from __future__ import annotations

import math
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

from app.db.supabase import supabase_admin


PHASH_SIZE = 8
PHASH_IMAGE_SIZE = 32
PHASH_MATCH_THRESHOLD = 8
MAX_HASH_CANDIDATES = 5000


class ImagenHashInvalida(ValueError):
    pass


def _dct_2d(valores: list[list[float]]) -> list[list[float]]:
    """DCT-II 2D pequeña (32x32) sin dependencias científicas pesadas."""
    n = len(valores)
    cosenos = [
        [math.cos((2 * x + 1) * u * math.pi / (2 * n)) for x in range(n)]
        for u in range(n)
    ]
    temporal = [
        [sum(valores[y][x] * cosenos[u][x] for x in range(n)) for u in range(n)]
        for y in range(n)
    ]
    return [
        [sum(temporal[y][u] * cosenos[v][y] for y in range(n)) for u in range(n)]
        for v in range(n)
    ]


def calcular_phash(contenido: bytes) -> str:
    """Genera un pHash de 64 bits representado por 16 caracteres hexadecimales."""
    try:
        with Image.open(BytesIO(contenido)) as imagen:
            imagen = ImageOps.exif_transpose(imagen).convert("L").resize(
                (PHASH_IMAGE_SIZE, PHASH_IMAGE_SIZE),
                Image.Resampling.LANCZOS,
            )
            pixeles = [
                [float(imagen.getpixel((x, y))) for x in range(PHASH_IMAGE_SIZE)]
                for y in range(PHASH_IMAGE_SIZE)
            ]
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise ImagenHashInvalida("El archivo no es una fotografía válida") from exc

    dct = _dct_2d(pixeles)
    frecuencias = [
        dct[y][x]
        for y in range(PHASH_SIZE)
        for x in range(PHASH_SIZE)
    ]
    ordenadas = sorted(frecuencias[1:])
    mediana = ordenadas[len(ordenadas) // 2]
    bits = 0
    for valor in frecuencias:
        bits = (bits << 1) | int(valor > mediana)
    return f"{bits:016x}"


def distancia_hamming(hash_a: str, hash_b: str) -> int:
    return (int(hash_a, 16) ^ int(hash_b, 16)).bit_count()


def registrar_phash_reporte(
    *, reporte_id: str, animal_foto_id: str | None, phash: str
) -> dict:
    """Persiste la huella y registra la coincidencia más cercana como señal."""
    existentes = (
        supabase_admin.table("reporte_imagen_hashes")
        .select("id, reporte_id, phash")
        .neq("reporte_id", reporte_id)
        .order("created_at", desc=True)
        .limit(MAX_HASH_CANDIDATES)
        .execute()
    )
    coincidencia = None
    for fila in existentes.data or []:
        try:
            distancia = distancia_hamming(phash, fila["phash"])
        except (KeyError, TypeError, ValueError):
            continue
        if coincidencia is None or distancia < coincidencia["distancia"]:
            coincidencia = {"fila": fila, "distancia": distancia}

    es_alerta = bool(coincidencia and coincidencia["distancia"] <= PHASH_MATCH_THRESHOLD)
    insertada = supabase_admin.table("reporte_imagen_hashes").insert({
        "reporte_id": reporte_id,
        "animal_foto_id": animal_foto_id,
        "phash": phash,
        "coincidencia_hash_id": coincidencia["fila"]["id"] if es_alerta else None,
        "distancia_hamming": coincidencia["distancia"] if es_alerta else None,
    }).execute()

    if es_alerta:
        supabase_admin.table("reportes").update({
            "phash_alerta": True,
            "phash_coincidencia_reporte_id": coincidencia["fila"]["reporte_id"],
            "phash_distancia": coincidencia["distancia"],
        }).eq("id", reporte_id).execute()

    return {
        "id": insertada.data[0]["id"] if insertada.data else None,
        "alerta": es_alerta,
        "distancia": coincidencia["distancia"] if es_alerta else None,
        "reporte_coincidente_id": coincidencia["fila"]["reporte_id"] if es_alerta else None,
    }
