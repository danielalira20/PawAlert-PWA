import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useAuth } from "../context/AuthContext";
import { useAdminEventIncidents } from "../hooks/events/useAdminEventIncidents";
import { listAdminEventIncidents } from "../services/eventService";
import type { EventAdminIncidentPage } from "../types/event";

jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../services/eventService", () => {
  const actual = jest.requireActual("../services/eventService");
  return { ...actual, listAdminEventIncidents: jest.fn() };
});

const mockedUseAuth = useAuth as jest.Mock;
const mockedListIncidents = listAdminEventIncidents as jest.MockedFunction<
  typeof listAdminEventIncidents
>;

const page: EventAdminIncidentPage = {
  items: [],
  pagina: 1,
  limite: 8,
  total: 3,
  tiene_mas: false,
};

describe("useAdminEventIncidents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ token: "token-admin" });
    mockedListIncidents.mockResolvedValue(page);
  });

  it("consulta la bandeja con filtros y paginación", async () => {
    const filters = {
      estado: "pendiente" as const,
      motivo: "servicio_riesgoso" as const,
      pagina: 1,
      limite: 8,
    };
    const { result } = await renderHook(() => useAdminEventIncidents(filters));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedListIncidents).toHaveBeenCalledWith("token-admin", filters);
    expect(result.current.page.total).toBe(3);
    expect(result.current.error).toBeNull();
  });

  it("refresca sin reemplazar la bandeja por la carga inicial", async () => {
    const filters = { estado: "pendiente" as const, pagina: 1, limite: 8 };
    const { result } = await renderHook(() => useAdminEventIncidents(filters));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockedListIncidents).toHaveBeenCalledTimes(2);
    expect(result.current.isRefreshing).toBe(false);
  });

  it("no consulta incidentes sin una sesión administrativa", async () => {
    mockedUseAuth.mockReturnValue({ token: null });
    const filters = { estado: "pendiente" as const, pagina: 1, limite: 8 };
    const { result } = await renderHook(() => useAdminEventIncidents(filters));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedListIncidents).not.toHaveBeenCalled();
    expect(result.current.error).toContain("administrador");
  });
});
