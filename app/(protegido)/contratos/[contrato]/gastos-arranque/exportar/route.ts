import { respuestaDeExcel } from "@/lib/contratos/arranque-exportar";

export const dynamic = "force-dynamic";

/** Descarga Gastos de arranque como Excel: resumen, ítems, líneas y cotizaciones. */
export async function GET() {
  return await respuestaDeExcel("gastos");
}
