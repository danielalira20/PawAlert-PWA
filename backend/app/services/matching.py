"""Matching explicable de voluntarios con capacidades operativas v2.

La función SQL ``candidatos_para_reporte`` resuelve pertenencia, estado,
pausas, distancia y carga. Este módulo aplica compatibilidad segura y genera
un ranking entendible para la asociación.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.db.supabase import supabase
from app.utils.animal_shaping import shape_animal_embed


TZ_MEXICO = ZoneInfo("America/Mexico_City")
DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]
MAX_RADIO_KM = 30

PESOS = {
    "proximidad": 0.30,
    "disponibilidad": 0.25,
    "experiencia": 0.20,
    "movilidad": 0.15,
    "carga": 0.10,
}

ETIQUETAS_EXPERIENCIA = {
    "docil_estable": "Manejo de animales dóciles o estables",
    "cachorros_neonatos": "Experiencia con cachorros o neonatos",
    "enfermedad_cuarentena": "Manejo de enfermedad o cuarentena",
    "reactivo_agresivo": "Manejo de conducta reactiva o agresiva",
    "lesion_movilidad_reducida": "Manejo de lesiones o movilidad reducida",
}


def obtener_candidatos(reporte_id: str) -> dict:
    """Devuelve el top 3 vigente con filtros y desglose de puntuación."""
    reporte = _obtener_reporte(reporte_id)
    especies_caso = {
        animal["tipo_animal"]
        for animal in reporte["animales"]
        if animal.get("tipo_animal")
    }
    tamanios_caso = {
        animal["tamanio"]
        for animal in reporte["animales"]
        if animal.get("tamanio")
    }
    critico = any(
        animal.get("condicion") == "grave"
        for animal in reporte["animales"]
    )
    crudos = supabase.rpc(
        "candidatos_para_reporte", {"p_reporte_id": reporte_id}
    ).execute().data or []
    rechazaron = _voluntarios_que_rechazaron(reporte_id)

    candidatos = []
    for candidato in crudos:
        # El ranking pertenece exclusivamente al equipo interno de la
        # asociación. Los externos solo aparecen si se ofrecieron y se
        # consultan por la vía independiente de coverage_service.
        if candidato.get("rol") != "voluntario_interno":
            continue
        if candidato["usuario_id"] in rechazaron:
            continue

        especies = set(
            candidato.get("especies_manejo")
            or candidato.get("especies")
            or []
        )
        tamanios = set(
            candidato.get("tamanios_manejo")
            or candidato.get("tamanios")
            or []
        )
        if especies_caso and not especies_caso.issubset(especies):
            continue
        if tamanios_caso and not tamanios_caso.issubset(tamanios):
            continue

        if critico and candidato.get("disponibilidad_urgencias") == "no":
            continue

        radio = min(
            float(candidato.get("radio_max_km") or MAX_RADIO_KM),
            MAX_RADIO_KM,
        )
        distancia = float(candidato.get("distancia_km") or 0)
        if distancia > radio:
            continue

        max_casos = int(candidato.get("max_casos_simultaneos") or 1)
        carga_actual = int(candidato.get("carga_actual") or 0)
        if carga_actual >= max_casos:
            continue

        evaluacion = _evaluar_candidato(
            reporte, candidato, distancia, radio, carga_actual, max_casos
        )

        candidatos.append({
            "voluntario_id": candidato["voluntario_id"],
            "usuario_id": candidato["usuario_id"],
            "nombre": candidato["nombre"],
            "tipo": candidato["rol"],
            "etiqueta": None,
            "distancia_km": distancia,
            "radio_max_km": int(radio),
            "carga_actual": carga_actual,
            "max_casos_simultaneos": max_casos,
            "medios_transporte": candidato.get("medios_transporte") or [],
            **evaluacion,
        })

    candidatos.sort(
        key=lambda item: (
            item["score"]["total"],
            -item["distancia_km"],
        ),
        reverse=True,
    )
    return {"candidatos": candidatos[:3]}


def evaluar_candidato_externo(
    reporte_id: str,
    candidato: dict,
    distancia_km: float,
    carga_actual: int,
    max_casos: int,
) -> dict:
    """Evalúa un ofrecimiento externo con la misma escala del top interno.

    El resultado es explicativo y no incorpora al externo al ranking de la
    asociación ni le reserva el caso.
    """
    reporte = _obtener_reporte(reporte_id)
    radio = min(
        float(candidato.get("radio_max_km") or MAX_RADIO_KM),
        MAX_RADIO_KM,
    )
    return {
        "radio_max_km": int(radio),
        "carga_actual": carga_actual,
        "max_casos_simultaneos": max_casos,
        "medios_transporte": candidato.get("medios_transporte") or [],
        **_evaluar_candidato(
            reporte,
            candidato,
            float(distancia_km),
            radio,
            carga_actual,
            max_casos,
        ),
    }


def _evaluar_candidato(
    reporte: dict,
    candidato: dict,
    distancia: float,
    radio: float,
    carga_actual: int,
    max_casos: int,
) -> dict:
    """Construye el score ponderado y sus razones para cualquier candidato."""
    critico = any(
        animal.get("condicion") == "grave"
        for animal in reporte["animales"]
    )
    puntajes_crudos = {
        "proximidad": _score_proximidad(distancia, radio),
        "disponibilidad": _score_disponibilidad(
            candidato.get("disponibilidad") or {},
            candidato.get("tiempo_reaccion"),
            candidato.get("disponibilidad_urgencias"),
            critico,
        ),
        "experiencia": _score_experiencia(reporte, candidato),
        "movilidad": _score_movilidad(reporte, candidato),
        "carga": _score_carga(max_casos, carga_actual),
    }
    desglose = {
        clave: round(valor * PESOS[clave])
        for clave, valor in puntajes_crudos.items()
    }
    return {
        "score": {"total": sum(desglose.values()), **desglose},
        **_detalles_candidato(reporte, candidato, carga_actual, max_casos),
    }


def _score_proximidad(distancia_km, radio_max_km=10) -> float:
    """100 en el punto del caso y 0 al alcanzar el radio declarado."""
    radio = max(float(radio_max_km or 1), 1.0)
    return round(max(0.0, 100.0 * (1.0 - float(distancia_km) / radio)), 1)


def _franja_actual(ahora: datetime) -> str:
    hora = ahora.hour
    if 6 <= hora < 12:
        return "matutino"
    if 12 <= hora < 18:
        return "vespertino"
    if 18 <= hora < 22:
        return "nocturno"
    return "madrugada"


def _esta_en_horario(disponibilidad: dict, ahora: datetime | None = None) -> bool:
    ahora = ahora or datetime.now(TZ_MEXICO)
    dias = (disponibilidad or {}).get("dias") or []
    if DIAS[ahora.weekday()] not in dias:
        return False

    franjas = (disponibilidad or {}).get("franjas") or []
    if franjas:
        return _franja_actual(ahora) in franjas

    # Compatibilidad de lectura con registros anteriores a capacidades v2.
    hora_actual = ahora.strftime("%H:%M")
    for horario in (disponibilidad or {}).get("horarios") or []:
        if (
            horario.get("de", "00:00")
            <= hora_actual
            <= horario.get("a", "23:59")
        ):
            return True
    return False


def _score_disponibilidad(
    disponibilidad: dict,
    tiempo_reaccion: str | None = None,
    disponibilidad_urgencias: str | None = None,
    critico: bool = False,
) -> float:
    """Combina horario habitual, tiempo de reacción y urgencias declaradas."""
    horario = 100.0 if _esta_en_horario(disponibilidad) else 0.0
    reaccion = {
        "inmediata": 100.0,
        "una_hora": 75.0,
        "tres_horas": 40.0,
        "un_dia": 10.0,
    }.get(tiempo_reaccion, 0.0)
    total = horario * 0.65 + reaccion * 0.35
    if critico and disponibilidad_urgencias == "ocasional":
        total *= 0.75
    return round(total, 1)


def _necesidades_experiencia(reporte: dict) -> set[str]:
    necesidades = set()
    for animal in reporte["animales"]:
        if animal.get("es_agresivo"):
            necesidades.add("reactivo_agresivo")
        if (
            animal.get("edad_aproximada") == "cachorro"
            or animal.get("trae_crias_nacidas")
        ):
            necesidades.add("cachorros_neonatos")
        if animal.get("condicion") in ("grave", "herido"):
            necesidades.add("lesion_movilidad_reducida")
        if (
            animal.get("condicion") == "estable"
            and not animal.get("es_agresivo")
        ):
            necesidades.add("docil_estable")
    return necesidades


def _score_experiencia(reporte: dict, candidato: dict) -> float:
    """Experiencia declarada: suma como apoyo, nunca como filtro decisivo."""
    experiencias = set(candidato.get("experiencias_campo") or [])
    necesidades = _necesidades_experiencia(reporte)
    criterios = []

    if necesidades:
        criterios.append(100.0 * len(necesidades & experiencias) / len(necesidades))

    if any(
        animal.get("condicion") in ("grave", "herido")
        for animal in reporte["animales"]
    ):
        criterios.append({
            "sin_formacion": 0.0,
            "basico": 55.0,
            "formal": 100.0,
        }.get(candidato.get("primeros_auxilios_nivel"), 0.0))

    criterios.append({
        "sin_experiencia": 0.0,
        "menos_1": 35.0,
        "entre_1_3": 70.0,
        "mas_3": 100.0,
    }.get(candidato.get("experiencia_anios"), 0.0))

    trayectorias = set(candidato.get("trayectoria_tipos") or [])
    if trayectorias and "sin_experiencia" not in trayectorias:
        criterios.append(100.0)

    return round(sum(criterios) / len(criterios), 1) if criterios else 0.0


def _equipamiento_necesario(reporte: dict) -> set[str]:
    necesario = set()
    for animal in reporte["animales"]:
        tamanio = animal.get("tamanio")
        if tamanio == "pequeno":
            necesario.update(("transportadora_chica", "correas_arneses"))
        elif tamanio in ("mediano", "grande"):
            necesario.update(
                ("transportadora_grande", "jaula_contencion", "correas_arneses")
            )
        if animal.get("es_agresivo"):
            necesario.update(("guantes_manejo", "jaula_contencion"))
        if animal.get("condicion") in ("grave", "herido"):
            necesario.add("proteccion_vehiculo")
    return necesario


def _score_movilidad(reporte: dict, candidato: dict) -> float:
    medios = set(candidato.get("medios_transporte") or [])
    valores_transporte = {
        "automovil": 90.0,
        "motocicleta": 70.0,
        "transporte_publico": 55.0,
        "bicicleta": 40.0,
        "a_pie": 25.0,
        "depende_terceros": 15.0,
    }
    transporte = max(
        (valores_transporte.get(medio, 0.0) for medio in medios),
        default=0.0,
    )
    if candidato.get("vehiculo_apto_traslado"):
        transporte = 100.0

    necesario = _equipamiento_necesario(reporte)
    equipo = set(candidato.get("equipamiento") or [])
    equipamiento = (
        100.0 * len(necesario & equipo) / len(necesario)
        if necesario
        else 100.0
    )
    return round(transporte * 0.70 + equipamiento * 0.30, 1)


def _score_carga(max_casos_simultaneos, carga_actual) -> float:
    capacidad = int(max_casos_simultaneos or 0)
    if capacidad <= 0:
        return 0.0
    libres = max(0, capacidad - int(carga_actual or 0))
    return round(100.0 * libres / capacidad, 1)


def _detalles_candidato(
    reporte: dict,
    candidato: dict,
    carga_actual: int,
    max_casos: int,
) -> dict:
    coincidencias = [
        ETIQUETAS_EXPERIENCIA[clave]
        for clave in sorted(
            _necesidades_experiencia(reporte)
            & set(candidato.get("experiencias_campo") or [])
        )
    ]
    alertas = []
    if not _esta_en_horario(candidato.get("disponibilidad") or {}):
        alertas.append("Fuera de su horario habitual")
    if candidato.get("disponibilidad_urgencias") == "ocasional":
        alertas.append("Atiende urgencias solo en ciertas ocasiones")
    if carga_actual:
        alertas.append(f"Tiene {carga_actual} caso(s) activo(s)")

    return {
        "coincidencias": coincidencias,
        "alertas": alertas,
        "capacidad_resumen": f"{carga_actual} de {max_casos} casos activos",
    }


def _obtener_reporte(reporte_id: str) -> dict:
    resultado = supabase.table("reportes").select(
        "id, asociacion_asignada_id, latitud, longitud, "
        "candidatos_presentados_at, "
        "animal(orden, cantidad, es_agresivo, edad_aproximada, "
        "trae_crias_nacidas, tipo_animal_catalogo(clave), "
        "tamanio_catalogo(clave), condicion_catalogo(clave))"
    ).eq("id", reporte_id).single().execute()
    data = resultado.data
    animales_crudos, _ = shape_animal_embed(data.get("animal"))
    data["animales"] = [
        {
            "tipo_animal": (
                animal.get("tipo_animal_catalogo") or {}
            ).get("clave"),
            "tamanio": (
                animal.get("tamanio_catalogo") or {}
            ).get("clave"),
            "condicion": (
                animal.get("condicion_catalogo") or {}
            ).get("clave"),
            "cantidad": animal.get("cantidad"),
            "es_agresivo": animal.get("es_agresivo"),
            "edad_aproximada": animal.get("edad_aproximada"),
            "trae_crias_nacidas": animal.get("trae_crias_nacidas"),
        }
        for animal in animales_crudos
    ]
    return data


def _voluntarios_que_rechazaron(reporte_id: str) -> set:
    resultado = (
        supabase.table("historial_reporte")
        .select("usuario_id")
        .eq("reporte_id", reporte_id)
        .eq("tipo_evento", "voluntario_rechaza")
        .execute()
    )
    return {
        fila["usuario_id"]
        for fila in (resultado.data or [])
        if fila.get("usuario_id")
    }
