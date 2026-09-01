import type { EventReportReason, EventReportState } from "../types/event";

export const EVENT_MODERATION_STATE_OPTIONS: readonly {
  value: EventReportState;
  label: string;
}[] = [
  { value: "pendiente", label: "Pendientes" },
  { value: "en_revision", label: "En revisión" },
  { value: "requiere_informacion", label: "Requieren información" },
  { value: "resuelto", label: "Resueltos" },
  { value: "descartado", label: "Descartados" },
];

export const EVENT_MODERATION_REASON_OPTIONS: readonly {
  value: EventReportReason;
  label: string;
}[] = [
  { value: "informacion_falsa", label: "Información falsa" },
  { value: "servicio_riesgoso", label: "Servicio riesgoso" },
  { value: "ubicacion_incorrecta", label: "Ubicación incorrecta" },
  { value: "cobro_no_informado", label: "Cobro no informado" },
  { value: "otro", label: "Otro motivo" },
];

export const EVENT_ADMIN_SUSPEND_OPTIONS = [
  {
    value: "Información pública falsa o engañosa confirmada.",
    label: "Información falsa confirmada",
    description: "Los datos publicados no corresponden con el evento real.",
  },
  {
    value: "Servicio potencialmente riesgoso pendiente de aclaración.",
    label: "Riesgo para la comunidad",
    description: "La actividad necesita revisión antes de volver a mostrarse.",
  },
  {
    value: "Ubicación o condiciones de acceso no verificables.",
    label: "Ubicación o acceso dudoso",
    description: "La sede, el registro o las indicaciones no son confiables.",
  },
  {
    value: "Cobros o costos relevantes no informados públicamente.",
    label: "Cobro no informado",
    description: "El costo real difiere de la información publicada.",
  },
  {
    value: "Incumplimiento de los lineamientos comunitarios de PawAlert.",
    label: "Incumplimiento de lineamientos",
    description: "El contenido requiere correcciones de la asociación.",
  },
] as const;

export const EVENT_ADMIN_RESTORE_OPTIONS = [
  {
    value: "La información fue corregida y el riesgo reportado quedó atendido.",
    label: "Información corregida",
    description: "La asociación deberá revisar y publicar nuevamente.",
  },
  {
    value: "La revisión administrativa descartó el riesgo reportado.",
    label: "Riesgo descartado",
    description: "No se confirmó una condición que amerite la suspensión.",
  },
  {
    value: "La ubicación, el acceso y los costos fueron verificados.",
    label: "Datos verificados",
    description:
      "Los datos cuestionados cuentan con una aclaración suficiente.",
  },
  {
    value: "El incidente fue resuelto administrativamente con la asociación.",
    label: "Incidente resuelto",
    description: "La revisión concluyó y el evento volverá como pausado.",
  },
] as const;

export const ACTIVE_EVENT_REPORT_STATES: EventReportState[] = [
  "pendiente",
  "en_revision",
  "requiere_informacion",
];
