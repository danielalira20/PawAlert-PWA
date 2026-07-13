"""
M1 - Datos sinteticos para probar el algoritmo de matching de voluntarios.

Genera:
  - 15 voluntarios (usuarios + voluntarios + capacidades), distancias 0.5-12km
    del centro de prueba (asociacion DCPets), mezcla de especies/tamanios,
    3 externos, 2 con carga activa (1 y 2 casos), 1 sin disponibilidad.
  - 5 reportes de prueba sin asignar, en distintas condiciones (grave/herido/estable).

Correr contra staging:
    python3 seed_voluntarios.py

Es idempotente: borra su propia corrida anterior (identificada por telefonos
7000000xx) antes de insertar de nuevo, para poder re-correrlo sin duplicar.
"""
import math
import sys

sys.path.insert(0, ".")
from app.db.supabase import supabase_admin as db

ASOCIACION_PRUEBA_ID = "989f8d6b-c313-48fc-b9ab-18aac9336021"  # DCPets
CENTRO_LAT = 18.97365456
CENTRO_LNG = -98.21871708

ROL_INTERNO = "44094a40-db17-42e1-8ad5-b1734a21c2c8"   # voluntario_interno
ROL_EXTERNO = "2ade8730-7992-412d-a777-3565da3a3736"   # voluntario_externo

ESTADO_PENDIENTE = "50b17bf4-3ea3-4c6e-9e13-04cb7f77ec2d"
ESTADO_EN_ATENCION = "da48f2a7-331d-4e05-a78f-a6d1da3ae551"

DISPONIBLE_SIEMPRE = {
    "dias": ["lun", "mar", "mie", "jue", "vie", "sab", "dom"],
    "horarios": [{"de": "00:00", "a": "23:59"}],
}
SIN_DISPONIBILIDAD = {"dias": [], "horarios": []}

# nombre, apellido, tipo, distancia_km, angulo_grados, especies, tamanios,
# disponible, nivel (1|2), casos_activos
VOLUNTARIOS = [
    ("Ana",       "Garcia",    "interno", 0.5,  10,  ["perro", "gato"],          ["pequeno", "mediano"], True,  1, 0),
    ("Carlos",    "Ruiz",      "interno", 1.2,  50,  ["perro"],                  ["mediano", "grande"],  True,  1, 0),
    ("Beatriz",   "Soto",      "interno", 2.0,  90,  ["gato"],                   ["pequeno"],             True,  2, 0),
    ("David",     "Torres",    "interno", 3.5,  130, ["perro", "gato", "otro"],  ["grande"],              True,  1, 0),
    ("Elena",     "Vargas",    "interno", 4.0,  170, ["perro"],                  ["pequeno", "mediano"], False, 1, 0),
    ("Fernando",  "Cruz",      "interno", 5.0,  210, ["gato", "otro"],           ["mediano"],             True,  2, 1),
    ("Gabriela",  "Ponce",     "interno", 6.0,  250, ["perro"],                  ["grande"],              True,  1, 0),
    ("Hugo",      "Mendez",    "interno", 7.5,  290, ["perro", "gato"],          ["pequeno"],             True,  1, 0),
    ("Irene",     "Castillo",  "interno", 8.0,  330, ["otro"],                   ["mediano", "grande"],  True,  2, 2),
    ("Jorge",     "Salinas",   "interno", 9.5,  30,  ["perro"],                  ["pequeno"],             True,  1, 0),
    ("Karla",     "Ibarra",    "interno", 10.5, 70,  ["gato"],                   ["mediano"],             True,  1, 0),
    ("Luis",      "Ramos",     "interno", 12.0, 110, ["perro", "gato"],          ["grande"],              True,  1, 0),
    ("Marta",     "Nunez",     "externo", 1.5,  150, ["perro"],                  ["pequeno", "mediano"], True,  1, 0),
    ("Nestor",    "Aguilar",   "externo", 3.0,  190, ["gato", "otro"],           ["mediano"],             True,  2, 0),
    ("Olivia",    "Reyes",     "externo", 6.5,  230, ["perro", "gato"],          ["grande"],              True,  1, 0),
]

