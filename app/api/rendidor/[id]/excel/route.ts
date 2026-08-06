import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { obtenerRendicion } from "@/lib/rendidor/datos";
import { construirLibroRendicion, nombreArchivoRendicion, type RespaldoParaExcel } from "@/lib/rendidor/excel";
import { adjuntarArchivoAGasto } from "@/lib/rendidor/odoo";
import { descargarRespaldo, miniaturaParaExcel } from "@/lib/rendidor/almacenamiento";

const SLUG_APP = "rendir-gastos";

export const runtime = "nodejs";
export const maxDuration = 60;

// PASO 4 (y 7) de la skill: genera la planilla de 2 hojas con los respaldos
// embebidos.
//
// Los respaldos se leen del bucket y se comprimen acá con sharp. Antes el cliente
// los mandaba comprimidos por multipart —N imágenes en un solo request, rozando
// el tope de ~4,5 MB del body de Vercel— y solo funcionaba si los archivos
// seguían en memoria de esa pestaña. Ahora una rendición recuperada más tarde
// exporta la planilla igual.
//
// Dos modos:
//   sin `expenseId`  → devuelve el .xlsx para descargar
//   con `expenseId`  → lo adjunta a ese hr.expense en Odoo y devuelve JSON
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const { id } = await params;

  try {
    const rendicion = await obtenerRendicion(id);
    if (!rendicion) {
      return NextResponse.json({ error: "No encontramos esa rendición." }, { status: 404 });
    }
    if (rendicion.gastos.length === 0) {
      return NextResponse.json(
        { error: "La rendición no tiene gastos: no hay nada que poner en la planilla." },
        { status: 400 },
      );
    }

    const cuerpo = (await request.json().catch(() => ({}))) as { expenseId?: number };

    // Los respaldos se bajan y comprimen en paralelo: son N descargas del bucket
    // más N conversiones con sharp, y en serie una rendición de 16 comprobantes
    // se pasaría del tiempo de la función.
    const respaldos = (
      await Promise.all(
        rendicion.gastos
          .filter((g) => g.archivoPath)
          .map(async (g): Promise<RespaldoParaExcel | null> => {
            const respaldo = await descargarRespaldo(g.archivoPath);
            if (!respaldo) return null;

            const mini = await miniaturaParaExcel(respaldo.contenido, respaldo.mimeType);
            return {
              gastoId: g.id,
              nombre: g.archivoNombre || g.archivoPath.split("/").pop() || "respaldo",
              // Sin miniatura (un PDF, o una conversión que falló) se pasa el
              // original: construirLibroRendicion decide si lo embebe o pone el
              // aviso, y así el motivo queda en un solo lugar.
              mimeType: mini ? "image/jpeg" : respaldo.mimeType,
              contenido: mini ?? respaldo.contenido,
            };
          }),
      )
    ).filter((r): r is RespaldoParaExcel => r !== null);

    const libro = await construirLibroRendicion(rendicion, respaldos);
    const nombre = nombreArchivoRendicion(rendicion);

    const expenseId = Number(cuerpo.expenseId);
    if (expenseId) {
      const attachmentId = await adjuntarArchivoAGasto(
        expenseId,
        nombre,
        libro,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      return NextResponse.json({
        attachmentId,
        nombre,
        // Cuántos gastos quedaron sin imagen: se informa, no se oculta.
        sinRespaldo: rendicion.gastos.length - respaldos.length,
      });
    }

    return new NextResponse(new Uint8Array(libro), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Content-Length": String(libro.length),
      },
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[rendidor] Error al generar el Excel:", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
