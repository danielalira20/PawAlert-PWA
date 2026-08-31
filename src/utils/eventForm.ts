import {
  AUDIENCE_OPTIONS,
  DOCUMENT_OPTIONS,
  EVENT_SERVICE_OPTIONS,
  EVENT_TYPE_OPTIONS,
  EXCLUSION_OPTIONS,
  REQUIREMENT_OPTIONS,
  SPECIES_OPTIONS,
} from "../constants/eventForm";
import type {
  EventAssociationView,
  EventProfessionalDataState,
  EventType,
  EventWriteData,
} from "../types/event";

export type CostMode = "fijo" | "desde" | "recuperacion" | "variable";

export interface EventEditorValues {
  tipo: EventType | null;
  categoriaOtro: string;
  titulo: string;
  descripcion: string;
  descripcionPersonalizada: boolean;
  servicios: string[];
  servicioOtro: string;
  fechaInicio: string;
  horaInicio: string;
  fechaFin: string;
  horaFin: string;
  zonaHoraria: string;
  lugarNombre: string;
  direccionPublica: string;
  municipio: string;
  estadoUbicacion: string;
  latitud: number | null;
  longitud: number | null;
  modalidadAcceso: EventWriteData["modalidad_acceso"];
  enlaceRegistro: string;
  instruccionesContacto: string;
  especies: string[];
  especieOtra: string;
  publicos: string[];
  publicoOtro: string;
  requisitos: string[];
  requisitoOtro: string;
  documentos: string[];
  documentoOtro: string;
  exclusiones: string[];
  exclusionOtra: string;
  esGratuito: boolean | null;
  modoCosto: CostMode;
  costo: string;
  cupoLimitado: boolean | null;
  cupoTotal: string;
  cupoAgotado: boolean;
  responsableOperativoId: string;
  contactoNombre: string;
  contactoTelefono: string;
  contactoEmail: string;
  responsableProfesional: string;
  cedulaProfesional: string;
  institucionProfesional: string;
  datosProfesionalesEstado: EventProfessionalDataState;
  textoAlternativo: string;
}

const defaultTimeZone = (() => {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return resolved?.startsWith("America/") ? resolved : "America/Mexico_City";
})();

export function createInitialEventValues(userId = ""): EventEditorValues {
  return {
    tipo: null,
    categoriaOtro: "",
    titulo: "",
    descripcion: "",
    descripcionPersonalizada: false,
    servicios: [],
    servicioOtro: "",
    fechaInicio: "",
    horaInicio: "",
    fechaFin: "",
    horaFin: "",
    zonaHoraria: defaultTimeZone,
    lugarNombre: "",
    direccionPublica: "",
    municipio: "",
    estadoUbicacion: "",
    latitud: null,
    longitud: null,
    modalidadAcceso: null,
    enlaceRegistro: "",
    instruccionesContacto: "",
    especies: [],
    especieOtra: "",
    publicos: [],
    publicoOtro: "",
    requisitos: [],
    requisitoOtro: "",
    documentos: [],
    documentoOtro: "",
    exclusiones: [],
    exclusionOtra: "",
    esGratuito: null,
    modoCosto: "fijo",
    costo: "",
    cupoLimitado: null,
    cupoTotal: "",
    cupoAgotado: false,
    responsableOperativoId: userId,
    contactoNombre: "",
    contactoTelefono: "",
    contactoEmail: "",
    responsableProfesional: "",
    cedulaProfesional: "",
    institucionProfesional: "",
    datosProfesionalesEstado: "no_aplica",
    textoAlternativo: "",
  };
}

export function toggleEventOption(
  values: string[],
  option: string,
  exclusive?: string,
) {
  if (values.includes(option))
    return values.filter((value) => value !== option);
  if (option === exclusive) return [option];
  return [...values.filter((value) => value !== exclusive), option];
}

function serializeSelections(values: string[], other: string) {
  return [...values, other.trim()].filter(Boolean).join("; ");
}

