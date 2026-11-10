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
