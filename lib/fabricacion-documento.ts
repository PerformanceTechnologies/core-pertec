// El PDF del costo de fabricación de un producto: arma el HTML (A4) que Chromium imprime.
//
// Sin "server-only" a propósito (texto → texto, se prueba con tsx). Mismo lenguaje visual que la orden de
// compra y la cotización —barra de color de la empresa, tabla de encabezado oscuro y barra de TOTAL— y se
// ajusta a UNA hoja con la misma regla (ver cotizacion-impresion.ts: lo único que se achica son las filas de
// la tabla).
//
// ESTE DOCUMENTO SE ENVÍA A PROVEEDORES. Por eso su entrada (`DatosCostoPdf`) NO TIENE margen, precio con
// margen, utilidad ni notas internas: lo que no está en el tipo no puede salir impreso. Tampoco lleva las
// notas de cada ítem (suelen decir de qué proveedor viene el precio o qué supuesto se usó). Si algún día
// hay que mostrar algo más, se agrega al tipo a propósito, y scripts/probar-fabricacion.mts avisa si se
// cuela una de esas palabras.
//
// Todo lo que viene de personas pasa por `esc`.

import { esc } from "./fin/oc-documento";
import { coloresDeEmpresa } from "./fin/oc-modelo";
import { fechaCl } from "./fin/reglas";
import {
  ETIQUETA_GRUPO,
  GRUPOS_COSTO,
  formatearMontoFino,
  formatearPct,
  subtotalItem,
  type GrupoCosto,
} from "./fabricacion-modelo";

export interface DatosCostoPdf {
  empresa: {
    slug: string;
    nombre: string;
    rut: string | null;
    direccion: string | null;
    giro: string | null;
    telefono: string | null;
    correo: string | null;
    web: string | null;
  };
  /** data:image/png;base64,… o null (entonces va el nombre en texto). */
  logo: string | null;
  /** Fecha de emisión, AAAA-MM-DD. */
  fecha: string;
  producto: { nombre: string; codigo: string | null; descripcion: string | null; unidad: string | null };
  items: { grupo: GrupoCosto; descripcion: string; cantidad: number; unidad: string; costoUnitario: number; mermaPct: number }[];
}

/**
 * Más ítems que esto no caben legibles en UNA hoja (con 22 las filas ya se achican a ~80 %; con 30 quedan en
 * 60 %, ilegible impreso): el PDF muestra entonces un renglón por tipo de costo. El detalle sigue en la ficha.
 */
export const MAX_ITEMS_DETALLADOS = 22;

/** Un data URI de PNG que armó el servidor y nada más. */
const logoSeguro = (l: string | null) => (l && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(l) ? l : null);
const conSaltos = (t: string | null | undefined) => esc(t).replace(/\r?\n/g, "<br>");

