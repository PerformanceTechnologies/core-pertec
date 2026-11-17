import { auditar, contextoFinApi } from "@/lib/fin/datos";
import { cargarLibroDelMes } from "@/lib/fin/remuneraciones";
import { puedeVerRemuneraciones } from "@/lib/fin/remuneraciones-acceso";
import { generarLibroExcel, nombreDelArchivo } from "@/lib/fin/remuneraciones-excel";
import { periodoValido } from "@/lib/fin/remuneraciones-modelo";
import { TIPO_XLSX } from "@/lib/contratos/excel-comun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SIN_CACHE = { "cache-control": "private, no-store" };

/**
 * El libro de remuneraciones de un mes en Excel (`?mes=2026-10`): el que se le envía a Contabilidad.
 *
 * Lleva nombre, RUT y sueldo de cada persona, así que el permiso se comprueba AQUÍ y no solo escondiendo el botón (esto es
 * una URL y se puede pedir directo): la misma regla de la pestaña. Cada descarga queda en la auditoría de Finanzas con
 * quién, cuándo y de qué mes. Nada se cachea en ningún intermediario.
 */
export async function GET(request: Request) {
  const ctx = await contextoFinApi();
  // 403 igual si no tiene la app o si no tiene el permiso: no se avisa cuál de las dos falta.
  if (!ctx || !(await puedeVerRemuneraciones(ctx))) return new Response("No autorizado", { status: 403, headers: SIN_CACHE });

  const mes = new URL(request.url).searchParams.get("mes");
  if (!periodoValido(mes, ctx.hoy)) return new Response("Mes inválido", { status: 400, headers: SIN_CACHE });

  const r = await cargarLibroDelMes(ctx, mes);
  if (r.estado === "sin-configurar") return new Response("BUK no está configurado.", { status: 503, headers: SIN_CACHE });
  if (r.estado === "error") return new Response(r.mensaje, { status: 502, headers: SIN_CACHE });
  if (r.estado === "vacio") return new Response("BUK no tiene liquidaciones en ese mes.", { status: 404, headers: SIN_CACHE });

  const { libro } = r;
  const buffer = await generarLibroExcel({
    empresa: libro.empresaBuk,
    periodo: libro.periodo,
    cerrado: libro.cerrado,
    fechaPago: libro.fechaPago,
    plazoPrevired: libro.plazoPrevired,
    hoy: ctx.hoy,
    resumen: libro.resumen,
    personas: libro.personas,
    centralizacion: libro.centralizacion,
  });
  await auditar(ctx, "remuneraciones", null, "exportar", `Libro de remuneraciones ${mes} en Excel (${libro.personas.length} personas${libro.cerrado ? "" : ", provisorio"})`);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": TIPO_XLSX,
      // ASCII: el nombre viaja en una cabecera HTTP, donde un acento o una eñe se rompen.
      "content-disposition": `attachment; filename="${nombreDelArchivo(libro.periodo, libro.cerrado)}.xlsx"`,
      ...SIN_CACHE,
    },
  });
}