# tipo_animal, tamanio, condicion, distancia_km, angulo_grados, descripcion
REPORTES_PRUEBA = [
    ("perro", "grande",  "grave",   1.0, 20,  "Perro grande atropellado, sangrando, necesita ayuda urgente"),
    ("gato",  "pequeno", "herido",  3.0, 100, "Gatito con la pata lastimada, cojeando"),
    ("perro", "mediano", "estable", 5.0, 180, "Perro callejero desnutrido pero tranquilo"),
    ("otro",  "grande",  "grave",   8.0, 260, "Caballo caido en zanja, requiere rescate especializado"),
    ("gato",  "mediano", "herido",  2.0, 320, "Gato con herida en el ojo, activo pero asustado"),
]


def punto_a_distancia(lat, lng, distancia_km, angulo_grados):
    angulo = math.radians(angulo_grados)
    delta_lat = (distancia_km / 111.0) * math.cos(angulo)
    delta_lng = (distancia_km / (111.0 * math.cos(math.radians(lat)))) * math.sin(angulo)
    return round(lat + delta_lat, 6), round(lng + delta_lng, 6)


def limpiar_corrida_anterior():
    telefonos = [f"70000000{i:02d}" for i in range(1, len(VOLUNTARIOS) + 1)]
    usuarios_previos = db.table("usuarios").select("id").in_("telefono", telefonos).execute().data
    if not usuarios_previos:
        return
    usuario_ids = [u["id"] for u in usuarios_previos]
    voluntarios_previos = db.table("voluntarios").select("id").in_("usuario_id", usuario_ids).execute().data
    voluntario_ids = [v["id"] for v in voluntarios_previos]

    if voluntario_ids:
        db.table("reportes").update({"staff_asignado_id": None, "voluntario_id": None}) \
            .in_("staff_asignado_id", usuario_ids).execute()
        db.table("reportes").delete().eq("descripcion", "SEED_M1_CARGA").execute()
        db.table("capacidades").delete().in_("voluntario_id", voluntario_ids).execute()
        db.table("postulaciones").delete().in_("voluntario_id", voluntario_ids).execute()
        db.table("voluntarios").delete().in_("id", voluntario_ids).execute()
    db.table("usuarios").delete().in_("id", usuario_ids).execute()
    db.table("reportes").delete().eq("reportante_telefono", "7000000099").execute()
    print(f"Limpieza: {len(usuario_ids)} usuarios de corridas anteriores eliminados.")