export const nombreArchivoCosto = (d: Pick<DatosCostoPdf, "producto">): string => {
  const limpio = (t: string) => t.normalize("NFC").replace(/["*:<>?/\\|#%\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return `Costo de fabricación - ${limpio(d.producto.nombre).slice(0, 80)}.pdf`;
};

/** El costo total del documento: la suma de los subtotales (con merma). */
export function totalDelDocumento(items: DatosCostoPdf["items"]): number {
  return items.reduce((t, i) => t + subtotalItem(i), 0);
}

function css(slug: string): string {
  const c = coloresDeEmpresa(slug);
  return `
  @page { size: A4; margin: 12mm 0 13mm 0; }
  @page :first { margin-top: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #1b1814; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barra { height: 5px; background: ${c.acento}; }
  .hoja { padding: 0 16mm; }
  .pagina.una-hoja { display: flex; flex-direction: column; }
  .g { display: block; }

  .cabecera { display: flex; justify-content: space-between; align-items: center; gap: 12mm; padding: 6mm 0 4mm; }
  .marca img { max-height: 15mm; max-width: 58mm; display: block; }
  .marca .nombre { font-size: 17pt; font-weight: 800; letter-spacing: -0.01em; }
  .emisora { text-align: right; font-size: 8pt; color: #5a5249; line-height: 1.4; }
  .emisora b { color: #1b1814; font-size: 9pt; }

  .portada { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; align-items: stretch; border-top: 1px solid #e3ddd3; padding-top: 4mm; }
  .portada h1 { margin: 0; font-size: 20pt; font-weight: 800; letter-spacing: 0.01em; text-transform: uppercase; color: ${c.acento}; line-height: 1.05; }
  .portada .sub { margin: 1.5mm 0 3mm; font-size: 11pt; font-weight: 600; overflow-wrap: anywhere; }
  .meta { display: grid; grid-template-columns: repeat(3, auto); justify-content: start; gap: 2.5mm 9mm; }
  .meta .et { display: block; color: #7a7167; text-transform: uppercase; letter-spacing: 0.07em; font-size: 7pt; }
  .meta b { display: block; font-size: 9.5pt; white-space: nowrap; }

  .caja { border: 1px solid #e3ddd3; border-radius: 3mm; padding: 3.5mm 5mm; background: #fbf9f5; }
  .caja h2 { margin: 0 0 2mm; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: ${c.acento}; }
  .caja p { margin: 0.5mm 0; font-size: 9pt; overflow-wrap: anywhere; }
  .caja .grande { font-size: 10.5pt; font-weight: 700; }

  table.lineas { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.lineas thead { display: table-header-group; }
  table.lineas thead th { background: #1b1814; color: #fff; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.07em; padding: 2.4mm 2.5mm; text-align: left; }
  table.lineas thead th.n, table.lineas td.n { text-align: right; white-space: nowrap; }
  table.lineas tbody td { padding: 1.7mm 2.5mm; border-bottom: 1px solid #ece6dc; vertical-align: top; font-size: 9pt; overflow-wrap: anywhere; }
  table.lineas tr { break-inside: avoid; page-break-inside: avoid; }
  table.lineas .num { color: #9a9086; white-space: nowrap; }
  /* La franja de cada tipo de costo: su nombre y su subtotal. */
  table.lineas tr.grupo td { background: #f3eee6; border-bottom: 1px solid #e3ddd3; padding: 1.5mm 2.5mm; font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #3d362f; }
  table.lineas tr.grupo td.n { color: #1b1814; letter-spacing: 0; font-size: 9pt; }
  table.lineas tr.grupo .cuenta { font-weight: 600; color: #8a8176; letter-spacing: 0; text-transform: none; margin-left: 1.5mm; }

  .bajo-tabla { margin-top: 4mm; break-inside: avoid; page-break-inside: avoid; }
  .totales { width: 86mm; margin-left: auto; }
  .totales table { width: 100%; border-collapse: collapse; }
  .totales td { padding: 1.9mm 3.5mm; }
  .totales td:last-child { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totales tr.total td { background: ${c.acento}; color: #fff; font-weight: 800; font-size: 11.5pt; }
  .totales .por { margin: 1.5mm 0 0; text-align: right; font-size: 8pt; color: #6b6258; }

  .cierre { break-inside: avoid; page-break-inside: avoid; padding-bottom: 2mm; }
  .nota { border-top: 1px solid #e3ddd3; padding-top: 3mm; font-size: 8pt; line-height: 1.5; color: #6b6258; }
  .nota b { color: #3d362f; }
  .g + .g { margin-top: 4mm; }
  .g + .g.cierre { margin-top: 5mm; }

  body.espacio-justo .cabecera { padding: 4mm 0 2.5mm; }
  body.espacio-justo .portada { padding-top: 2.5mm; }
  body.espacio-justo .caja { padding: 2.5mm 4mm; }
  body.espacio-justo .totales td { padding: 1.3mm 3.5mm; }
  body.espacio-justo .g + .g:not(.cierre) { margin-top: 3mm; }
`;
}

export function htmlDeCosto(d: DatosCostoPdf): string {
  const e = d.empresa;
  const p = d.producto;
  const logo = logoSeguro(d.logo);
  const total = totalDelDocumento(d.items);
  const filasEmisora = [e.giro, e.direccion, [e.telefono, e.correo, e.web].filter(Boolean).join(" · ")].filter((x): x is string => Boolean(x && x.trim()));
  const resumido = d.items.length > MAX_ITEMS_DETALLADOS;
  const hayMerma = !resumido && d.items.some((i) => i.mermaPct > 0);
  const columnas = resumido ? 2 : hayMerma ? 6 : 5;

  let n = 0;
  const cuerpo = GRUPOS_COSTO.map((g) => {
    const delGrupo = d.items.filter((i) => i.grupo === g);
    if (delGrupo.length === 0) return "";
    const subtotal = delGrupo.reduce((t, i) => t + subtotalItem(i), 0);
    const cuenta = `<span class="cuenta">${delGrupo.length} ${delGrupo.length === 1 ? "ítem" : "ítems"}</span>`;
    if (resumido) {
      return `<tr class="grupo"><td>${esc(ETIQUETA_GRUPO[g])}${cuenta}</td><td class="n">${formatearMontoFino(subtotal)}</td></tr>`;
    }
    const filas = delGrupo
      .map((i) => {
        n += 1;
        return `
      <tr>
        <td class="num">${n}</td>
        <td>${conSaltos(i.descripcion)}</td>
        <td class="n">${esc(i.cantidad.toLocaleString("es-CL", { maximumFractionDigits: 3 }))}${i.unidad ? ` ${esc(i.unidad)}` : ""}</td>
        <td class="n">${formatearMontoFino(i.costoUnitario)}</td>
        ${hayMerma ? `<td class="n">${i.mermaPct > 0 ? formatearPct(i.mermaPct) : "—"}</td>` : ""}
        <td class="n"><b>${formatearMontoFino(subtotalItem(i))}</b></td>
      </tr>`;
      })
      .join("");
    return `<tr class="grupo"><td colspan="${columnas - 1}">${esc(ETIQUETA_GRUPO[g])}${cuenta}</td><td class="n">${formatearMontoFino(subtotal)}</td></tr>${filas}`;
  }).join("");

  const colgroup = resumido
    ? '<colgroup><col><col style="width:40mm"></colgroup>'
    : `<colgroup><col style="width:10mm"><col><col style="width:27mm"><col style="width:29mm">${hayMerma ? '<col style="width:16mm">' : ""}<col style="width:31mm"></colgroup>`;
  const encabezado = resumido
    ? '<tr><th>Tipo de costo</th><th class="n">Subtotal</th></tr>'
    : `<tr><th>#</th><th>Descripción</th><th class="n">Cantidad</th><th class="n">Costo unit.</th>${hayMerma ? '<th class="n">Merma</th>' : ""}<th class="n">Subtotal</th></tr>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Costo de fabricación ${esc(p.nombre)}</title><style>${css(e.slug)}</style></head>
<body>
  <div class="barra"></div>
  <div class="hoja"><div class="pagina">
    <div class="g">
      <header class="cabecera">
        <div class="marca">${logo ? `<img src="${logo}" alt="${esc(e.nombre)}">` : `<div class="nombre">${esc(e.nombre)}</div>`}</div>
        <div class="emisora"><b>${esc(e.nombre)}${e.rut ? ` · RUT ${esc(e.rut)}` : ""}</b>${filasEmisora.map((f) => `<br>${esc(f)}`).join("")}</div>
      </header>

      <section class="portada">
        <div>
          <h1>Costo de fabricación</h1>
          <p class="sub">${esc(p.nombre)}</p>
          <div class="meta">
            ${p.codigo ? `<div><span class="et">Código</span><b>${esc(p.codigo)}</b></div>` : ""}
            <div><span class="et">Fecha</span><b>${fechaCl(d.fecha)}</b></div>
            ${p.unidad ? `<div><span class="et">Unidad</span><b>${esc(p.unidad)}</b></div>` : ""}
          </div>
        </div>
        <div class="caja">
          <h2>Producto</h2>
          <p class="grande">${esc(p.nombre)}</p>
          ${p.descripcion?.trim() ? `<p>${conSaltos(p.descripcion.trim())}</p>` : '<p style="color:#8a8176">Sin descripción.</p>'}
        </div>
      </section>
    </div>

    <div class="g">
      <table class="lineas">
        ${colgroup}
        <thead>${encabezado}</thead>
        <tbody>${cuerpo}</tbody>
      </table>

      <div class="bajo-tabla">
        <div class="totales"><table>
          <tr class="total"><td>COSTO TOTAL</td><td>${formatearMontoFino(total)}</td></tr>
        </table>
        ${p.unidad ? `<p class="por">Costo de fabricar 1 ${esc(p.unidad)}</p>` : ""}</div>
      </div>
    </div>

    <div class="g cierre">
      <div class="nota">
        <b>Valores en pesos chilenos (CLP).</b> Costo de fabricación referencial, calculado a la fecha de emisión; los precios de los insumos pueden variar.
      </div>
    </div>
  </div></div>
</body></html>`;
}

/** Pie que Chromium repite en cada página. */
export function pieDeCosto(d: Pick<DatosCostoPdf, "empresa" | "producto">): string {
  return `<div style="width:100%;font-family:Arial,sans-serif;font-size:7pt;color:#8a8176;padding:0 16mm;display:flex;justify-content:space-between;align-items:center;">
    <span>${esc(d.empresa.nombre)}</span><span>Costo de fabricación · ${esc(d.producto.nombre)} · Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
}
