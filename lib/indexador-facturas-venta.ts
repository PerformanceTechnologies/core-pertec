import "server-only";
import {
  listarCarpetasAnioMes,
  listarArchivosDeCarpeta,
  descargarContenidoArchivo,
  type CarpetaAnioMes,
} from "./sharepoint-facturas";
import { parsearXmlDte } from "./xml-dte";
import { guardarFacturasVenta, obtenerDriveItemIdsIndexados, type ArchivoVentaAIndexar } from "./facturas-historicas";

export interface OpcionesIndexacion {
  // Sin anio/mes: modo incremental (mes actual + anterior, para el cron
  // diario). Con anio/mes: procesa solo esa carpeta puntual -- asi la carga
  // inicial del historico completo (2022-2026, miles de archivos) se hace
  // en varias llamadas chicas en vez de una sola que se pasaria del limite
  // de tiempo de una funcion serverless.
  anio?: number;
  mes?: number;
}

function carpetasObjetivo(todas: CarpetaAnioMes[], opciones: OpcionesIndexacion): CarpetaAnioMes[] {
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

export async function indexarFacturasVenta(opciones: OpcionesIndexacion = {}): Promise<{ nuevos: number; procesados: number }> {
  const todasLasCarpetas = await listarCarpetasAnioMes("ventas");
  const carpetas = carpetasObjetivo(todasLasCarpetas, opciones);
  const yaIndexados = await obtenerDriveItemIdsIndexados();

  let procesados = 0;
  const porIndexar: ArchivoVentaAIndexar[] = [];

  for (const carpeta of carpetas) {
    const archivos = await listarArchivosDeCarpeta(carpeta.itemId);
    const nuevosDeEstaCarpeta = archivos.filter((a) => a.nombre.toLowerCase().endsWith(".xml") && !yaIndexados.has(a.id));

    for (const archivo of nuevosDeEstaCarpeta) {
      procesados++;
      const contenido = await descargarContenidoArchivo(archivo.id);
      const dtes = parsearXmlDte(contenido);
      if (dtes.length === 0) continue; // XML no reconocido: se omite, no frena el resto

      // En la practica cada archivo trae un solo DTE; si trajera mas de uno
      // se indexan todos con el mismo drive_item_id + sufijo para no romper
      // la clave unica.
      dtes.forEach((dte, i) => {
        porIndexar.push({
          driveItemId: dtes.length > 1 ? `${archivo.id}#${i}` : archivo.id,
          nombreArchivo: archivo.nombre,
          anio: carpeta.anio,
          mes: carpeta.mes,
          webUrl: archivo.webUrl,
          dte,
        });
      });
    }
  }

  const nuevos = await guardarFacturasVenta(porIndexar);
  return { nuevos, procesados };
}
