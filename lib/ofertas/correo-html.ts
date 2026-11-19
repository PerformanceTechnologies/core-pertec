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

/**
 * La firma de quien envía, debajo del mensaje: separada por una línea fina y en gris, como la
 * pone Outlook. Texto plano escapado (cada salto de línea, un <br>): nada de lo que escriba la
 * persona se interpreta como HTML.
 */
export function firmaHtml(firma: string | null | undefined): string {
  const limpia = (firma ?? "").replace(/\r\n?/g, "\n").trim();
  if (!limpia) return "";
  const lineas = escapar(limpia)
    .split("\n")
    .map((linea) => linea.replace(/^ +/, (sangria) => "&nbsp;".repeat(sangria.length)))
    .join("<br>");
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.45;color:#5c564f;border-top:1px solid #e5e0d8;margin-top:6px;padding-top:10px">${lineas}</div>`;
}