function splitSelections(value: string | null | undefined) {
  return value
    ? value
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function partitionSelections(values: string[], catalog: readonly string[]) {
  const known = values.filter((value) => catalog.includes(value));
  const other = values.filter((value) => !catalog.includes(value)).join("; ");
  return { known, other };
}

function costModeFromDetail(
  detail: string | null | undefined,
): CostMode {
  if (detail?.startsWith("Desde:")) return "desde";
  if (detail?.startsWith("Cuota de recuperación:")) return "recuperacion";
  if (detail?.startsWith("Costo base;")) return "variable";
  return "fijo";
}

export function generateEventDescription(values: EventEditorValues) {
  const type =
    values.categoriaOtro.trim() ||
    EVENT_TYPE_OPTIONS.find((option) => option.value === values.tipo)?.label ||
    "actividad comunitaria";
  const species = serializeSelections(values.especies, values.especieOtra);
  const services = serializeSelections(values.servicios, values.servicioOtro);
  const audience = serializeSelections(values.publicos, values.publicoOtro);
  const parts = [
    `${type.charAt(0).toUpperCase()}${type.slice(1)} organizada por la asociación.`,
  ];
  if (services) parts.push(`Se ofrecerá: ${services}.`);
  if (species) parts.push(`Dirigida a: ${species}.`);
  if (audience) parts.push(`Público: ${audience}.`);
  if (values.esGratuito === true) parts.push("La actividad es gratuita.");
  return parts.join(" ");
}

function dateParts(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export function zonedDateTimeToIso(
  date: string,
  time: string,
  timeZone: string,
) {
  if (!date || !time) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desired;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const observed = dateParts(new Date(guess).toISOString(), timeZone);
    const [observedYear, observedMonth, observedDay] = observed.date
      .split("-")
      .map(Number);
    const [observedHour, observedMinute] = observed.time.split(":").map(Number);
    const observedUtc = Date.UTC(
      observedYear,
      observedMonth - 1,
      observedDay,
      observedHour,
      observedMinute,
    );
    guess += desired - observedUtc;
  }
  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

function safeType(values: EventEditorValues) {
  return values.tipo === "otro" && !values.categoriaOtro.trim()
    ? null
    : values.tipo;
}

export function eventValuesToWriteData(
  values: EventEditorValues,
): EventWriteData {
  const startsAt = zonedDateTimeToIso(
    values.fechaInicio,
    values.horaInicio,
    values.zonaHoraria,
  );
  const endsAt = zonedDateTimeToIso(
    values.fechaFin,
    values.horaFin,
    values.zonaHoraria,
  );
  const validRange =
    startsAt && endsAt && new Date(startsAt) < new Date(endsAt);
  const accessIsReady =
    values.modalidadAcceso === "sin_registro" ||
    (values.modalidadAcceso === "registro_externo" &&
      Boolean(values.enlaceRegistro.trim())) ||
    (values.modalidadAcceso === "contacto_institucional" &&
      Boolean(values.instruccionesContacto.trim()));
  const amount = Number(values.costo.replace(",", "."));
  const validPaidCost =
    values.esGratuito === false &&
    Boolean(values.costo.trim()) &&
    Number.isFinite(amount) &&
    amount >= 0;
  const capacity = Number(values.cupoTotal);
  const validCapacity =
    values.cupoLimitado === true && Number.isInteger(capacity) && capacity > 0;
  const clinical =
    values.tipo === "vacunacion" || values.tipo === "esterilizacion";

  return {
    responsable_operativo_usuario_id: values.responsableOperativoId || null,
    tipo: safeType(values),
    categoria_otro: values.categoriaOtro.trim() || null,
    titulo: values.titulo.trim() || null,
    descripcion:
      (values.descripcionPersonalizada
        ? values.descripcion
        : generateEventDescription(values)
      ).trim() || null,
    inicia_at: validRange ? startsAt : null,
    termina_at: validRange ? endsAt : null,
    zona_horaria: validRange ? values.zonaHoraria : null,
    lugar_nombre: values.lugarNombre.trim() || null,
    direccion_publica: values.direccionPublica.trim() || null,
    municipio: values.municipio.trim() || null,
    estado_ubicacion: values.estadoUbicacion.trim() || null,
    latitud: values.latitud,
    longitud: values.longitud,
    modalidad_acceso: accessIsReady ? values.modalidadAcceso : null,
    enlace_registro_externo: values.enlaceRegistro.trim() || null,
    instrucciones_contacto: values.instruccionesContacto.trim() || null,
    especies_objetivo: [...values.especies, values.especieOtra.trim()].filter(
      Boolean,
    ),
    publico_objetivo:
      serializeSelections(values.publicos, values.publicoOtro) || null,
    requisitos_asistencia:
      serializeSelections(values.requisitos, values.requisitoOtro) || null,
    servicios_detalle:
      serializeSelections(values.servicios, values.servicioOtro) || null,
    condiciones_excluidas: [
      ...values.exclusiones,
      values.exclusionOtra.trim(),
    ].filter(Boolean),
    documentos_requeridos: [
      ...values.documentos,
      values.documentoOtro.trim(),
    ].filter(Boolean),
    contacto_institucional_nombre: values.contactoNombre.trim() || null,
    contacto_institucional_telefono: values.contactoTelefono.trim() || null,
    contacto_institucional_email: values.contactoEmail.trim() || null,
    es_gratuito:
      values.esGratuito === true ? true : validPaidCost ? false : null,
    costo_centavos:
      values.esGratuito === true
        ? 0
        : validPaidCost
          ? Math.round(amount * 100)
          : null,
    moneda: "MXN",
    detalle_costos: validPaidCost
      ? `${values.modoCosto === "desde" ? "Desde" : values.modoCosto === "recuperacion" ? "Cuota de recuperación" : values.modoCosto === "variable" ? "Costo base; puede variar según el servicio" : "Costo fijo"}: $${amount.toFixed(2)} MXN`
      : null,
    cupo_total: validCapacity ? capacity : null,
    cupo_estado: validCapacity
      ? values.cupoAgotado
        ? "agotado"
        : "disponible"
      : "no_aplica",
    responsable_profesional: clinical
      ? values.responsableProfesional.trim() || null
      : null,
    cedula_profesional: clinical
      ? values.cedulaProfesional.trim() || null
      : null,
    institucion_profesional: clinical
      ? values.institucionProfesional.trim() || null
      : null,
    datos_profesionales_estado:
      clinical && values.responsableProfesional.trim()
        ? values.datosProfesionalesEstado === "verificado"
          ? "verificado"
          : "declarado"
        : "no_aplica",
  };
}

export function eventValuesFromAssociation(
  event: EventAssociationView,
): EventEditorValues {
  const initial = createInitialEventValues(
    event.responsable_operativo_usuario_id || "",
  );
  const start =
    event.inicia_at && event.zona_horaria
      ? dateParts(event.inicia_at, event.zona_horaria)
      : { date: "", time: "" };
  const end =
    event.termina_at && event.zona_horaria
      ? dateParts(event.termina_at, event.zona_horaria)
      : { date: "", time: "" };
  const services = partitionSelections(
    splitSelections(event.servicios_detalle),
    event.tipo ? EVENT_SERVICE_OPTIONS[event.tipo] : [],
  );
  const species = partitionSelections(
    event.especies_objetivo || [],
    SPECIES_OPTIONS,
  );
  const audiences = partitionSelections(
    splitSelections(event.publico_objetivo),
    AUDIENCE_OPTIONS,
  );
  const requirements = partitionSelections(
    splitSelections(event.requisitos_asistencia),
    REQUIREMENT_OPTIONS,
  );
  const documents = partitionSelections(
    event.documentos_requeridos || [],
    DOCUMENT_OPTIONS,
  );
  const exclusions = partitionSelections(
    event.condiciones_excluidas || [],
    EXCLUSION_OPTIONS,
  );
  return {
    ...initial,
    tipo: event.tipo,
    categoriaOtro: event.categoria_otro || "",
    titulo: event.titulo || "",
    descripcion: event.descripcion || "",
    descripcionPersonalizada: Boolean(event.descripcion),
    servicios: services.known,
    servicioOtro: services.other,
    fechaInicio: start.date,
    horaInicio: start.time,
    fechaFin: end.date,
    horaFin: end.time,
    zonaHoraria: event.zona_horaria || initial.zonaHoraria,
    lugarNombre: event.lugar_nombre || "",
    direccionPublica: event.direccion_publica || "",
    municipio: event.municipio || "",
    estadoUbicacion: event.estado_ubicacion || "",
    latitud: event.latitud,
    longitud: event.longitud,
    modalidadAcceso: event.modalidad_acceso,
    enlaceRegistro: event.enlace_registro_externo || "",
    instruccionesContacto: event.instrucciones_contacto || "",
    especies: species.known,
    especieOtra: species.other,
    publicos: audiences.known,
    publicoOtro: audiences.other,
    requisitos: requirements.known,
    requisitoOtro: requirements.other,
    documentos: documents.known,
    documentoOtro: documents.other,
    exclusiones: exclusions.known,
    exclusionOtra: exclusions.other,
    esGratuito: event.es_gratuito,
    modoCosto: costModeFromDetail(event.detalle_costos),
    costo:
      event.costo_centavos == null ? "" : String(event.costo_centavos / 100),
    cupoLimitado: event.cupo_total != null,
    cupoTotal: event.cupo_total == null ? "" : String(event.cupo_total),
    cupoAgotado: event.cupo_estado === "agotado",
    contactoNombre: event.contacto_institucional_nombre || "",
    contactoTelefono: event.contacto_institucional_telefono || "",
    contactoEmail: event.contacto_institucional_email || "",
    responsableProfesional: event.responsable_profesional || "",
    cedulaProfesional: event.cedula_profesional || "",
    institucionProfesional: event.institucion_profesional || "",
    datosProfesionalesEstado: event.datos_profesionales_estado,
    textoAlternativo: event.imagen_texto_alternativo || "",
  };
}

export function getEventStepCompletion(values: EventEditorValues) {
  const clinical =
    values.tipo === "vacunacion" || values.tipo === "esterilizacion";
  const startsAt = zonedDateTimeToIso(
    values.fechaInicio,
    values.horaInicio,
    values.zonaHoraria,
  );
  const endsAt = zonedDateTimeToIso(
    values.fechaFin,
    values.horaFin,
    values.zonaHoraria,
  );
  const accessReady =
    values.modalidadAcceso === "sin_registro" ||
    (values.modalidadAcceso === "registro_externo" &&
      Boolean(values.enlaceRegistro.trim())) ||
    (values.modalidadAcceso === "contacto_institucional" &&
      Boolean(values.instruccionesContacto.trim()));
  const validCost =
    values.esGratuito === true ||
    (values.esGratuito === false &&
      Boolean(values.costo.trim()) &&
      Number.isFinite(Number(values.costo.replace(",", "."))) &&
      Number(values.costo.replace(",", ".")) >= 0);
  const validCapacity =
    values.cupoLimitado === false ||
    (values.cupoLimitado === true &&
      Number.isInteger(Number(values.cupoTotal)) &&
      Number(values.cupoTotal) > 0);
  return [
    Boolean(
      values.tipo &&
      (values.tipo !== "otro" || values.categoriaOtro.trim()) &&
      values.titulo.trim() &&
      (values.descripcionPersonalizada
        ? values.descripcion.trim()
        : generateEventDescription(values)),
    ),
    Boolean(
      startsAt &&
      endsAt &&
      new Date(startsAt) < new Date(endsAt) &&
      new Date(endsAt) > new Date() &&
      values.lugarNombre.trim() &&
      values.direccionPublica.trim() &&
      values.municipio.trim() &&
      values.estadoUbicacion.trim() &&
      values.latitud != null &&
      values.longitud != null,
    ),
    Boolean(
      values.especies.length + Number(Boolean(values.especieOtra.trim())) > 0 &&
      values.publicos.length + Number(Boolean(values.publicoOtro.trim())) > 0 &&
      values.requisitos.length + Number(Boolean(values.requisitoOtro.trim())) >
        0 &&
      accessReady,
    ),
    Boolean(
      validCost &&
      validCapacity &&
      values.responsableOperativoId &&
      values.contactoNombre.trim() &&
      (values.contactoTelefono.trim() || values.contactoEmail.trim()) &&
      (!clinical ||
        (values.responsableProfesional.trim() &&
          values.servicios.length +
            Number(Boolean(values.servicioOtro.trim())) >
            0)),
    ),
    true,
  ];
}
