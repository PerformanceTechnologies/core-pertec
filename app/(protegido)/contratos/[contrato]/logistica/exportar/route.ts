import { respuestaDeExcel } from "@/lib/contratos/arranque-exportar";

export const dynamic = "force-dynamic";

/** Descarga Logística como Excel: sus requerimientos y un resumen. */
export async function GET() {
  return await respuestaDeExcel("logistica");
}
