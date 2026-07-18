def get_html(nombre: str, url_completar_cuenta: str, nombre_asociacion: str) -> str:
   return f"""
    <!DOCTYPE html>
    <html lang="es">
    <body style="margin:0; padding:0; background-color:#FAF3EA; font-family: Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF3EA; padding: 32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color:#FFFFFF; border-radius: 28px; overflow:hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.08);">

              <tr>
                <td style="background-color:#66BCB4; padding: 32px 32px 28px 32px; text-align:center;">
                  <div style="width:64px; height:64px; background-color:rgba(255,255,255,0.25); border-radius:20px; display:inline-block; line-height:64px; font-size:30px; margin-bottom: 14px;">
                    🐾
                  </div>
                  <h1 style="margin:0; color:#FFFFFF; font-size:22px; font-weight:900;">
                    ¡Bienvenido a PawAlert, {nombre}!
                  </h1>
                </td>
              </tr>

              <tr>
                <td style="padding: 32px;">
                  <p style="margin:0 0 20px 0; color:#4A3728; font-size:15px; line-height:22px;">
                    <strong>{nombre_asociacion}</strong> te dio de alta en PawAlert para que puedas ayudar a coordinar rescates. Sigue estos 3 pasos para activar tu cuenta:
                </p>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #F3F4F6;">
                        <span style="display:inline-block; width:24px; height:24px; background-color:#EC802B; color:#fff; border-radius:12px; text-align:center; line-height:24px; font-weight:800; font-size:13px; margin-right:10px;">1</span>
                        <span style="color:#4A3728; font-size:14px;">Da clic en el botón de abajo</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #F3F4F6;">
                        <span style="display:inline-block; width:24px; height:24px; background-color:#EC802B; color:#fff; border-radius:12px; text-align:center; line-height:24px; font-weight:800; font-size:13px; margin-right:10px;">2</span>
                        <span style="color:#4A3728; font-size:14px;">Te enviaremos un código de 6 dígitos por SMS para confirmar tu número</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 0;">
                        <span style="display:inline-block; width:24px; height:24px; background-color:#EC802B; color:#fff; border-radius:12px; text-align:center; line-height:24px; font-weight:800; font-size:13px; margin-right:10px;">3</span>
                        <span style="color:#4A3728; font-size:14px;">Crea tu contraseña y listo — ya podrás iniciar sesión</span>
                      </td>
                    </tr>
                  </table>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                    <tr>
                      <td align="center">
                        <a href="{url_completar_cuenta}" style="display:inline-block; background-color:#EC802B; color:#FFFFFF; text-decoration:none; padding: 16px 32px; border-radius: 100px; font-weight:800; font-size:15px;">
                          Activar mi cuenta
                        </a>
                      </td>
                    </tr>
                  </table>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="border-top: 1px solid #E5E7EB; padding-top: 20px;">
                        <p style="margin:0; color:#8C7A6B; font-size:12px; line-height:18px;">
                          Si no esperabas este correo, puedes ignorarlo con tranquilidad.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="background-color:#FAF3EA; padding: 20px 32px; text-align:center;">
                  <p style="margin:0; color:#B0966E; font-size:11px; font-weight:700; letter-spacing:0.4px;">
                    PawAlert · Puebla, México
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """