// El PDF de la cotización: arma el HTML (A4) que Chromium imprime.
//
// Sin "server-only" a propósito: es solo texto → texto, y así lo prueba scripts/probar-cotizacion-pdf.mts
// con tsx, sin navegador. Lo que abre Chromium vive en cotizacion-pdf.ts.
//
// Todo lo que viene de personas (títulos, descripciones, notas, nombres) pasa por `esc`: el HTML se
// manda a un cliente y no puede ser un vector de nada.

import { clp, fechaCl, sumarDias } from "./reglas";
import { ETIQUETA_TIPO_VENTA, lineaNeta, totalesCotizacion, type DescuentoGeneral, type LineaCotizacion } from "./modelo";

export interface EmpresaDocumento {
  nombre: string;
  rut: string | null;
  direccion: string | null;
  giro: string | null;
  telefono: string | null;
  correo: string | null;
  web: string | null;
  datosBancarios: string | null;
  pie: string | null;
}

export interface ClienteDocumento {
  nombre: string;
  rut: string | null;
  giro: string | null;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
}

export interface DatosDocumento {
  empresa: EmpresaDocumento;
  /** data:image/png;base64,… o null (entonces va el nombre en texto). */
  logo: string | null;
  numero: string;
  version: number;
  titulo: string;
  fecha: string;
  validezDias: number;
  tipo: string;
  /** El estado no se imprime: un PDF de borrador no puede llegar al cliente diciendo «borrador». */
  estado: string;
  cliente: ClienteDocumento | null;
  atencion: string | null;
  lineas: LineaCotizacion[];
  tasaIva: number;
  /** Descuento sobre todo el documento (además del de cada línea); null si no hay. */
  descuentoGeneral: DescuentoGeneral | null;
  /** Si el PDF lleva los datos bancarios de la empresa (apagado por omisión). */
  incluirDatosPago: boolean;
  condicionPagoDias: number | null;
  formaPago: string | null;
  plazoEntrega: string | null;
  requiereOc: boolean;
  requiereEdp: boolean;
  requiereHes: boolean;
  notas: string | null;
  emisor: { nombre: string; correo: string };
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
/** Un data URI de PNG que armó el servidor y nada más (ver logoComoDataUri). */
const logoSeguro = (l: string | null) => (l && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(l) ? l : null);

/** Hasta cuándo vale: fecha + validez. */
export function vigenteHasta(fecha: string, validezDias: number): string {
  return sumarDias(fecha.slice(0, 10), validezDias);
}

/** Los requisitos de facturación del cliente, en una frase. */
function requisitos(d: Pick<DatosDocumento, "requiereOc" | "requiereEdp" | "requiereHes">): string | null {
  const x = [d.requiereOc && "orden de compra (OC)", d.requiereEdp && "estado de pago (EDP) aprobado", d.requiereHes && "hoja de entrada de servicio (HES)"].filter(Boolean) as string[];
  if (x.length === 0) return null;
  return `Para facturar se requiere ${x.length > 1 ? `${x.slice(0, -1).join(", ")} y ${x[x.length - 1]}` : x[0]}.`;
}

/** Las condiciones comerciales, una por fila (lo que dice el documento, derivado de lo que se cargó). */
export function condicionesDelDocumento(d: DatosDocumento): { etiqueta: string; texto: string }[] {
  const c: { etiqueta: string; texto: string }[] = [];
  c.push({ etiqueta: "Validez de la oferta", texto: `${d.validezDias} días, hasta el ${fechaCl(vigenteHasta(d.fecha, d.validezDias))}.` });
  if (d.formaPago?.trim()) c.push({ etiqueta: "Forma de pago", texto: d.formaPago.trim() });
  else if (d.condicionPagoDias !== null && d.condicionPagoDias !== undefined) c.push({ etiqueta: "Forma de pago", texto: d.condicionPagoDias === 0 ? "Contado contra factura." : `Pago a ${d.condicionPagoDias} días desde la fecha de la factura.` });
  if (d.plazoEntrega?.trim()) c.push({ etiqueta: "Plazo de entrega", texto: d.plazoEntrega.trim() });
  const r = requisitos(d);
  if (r) c.push({ etiqueta: "Facturación", texto: r });
  return c;
}

const CSS = `
  /* La primera hoja arranca sin margen superior (la barra de color va pegada arriba); las siguientes llevan aire. */
  @page { size: A4; margin: 12mm 0 13mm 0; }
  @page :first { margin-top: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #1b1814; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barra { height: 5px; background: #c85217; }
  /* El margen lateral vive en .hoja (fijo); lo que se achica o agranda al ajustar a la hoja es .pagina, con «zoom». */
  .hoja { padding: 0 16mm; }
  .pagina.una-hoja { display: flex; flex-direction: column; }
  .pagina.una-hoja .cierre { margin-top: auto; }
  .g { display: block; }

  .cabecera { display: flex; justify-content: space-between; align-items: center; gap: 12mm; padding: 6mm 0 4mm; }
  .marca img { max-height: 15mm; max-width: 58mm; display: block; }
  .marca .nombre { font-size: 17pt; font-weight: 800; letter-spacing: -0.01em; }
  .emisora { text-align: right; font-size: 8pt; color: #5a5249; line-height: 1.4; }
  .emisora b { color: #1b1814; font-size: 9pt; }

  .titulo { display: grid; grid-template-columns: 1fr auto; gap: 10mm; align-items: center; border-top: 1px solid #e3ddd3; border-bottom: 1px solid #e3ddd3; padding: 3.5mm 0; margin-bottom: 4.5mm; }
  .titulo .izq { min-width: 0; }
  .titulo h1 { margin: 0; font-size: 20pt; font-weight: 800; letter-spacing: 0.01em; text-transform: uppercase; color: #c85217; line-height: 1.05; }
  .titulo .sub { margin: 1.5mm 0 0; font-size: 11pt; font-weight: 600; color: #1b1814; overflow-wrap: anywhere; }
  /* Los cuatro datos en 2 × 2: cada etiqueta sobre su valor, todo alineado a la izquierda y a la misma altura que el título. */
  .meta { display: grid; grid-template-columns: repeat(2, auto); gap: 2.5mm 9mm; }
  .meta .et { display: block; color: #7a7167; text-transform: uppercase; letter-spacing: 0.07em; font-size: 7pt; }
  .meta b { display: block; font-size: 9.5pt; white-space: nowrap; }

  .dos { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .caja { border: 1px solid #e3ddd3; border-radius: 3mm; padding: 3.5mm 5mm; background: #fbf9f5; }
  .caja h2 { margin: 0 0 2mm; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: #c85217; }
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
  .resumen { display: grid; grid-template-columns: 1fr 80mm; gap: 8mm; align-items: start; break-inside: avoid; page-break-inside: avoid; }
  .resumen.solo { grid-template-columns: 1fr; }
  .totales table { width: 100%; border-collapse: collapse; }
  .totales td { padding: 1.2mm 3mm; font-size: 9.5pt; }
  .totales td:last-child { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totales tr.desc td { color: #b3261e; }
  .totales tr.sep td { border-top: 1px solid #e3ddd3; }
  .totales tr.total td { background: #c85217; color: #fff; font-weight: 800; font-size: 12pt; padding: 2.4mm 3mm; }

  .bloque { margin-bottom: 4mm; break-inside: avoid; page-break-inside: avoid; }
  .bloque h2 { margin: 0 0 2mm; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; color: #c85217; border-bottom: 1px solid #e3ddd3; padding-bottom: 1.2mm; }
  .bloque ul { margin: 0; padding: 0; list-style: none; }
  .bloque li { margin: 0 0 1mm; font-size: 9pt; display: flex; gap: 3mm; }
  .bloque li b { flex: 0 0 34mm; color: #3d362f; }
  .bloque p { margin: 0; font-size: 9pt; }
  .banco { white-space: pre-line; background: #fbf9f5; border: 1px dashed #d8cfc2; border-radius: 2mm; padding: 3mm 4mm; font-size: 9pt; }
  .cierre { break-inside: avoid; page-break-inside: avoid; padding-bottom: 2mm; }
  .cierre .fila { display: grid; grid-template-columns: 1fr 70mm; gap: 8mm; align-items: end; }
  .cierre .fila.solo { grid-template-columns: 1fr; justify-items: end; }
  .cierre .bloque { margin-bottom: 0; }
  .agradece { margin: 0 0 4mm; font-size: 9pt; color: #5a5249; }
  .firma { font-size: 9pt; }
  .firma .raya { width: 60mm; border-top: 1px solid #1b1814; margin-bottom: 1.5mm; }
  .firma b { font-size: 10pt; }
  .g + .g { margin-top: 5mm; }
`;

export function htmlDeCotizacion(d: DatosDocumento): string {
  const t = totalesCotizacion(d.lineas, d.tasaIva, d.descuentoGeneral);
  const arriendo = d.tipo === "arriendo";
  const logo = logoSeguro(d.logo);
  const e = d.empresa;
  // Tres líneas como mucho: giro, dirección, y contacto (teléfono · correo · web).
  const filasEmisora = [e.giro, e.direccion, [e.telefono, e.correo, e.web].filter(Boolean).join(" · ")].filter((x): x is string => Boolean(x && x.trim()));
  const hayDescuento = d.lineas.some((l) => Number(l.descuentoPct) > 0);
  const condiciones = condicionesDelDocumento(d);
  const pago = d.incluirDatosPago && e.datosBancarios?.trim() ? e.datosBancarios.trim() : null;
  const etiquetaDescuento = d.descuentoGeneral?.tipo === "pct" ? `Descuento (${Math.round(Number(d.descuentoGeneral.valor) * 100) / 100}%)` : "Descuento";

  const filas = d.lineas
    .map(
      (l, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${conSaltos(l.descripcion)}${l.exento ? '<span class="sub">Exento de IVA</span>' : ""}${arriendo && l.meses ? `<span class="sub">${l.meses} ${l.meses === 1 ? "mes" : "meses"} de arriendo</span>` : ""}</td>
        <td class="n">${esc(Number(l.cantidad).toLocaleString("es-CL", { maximumFractionDigits: 2 }))}${l.unidad ? ` ${esc(l.unidad)}` : ""}</td>
        <td class="n">${clp(Number(l.precioUnitario))}${arriendo ? '<span class="sub">por mes</span>' : ""}</td>
        ${hayDescuento ? `<td class="n">${Number(l.descuentoPct) > 0 ? `${Math.round(Number(l.descuentoPct) * 1000) / 10}%` : "—"}</td>` : ""}
        <td class="n"><b>${clp(lineaNeta(l))}</b></td>
      </tr>`,
    )
    .join("");

  const c = d.cliente;
  const atencionSecundaria = [c?.correo, c?.telefono].filter((x): x is string => Boolean(x));
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(d.numero)} ${esc(d.titulo)}</title><style>${CSS}</style></head>
<body>
  <div class="barra"></div>
  <div class="hoja"><div class="pagina">
    <div class="g">
      <header class="cabecera">
        <div class="marca">${logo ? `<img src="${logo}" alt="${esc(e.nombre)}">` : `<div class="nombre">${esc(e.nombre)}</div>`}</div>
        <div class="emisora"><b>${esc(e.nombre)}${e.rut ? ` · RUT ${esc(e.rut)}` : ""}</b>${filasEmisora.map((f) => `<br>${esc(f)}`).join("")}</div>
      </header>

      <section class="titulo">
        <div class="izq">
          <h1>Cotización</h1>
          <p class="sub">${esc(d.titulo)}</p>
        </div>
        <div class="meta">
          <div><span class="et">N°</span><b>${esc(d.numero)}${d.version > 1 ? ` · V${d.version}` : ""}</b></div>
          <div><span class="et">Fecha</span><b>${fechaCl(d.fecha)}</b></div>
          <div><span class="et">Tipo</span><b>${esc(ETIQUETA_TIPO_VENTA[d.tipo] ?? d.tipo)}</b></div>
          <div><span class="et">Válida hasta</span><b>${fechaCl(vigenteHasta(d.fecha, d.validezDias))}</b></div>
        </div>
      </section>

      <section class="dos">
        <div class="caja">
          <h2>Cliente</h2>
          ${c ? `<p class="grande">${esc(c.nombre)}</p>${[c.rut ? `RUT ${esc(c.rut)}` : "", c.giro ? esc(c.giro) : ""].filter(Boolean).length ? `<p>${[c.rut ? `RUT ${esc(c.rut)}` : "", c.giro ? esc(c.giro) : ""].filter(Boolean).join(" · ")}</p>` : ""}${c.direccion ? `<p class="tenue">${esc(c.direccion)}</p>` : ""}` : '<p class="tenue">Sin cliente asignado</p>'}
        </div>
        <div class="caja">
          <h2>Atención</h2>
          <p class="grande">${esc(d.atencion?.trim() || "—")}</p>
          ${atencionSecundaria.map((x) => `<p class="tenue">${esc(x)}</p>`).join("")}
        </div>
      </section>
    </div>

    <div class="g">
      <table class="lineas">
        <colgroup><col style="width:11mm"><col><col style="width:25mm"><col style="width:29mm">${hayDescuento ? '<col style="width:15mm">' : ""}<col style="width:30mm"></colgroup>
        <thead><tr>
          <th>#</th><th>Descripción</th><th class="n">Cantidad</th><th class="n">${arriendo ? "Tarifa" : "Precio unit."}</th>${hayDescuento ? '<th class="n">Desc.</th>' : ""}<th class="n">Total</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>

    </div>

    <div class="g">
      <div class="resumen">
        <div>
          <section class="bloque">
            <h2>Condiciones comerciales</h2>
            <ul>${condiciones.map((x) => `<li><b>${esc(x.etiqueta)}</b><span>${esc(x.texto)}</span></li>`).join("")}</ul>
          </section>
          ${d.notas?.trim() ? `<section class="bloque"><h2>Observaciones</h2><p>${conSaltos(d.notas.trim())}</p></section>` : ""}
        </div>
        <div class="totales"><table>
          ${t.descuento > 0 ? `<tr><td>Subtotal</td><td>${clp(t.bruto)}</td></tr><tr class="desc"><td>${esc(etiquetaDescuento)}</td><td>−${clp(t.descuento)}</td></tr>` : ""}
          <tr${t.descuento > 0 ? ' class="sep"' : ""}><td>${t.exento > 0 ? "Neto afecto" : "Neto"}</td><td>${clp(t.neto)}</td></tr>
          ${t.exento > 0 ? `<tr><td>Exento</td><td>${clp(t.exento)}</td></tr>` : ""}
          <tr><td>IVA ${Math.round(d.tasaIva * 1000) / 10}%</td><td>${clp(t.iva)}</td></tr>
          <tr class="total"><td>TOTAL</td><td>${clp(t.total)}</td></tr>
        </table></div>
      </div>
    </div>

    <div class="g cierre">
      <p class="agradece">Quedamos atentos a sus comentarios. Gracias por considerarnos.</p>
      <div class="fila${pago ? "" : " solo"}">
        ${pago ? `<section class="bloque"><h2>Datos para el pago</h2><div class="banco">${esc(pago)}</div></section>` : ""}
        <div class="firma"><div class="raya"></div><b>${esc(d.emisor.nombre)}</b><br>${esc(e.nombre)}<br>${esc(d.emisor.correo)}</div>
      </div>
    </div>
  </div></div>
</body></html>`;
}

/** Pie que Chromium repite en cada página: el texto de la empresa y «Página x de y». */
export function pieDeCotizacion(d: Pick<DatosDocumento, "empresa" | "numero" | "version">): string {
  const texto = d.empresa.pie?.trim() ? esc(d.empresa.pie.trim().split(/\r?\n/)[0]).slice(0, 160) : esc(d.empresa.nombre);
  return `<div style="width:100%;font-family:Arial,sans-serif;font-size:7pt;color:#8a8176;padding:0 16mm;display:flex;justify-content:space-between;align-items:center;">
    <span>${texto}</span><span>${esc(d.numero)}${d.version > 1 ? ` V${d.version}` : ""} · Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
}
