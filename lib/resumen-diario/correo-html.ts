import "server-only";
import type { ResumenDiario, Urgencia } from "./tipos";

/**
 * El cuerpo HTML del correo de la mañana.
 *
 * Todo con estilos en línea y tablas: los clientes de correo no aplican hojas de
 * estilo externas y Outlook de escritorio ignora buena parte de flexbox. Es la
 * razón por la que esto no reusa los componentes del dashboard.
 */

/**
 * Escapa para HTML.
 *
 * NO es opcional acá. El resumen lo escribió el modelo leyendo correo de
 * terceros: un asunto con `<img src=x onerror=...>` o con una etiqueta a medio
 * cerrar entraría tal cual al cuerpo del correo. Escapar es lo que corta esa
 * cadena, igual que en el PDF del cotizador.
 */
function esc(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COLOR_URGENCIA: Record<Urgencia, string> = {
  alta: "#c85217",
  media: "#8c8578",
  baja: "#b8b2a4",
};

function seccion(titulo: string, contenido: string): string {
  return `<tr><td style="padding:22px 24px 0 24px">
    <div style="font:700 11px/1.4 Arial,sans-serif;letter-spacing:1.4px;text-transform:uppercase;color:#8c8578;padding-bottom:8px">${esc(titulo)}</div>
    ${contenido}
  </td></tr>`;
}

/**
 * Interpola un número sin escapar.
 *
 * Los conteos los calcula el servidor y `temas[].correos` lo devuelve el modelo
 * con el esquema forzado a integer, así que en teoría no hace falta. Pasa por
 * Number igual porque el valor viene de una columna jsonb: si alguna vez se
 * manipula esa fila, un string ahí sería HTML sin escapar dentro del correo.
 */
function numero(v: number): string {
  return String(Number(v) || 0);
}

function vacio(texto: string): string {
  return `<div style="font:14px/1.5 Arial,sans-serif;color:#b8b2a4">${esc(texto)}</div>`;
}

export function armarCorreoHtml(nombre: string, fechaLegible: string, r: ResumenDiario): string {
  const reuniones = r.reuniones.length
    ? r.reuniones
        .map(
          (m) => `<div style="padding:8px 0;border-bottom:1px solid #e7e1d8">
        <div style="font:700 15px/1.4 Arial,sans-serif;color:#171411">
          <span style="color:#c85217">${esc(m.inicio.slice(11, 16))}</span>
          ${m.dia !== "hoy" ? `<span style="font:600 10px/1 Arial,sans-serif;color:#8c8578;letter-spacing:1px"> ${esc(m.dia === "manana" ? "MAÑANA" : "MÁS ADELANTE")} </span>` : ""}
          ${!m.agendadaAntes ? '<span style="font:600 10px/1 Arial,sans-serif;color:#c85217;letter-spacing:1px"> RECIÉN AGENDADA </span>' : ""}
          ${esc(m.asunto)}
        </div>
        <div style="font:13px/1.5 Arial,sans-serif;color:#8c8578">con ${esc(m.con)}</div>
        ${m.preparacion ? `<div style="font:13px/1.5 Arial,sans-serif;color:#c85217">Preparar: ${esc(m.preparacion)}</div>` : ""}
      </div>`,
        )
        .join("")
    : vacio("Sin reuniones hoy ni mañana.");

  const correos = r.correosDestacados.length
    ? r.correosDestacados
        .map(
          (c) => `<div style="padding:8px 0;border-bottom:1px solid #e7e1d8">
        <div style="font:700 15px/1.4 Arial,sans-serif;color:#171411">
          <span style="display:inline-block;width:8px;height:8px;border-radius:8px;background:${COLOR_URGENCIA[c.urgencia]}"></span>
          ${esc(c.asunto)}
        </div>
        <div style="font:13px/1.5 Arial,sans-serif;color:#8c8578">
          ${esc(c.de)} · ${esc(c.cuando)}${c.dirigido !== "a_mi" ? ` · ${esc(c.dirigido === "en_copia" ? "en copia" : "lista")}` : ""}
        </div>
        <div style="font:14px/1.5 Arial,sans-serif;color:#171411">${esc(c.queEsperan)}</div>
      </div>`,
        )
        .join("")
    : vacio("Nada en la bandeja está esperando algo de vos.");

  const compromisos = r.compromisos.length
    ? `<ul style="margin:0;padding-left:18px">${r.compromisos
        .map(
          (c) =>
            `<li style="font:14px/1.6 Arial,sans-serif;color:#171411">${esc(c.compromiso)} <span style="color:#8c8578">— ${esc(c.aQuien)}${c.desde ? `, ${esc(c.desde)}` : ""}</span></li>`,
        )
        .join("")}</ul>`
    : vacio("Sin compromisos propios abiertos.");

  const temas = r.temas.length
    ? r.temas
        .map(
          (t) => `<div style="padding:8px 0;border-bottom:1px solid #e7e1d8">
        <div style="font:700 15px/1.4 Arial,sans-serif;color:#171411">
          ${esc(t.tema)}
          <span style="font:400 12px/1.4 Arial,sans-serif;color:#b8b2a4">· ${numero(t.correos)} correos</span>
        </div>
        <div style="font:14px/1.5 Arial,sans-serif;color:#171411">${esc(t.estado)}</div>
      </div>`,
        )
        .join("")
    : "";

  const enCopia = r.enCopia.length
    ? r.enCopia
        .map(
          (c) => `<div style="padding:6px 0">
        <div style="font:600 14px/1.4 Arial,sans-serif;color:#8c8578">${esc(c.asunto)} <span style="font-weight:400">— ${esc(c.de)}</span></div>
        <div style="font:13px/1.5 Arial,sans-serif;color:#8c8578">${esc(c.porQueImporta)}</div>
      </div>`,
        )
        .join("")
    : "";

  const conteos = `<div style="font:13px/1.6 Arial,sans-serif;color:#8c8578">
    <b style="color:#171411">${numero(r.conteos.total)}</b> correos en ${numero(r.conteos.horas)} h ·
    <b style="color:#171411">${numero(r.conteos.aMi)}</b> dirigidos a vos ·
    <b style="color:#171411">${numero(r.conteos.enCopia)}</b> en copia ·
    <b style="color:#c85217">${numero(r.conteos.sinLeer)}</b> sin leer ·
    <b style="color:#171411">${numero(r.reunionesTotales)}</b> reuniones
    ${r.conteos.recortado ? '<br><span style="color:#c85217">Se llegó al tope de mensajes: hay correo más viejo que no se analizó.</span>' : ""}
  </div>`;

  const prioridades = r.prioridades
    .map(
      (p, i) => `<tr>
        <td style="width:26px;vertical-align:top;font:700 15px/1.5 Arial,sans-serif;color:#c85217">${i + 1}</td>
        <td style="font:15px/1.5 Arial,sans-serif;color:#171411">${esc(p)}</td>
      </tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:24px 0">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e7e1d8;border-radius:14px;overflow:hidden">
      <tr><td style="background:#171411;padding:20px 24px">
        <div style="font:700 12px/1.4 Arial,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:#c85217">Tu día</div>
        <div style="font:700 22px/1.3 Arial,sans-serif;color:#faf8f5">${esc(nombre)}</div>
        <div style="font:13px/1.5 Arial,sans-serif;color:rgba(250,248,245,.5)">${esc(fechaLegible)}</div>
      </td></tr>

      <tr><td style="padding:20px 24px 0 24px">
        <div style="font:15px/1.6 Arial,sans-serif;color:#171411">${esc(r.panorama)}</div>
      </td></tr>

      ${seccion("El período en números", conteos)}
      ${seccion("Lo primero", `<table role="presentation" cellpadding="0" cellspacing="0">${prioridades}</table>`)}
      ${seccion("Reuniones", reuniones)}
      ${seccion("Esperan algo de vos", correos)}
      ${temas ? seccion("En qué quedaron los temas", temas) : ""}
      ${enCopia ? seccion("Para saber, sin acción", enCopia) : ""}
      ${seccion("Prometiste y sigue abierto", compromisos)}

      <tr><td style="padding:22px 24px 24px 24px">
        <div style="font:12px/1.5 Arial,sans-serif;color:#b8b2a4;border-top:1px solid #e7e1d8;padding-top:14px">
          Generado automáticamente por Core PERTEC a partir de tu correo y tu calendario.
          Es un resumen, no un reemplazo: revisá la bandeja antes de decidir algo importante.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}
