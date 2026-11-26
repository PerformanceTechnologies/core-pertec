// El cuerpo de un correo de texto plano, convertido a HTML que se ve igual en Outlook, Gmail y el celular.
// Sin "server-only": es texto → texto y se prueba con tsx.
//
// Antes se usaba `white-space: pre-wrap` en un solo <div>. Se veía bien al redactar, pero Outlook y otros
// clientes ignoran esa propiedad y el mensaje le llegaba al cliente en un solo párrafo, sin saltos. Acá cada
// párrafo (separado por una línea en blanco) es un <p>, cada salto simple es un <br>, y la sangría de las
// viñetas se conserva con espacios duros.

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function cuerpoHtml(texto: string): string {
  const parrafos = escapar(texto.replace(/\r\n?/g, "\n").trim())
    .split(/\n{2,}/)
    .map((p) =>
      p
        .split("\n")
        .map((linea) => linea.replace(/^ +/, (sangria) => "&nbsp;".repeat(sangria.length)))
        .join("<br>"),
    );
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#171411">${parrafos
    .map((p) => `<p style="margin:0 0 14px 0">${p}</p>`)
    .join("")}</div>`;
}

/** Una línea de la firma ya escapada, con la web y los correos como enlaces (como en la firma de Outlook). */
function enlazar(linea: string): string {
  return linea
    .replace(/\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:)])/gi, (u) => `<a href="${u.startsWith("www.") ? `https://${u}` : u}" style="color:#171411;text-decoration:underline">${u}</a>`)
    .replace(/\b([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\b/g, '<a href="mailto:$1" style="color:#171411;text-decoration:underline">$1</a>');
}

/**
 * La firma de quien envía, debajo del mensaje, con el formato de la firma de la empresa: arriba el texto
 * (la primera línea, el nombre, en negrita; las líneas en blanco se respetan; la web y los correos como
 * enlace) y abajo la imagen, si tiene. La imagen viaja como adjunto incrustado con este mismo cid (ver
 * adjuntoDeFirma en lib/firma-correo.ts): Outlook y Gmail la muestran dentro del correo. Sin firma, nada.
 */
export function firmaHtml(firma: { texto: string | null; imagen: string | null } | null | undefined): string {
  if (!firma) return "";
  let html = "";
  if (firma.texto) {
    const lineas = escapar(firma.texto.replace(/\r\n?/g, "\n").trim())
      .split("\n")
      .map((l, i) => (i === 0 ? `<b style="font-size:15px">${l}</b>` : enlazar(l)));
    html += `<div style="margin-top:18px;padding-left:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#171411">${lineas.join("<br>")}</div>`;
  }
  if (firma.imagen) html += '<div style="margin-top:16px"><img src="cid:firma-core" alt="Firma" style="display:block;max-width:600px;height:auto;border:0"></div>';
  return html;
}
