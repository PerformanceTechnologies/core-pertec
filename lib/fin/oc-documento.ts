// El PDF de la Orden de Compra: arma el HTML (A4) que Chromium imprime.
//
// Sin "server-only" a propósito (texto → texto, se prueba con tsx). Mismo lenguaje visual que la cotización —hoja blanca,
// barra de color arriba, tabla con encabezado oscuro y barra de TOTAL— con el color de cada empresa, y se ajusta a UNA hoja
// con la misma regla (ver cotizacion-impresion.ts: lo único que se achica son las filas de la tabla de ítems). Marca de agua
// «BORRADOR» mientras la OC no tenga número (nace al visar). Todo lo que viene de personas pasa por `esc`.

import { fechaCl } from "./reglas";
import { coloresDeEmpresa, formatoMonto, netoLineaOc, aPesos, totalesOc, CONDICIONES_OC_POR_OMISION, type LineaOc, type Moneda } from "./oc-modelo";

export interface DatosOc {
  empresa: {
    slug: string;
    nombre: string;
    rut: string | null;
    direccion: string | null;
    giro: string | null;
    telefono: string | null;
    correo: string | null;
    web: string | null;
    condicionesOc: string | null;
  };
  /** data:image/png;base64,… o null (entonces va el nombre en texto). */
  logo: string | null;
  /** «OC-000012»; null mientras es borrador (aún no se visa). */
  numero: string | null;
  fecha: string;
  titulo: string;
  proveedor: { nombre: string; rut: string | null; giro: string | null; direccion: string | null; telefono: string | null; correo: string | null } | null;
  atencion: string | null;
  moneda: Moneda;
  tipoCambio: number;
  lineas: LineaOc[];
  tasaIva: number;
  entregaLugar: string | null;
  entregaPlazo: string | null;
  /** «Se necesita para»: fecha. */
  fechaRequerida: string | null;
  formaPago: string | null;
  condicionPagoDias: number | null;
  observaciones: string | null;
  condiciones: string | null;
  /** Quién creó la OC: es el único nombre que sale al final del documento. */
  creador: string;
}

