import "server-only";
import { PDFParse } from "pdf-parse";
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
    const nuevosDeEstaCarpeta = archivos.filter((a) => a.nombre.toLowerCase().endsWith(".pdf") && !yaIndexados.has(a.id));

    for (const archivo of nuevosDeEstaCarpeta) {
      procesados++;
      const buffer = await descargarBinarioArchivo(archivo.id);
      let texto = "";
      try {
        const parser = new PDFParse({ data: buffer });
        const resultado = await parser.getText();
        texto = resultado.text;
        await parser.destroy();
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
