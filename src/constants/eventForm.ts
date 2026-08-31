import type { EventAccessMode, EventType } from "../types/event";

export interface EventFormOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

export const EVENT_FORM_STEPS = [
  "Información principal",
  "Fecha y ubicación",
  "Público y acceso",
  "Organización",
  "Imagen y revisión",
] as const;

export const EVENT_TYPE_OPTIONS: EventFormOption<EventType>[] = [
  { value: "vacunacion", label: "Vacunación" },
  { value: "esterilizacion", label: "Esterilización" },
  { value: "feria_adopcion", label: "Feria de adopción" },
  { value: "identificacion", label: "Identificación" },
  { value: "acopio", label: "Centro o jornada de acopio" },
  { value: "capacitacion", label: "Capacitación" },
  { value: "bienestar_animal", label: "Bienestar animal" },
  { value: "otro", label: "Otro evento" },
];

export const EVENT_TITLE_SUGGESTIONS: Record<EventType, string[]> = {
  vacunacion: [
    "Jornada de vacunación",
    "Campaña de vacunación para perros y gatos",
  ],
  esterilizacion: [
    "Jornada de esterilización",
    "Campaña de esterilización para perros y gatos",
  ],
  feria_adopcion: ["Feria de adopción", "Encuentro con animales en adopción"],
  identificacion: [
    "Jornada de identificación animal",
    "Campaña de identificación para mascotas",
  ],
  acopio: [
    "Centro de acopio para animales rescatados",
    "Jornada comunitaria de acopio",
  ],
  capacitacion: ["Taller de cuidado animal", "Capacitación para la comunidad"],
  bienestar_animal: [
    "Jornada de bienestar animal",
    "Encuentro comunitario de cuidado animal",
  ],
  otro: ["Evento comunitario de bienestar animal"],
};

export const EVENT_SERVICE_OPTIONS: Record<EventType, string[]> = {
  vacunacion: [
    "Vacuna antirrábica",
    "Esquema múltiple canino",
    "Esquema múltiple felino",
    "Revisión previa",
    "Desparasitación",
    "Orientación veterinaria",
  ],
  esterilizacion: [
    "Esterilización de perros",
    "Esterilización de gatos",
    "Atención para hembras",
    "Atención para machos",
    "Valoración preoperatoria",
    "Seguimiento postoperatorio",
  ],
  feria_adopcion: [
    "Convivencia con animales",
    "Orientación para adoptantes",
    "Recepción de solicitudes",
    "Información sobre el proceso",
    "Actividades familiares",
  ],
  identificacion: [
    "Placa de identificación",
    "Microchip",
    "Registro de datos",
    "Código QR para collar",
    "Orientación sobre identificación",
  ],
  acopio: [
    "Alimento",
    "Medicamentos vigentes",
    "Material de curación",
    "Artículos de limpieza",
    "Cobijas y camas",
    "Transportadoras",
  ],
  capacitacion: [
    "Tenencia responsable",
    "Primeros auxilios",
    "Manejo animal",
    "Reporte responsable",
    "Formación para voluntariado",
  ],
  bienestar_animal: [
    "Valoración general",
    "Desparasitación",
    "Higiene y cepillado",
    "Orientación conductual",
    "Enriquecimiento animal",
  ],
  otro: [],
};

export const SPECIES_OPTIONS = [
  "Perros",
  "Gatos",
  "Aves",
  "Pequeños mamíferos",
  "Animales de compañía en general",
];
export const AUDIENCE_OPTIONS = [
  "Público general",
  "Tutores de animales",
  "Personas interesadas en adoptar",
  "Familias",
  "Niñas y niños acompañados",
  "Voluntarios y rescatistas",
  "Asociaciones protectoras",
  "Profesionales del bienestar animal",
  "Habitantes de la comunidad",
];
export const REQUIREMENT_OPTIONS = [
  "Sin requisitos adicionales",
  "Registro previo",
  "Ser mayor de edad",
  "Menores acompañados",
  "Identificación oficial",
  "Comprobante de domicilio",
  "Cartilla de vacunación",
  "Llevar al animal con correa",
  "Llevar transportadora",
  "Ayuno previo",
  "Cita confirmada",
  "Vivir en el municipio",
];
export const DOCUMENT_OPTIONS = [
  "Ninguno",
  "Identificación oficial",
  "CURP",
  "Comprobante de domicilio",
  "Cartilla de vacunación",
  "Confirmación de registro",
  "Formato proporcionado por la asociación",
];
export const EXCLUSION_OPTIONS = [
  "Ninguna exclusión",
  "Animales con signos de enfermedad",
  "Animales gestantes o lactantes",
  "Animales fuera del rango de edad",
  "Animales fuera del rango de peso",
  "Animales altamente reactivos",
  "Animales sin el ayuno requerido",
  "Personas sin registro o cita",
  "Cupo agotado",
];

export const ACCESS_MODE_OPTIONS: EventFormOption<EventAccessMode>[] = [
  {
    value: "sin_registro",
    label: "Acceso libre, sin registro",
    description: "Las personas pueden asistir directamente.",
  },
  {
    value: "registro_externo",
    label: "Registro en sitio externo",
    description: "PawAlert dirigirá al sitio oficial de la asociación.",
  },
  {
    value: "contacto_institucional",
    label: "Contactar a la asociación",
    description: "La asociación coordina citas o registros.",
  },
];

export const COST_MODE_OPTIONS = [
  { value: "fijo", label: "Costo fijo" },
  { value: "desde", label: "Costo desde cierta cantidad" },
  { value: "recuperacion", label: "Cuota de recuperación" },
  { value: "variable", label: "Costo variable según servicio" },
] as const;

export const TIME_ZONE_OPTIONS = [
  { value: "America/Mexico_City", label: "Centro de México" },
  { value: "America/Cancun", label: "Quintana Roo" },
  { value: "America/Monterrey", label: "Noreste de México" },
  { value: "America/Chihuahua", label: "Chihuahua" },
  { value: "America/Mazatlan", label: "Pacífico de México" },
  { value: "America/Hermosillo", label: "Sonora" },
  { value: "America/Tijuana", label: "Baja California" },
] as const;
