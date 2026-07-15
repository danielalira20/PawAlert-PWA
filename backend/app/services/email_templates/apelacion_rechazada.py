def get_html(nombre_asociacion: str, respuesta: str | None = None, nombre_representante: str = "") -> str:
    saludo = f"Hola <strong>{nombre_representante}</strong>," if nombre_representante else "Hola,"
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:20px;background:#F8FAFC;font-family:'Inter',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;">

  <!-- HEADER -->
  <div style="background:#1F77B4;padding:28px 40px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div>
        <div style="color:#ffffff;font-size:20px;font-weight:700;line-height:1;">PawAlert</div>
        <div style="color:rgba(255,255,255,0.75);font-size:11px;margin-top:3px;">Red de Rescate Animal · MX</div>
      </div>
    </div>
  </div>

  <!-- BODY -->
  <div style="padding:32px 40px;">

    <!-- Badge rojo -->
    <div style="display:inline-flex;align-items:center;gap:6px;background:#FDEDEC;border:1px solid #F5B7B1;border-radius:20px;padding:5px 12px;margin-bottom:20px;">
      <span style="font-size:13px;"></span>
      <span style="color:#922B21;font-weight:600;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;">Apelación no procedente</span>
    </div>

    <h1 style="color:#2C3E50;font-size:24px;font-weight:700;line-height:1.2;margin:0 0 12px;">
      Resolución final de tu apelación
    </h1>

    <p style="color:#566573;font-size:15px;line-height:1.75;margin:0 0 24px;">
      {saludo} tras una revisión exhaustiva, no es posible aprobar el registro de
      <strong style="color:#2C3E50;">{nombre_asociacion}</strong>
      <strong style="color:#E74C3C;">en esta instancia</strong>.
    </p>

    {"<div style='background:#FDEDEC;border:1px solid #F5B7B1;border-radius:12px;padding:16px 20px;margin-bottom:28px;'><div style='color:#94A3B8;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;'>Respuesta del revisor</div><p style='color:#2C3E50;font-size:14px;line-height:1.7;margin:0;'>" + respuesta + "</p></div>" if respuesta else ""}

    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
      <p style="color:#566573;font-size:13px;line-height:1.7;margin:0;">
        Esta resolución es definitiva para el ciclo actual. Podrás volver a solicitar
        el registro transcurridos <strong style="color:#2C3E50;">6 meses</strong> desde esta fecha.
      </p>
    </div>

    <a href="https://paw-alert-pwa.vercel.app" style="display:inline-block;background:#1F77B4;color:#ffffff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
      Ver historial de solicitudes →
    </a>

    <p style="color:#94A3B8;font-size:12px;margin-top:20px;line-height:1.6;">
      Si tienes dudas, contáctanos en cualquier momento.
    </p>
  </div>

  <!-- FOOTER -->
  <div style="border-top:1px solid #E2E8F0;padding:20px 40px;background:#F8FAFC;text-align:center;">
    <p style="color:#566573;font-weight:600;font-size:13px;margin:0 0 8px;">🐾 Equipo PawAlert</p>
    <p style="color:#94A3B8;font-size:11px;line-height:1.7;margin:0 0 6px;">
      Este correo fue generado automáticamente. No respondas directamente.<br>
      Soporte: <a href="mailto:pawalert2026@gmail.com" style="color:#1F77B4;text-decoration:none;">soporte@pawalert.mx</a>
    </p>
    <p style="color:#BDC3C7;font-size:10px;margin:0;">© 2025 PawAlert · México</p>
  </div>

</div>
</body>
</html>"""