export function esc(t: string | null | undefined): string {
  return String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
const conSaltos = (t: string | null | undefined) => esc(t).replace(/\r?\n/g, "<br>");
/** Un data URI de PNG que armó el servidor y nada más. */
const logoSeguro = (l: string | null) => (l && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(l) ? l : null);

export const nombreArchivoOc = (d: Pick<DatosOc, "numero" | "titulo" | "proveedor">): string => {
  const limpio = (t: string) => t.normalize("NFC").replace(/["*:<>?/\\|#%\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  const partes = [d.numero ? limpio(d.numero) : "Borrador OC", d.proveedor ? limpio(d.proveedor.nombre).slice(0, 50) : ""].filter(Boolean);
  return `${partes.join(" - ")}.pdf`;
};

/** La condición de pago en una frase: «Pago a 30 días desde la fecha de la factura», más la forma si hay. */
export function textoDePago(d: Pick<DatosOc, "formaPago" | "condicionPagoDias">): string | null {
  const dias = d.condicionPagoDias === null || d.condicionPagoDias === undefined ? null : d.condicionPagoDias === 0 ? "Contado contra factura" : `Pago a ${d.condicionPagoDias} días desde la fecha de la factura`;
  const forma = d.formaPago?.trim();
  if (dias && forma) return `${dias}. ${forma}`;
  return dias ?? (forma || null);
}

function css(slug: string): string {
  const c = coloresDeEmpresa(slug);
  return `
  /* La primera hoja arranca sin margen superior (la barra de color va pegada arriba); las siguientes llevan aire. */
  @page { size: A4; margin: 12mm 0 13mm 0; }
  @page :first { margin-top: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #1b1814; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barra { height: 5px; background: ${c.acento}; }
  /* El margen lateral vive en .hoja. Para ajustar a la hoja solo se achica la tabla de ítems (con «zoom»); el resto del texto no cambia. */
  .hoja { padding: 0 16mm; }
  .pagina.una-hoja { display: flex; flex-direction: column; }
  .g { display: block; position: relative; z-index: 1; }
  .marca-agua { position: fixed; top: 46%; left: 50%; transform: translate(-50%, -50%) rotate(-28deg); font-size: 96pt; font-weight: 900; letter-spacing: 0.1em; color: ${c.acento}; opacity: 0.07; pointer-events: none; z-index: 0; white-space: nowrap; }

  .cabecera { display: flex; justify-content: space-between; align-items: center; gap: 12mm; padding: 6mm 0 4mm; }
  .marca img { max-height: 15mm; max-width: 58mm; display: block; }
  .marca .nombre { font-size: 17pt; font-weight: 800; letter-spacing: -0.01em; }
  .emisora { text-align: right; font-size: 8pt; color: #5a5249; line-height: 1.4; }
  .emisora b { color: #1b1814; font-size: 9pt; }

  /* Portada: a la izquierda el título y los datos de la OC; a la derecha, la casilla del proveedor. */
  .portada { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; align-items: stretch; border-top: 1px solid #e3ddd3; padding-top: 4mm; }
  .portada h1 { margin: 0; font-size: 20pt; font-weight: 800; letter-spacing: 0.01em; text-transform: uppercase; color: ${c.acento}; line-height: 1.05; }
  .portada .sub { margin: 1.5mm 0 3mm; font-size: 11pt; font-weight: 600; overflow-wrap: anywhere; }
  .meta { display: grid; grid-template-columns: repeat(3, auto); justify-content: start; gap: 2.5mm 9mm; }
  .meta .et { display: block; color: #7a7167; text-transform: uppercase; letter-spacing: 0.07em; font-size: 7pt; }
  .meta b { display: block; font-size: 9.5pt; white-space: nowrap; }
  .meta b.pend { color: #9a9086; font-weight: 600; }

  .caja { border: 1px solid #e3ddd3; border-radius: 3mm; padding: 3.5mm 5mm; background: #fbf9f5; }
  .caja h2 { margin: 0 0 2mm; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: ${c.acento}; }
  .caja p { margin: 0.5mm 0; font-size: 9pt; overflow-wrap: anywhere; }
  .caja .grande { font-size: 10.5pt; font-weight: 700; }
  .caja .tenue { color: #6b6258; }

  /* Columnas fijas: con «overflow-wrap» el ancho mínimo de la descripción es casi cero y el navegador la angostaba. */
  table.lineas { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.lineas thead { display: table-header-group; }
  table.lineas thead th { background: #1b1814; color: #fff; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.07em; padding: 2.4mm 2.5mm; text-align: left; }
  table.lineas thead th.n, table.lineas td.n { text-align: right; white-space: nowrap; }
  table.lineas tbody td { padding: 1.9mm 2.5mm; border-bottom: 1px solid #ece6dc; vertical-align: top; font-size: 9pt; overflow-wrap: anywhere; }
  table.lineas tbody tr:nth-child(even) td { background: #faf8f4; }
  table.lineas tr { break-inside: avoid; page-break-inside: avoid; }
  table.lineas .num { color: #9a9086; white-space: nowrap; }
  table.lineas .sub { display: block; font-size: 7.5pt; color: #8a8176; margin-top: 0.6mm; }
  /* El detalle opcional del ítem: sale bajo la descripción. */
  table.lineas .nota { display: block; font-size: 8pt; line-height: 1.35; color: #6b6258; margin-top: 1mm; }

  /* Justo bajo la tabla: a la izquierda entrega, pago y observaciones; a la derecha, los totales. Sin hueco entre uno y otro. */
  .bajo-tabla { display: grid; grid-template-columns: minmax(0, 1fr) 74mm; gap: 8mm; align-items: start; margin-top: 3mm; break-inside: avoid; page-break-inside: avoid; }
  .bajo-tabla .bloque:last-child { margin-bottom: 0; }
  .totales table { width: 100%; border-collapse: collapse; }
  .totales td { padding: 1mm 3mm; font-size: 9pt; }
  .totales td:last-child { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totales tr.total td { background: ${c.acento}; color: #fff; font-weight: 800; font-size: 10.5pt; padding: 1.7mm 3mm; }
  .totales tr.pesos td { color: #6b6258; font-size: 8pt; border-top: 1px solid #e3ddd3; }

  .bloque { margin-bottom: 4mm; break-inside: avoid; page-break-inside: avoid; }
  .bloque h2 { margin: 0 0 2mm; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; color: ${c.acento}; border-bottom: 1px solid #e3ddd3; padding-bottom: 1.2mm; }
  .bloque ul { margin: 0; padding: 0; list-style: none; }
  .bloque li { margin: 0 0 1mm; font-size: 9pt; display: flex; gap: 3mm; }
  .bloque li b { flex: 0 0 34mm; color: #3d362f; }
  .bloque p { margin: 0; font-size: 9pt; }
  .bloque ol { margin: 0; padding-left: 4.5mm; }
  .bloque ol li { display: list-item; font-size: 8.5pt; color: #4a443d; margin-bottom: 0.8mm; }

  /* Lo último: las condiciones y, al final, «Facturar a» (chico) con el nombre de quien creó la OC. Sigue al resto sin dejar huecos. */
  .cierre { break-inside: avoid; page-break-inside: avoid; padding-bottom: 2mm; }
  .final { display: grid; grid-template-columns: 1fr 62mm; gap: 8mm; align-items: end; border-top: 1px solid #e3ddd3; padding-top: 3mm; }
  .facturar { font-size: 7.5pt; line-height: 1.45; color: #6b6258; }
  .facturar .et { display: block; text-transform: uppercase; letter-spacing: 0.1em; font-size: 7pt; font-weight: 700; color: ${c.acento}; margin-bottom: 0.8mm; }
  .facturar b { color: #1b1814; font-size: 8pt; }
  .firma { font-size: 9pt; }
  .firma .raya { width: 100%; border-top: 1px solid #1b1814; margin-bottom: 1.5mm; margin-top: 9mm; }
  .firma b { font-size: 10pt; }
  .g + .g { margin-top: 4mm; }
  .g + .g.cierre { margin-top: 5mm; }

  /* Espacio justo: antes de achicar las filas de ítems se aprietan los márgenes (la letra no cambia). */
  body.espacio-justo .cabecera { padding: 4mm 0 2.5mm; }
  body.espacio-justo .portada { padding-top: 2.5mm; }
  body.espacio-justo .caja { padding: 2.5mm 4mm; }
  body.espacio-justo .bloque { margin-bottom: 2.5mm; }
  body.espacio-justo .bloque li { margin-bottom: 0.6mm; }
  body.espacio-justo .totales td { padding: 0.7mm 3mm; }
  body.espacio-justo .totales tr.total td { padding: 1.3mm 3mm; }
  body.espacio-justo .firma .raya { margin-top: 5mm; }
  body.espacio-justo .g + .g:not(.cierre) { margin-top: 3mm; }
`;
}

export function htmlDeOc(d: DatosOc): string {
  const e = d.empresa;
  const m = d.moneda;
  const t = totalesOc(d.lineas, d.tasaIva, m);
  const logo = logoSeguro(d.logo);
  const filasEmisora = [e.giro, e.direccion, [e.telefono, e.correo, e.web].filter(Boolean).join(" · ")].filter((x): x is string => Boolean(x && x.trim()));
  const hayDescuento = d.lineas.some((l) => Number(l.descuentoPct) > 0);
  const p = d.proveedor;
  const pago = textoDePago(d);
  const condiciones = (d.condiciones?.trim() || e.condicionesOc?.trim() || CONDICIONES_OC_POR_OMISION).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const entrega = [
    d.entregaLugar?.trim() && { etiqueta: "Lugar de entrega", texto: d.entregaLugar.trim() },
    d.entregaPlazo?.trim() && { etiqueta: "Plazo de entrega", texto: d.entregaPlazo.trim() },
    d.fechaRequerida && { etiqueta: "Se necesita para", texto: fechaCl(d.fechaRequerida) },
    pago && { etiqueta: "Pago", texto: pago },
  ].filter((x): x is { etiqueta: string; texto: string } => Boolean(x));
  const datosFacturar = [e.rut ? `RUT ${e.rut}` : "", e.giro ?? "", e.direccion ?? ""].filter((x) => x.trim());

  const filas = d.lineas
    .map(
      (l, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${conSaltos(l.descripcion)}${l.nota?.trim() ? `<span class="nota">${conSaltos(l.nota.trim())}</span>` : ""}${l.exento ? '<span class="sub">Exento de IVA</span>' : ""}</td>
        <td class="n">${esc(Number(l.cantidad).toLocaleString("es-CL", { maximumFractionDigits: 2 }))}${l.unidad ? ` ${esc(l.unidad)}` : ""}</td>
        <td class="n">${formatoMonto(Number(l.precioUnitario), m)}</td>
        ${hayDescuento ? `<td class="n">${Number(l.descuentoPct) > 0 ? `${Math.round(Number(l.descuentoPct) * 1000) / 10}%` : "—"}</td>` : ""}
        <td class="n"><b>${formatoMonto(netoLineaOc(l, m), m)}</b></td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(d.numero ?? "Borrador OC")} ${esc(d.titulo)}</title><style>${css(e.slug)}</style></head>
<body>
  ${d.numero ? "" : '<div class="marca-agua">BORRADOR</div>'}
  <div class="barra"></div>
  <div class="hoja"><div class="pagina">
    <div class="g">
      <header class="cabecera">
        <div class="marca">${logo ? `<img src="${logo}" alt="${esc(e.nombre)}">` : `<div class="nombre">${esc(e.nombre)}</div>`}</div>
        <div class="emisora"><b>${esc(e.nombre)}${e.rut ? ` · RUT ${esc(e.rut)}` : ""}</b>${filasEmisora.map((f) => `<br>${esc(f)}`).join("")}</div>
      </header>

      <section class="portada">
        <div>
          <h1>Orden de compra</h1>
          <p class="sub">${esc(d.titulo)}</p>
          <div class="meta">
            <div><span class="et">N° OC</span>${d.numero ? `<b>${esc(d.numero)}</b>` : '<b class="pend">Al visar</b>'}</div>
            <div><span class="et">Fecha</span><b>${fechaCl(d.fecha)}</b></div>
            <div><span class="et">Moneda</span><b>${m}</b></div>
          </div>
        </div>
        <div class="caja">
          ${p ? `<p class="grande">${esc(p.nombre)}</p>${[p.rut ? `RUT ${esc(p.rut)}` : "", p.giro ? esc(p.giro) : ""].filter(Boolean).length ? `<p>${[p.rut ? `RUT ${esc(p.rut)}` : "", p.giro ? esc(p.giro) : ""].filter(Boolean).join(" · ")}</p>` : ""}${p.direccion ? `<p class="tenue">${esc(p.direccion)}</p>` : ""}${[p.telefono, p.correo].filter(Boolean).length ? `<p class="tenue">${[p.telefono, p.correo].filter(Boolean).map((x) => esc(x)).join(" · ")}</p>` : ""}` : '<p class="tenue">Sin proveedor asignado</p>'}
          ${d.atencion?.trim() ? `<p class="tenue">Atención: ${esc(d.atencion.trim())}</p>` : ""}
        </div>
      </section>
    </div>

    <div class="g">
      <table class="lineas">
        <colgroup><col style="width:10mm"><col><col style="width:25mm"><col style="width:30mm">${hayDescuento ? '<col style="width:14mm">' : ""}<col style="width:31mm"></colgroup>
        <thead><tr><th>#</th><th>Descripción</th><th class="n">Cantidad</th><th class="n">Precio unit.</th>${hayDescuento ? '<th class="n">Desc.</th>' : ""}<th class="n">Total</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>

      <div class="bajo-tabla">
        <div>
          ${entrega.length ? `<section class="bloque"><h2>Entrega y pago</h2><ul>${entrega.map((x) => `<li><b>${esc(x.etiqueta)}</b><span>${esc(x.texto)}</span></li>`).join("")}</ul></section>` : ""}
          ${d.observaciones?.trim() ? `<section class="bloque"><h2>Observaciones</h2><p>${conSaltos(d.observaciones.trim())}</p></section>` : ""}
        </div>
        <div class="totales"><table>
          <tr><td>${t.exento > 0 ? "Neto afecto" : "Neto"}</td><td>${formatoMonto(t.neto, m)}</td></tr>
          ${t.exento > 0 ? `<tr><td>Exento</td><td>${formatoMonto(t.exento, m)}</td></tr>` : ""}
          <tr><td>IVA ${Math.round(d.tasaIva * 1000) / 10}%</td><td>${formatoMonto(t.iva, m)}</td></tr>
          <tr class="total"><td>TOTAL</td><td>${formatoMonto(t.total, m)}</td></tr>
          ${m !== "CLP" ? `<tr class="pesos"><td>En pesos (${m} a ${formatoMonto(d.tipoCambio, "CLP")})</td><td>${formatoMonto(aPesos(t.total, m, d.tipoCambio), "CLP")}</td></tr>` : ""}
        </table></div>
      </div>
    </div>

    <div class="g cierre">
      <section class="bloque"><h2>Condiciones generales</h2><ol>${condiciones.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></section>
      <div class="final">
        <div class="facturar"><span class="et">Facturar a</span><b>${esc(e.nombre)}</b>${datosFacturar.length ? `<br>${datosFacturar.map((x) => esc(x)).join(" · ")}` : ""}</div>
        <div class="firma"><div class="raya"></div><b>${esc(d.creador)}</b></div>
      </div>
    </div>
  </div></div>
</body></html>`;
}

/** Pie que Chromium repite en cada página. */
export function pieDeOc(d: Pick<DatosOc, "empresa" | "numero">): string {
  return `<div style="width:100%;font-family:Arial,sans-serif;font-size:7pt;color:#8a8176;padding:0 16mm;display:flex;justify-content:space-between;align-items:center;">
    <span>${esc(d.empresa.nombre)}</span><span>${esc(d.numero ?? "Borrador de OC")} · Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
}
