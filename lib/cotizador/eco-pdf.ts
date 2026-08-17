import "server-only";
import type { QuotationInput } from "@/lib/cotizador/motor/types";
import { lanzarNavegador } from "../playwright-navegador";
import { money, fechaCl } from "./formato";
import type { CotizacionCompleta } from "../cotizador";
import type { QuotationResult } from "./motor/consolidacion";
import { lineaIdentidadEmpresa, nombreMostrarEmpresa, type EmpresaIdentidad } from "./empresas";

export interface PreparadoPor {
  nombre: string;
  correo: string;
}

function escapeHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function filaEcoItem(e: QuotationResult["ecoItems"][number]): string {
  return `
    <tr>
      <td class="num-col">${escapeHtml(e.item)}</td>
      <td>${escapeHtml(e.descripcion)}</td>
      <td class="num-col">${escapeHtml(e.unidad)}</td>
      <td class="num-col right">${escapeHtml(String(e.cantidad))}</td>
      <td class="right">${money(e.precioUnitario)}</td>
      <td class="right strong">${money(e.total)}</td>
    </tr>`;
}

// Construye el HTML autocontenido (sin dependencias externas — Playwright lo
// renderiza sin red) del resumen ejecutivo ECO-1, con los datos más
// relevantes de la cotización. Independiente de la vista en pantalla
// (EcoTab.tsx): esta es la versión "para imprimir", generada en el servidor.
export function construirHtmlEcoPdf(
  cotizacion: CotizacionCompleta & { input: QuotationInput },
  result: QuotationResult,
  preparadoPor: PreparadoPor,
  empresa: EmpresaIdentidad | null,
): string {
  const spot = cotizacion.input.tipoServicio === "spot";
  // Linea "RUT X · Direccion, Ciudad · correo" de la empresa emisora. Queda
  // vacia mientras no se carguen los datos legales reales, y en ese caso no se
  // renderiza el div en vez de mostrar campos a medias.
  const lineaEmpresa = lineaIdentidadEmpresa(empresa);

  const bloqueSpotContrato =
    !spot && result.ecoItemsPersonalSpotContrato.length > 0
      ? `
    <div class="seccion">
      <div class="titulo-seccion">Personal SPOT del contrato — facturación por HH</div>
      <table>
        <thead>
          <tr>
            <th class="num-col">Ítem</th>
            <th>Cargo</th>
            <th class="num-col">Unidad</th>
            <th class="num-col right">HH/mes</th>
            <th class="right">Tarifa HH25</th>
            <th class="right">Total CLP</th>
          </tr>
        </thead>
        <tbody>
          ${result.ecoItemsPersonalSpotContrato.map(filaEcoItem).join("")}
        </tbody>
      </table>
      <div class="totales">
        <div class="fila strong">
          <span>SUBTOTAL PERSONAL SPOT</span>
          <span>${money(result.ecoSubtotalPersonalSpotContrato)}</span>
        </div>
      </div>
    </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f1b16; font-size: 11px; margin: 0; }
  .encabezado { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1f1b16; padding-bottom: 10px; }
  .empresa { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
  .identidad-empresa { margin-top: 3px; font-size: 9.5px; color: #4a443c; }
  .subtitulo { margin-top: 4px; font-size: 10px; color: #6b6459; }
  .titulo-doc { text-align: right; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .meta-doc { margin-top: 4px; font-size: 10px; color: #6b6459; text-align: right; }
  .aviso-demo { margin-top: 12px; border: 2px solid #c85217; border-radius: 6px; background: #fdf1ea; color: #8f3a10; padding: 8px 12px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; text-align: center; }
  .identificacion { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; border-bottom: 1px solid #ded6c8; padding: 12px 0; font-size: 11px; }
  .identificacion b { color: #6b6459; font-weight: 600; }
  .resumen-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
  .kpi { border: 1px solid #ded6c8; border-radius: 8px; padding: 10px; }
  .kpi .etiqueta { font-size: 9px; text-transform: uppercase; color: #6b6459; letter-spacing: 0.03em; }
  .kpi .valor { margin-top: 4px; font-size: 15px; font-weight: 700; }
  .titulo-seccion { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 2px solid #1f1b16; padding-bottom: 6px; margin-bottom: 6px; }
  .seccion { margin-top: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th { text-align: left; font-size: 9px; text-transform: uppercase; color: #6b6459; border-bottom: 1px solid #1f1b16; padding: 5px 4px; }
  tbody td { padding: 5px 4px; border-bottom: 1px solid #ede7da; }
  .right { text-align: right; }
  .strong { font-weight: 700; }
  .num-col { color: #9a9285; font-size: 9.5px; }
  .totales { display: flex; justify-content: flex-end; margin-top: 8px; }
  .totales .fila { display: flex; justify-content: space-between; gap: 24px; width: 260px; padding: 3px 0; }
  .totales .fila.strong { background: #1f1b16; color: #fff; border-radius: 6px; padding: 6px 10px; margin-top: 4px; }
  .glosa { margin-top: 14px; background: #f4efe4; border-radius: 6px; padding: 10px 12px; }
  .glosa .etiqueta { font-size: 8.5px; text-transform: uppercase; color: #6b6459; }
  .glosa .texto { margin-top: 3px; font-size: 11px; font-weight: 600; }
  .pie { margin-top: 34px; display: flex; justify-content: space-between; align-items: flex-end; }
  .condiciones { font-size: 9.5px; color: #6b6459; line-height: 1.5; max-width: 60%; }
  .firma { text-align: center; }
  .firma .linea { width: 200px; border-top: 1px solid #1f1b16; padding-top: 5px; font-size: 11px; font-weight: 600; }
  .firma .detalle { font-size: 9.5px; color: #6b6459; margin-top: 2px; }
</style>
</head>
<body>
  <div class="encabezado">
    <div>
      <div class="empresa">${escapeHtml(nombreMostrarEmpresa(cotizacion.empresa, empresa))}</div>
      ${lineaEmpresa ? `<div class="identidad-empresa">${escapeHtml(lineaEmpresa)}</div>` : ""}
      <div class="subtitulo">Resumen ejecutivo de cotización</div>
    </div>
    <div>
      <div class="titulo-doc">Formulario ECO-1</div>
      <div class="meta-doc">Oferta económica · ${escapeHtml(cotizacion.rev)} · ${fechaCl(cotizacion.parametrosSnapshot.vigenteDesde)}</div>
    </div>
  </div>

  ${
    cotizacion.esDemo
      ? `<div class="aviso-demo">
    Documento de EJEMPLO — cifras ilustrativas, no corresponden a una oferta real. No distribuir.
  </div>`
      : ""
  }

  <div class="identificacion">
    <span><b>Mandante:</b> ${escapeHtml(cotizacion.cliente ?? "—")}</span>
    <span><b>Servicio:</b> ${escapeHtml(cotizacion.nombre)}</span>
    <span><b>Faena:</b> ${escapeHtml(cotizacion.faena ?? "—")}</span>
    <span><b>Plazo:</b> ${escapeHtml(String(cotizacion.input.duracionMeses))} ${cotizacion.input.duracionMeses === 1 ? "mes" : "meses"} · ${escapeHtml(String(cotizacion.input.diasServicio))} días de servicio</span>
    <span><b>Tipo de servicio:</b> ${spot ? "SPOT" : "Contrato permanente"}</span>
    <span><b>Dotación total:</b> ${escapeHtml(String(result.staff.reduce((a, s) => a + Number(s.dotacionTotal ?? 0), 0)))} personas · ${result.staff.length} cargos</span>
  </div>

  <div class="resumen-kpis">
    <div class="kpi">
      <div class="etiqueta">Costo mensual total</div>
      <div class="valor">${money(result.costoMensualTotal)}</div>
    </div>
    <div class="kpi">
      <div class="etiqueta">Costo total servicio</div>
      <div class="valor">${money(result.costoTotalServicio)}</div>
    </div>
    <div class="kpi">
      <div class="etiqueta">Total neto mensual (ECO)</div>
      <div class="valor">${money(result.ecoTotalNeto)}</div>
    </div>
    <div class="kpi">
      <div class="etiqueta">Total mensual con IVA</div>
      <div class="valor">${money(result.ecoConIva)}</div>
    </div>
  </div>

  <div class="seccion">
    <div class="titulo-seccion">Desglose ECO-1</div>
    <table>
      <thead>
        <tr>
          <th class="num-col">Ítem</th>
          <th>Descripción</th>
          <th class="num-col">Unidad</th>
          <th class="num-col right">Cant.</th>
          <th class="right">P. unitario</th>
          <th class="right">Total CLP</th>
        </tr>
      </thead>
      <tbody>
        ${result.ecoItems.map(filaEcoItem).join("")}
      </tbody>
    </table>
  </div>

  ${bloqueSpotContrato}

  <div class="seccion">
    <div class="totales">
      <div class="fila">
        <span>Total neto mensual</span>
        <span>${money(result.ecoTotalNeto)}</span>
      </div>
      <div class="fila">
        <span>IVA 19%</span>
        <span>${money(result.ecoIva)}</span>
      </div>
    </div>
    <div class="totales">
      <div class="fila strong">
        <span>TOTAL MENSUAL</span>
        <span>${money(result.ecoConIva)}</span>
      </div>
    </div>
  </div>

  <div class="glosa">
    <div class="etiqueta">Son (valor neto mensual)</div>
    <div class="texto">${escapeHtml(result.glosa)}</div>
  </div>

  <div class="pie">
    <div class="condiciones">
      Oferta válida por 30 días corridos.<br />
      Valores netos, no incluyen IVA salvo indicación.<br />
      Boleta de garantía según bases de licitación (${money(result.boletaGarantia)}).
    </div>
    <div class="firma">
      <div class="linea">${escapeHtml(preparadoPor.nombre)}</div>
      <div class="detalle">
        Preparado por · ${escapeHtml(cotizacion.empresa)}<br />
        ${escapeHtml(preparadoPor.correo)}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function generarEcoPdf(
  cotizacion: CotizacionCompleta & { input: QuotationInput },
  result: QuotationResult,
  preparadoPor: PreparadoPor,
  empresa: EmpresaIdentidad | null,
): Promise<Buffer> {
  const html = construirHtmlEcoPdf(cotizacion, result, preparadoPor, empresa);
  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
