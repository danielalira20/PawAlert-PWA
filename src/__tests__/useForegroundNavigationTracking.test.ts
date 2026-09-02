import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { useForegroundNavigationTracking } from "../hooks/useForegroundNavigationTracking";
import { watchNavigationPosition } from "../services/navigationLocationService";
import type { NavigationDevicePosition } from "../services/navigationLocationService";

jest.mock("../services/navigationLocationService", () => ({
  watchNavigationPosition: jest.fn(),
}));

const mockedWatchPosition = watchNavigationPosition as jest.Mock;

describe("useForegroundNavigationTracking", () => {
  const originalCurrentState = Object.getOwnPropertyDescriptor(
    AppState,
    "currentState",
  );
  let appStateListener: ((state: AppStateStatus) => void) | null;
  let removeListener: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    appStateListener = null;
    removeListener = jest.fn();
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "active",
    });
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: removeListener };
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalCurrentState) {
      Object.defineProperty(AppState, "currentState", originalCurrentState);
    }
  });

  it("observa solo en primer plano y libera cada suscripción", async () => {
    const stopFirst = jest.fn();
    const stopSecond = jest.fn();
    let emitPosition: ((position: NavigationDevicePosition) => void) | null =
      null;
    mockedWatchPosition
      .mockImplementationOnce((onPosition) => {
        emitPosition = onPosition;
        return Promise.resolve(stopFirst);
      })
      .mockResolvedValueOnce(stopSecond);

    const { result, unmount } = await renderHook(() =>
      useForegroundNavigationTracking(true),
    );
    await waitFor(() => expect(mockedWatchPosition).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.state).toBe("starting");

    const position: NavigationDevicePosition = {
      latitude: 19.03,
      longitude: -98.19,
      accuracyMeters: 7,
      capturedAt: "2026-09-02T12:00:00.000Z",
    };
    await act(async () => {
      emitPosition?.(position);
    });
    expect(result.current.position).toEqual(position);
    expect(result.current.state).toBe("active");

    await act(async () => {
      appStateListener?.("background");
    });
    expect(stopFirst).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("paused");

    await act(async () => {
      appStateListener?.("active");
      await Promise.resolve();
    });
    await waitFor(() => expect(mockedWatchPosition).toHaveBeenCalledTimes(2));

    await act(async () => {
      unmount();
    });
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(stopSecond).toHaveBeenCalledTimes(1);
  });

  it("no inicia el GPS mientras está deshabilitado", async () => {
    const { result } = await renderHook(() =>
      useForegroundNavigationTracking(false),
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual({ position: null, state: "idle" });
    expect(mockedWatchPosition).not.toHaveBeenCalled();
  });
});
