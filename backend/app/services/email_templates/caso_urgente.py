def get_html(nombre_asociacion: str, municipio: str | None, tipo_animal: str | None) -> str:
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
      <span style="color:#922B21;font-weight:600;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;">Caso urgente · Acción inmediata</span>
    </div>

    <h1 style="color:#2C3E50;font-size:24px;font-weight:700;line-height:1.2;margin:0 0 12px;">
      Animal en situación crítica detectado
    </h1>

    <p style="color:#566573;font-size:15px;line-height:1.75;margin:0 0 24px;">
      Hola <strong style="color:#2C3E50;">{nombre_asociacion}</strong>, se ha asignado un
      <strong style="color:#E74C3C;">caso urgente</strong> en tu zona de cobertura
      que requiere atención inmediata.
    </p>

    <!-- Aviso de tiempo -->
    <div style="background:#FDEDEC;border:1px solid #F5B7B1;border-radius:12px;padding:14px 18px;margin-bottom:20px;display:flex;gap:12px;align-items:flex-start;">
      <span style="font-size:18px;flex-shrink:0;">⏱️</span>
      <p style="color:#2C3E50;font-size:14px;font-weight:600;margin:0;line-height:1.55;">
        Responde en un máximo de <strong style="color:#E74C3C;">2 horas</strong> o márcalo como no disponible en la app.
      </p>
    </div>

    <!-- Datos del caso -->
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
      <div style="color:#94A3B8;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px;">Datos del caso</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 8px 4px 0;width:50%;vertical-align:top;">
            <div style="color:#94A3B8;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px;">Animal</div>
            <div style="color:#2C3E50;font-size:14px;font-weight:600;">{tipo_animal or 'No especificado'}</div>
          </td>
          <td style="padding:4px 0 4px 8px;vertical-align:top;">
            <div style="color:#94A3B8;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px;">Zona</div>
            <div style="color:#2C3E50;font-size:14px;font-weight:600;">{municipio or 'No especificada'}</div>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding:12px 0 4px;">
            <div style="color:#94A3B8;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px;">Condición</div>
            <div style="color:#E74C3C;font-size:14px;font-weight:600;">Grave — requiere atención inmediata</div>
          </td>
        </tr>
      </table>
    </div>

    <a href="https://paw-alert-pwa.vercel.app" style="display:inline-block;background:#1F77B4;color:#ffffff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
      Ver caso completo →
    </a>

    <p style="color:#94A3B8;font-size:12px;margin-top:20px;line-height:1.6;">
      Si no puedes atender este caso, márcalo como no disponible desde la app.
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