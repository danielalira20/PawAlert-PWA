def get_html(nombre_asociacion: str, nombre_representante: str = "") -> str:
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

    <!-- Badge -->
    <div style="display:inline-flex;align-items:center;gap:6px;background:#EAFAF1;border:1px solid #A9DFBF;border-radius:20px;padding:5px 12px;margin-bottom:20px;">
      <span style="font-size:13px;"></span>
      <span style="color:#1E8449;font-weight:600;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;">Asociación aprobada</span>
    </div>

    <h1 style="color:#2C3E50;font-size:24px;font-weight:700;line-height:1.2;margin:0 0 12px;">
      ¡Bienvenidos a la red PawAlert!
    </h1>

    <p style="color:#566573;font-size:15px;line-height:1.75;margin:0 0 24px;">
      {saludo} nos complace informarte que
      <strong style="color:#2C3E50;">{nombre_asociacion}</strong> ha sido
      <strong style="color:#27AE60;">aprobada exitosamente</strong>.
      Ya pueden publicar casos, coordinar rescates y acceder a todas las herramientas de la plataforma.
    </p>

    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 8px 4px 0;width:50%;">
            <div style="color:#94A3B8;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px;">Asociación</div>
            <div style="color:#2C3E50;font-size:14px;font-weight:600;">{nombre_asociacion}</div>
          </td>
          <td style="padding:4px 0 4px 8px;">
            <div style="color:#94A3B8;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px;">Estado</div>
            <div style="color:#27AE60;font-size:14px;font-weight:600;">Verificada ✓</div>
          </td>
        </tr>
      </table>
    </div>

    <a href="https://paw-alert-pwa.vercel.app" style="display:inline-block;background:#1F77B4;color:#ffffff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
      Acceder a PawAlert →
    </a>

    <p style="color:#94A3B8;font-size:12px;margin-top:20px;line-height:1.6;">
      Si tienes preguntas sobre tu cuenta, contáctanos en cualquier momento.
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