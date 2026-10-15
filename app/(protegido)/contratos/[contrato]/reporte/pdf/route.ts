import { exigirSesion } from "@/lib/contratos/autorizacion";
import { nombreDeArchivo } from "@/lib/contratos/excel-comun";
import { armarReporte } from "@/lib/contratos/reporte";
import { generarReportePdf } from "@/lib/contratos/reporte-pdf";

export const dynamic = "force-dynamic";
// pdf-lib dibuja todo en memoria con JavaScript puro: sin navegador ni fuentes que leer del disco.
export const runtime = "nodejs";

/**
 * Descarga el reporte del contrato en PDF: el mismo estado que el tablero, con gráficos, ordenado
 * por módulo y listo para imprimir o mandar.
 *
 * Solo incluye los módulos que quien lo pide puede abrir (ver armarReporte). El acceso se comprueba
 * AQUÍ y no solo escondiendo el botón: un Route Handler es una URL y se puede pedir directo.
 */
export async function GET() {
  const usuario = await exigirSesion();
  const datos = await armarReporte(usuario);
  const pdf = await generarReportePdf(datos);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreDeArchivo(`Reporte-${datos.contrato.nombre}`, datos.hoy).replace(/\.xlsx$/, ".pdf")}"`,
      // Datos del contrato: que ningún intermediario los guarde.
      "Cache-Control": "no-store",
    },
  });
}
