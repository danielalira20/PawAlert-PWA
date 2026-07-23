from pydantic import BaseModel, Field, model_validator
from typing import Optional
from enum import Enum


class TipoVoluntarioEnum(str, Enum):
    interno = "interno"
    externo = "externo"


class AccionPostulacionEnum(str, Enum):
    aceptar = "aceptar"
    rechazar = "rechazar"


class PostulacionRequest(BaseModel):
    """Body para POST /voluntarios/postulaciones"""
    tipo: TipoVoluntarioEnum
    asociacion_id: str


class ResolverPostulacionRequest(BaseModel):
    """Body para PATCH /asociaciones/me/postulaciones/{id}"""
    accion: AccionPostulacionEnum
    motivo: Optional[str] = None


class DiaSemanaEnum(str, Enum):
    lun = "lun"
    mar = "mar"
    mie = "mie"
    jue = "jue"
    vie = "vie"
    sab = "sab"
    dom = "dom"


class FranjaHorariaEnum(str, Enum):
    matutino = "matutino"
    vespertino = "vespertino"
    nocturno = "nocturno"
    madrugada = "madrugada"


class TiempoReaccionEnum(str, Enum):
    inmediata = "inmediata"
    una_hora = "una_hora"
    tres_horas = "tres_horas"
    un_dia = "un_dia"


class DisponibilidadUrgenciasEnum(str, Enum):
    si = "si"
    ocasional = "ocasional"
    no = "no"


class MedioTransporteEnum(str, Enum):
    automovil = "automovil"
    motocicleta = "motocicleta"
    transporte_publico = "transporte_publico"
    bicicleta = "bicicleta"
    a_pie = "a_pie"
    depende_terceros = "depende_terceros"


class EspecieManejoEnum(str, Enum):
    perro = "perro"
    gato = "gato"
    otro = "otro"


class OtraEspecieManejoEnum(str, Enum):
    aves = "aves"
    pequenos_mamiferos = "pequenos_mamiferos"
    reptiles = "reptiles"
    granja = "granja"
    otra = "otra"


class TamanioEnum(str, Enum):
    pequeno = "pequeno"
    mediano = "mediano"
    grande = "grande"


class PrimerosAuxiliosEnum(str, Enum):
    sin_formacion = "sin_formacion"
    basico = "basico"
    formal = "formal"


class ExperienciaCampoEnum(str, Enum):
    docil_estable = "docil_estable"
    cachorros_neonatos = "cachorros_neonatos"
    enfermedad_cuarentena = "enfermedad_cuarentena"
    reactivo_agresivo = "reactivo_agresivo"
    lesion_movilidad_reducida = "lesion_movilidad_reducida"


class ViaTratamientoEnum(str, Enum):
    oral = "oral"
    topica = "topica"
    inyectable_avanzado = "inyectable_avanzado"


class TrayectoriaEnum(str, Enum):
    mascotas_propias = "mascotas_propias"
    rescate_independiente = "rescate_independiente"
    casa_temporal = "casa_temporal"
    refugio_asociacion = "refugio_asociacion"
    clinica_veterinaria = "clinica_veterinaria"
    sin_experiencia = "sin_experiencia"


class ExperienciaAniosEnum(str, Enum):
    sin_experiencia = "sin_experiencia"
    menos_1 = "menos_1"
    entre_1_3 = "entre_1_3"
    mas_3 = "mas_3"


class EquipamientoEnum(str, Enum):
    transportadora_chica = "transportadora_chica"
    transportadora_grande = "transportadora_grande"
    jaula_contencion = "jaula_contencion"
    correas_arneses = "correas_arneses"
    proteccion_vehiculo = "proteccion_vehiculo"
    guantes_manejo = "guantes_manejo"
    sin_equipo = "sin_equipo"


class RestriccionFisicaEnum(str, Enum):
    ninguna = "ninguna"
    evitar_carga_mayor_5kg = "evitar_carga_mayor_5kg"
    evitar_carga_mayor_15kg = "evitar_carga_mayor_15kg"
    evitar_escaleras = "evitar_escaleras"
    evitar_caminatas_prolongadas = "evitar_caminatas_prolongadas"
    evitar_pie_prolongado = "evitar_pie_prolongado"
    prefiere_comentarlo = "prefiere_comentarlo"


class CapacitacionEnum(str, Enum):
    si = "si"
    solo_virtual = "solo_virtual"
    no = "no"


class CanalContactoEnum(str, Enum):
    whatsapp = "whatsapp"
    llamada = "llamada"
    plataforma = "plataforma"


class ProyeccionColaboracionEnum(str, Enum):
    ocasional = "ocasional"
    uno_tres_meses = "uno_tres_meses"
    tres_seis_meses = "tres_seis_meses"
    mas_seis_meses = "mas_seis_meses"
    continua = "continua"


