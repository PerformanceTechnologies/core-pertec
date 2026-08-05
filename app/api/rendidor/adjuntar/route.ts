import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { adjuntarRespaldo, verificarGasto } from "@/lib/rendidor/odoo";

const SLUG_APP = "rendir-gastos";

export const runtime = "nodejs";
export const maxDuration = 60;

// 8.7 — Adjunta el respaldo de UN gasto ya creado en Odoo, y verifica.
//
// Un adjunto por request: el body de Vercel tope ~4,5 MB, así que 16 respaldos
// juntos no entran. A diferencia de la skill, el archivo NO se comprime: va del
// servidor directo a Odoo por XML-RPC, sin pasar por el contexto de ningún
// modelo, así que el motivo de la compresión (el costo en tokens de la llamada
// MCP) no existe acá.
export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const formulario = await request.formData();
  const archivo = formulario.get("archivo");
  const expenseIdRaw = formulario.get("expenseId");
  const totalEsperadoRaw = formulario.get("totalEsperado");

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }
  const expenseId = Number(expenseIdRaw);
  if (!expenseId) {
    return NextResponse.json({ error: "Falta el id del gasto de Odoo." }, { status: 400 });
  }

  try {
    const contenido = Buffer.from(await archivo.arrayBuffer());
    await adjuntarRespaldo(expenseId, archivo.name, contenido, archivo.type);

    // Verificación obligatoria: el respaldo quedó y extract_state sigue en
    // "done". Si el OCR corrió y pisó los montos, esto lo detecta.
    const v = await verificarGasto(expenseId);
    const problemas: string[] = [];

    if (!v) {
      problemas.push("No pudimos leer el gasto de vuelta para verificarlo.");
    } else {
      if (v.nb_attachment < 1) problemas.push("El respaldo no quedó adjunto.");
      if (v.extract_state !== "done") {
        problemas.push(
          `extract_state quedó en "${v.extract_state}": el OCR de Odoo corrió y pudo haber pisado ` +
            "proveedor, fecha o montos. Conviene desactivar el auto-send de la digitalización en Odoo.",
        );
      }
      const totalEsperado = Number(totalEsperadoRaw);
      if (totalEsperado && Math.abs(v.total_amount - totalEsperado) >= 1) {
        problemas.push(`El total quedó en ${v.total_amount} en vez de ${totalEsperado}.`);
      }
    }

    return NextResponse.json({ ok: problemas.length === 0, problemas, verificacion: v });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[rendidor] Error al adjuntar respaldo:", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
