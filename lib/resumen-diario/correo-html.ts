import "server-only";

/**
 * El correo de la mañana: un aviso con un botón, no el resumen.
 *
 * Antes traía todo el contenido —reuniones, correos, temas, compromisos— y eso
 * tenía dos problemas. El obvio es que duplicaba la página y obligaba a mantener
 * dos formatos del mismo resumen en paralelo. El otro es más serio: mandaba por
 * correo un extracto de la bandeja de entrada, con asuntos y remitentes, a un
 * buzón que se sincroniza en teléfonos y clientes de escritorio. Menos superficie
 * es mejor.
 *
 * Ahora el detalle vive en un solo lugar, detrás del login. El correo no lo
 * explica: quien lo recibe todos los días no necesita que se le repita, y era la
 * única línea del cuerpo que hablaba del correo en vez del día.
 *
 * Sigue con estilos en línea y tablas porque los clientes de correo no aplican
 * hojas de estilo externas y Outlook de escritorio ignora buena parte de flexbox.
 */

// El repo ya escribe este dominio a mano en los avisos de otros cron (ver
// app/api/cron/finanzas-sii). No hay variable de entorno para la URL base y no
// vale la pena introducir una para un solo enlace.
const URL_MI_DIA = "https://core.pertec.cl/mi-dia";

/**
 * Escapa para HTML.
 *
 * Queda muchísima menos superficie que antes —ya no entra acá nada de lo que
 * escribió el modelo leyendo correo de terceros— pero `nombre` y `fechaLegible`
 * siguen siendo datos: el nombre sale de la tabla de usuarios, que se llena desde
 * el perfil de Entra. El criterio no cambia porque el riesgo haya bajado.
 */
function esc(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function armarCorreoHtml(nombre: string, fechaLegible: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:32px 0">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#ffffff;border:1px solid #e7e1d8;border-radius:14px;overflow:hidden">
      <!-- El encabezado con el nombre y la fecha se queda: un correo cuyo cuerpo
           es un botón suelto, sin identidad ni contexto, se lee como phishing. -->
      <tr><td style="background:#171411;padding:22px 28px">
        <div style="font:700 12px/1.4 Arial,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:#c85217">Tu día</div>
        <div style="font:700 22px/1.3 Arial,sans-serif;color:#faf8f5">${esc(nombre)}</div>
        <div style="font:13px/1.5 Arial,sans-serif;color:rgba(250,248,245,.5)">${esc(fechaLegible)}</div>
      </td></tr>

      <tr><td align="center" style="padding:32px 28px 36px 28px">
        <!-- El botón va como tabla con el fondo en el <td>, no como un <a> con
             padding: Outlook de escritorio no respeta el padding de un enlace en
             bloque y el botón queda del tamaño del texto. -->
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td style="background:#c85217;border-radius:8px">
            <a href="${URL_MI_DIA}" style="display:inline-block;padding:14px 26px;font:700 14px/1 Arial,sans-serif;color:#ffffff;text-decoration:none">
              Ver mi resumen de hoy &rarr;
            </a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}
