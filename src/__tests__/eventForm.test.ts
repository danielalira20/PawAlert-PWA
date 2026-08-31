import type { EventAssociationView } from "../types/event";
import {
  createInitialEventValues,
  eventValuesFromAssociation,
  eventValuesToWriteData,
  generateEventDescription,
  getEventStepCompletion,
  toggleEventOption,
  zonedDateTimeToIso,
} from "../utils/eventForm";

describe("eventForm", () => {
  it("mantiene opciones exclusivas sin combinarlas con requisitos", () => {
    expect(
      toggleEventOption(
        ["Identificación oficial", "Registro previo"],
        "Sin requisitos adicionales",
        "Sin requisitos adicionales",
      ),
    ).toEqual(["Sin requisitos adicionales"]);

    expect(
      toggleEventOption(
        ["Sin requisitos adicionales"],
        "Registro previo",
        "Sin requisitos adicionales",
      ),
    ).toEqual(["Registro previo"]);
  });

  it("convierte la hora elegida en México a UTC sin usar la zona del dispositivo", () => {
    expect(
      zonedDateTimeToIso("2026-09-15", "10:00", "America/Mexico_City"),
    ).toBe("2026-09-15T16:00:00.000Z");
  });

  it("genera descripción y payload estructurado desde selecciones", () => {
    const values = {
      ...createInitialEventValues("usuario-1"),
      tipo: "vacunacion" as const,
      titulo: "Jornada antirrábica",
      servicios: ["Vacuna antirrábica"],
      especies: ["Perros", "Gatos"],
      publicos: ["Público general"],
      requisitos: ["Sin requisitos adicionales"],
      modalidadAcceso: "sin_registro" as const,
      esGratuito: true,
      cupoLimitado: false,
    };

    expect(generateEventDescription(values)).toContain("Vacuna antirrábica");
    expect(eventValuesToWriteData(values)).toMatchObject({
      tipo: "vacunacion",
      costo_centavos: 0,
      moneda: "MXN",
      cupo_total: null,
      cupo_estado: "no_aplica",
      modalidad_acceso: "sin_registro",
      especies_objetivo: ["Perros", "Gatos"],
    });
    expect(eventValuesToWriteData(values)).not.toHaveProperty("accesibilidad");
    expect(eventValuesToWriteData(values)).not.toHaveProperty("transporte");
  });

  it("no envía combinaciones incompletas que violarían un borrador", () => {
    const values = {
      ...createInitialEventValues("usuario-1"),
      tipo: "otro" as const,
      modalidadAcceso: "registro_externo" as const,
      esGratuito: false,
      cupoLimitado: true,
    };
    const payload = eventValuesToWriteData(values);

    expect(payload.tipo).toBeNull();
    expect(payload.modalidad_acceso).toBeNull();
    expect(payload.es_gratuito).toBeNull();
    expect(payload.cupo_total).toBeNull();
    expect(payload.cupo_estado).toBe("no_aplica");
  });

  it("conserva valores fuera del catálogo como opciones personalizadas al editar", () => {
    const event = {
      id: "evento-1",
      tipo: "vacunacion",
      servicios_detalle: "Vacuna antirrábica; Consulta especializada",
      especies_objetivo: ["Perros", "Reptiles"],
      publico_objetivo: "Público general; Estudiantes",
      requisitos_asistencia: "Registro previo",
      documentos_requeridos: [],
      condiciones_excluidas: [],
      datos_profesionales_estado: "declarado",
      costo_centavos: 12550,
      detalle_costos: "Desde: $125.50 MXN",
    } as unknown as EventAssociationView;

    const values = eventValuesFromAssociation(event);
    expect(values.servicios).toEqual(["Vacuna antirrábica"]);
    expect(values.servicioOtro).toBe("Consulta especializada");
    expect(values.especies).toEqual(["Perros"]);
    expect(values.especieOtra).toBe("Reptiles");
    expect(values.publicoOtro).toBe("Estudiantes");
    expect(values.modoCosto).toBe("desde");
    expect(values.costo).toBe("125.5");
  });

  it("calcula el avance usando campos completos y no pasos visitados", () => {
    const values = createInitialEventValues("usuario-1");
    expect(getEventStepCompletion(values)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("considera pendiente un horario que ya terminó", () => {
    const values = {
      ...createInitialEventValues("usuario-1"),
      fechaInicio: "2020-01-01",
      horaInicio: "10:00",
      fechaFin: "2020-01-01",
      horaFin: "12:00",
      lugarNombre: "Centro comunitario",
      direccionPublica: "Calle principal 1",
      municipio: "Puebla",
      estadoUbicacion: "Puebla",
      latitud: 19.04,
      longitud: -98.2,
    };

    expect(getEventStepCompletion(values)[1]).toBe(false);
  });
});
