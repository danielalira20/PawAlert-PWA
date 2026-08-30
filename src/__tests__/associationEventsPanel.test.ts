import type { EventAssociationView } from "../types/event";
import { buildAssociationEventCounts } from "../utils/associationEventFilters";

describe("AssociationEventsPanel", () => {
  it("calcula los indicadores y filtros sin perder estados administrativos", () => {
    const events = [
      { id: "1", estado: "publicado" },
      { id: "2", estado: "publicado" },
      { id: "3", estado: "borrador" },
      { id: "4", estado: "suspendido_admin" },
    ] as EventAssociationView[];

    expect(buildAssociationEventCounts(events)).toEqual({
      todos: 4,
      borrador: 1,
      publicado: 2,
      pausado: 0,
      cancelado: 0,
      finalizado: 0,
      archivado: 0,
      suspendido_admin: 1,
    });
  });
});
