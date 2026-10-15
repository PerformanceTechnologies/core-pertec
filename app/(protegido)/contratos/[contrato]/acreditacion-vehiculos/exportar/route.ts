import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { cargarFlota } from "@/lib/contratos/vehiculos";
import { generarExcelDeVehiculos } from "@/lib/contratos/vehiculos-excel";
import { nombreDeArchivo, TIPO_XLSX } from "@/lib/contratos/excel-comun";

export const dynamic = "force-dynamic";

/**
 * Descarga la flota como Excel: la matriz de documentos por vehículo, un resumen y los datos.
 *
 * El acceso se comprueba AQUÍ y no solo escondiendo el enlace: un Route Handler es una URL y se
 * puede pedir directo, igual que cada Server Action.
 */
export async function GET() {
  await exigirAccesoApp("acreditacion-vehiculos");

  const { contrato, tipos, vehiculos, hoy } = await cargarFlota();
  const buffer = await generarExcelDeVehiculos({ contrato, tipos, vehiculos, hoy });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${nombreDeArchivo(`Flota-${contrato.nombre}`, hoy)}"`,
      "Cache-Control": "no-store",
    },
  });
}
