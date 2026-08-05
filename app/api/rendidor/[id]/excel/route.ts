import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { obtenerRendicion } from "@/lib/rendidor/datos";
import { construirLibroRendicion, nombreArchivoRendicion, type RespaldoParaExcel } from "@/lib/rendidor/excel";
import { adjuntarArchivoAGasto } from "@/lib/rendidor/odoo";

const SLUG_APP = "rendir-gastos";

export const runtime = "nodejs";
export const maxDuration = 60;

// PASO 4 (y 7) de la skill: genera la planilla de 2 hojas con los respaldos
// embebidos.
//
// Va por POST y no por GET porque los archivos viven en memoria del navegador
// (no hay bucket en esta versión), así que el cliente tiene que mandarlos: uno
// por gasto, en un campo llamado `respaldo_{gastoId}`.
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

    const formulario = await request.formData();

    const respaldos: RespaldoParaExcel[] = [];
    for (const gasto of rendicion.gastos) {
      const archivo = formulario.get(`respaldo_${gasto.id}`);
      if (archivo instanceof File) {
        respaldos.push({
          gastoId: gasto.id,
          nombre: archivo.name,
          mimeType: archivo.type,
          contenido: Buffer.from(await archivo.arrayBuffer()),
        });
      }
    }

    const libro = await construirLibroRendicion(rendicion, respaldos);
    const nombre = nombreArchivoRendicion(rendicion);

    const expenseId = Number(formulario.get("expenseId"));
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
