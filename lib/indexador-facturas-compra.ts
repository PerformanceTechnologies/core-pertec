import "server-only";
import pdfParse from "pdf-parse";
import {
  listarCarpetasAnioMes,
  listarArchivosDeCarpeta,
  descargarBinarioArchivo,
  type CarpetaAnioMes,
} from "./sharepoint-facturas";
import {
  guardarFacturasCompra,
  obtenerDriveItemIdsIndexadosCompra,
  type ArchivoCompraAIndexar,
} from "./facturas-historicas";
import { extraerDatosFacturaCompra } from "./extraer-datos-factura-compra";
import { parsearXmlDte } from "./xml-dte";

/** Las mismas etiquetas que saca extraerDatosFacturaCompra de un PDF. */
const ETIQUETA_TIPO_DTE: Record<number, string> = { 33: "Factura", 34: "Factura", 46: "Factura", 56: "Nota de Débito", 61: "Nota de Crédito", 52: "Guía de Despacho", 39: "Boleta", 41: "Boleta" };
const normalizar = (rut: string | null | undefined) => (rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();

const RUT_PROPIO = process.env.SII_RUT_EMPRESA ?? "77590967-6";

export interface OpcionesIndexacionCompra {
  // Mismo criterio que el indexador de ventas: sin anio/mes, modo
  // incremental (mes actual + anterior); con anio/mes, esa carpeta puntual
  // (para la carga inicial del historico completo en varias llamadas).
  anio?: number;
  mes?: number;
}

function carpetasObjetivo(todas: CarpetaAnioMes[], opciones: OpcionesIndexacionCompra): CarpetaAnioMes[] {
  if (opciones.anio && opciones.mes) {
    return todas.filter((c) => c.anio === opciones.anio && c.mes === opciones.mes);
  }

  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;
  const mesAnteriorFecha = new Date(anioActual, mesActual - 2, 1);

  return todas.filter(
    (c) =>
      (c.anio === anioActual && c.mes === mesActual) ||
      (c.anio === mesAnteriorFecha.getFullYear() && c.mes === mesAnteriorFecha.getMonth() + 1)
  );
}

// A diferencia de ventas (XML con esquema fijo), aqui los campos
// estructurados (folio, RUT, fecha, monto) son best-effort via regex sobre
// el texto extraido -- cada PDF lo genera el sistema de facturacion de un
// proveedor distinto, sin layout comun, asi que pueden fallar ocasionalmente
// (ver lib/extraer-datos-factura-compra.ts). El texto completo igual se
// guarda para busqueda libre (ver comentario en la migracion de
// facturas_compra_historico sobre por que no se uso la busqueda de
// contenido de Graph).
export async function indexarFacturasCompra(
  opciones: OpcionesIndexacionCompra = {}
): Promise<{ nuevos: number; procesados: number }> {
  const todasLasCarpetas = await listarCarpetasAnioMes("compras");
  const carpetas = carpetasObjetivo(todasLasCarpetas, opciones);
  const yaIndexados = await obtenerDriveItemIdsIndexadosCompra();

  let procesados = 0;
  const porIndexar: ArchivoCompraAIndexar[] = [];

  for (const carpeta of carpetas) {
    const archivos = await listarArchivosDeCarpeta(carpeta.itemId);
    // Un PDF con un XML del mismo nombre al lado es la copia en PDF de un documento migrado desde
    // Odoo (lib/migracion-odoo-facturas.ts): el documento ya se indexa por su XML, no se duplica.
    const xmls = new Set(archivos.filter((a) => /\.xml$/i.test(a.nombre)).map((a) => a.nombre.toLowerCase().replace(/\.xml$/, "")));
    const nuevosDeEstaCarpeta = archivos.filter(
      (a) => /\.(pdf|xml)$/i.test(a.nombre) && !yaIndexados.has(a.id) && !(/\.pdf$/i.test(a.nombre) && xmls.has(a.nombre.toLowerCase().replace(/\.pdf$/, ""))),
    );

    for (const archivo of nuevosDeEstaCarpeta) {
      procesados++;
      // Los XML son los DTE que se traen de Odoo (lib/migracion-odoo-facturas.ts): ahí los datos
      // vienen exactos del documento, sin adivinarlos desde el texto de un PDF.
      if (archivo.nombre.toLowerCase().endsWith(".xml")) {
        const dtes = parsearXmlDte((await descargarBinarioArchivo(archivo.id)).toString("latin1"));
        const dte = dtes.find((d) => normalizar(d.rutReceptor) === normalizar(RUT_PROPIO)) ?? dtes[0];
        if (!dte) continue;
        porIndexar.push({
          driveItemId: archivo.id,
          nombreArchivo: archivo.nombre,
          anio: carpeta.anio,
          mes: carpeta.mes,
          webUrl: archivo.webUrl,
          textoExtraido: [dte.datos.emisor.razonSocial, dte.datos.emisor.rut, dte.folio, ...dte.datos.detalle.map((d) => d.nombre)].filter(Boolean).join(" "),
          datos: {
            folio: dte.folio,
            tipoDocumentoDetectado: ETIQUETA_TIPO_DTE[dte.tipoDte ?? 0] ?? "Factura",
            rutEmisor: dte.datos.emisor.rut,
            razonSocialEmisor: dte.datos.emisor.razonSocial,
            fechaEmision: dte.fechaEmision,
            montoTotal: dte.montoTotal,
          },
        });
        continue;
      }
      const buffer = await descargarBinarioArchivo(archivo.id);
      let texto = "";
      try {
        const resultado = await pdfParse(buffer);
        texto = resultado.text;
      } catch (err) {
        // PDF corrupto o no legible: se omite, no frena el resto -- pero se
        // deja rastro en el log del servidor para poder diagnosticar.
        console.error(`No se pudo extraer texto de ${archivo.nombre} (${archivo.id}):`, err);
        continue;
      }

      porIndexar.push({
        driveItemId: archivo.id,
        nombreArchivo: archivo.nombre,
        anio: carpeta.anio,
        mes: carpeta.mes,
        webUrl: archivo.webUrl,
        textoExtraido: texto,
        datos: extraerDatosFacturaCompra(texto, RUT_PROPIO),
      });
    }
  }

  const nuevos = await guardarFacturasCompra(porIndexar);
  return { nuevos, procesados };
}
