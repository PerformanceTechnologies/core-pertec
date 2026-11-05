// El correo de «te asignaron una tarea», con el detalle de la tarea.
//
// Sin "server-only" para poder verlo en una prueba local; no toca la base ni manda nada.
// Estilos en línea y tablas: los clientes de correo no leen hojas de estilo y Outlook de
// escritorio ignora buena parte de flexbox (igual que lib/resumen-diario/correo-html.ts).

import { PRIORIDADES, etiquetaFechas, tituloDeColumna, type Tarea } from "./tareas-modelo";

const URL_CORE = "https://core.pertec.cl";

export type TareaParaCorreo = Pick<
  Tarea,
  "id" | "titulo" | "descripcion" | "prioridad" | "responsables" | "asignadoPor" | "fechaInicio" | "fechaLimite"
> & { estado?: string };

/** Todo lo que entra al HTML es dato (lo escribió una persona): se escapa siempre. */
function esc(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const COLOR_PRIORIDAD: Record<string, { fondo: string; texto: string }> = {
  baja: { fondo: "#e0f2fe", texto: "#0369a1" },
  media: { fondo: "#fef3c7", texto: "#b45309" },
  alta: { fondo: "#ffe4e6", texto: "#be123c" },
};

function fila(etiqueta: string, valor: string): string {
  return `<tr>
          <td style="padding:7px 0;width:130px;vertical-align:top;font:13px/1.5 Arial,sans-serif;color:#8a8178">${etiqueta}</td>
          <td style="padding:7px 0;vertical-align:top;font:14px/1.5 Arial,sans-serif;color:#171411">${valor}</td>
        </tr>`;
}

export function asuntoCorreoTarea(t: TareaParaCorreo): string {
  return `Te asignaron una tarea: ${t.titulo}`.slice(0, 180);
}

/**
 * @param nombre traduce un correo al nombre de la persona.
 * @param hoyIso la fecha de Chile, para no repetir el año en curso.
 */
export function armarCorreoTarea(
  t: TareaParaCorreo,
  para: string,
  actor: { correo: string; nombre: string | null },
  nombre: (correo: string) => string,
  hoyIso: string,
): string {
  const prioridad = PRIORIDADES.find((p) => p.valor === t.prioridad);
  const color = COLOR_PRIORIDAD[t.prioridad] ?? COLOR_PRIORIDAD.media;
  const fechas = etiquetaFechas(t, hoyIso);
  const otros = t.responsables.filter((c) => c.toLowerCase() !== para.toLowerCase());
  const quienAsigna = t.asignadoPor ? nombre(t.asignadoPor) : actor.nombre ?? actor.correo;
  const enlace = `${URL_CORE}/tareas?abrir=${encodeURIComponent(t.id)}`;

  const filas = [
    fila("Prioridad", `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${color.fondo};color:${color.texto};font:700 12px/1.6 Arial,sans-serif">${esc(prioridad?.etiqueta ?? t.prioridad)}</span>`),
    fila(t.fechaInicio && t.fechaLimite ? "Fechas" : t.fechaInicio ? "Desde" : "Fecha límite", fechas ? `<strong>${esc(fechas)}</strong>` : `<span style="color:#8a8178">Sin fecha</span>`),
    fila("Asignada por", esc(quienAsigna)),
    otros.length ? fila("También a cargo", esc(otros.map(nombre).join(", "))) : "",
    t.estado ? fila("Columna", esc(tituloDeColumna(t.estado))) : "",
  ].join("");

  const descripcion = t.descripcion?.trim()
    ? `<tr><td style="padding:4px 28px 0 28px">
        <div style="font:700 12px/1.4 Arial,sans-serif;color:#8a8178;margin-bottom:6px">Detalle</div>
        <div style="background:#faf8f5;border:1px solid #efe9e1;border-radius:10px;padding:14px 16px;font:14px/1.6 Arial,sans-serif;color:#171411;white-space:pre-wrap">${esc(t.descripcion.trim())}</div>
      </td></tr>`
    : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:32px 0">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background:#ffffff;border:1px solid #e7e1d8;border-radius:14px;overflow:hidden">
      <tr><td style="background:#171411;padding:22px 28px">
        <div style="font:700 12px/1.4 Arial,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:#c85217">Nueva tarea para ti</div>
        <div style="font:700 21px/1.35 Arial,sans-serif;color:#faf8f5;margin-top:4px">${esc(t.titulo)}</div>
        <div style="font:13px/1.5 Arial,sans-serif;color:rgba(250,248,245,.55);margin-top:2px">${esc(actor.nombre ?? actor.correo)} te dejó como responsable</div>
      </td></tr>
      <tr><td style="padding:18px 28px 8px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${filas}
        </table>
      </td></tr>
      ${descripcion}
      <tr><td align="center" style="padding:28px 28px 32px 28px">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td style="background:#c85217;border-radius:8px">
            <a href="${enlace}" style="display:inline-block;padding:14px 26px;font:700 14px/1 Arial,sans-serif;color:#ffffff;text-decoration:none">Abrir la tarea &rarr;</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:14px 28px;border-top:1px solid #efe9e1;font:12px/1.5 Arial,sans-serif;color:#a39a90">
        Aviso automático de Tareas en PERTEC Core. Las notas y los cambios de la tarea se ven en el Core.
      </td></tr>
    </table>
  </td></tr>
</table>`;
}