def crear_voluntarios():
    creados = []
    for i, (nombre, apellido, tipo, dist, angulo, especies, tamanios, disponible, nivel, casos) in enumerate(VOLUNTARIOS, start=1):
        telefono = f"70000000{i:02d}"
        rol_id = ROL_INTERNO if tipo == "interno" else ROL_EXTERNO
        asociacion_id = ASOCIACION_PRUEBA_ID if tipo == "interno" else None

        usuario = db.table("usuarios").insert({
            "nombre": nombre,
            "apellido_paterno": apellido,
            "email": f"seed.{nombre.lower()}.{apellido.lower()}@pawalert.test",
            "telefono": telefono,
            "rol_id": rol_id,
            "asociacion_id": asociacion_id,
        }).execute().data[0]

        voluntario = db.table("voluntarios").insert({
            "usuario_id": usuario["id"],
            "asociacion_id": asociacion_id,
            "estado": f"activo_nivel_{nivel}",
        }).execute().data[0]

        lat, lng = punto_a_distancia(CENTRO_LAT, CENTRO_LNG, dist, angulo)
        db.table("capacidades").insert({
            "voluntario_id": voluntario["id"],
            "disponibilidad": DISPONIBLE_SIEMPRE if disponible else SIN_DISPONIBILIDAD,
            "ofrece_casa_hogar": nivel == 2,
            "capacidad_animales": 2 if nivel == 2 else 0,
            "especies": especies,
            "tamanios": tamanios,
            "otros_animales_en_casa": i % 3 == 0,
            "ninos_en_casa": i % 4 == 0,
            "tiene_vehiculo": i % 2 == 0,
            "latitud": lat,
            "longitud": lng,
            "experiencia_previa": "Voluntario de prueba generado por seed_voluntarios.py (M1)",
            "acepto_terminos": True,
        }).execute()

        db.table("postulaciones").insert({
            "voluntario_id": voluntario["id"],
            "asociacion_id": asociacion_id or ASOCIACION_PRUEBA_ID,
            "estado": "aceptada",
        }).execute()

        # Carga: crear reportes ya asignados a este voluntario
        for _ in range(casos):
            db.table("reportes").insert({
                "asociacion_asignada_id": asociacion_id or ASOCIACION_PRUEBA_ID,
                "estado_reporte": "en_atencion",
                "estado_id": ESTADO_EN_ATENCION,
                "staff_asignado_id": usuario["id"],
                "voluntario_id": voluntario["id"],
                "tipo_animal": especies[0],
                "condicion": "estable",
                "latitud": lat,
                "longitud": lng,
                "ubicacion_fuente": "gps",
                "reportante_nombre": "Seed",
                "reportante_apellido_paterno": "Carga",
                "reportante_telefono": "7000000099",
                "descripcion": "SEED_M1_CARGA",
            }).execute()

        etiqueta_disp = "disponible" if disponible else "SIN disponibilidad"
        etiqueta_carga = f", {casos} caso(s) activo(s)" if casos else ""
        print(f"  {i:2d}. {nombre} {apellido} ({tipo}, nivel_{nivel}, {dist}km, {etiqueta_disp}{etiqueta_carga})")
        creados.append(voluntario)
    return creados


def crear_reportes_prueba():
    print("\nReportes de prueba (sin asignar, listos para /candidatos):")
    for i, (especie, tamanio, condicion, dist, angulo, descripcion) in enumerate(REPORTES_PRUEBA, start=1):
        lat, lng = punto_a_distancia(CENTRO_LAT, CENTRO_LNG, dist, angulo)
        reporte = db.table("reportes").insert({
            "asociacion_asignada_id": ASOCIACION_PRUEBA_ID,
            "estado_reporte": "pendiente",
            "estado_id": ESTADO_PENDIENTE,
            "tipo_animal": especie,
            "tamanio": tamanio,
            "condicion": condicion,
            "latitud": lat,
            "longitud": lng,
            "ubicacion_fuente": "gps",
            "reportante_nombre": "Seed",
            "reportante_apellido_paterno": "Reporte",
            "reportante_telefono": "7000000098",
            "descripcion": descripcion,
        }).execute().data[0]
        print(f"  {i}. id={reporte['id']} | {especie}/{tamanio}/{condicion} a {dist}km — {descripcion}")


if __name__ == "__main__":
    print("Limpiando corridas anteriores de este seed...")
    limpiar_corrida_anterior()

    print(f"\nCreando {len(VOLUNTARIOS)} voluntarios de prueba (asociacion DCPets como centro)...")
    crear_voluntarios()

    crear_reportes_prueba()

    print("\nListo. Escenarios cubiertos:")
    print("  - Distancias de 0.5 a 12km (2 quedan fuera del radio de 10km: Karla y Luis)")
    print("  - 3 voluntarios externos: Marta, Nestor, Olivia")
    print("  - 2 con carga activa: Fernando (1 caso), Irene (2 casos, debe quedar excluida)")
    print("  - 1 sin disponibilidad: Elena")
    print("  - Mezcla de especies (perro/gato/otro) y tamanios (pequeno/mediano/grande)")
    print("  - 5 reportes de prueba sin asignar, en condiciones grave/herido/estable")
