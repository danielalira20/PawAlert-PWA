import { pwaPushSetupMessage } from "../utils/pwaPush";

describe("pwaPushSetupMessage", () => {
  it("explica el requisito de instalación en iPhone", () => {
    expect(
      pwaPushSetupMessage({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      }),
    ).toContain("pantalla de inicio");
  });

  it("no muestra el aviso cuando la PWA de iPhone ya está instalada", () => {
    expect(
      pwaPushSetupMessage({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        displayModeStandalone: true,
      }),
    ).toBeNull();
  });

  it("no aplica instrucciones de iPhone en Android", () => {
    expect(
      pwaPushSetupMessage({ userAgent: "Mozilla/5.0 (Linux; Android 15)" }),
    ).toBeNull();
  });
});