class MotivacionEnum(str, Enum):
    salvar_animales = "salvar_animales"
    apoyar_colectivos = "apoyar_colectivos"
    aplicar_conocimientos = "aplicar_conocimientos"
    adquirir_experiencia = "adquirir_experiencia"
    impacto_social = "impacto_social"
    apoyar_recuperacion = "apoyar_recuperacion"


class HorarioLegacy(BaseModel):
    """Rango usado por el formulario anterior durante la transición a franjas."""

    de: str
    a: str


class DisponibilidadRequest(BaseModel):
    dias: list[DiaSemanaEnum] = Field(default_factory=list)
    franjas: list[FranjaHorariaEnum] = Field(default_factory=list)
    horarios: list[HorarioLegacy] = Field(default_factory=list)


class CapacidadesRequest(BaseModel):
    """Contrato de capacidades operativas.

    Los campos marcados como legado se conservan temporalmente para que el
    formulario desplegado siga funcionando mientras se migra la interfaz.
    """

    disponibilidad: DisponibilidadRequest = Field(default_factory=DisponibilidadRequest)
    tiempo_reaccion: Optional[TiempoReaccionEnum] = None
    disponibilidad_urgencias: Optional[DisponibilidadUrgenciasEnum] = None
    max_casos_simultaneos: int = Field(default=1, ge=1, le=3)
    radio_max_km: Optional[int] = Field(default=None)
    medios_transporte: list[MedioTransporteEnum] = Field(default_factory=list)
    vehiculo_apto_traslado: bool = False
    tamanios_traslado: list[TamanioEnum] = Field(default_factory=list)

    especies_manejo: list[EspecieManejoEnum] = Field(default_factory=list)
    otras_especies_manejo: list[OtraEspecieManejoEnum] = Field(default_factory=list)
    tamanios_manejo: list[TamanioEnum] = Field(default_factory=list)
    primeros_auxilios_nivel: Optional[PrimerosAuxiliosEnum] = None
    experiencias_campo: list[ExperienciaCampoEnum] = Field(default_factory=list)
    vias_tratamiento: list[ViaTratamientoEnum] = Field(default_factory=list)
    trayectoria_tipos: list[TrayectoriaEnum] = Field(default_factory=list)
    experiencia_anios: Optional[ExperienciaAniosEnum] = None

    equipamiento: list[EquipamientoEnum] = Field(default_factory=list)
    restricciones_fisicas: list[RestriccionFisicaEnum] = Field(default_factory=list)
    acepta_capacitacion: Optional[CapacitacionEnum] = None

    canal_contacto: Optional[CanalContactoEnum] = None
    contacto_emergencia_nombre: Optional[str] = Field(default=None, max_length=120)
    contacto_emergencia_telefono: Optional[str] = Field(default=None, max_length=20)
    compromiso_comunicacion: bool = False
    compromiso_notificar: bool = False
    proyeccion_colaboracion: Optional[ProyeccionColaboracionEnum] = None

    motivaciones: list[MotivacionEnum] = Field(default_factory=list)
    comentarios_adicionales: Optional[str] = Field(default=None, max_length=250)

    # Control de perfil; se devuelve junto con capacidades, pero se persiste
    # en voluntarios porque no describe una habilidad.
    disponible_operativamente: Optional[bool] = None

    # Campos legado: se retirarán cuando frontend y matching usen v2.
    ofrece_casa_hogar: bool = False
    capacidad_animales: int = 0
    especies: list[str] = Field(default_factory=list)
    tamanios: list[str] = Field(default_factory=list)
    otros_animales_en_casa: Optional[bool] = None
    ninos_en_casa: Optional[bool] = None
    tiene_vehiculo: bool = False
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    motivo_voluntario: Optional[str] = None
    experiencia_previa: Optional[str] = None
    acepto_terminos: bool = False

    @model_validator(mode="after")
    def validar_opciones_condicionales(self):
        if self.radio_max_km is not None and self.radio_max_km not in (5, 10, 20, 30):
            raise ValueError("radio_max_km debe ser 5, 10, 20 o 30")

        if not self.vehiculo_apto_traslado and self.tamanios_traslado:
            raise ValueError(
                "No se pueden indicar tamaños de traslado sin un vehículo apto"
            )

        if (
            RestriccionFisicaEnum.ninguna in self.restricciones_fisicas
            and len(self.restricciones_fisicas) > 1
        ):
            raise ValueError("'ninguna' no puede combinarse con otras restricciones")

        if (
            EquipamientoEnum.sin_equipo in self.equipamiento
            and len(self.equipamiento) > 1
        ):
            raise ValueError("'sin_equipo' no puede combinarse con equipamiento")

        if (
            TrayectoriaEnum.sin_experiencia in self.trayectoria_tipos
            and len(self.trayectoria_tipos) > 1
        ):
            raise ValueError(
                "'sin_experiencia' no puede combinarse con otras trayectorias"
            )

        if (
            EspecieManejoEnum.otro not in self.especies_manejo
            and self.otras_especies_manejo
        ):
            raise ValueError(
                "Selecciona 'otro' antes de indicar otras especies de manejo"
            )

        return self
