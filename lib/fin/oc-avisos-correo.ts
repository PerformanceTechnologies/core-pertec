// Los avisos de una solicitud de compra (a quien aprueba, a quien visa, al solicitante): el texto de la campana y el HTML del
// correo. Sin "server-only": es solo texto, se prueba con tsx. Mismo estilo que el aviso de tareas (tablas y estilos en línea:
// Outlook de escritorio ignora buena parte de flexbox y de las hojas de estilo).

const URL_CORE = "https://core.pertec.cl";

/** Qué pasó con la solicitud y a quién se le avisa. */
export type TipoAvisoCompra = "aprobar" | "visar" | "devuelta" | "visada";

export interface DatosAvisoCompra {
  tipo: TipoAvisoCompra;
  id: string;
  codigo: string;
  titulo: string;
  proveedor: string | null;
  proyecto: string | null;
  solicitante: string;
  /** Ya formateado: «$1.234.567», «UF 12,30»… */
  total: string;
  empresa: string;
  /** Quién hizo lo que se avisa (envió, aprobó, devolvió, visó). */
  actor: string;
  motivo?: string | null;
  ocNumero?: string | null;
}

const TEXTOS: Record<TipoAvisoCompra, { etiqueta: string; titulo: (d: DatosAvisoCompra) => string; cuerpo: (d: DatosAvisoCompra) => string; boton: string }> = {
  aprobar: {
    etiqueta: "Por aprobar",
    titulo: (d) => `Solicitud de compra por aprobar: ${d.titulo}`,
    cuerpo: (d) => `${d.actor} envió la solicitud ${d.codigo} (${d.total}) a aprobación.`,
    boton: "Revisar y decidir",
  },
  visar: {
    etiqueta: "Por visar",
    titulo: (d) => `Solicitud de compra por visar: ${d.titulo}`,
    cuerpo: (d) => `${d.actor} aprobó la solicitud ${d.codigo} (${d.total}). Falta tu visado.`,
    boton: "Revisar y visar",
  },
  devuelta: {
    etiqueta: "Devuelta",
    titulo: (d) => `Te devolvieron la solicitud: ${d.titulo}`,
    cuerpo: (d) => `${d.actor} devolvió la solicitud ${d.codigo}${d.motivo ? `: ${d.motivo}` : "."}`,
    boton: "Corregir la solicitud",
  },
  visada: {
    etiqueta: "Visada",
    titulo: (d) => `Tu solicitud fue visada${d.ocNumero ? ` (${d.ocNumero})` : ""}: ${d.titulo}`,
    cuerpo: (d) => `${d.actor} visó la solicitud ${d.codigo}${d.ocNumero ? ` y emitió la ${d.ocNumero}` : ""}. Ahora se envía al proveedor.`,
    boton: "Ver la solicitud",
  },
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * A quién llega un aviso. Los de «te toca a ti» (aprobar, visar) le llegan a TODOS los que corresponden, incluida quien hizo la
 * acción si también le toca: aprobar deja algo pendiente a quien además visa. Los informativos (devuelta, visada) nunca le
 * llegan a quien hizo el cambio: ya lo sabe.
 */
export function elegirDestinatarios(tipo: TipoAvisoCompra, candidatos: (string | null | undefined)[], actor: string): string[] {
  const yo = actor.trim().toLowerCase();
  const informativo = tipo === "devuelta" || tipo === "visada";
  return [...new Set(candidatos.map((c) => String(c ?? "").trim().toLowerCase()).filter(Boolean))].filter((c) => !informativo || c !== yo);
}

/** Adónde lleva el aviso: el detalle de la solicitud (ahí se aprueba, se devuelve o se corrige). */
export const enlaceDeCompra = (id: string): string => `/finanzas/compras/${id}`;

export const tituloDeAviso = (d: DatosAvisoCompra): string => TEXTOS[d.tipo].titulo(d).slice(0, 200);
export const cuerpoDeAviso = (d: DatosAvisoCompra): string => TEXTOS[d.tipo].cuerpo(d).slice(0, 400);

const fila = (etiqueta: string, valor: string) => `<tr>
          <td style="padding:7px 0;width:120px;vertical-align:top;font:13px/1.5 Arial,sans-serif;color:#8a8178">${etiqueta}</td>
          <td style="padding:7px 0;vertical-align:top;font:14px/1.5 Arial,sans-serif;color:#171411">${valor}</td>
        </tr>`;

export function asuntoDeAvisoCompra(d: DatosAvisoCompra): string {
  return `${tituloDeAviso(d)} · ${d.empresa}`.slice(0, 200);
}

export function armarCorreoAvisoCompra(d: DatosAvisoCompra): string {
  const t = TEXTOS[d.tipo];
  const enlace = `${URL_CORE}${enlaceDeCompra(d.id)}`;
  const filas = [
    fila("Solicitud", `<strong>${esc(d.codigo)}</strong>${d.ocNumero ? ` · ${esc(d.ocNumero)}` : ""}`),
    fila("Qué se compra", esc(d.titulo)),
    d.proveedor ? fila("Proveedor", esc(d.proveedor)) : "",
    fila("Proyecto", esc(d.proyecto ?? "General")),
    fila("Solicita", esc(d.solicitante)),
    fila("Total", `<strong>${esc(d.total)}</strong> con IVA`),
  ].join("");
  const motivo = d.motivo?.trim()
    ? `<tr><td style="padding:4px 28px 0 28px">
        <div style="font:700 12px/1.4 Arial,sans-serif;color:#8a8178;margin-bottom:6px">Motivo</div>
        <div style="background:#faf8f5;border:1px solid #efe9e1;border-radius:10px;padding:14px 16px;font:14px/1.6 Arial,sans-serif;color:#171411;white-space:pre-wrap">${esc(d.motivo.trim())}</div>
      </td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:32px 0">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background:#ffffff;border:1px solid #e7e1d8;border-radius:14px;overflow:hidden">
      <tr><td style="background:#171411;padding:22px 28px">
        <div style="font:700 12px/1.4 Arial,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:#c85217">${esc(t.etiqueta)} · ${esc(d.empresa)}</div>
        <div style="font:700 21px/1.35 Arial,sans-serif;color:#faf8f5;margin-top:4px">${esc(d.titulo)}</div>
        <div style="font:13px/1.5 Arial,sans-serif;color:rgba(250,248,245,.55);margin-top:2px">${esc(cuerpoDeAviso(d))}</div>
      </td></tr>
      <tr><td style="padding:18px 28px 8px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${filas}
        </table>
      </td></tr>
      ${motivo}
      <tr><td align="center" style="padding:28px 28px 32px 28px">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td style="background:#c85217;border-radius:8px">
            <a href="${enlace}" style="display:inline-block;padding:14px 26px;font:700 14px/1 Arial,sans-serif;color:#ffffff;text-decoration:none">${esc(t.boton)} &rarr;</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:14px 28px;border-top:1px solid #efe9e1;font:12px/1.5 Arial,sans-serif;color:#a39a90">
        Aviso automático de Compras y pagos en PERTEC Core. Se abre con tu sesión del Core: ahí ves el resumen completo de la orden y decides.
      </td></tr>
    </table>
  </td></tr>
</table>`;
}
