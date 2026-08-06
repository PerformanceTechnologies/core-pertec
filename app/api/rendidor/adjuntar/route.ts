import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { adjuntarRespaldo, verificarGasto } from "@/lib/rendidor/odoo";
import { descargarRespaldo } from "@/lib/rendidor/almacenamiento";

const SLUG_APP = "rendir-gastos";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Cuerpo {
  expenseId: number;
  // Ruta en el bucket, tal como la devolvio /analizar y quedo guardada en el gasto.
  archivoPath: string;
  nombre: string;
  totalEsperado?: number;
}

// 8.7 — Adjunta el respaldo de UN gasto ya creado en Odoo, y verifica.
//
// El archivo ya NO viaja en el request: se lee del bucket por su ruta. Antes el
// navegador tenía que retenerlo en memoria y reenviarlo, así que una rendición
// recuperada en otra sesión se quedaba sin respaldos.
//
// Sigue siendo un adjunto por request, ahora por el tiempo de las dos llamadas
// XML-RPC (adjuntar y verificar), no por el tamaño del body.
//
// A diferencia de la skill, el archivo NO se comprime: va del servidor directo a
// Odoo por XML-RPC, sin pasar por el contexto de ningún modelo, así que el motivo
// de la compresión (el costo en tokens de la llamada MCP) no existe acá.
export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const cuerpo = (await request.json()) as Cuerpo;
  const expenseId = Number(cuerpo.expenseId);
  if (!expenseId) {
    return NextResponse.json({ error: "Falta el id del gasto de Odoo." }, { status: 400 });
  }
  if (!cuerpo.archivoPath) {
    return NextResponse.json(
      { error: "Este gasto no tiene respaldo guardado. Subilo a mano en Odoo." },
      { status: 400 },
    );
  }

  try {
    const respaldo = await descargarRespaldo(cuerpo.archivoPath);
    if (!respaldo) {
      return NextResponse.json(
        { error: `El respaldo ${cuerpo.archivoPath} no está en el bucket. Subilo a mano en Odoo.` },
        { status: 404 },
      );
    }

    await adjuntarRespaldo(
      expenseId,
      cuerpo.nombre || cuerpo.archivoPath.split("/").pop() || "respaldo",
      respaldo.contenido,
      respaldo.mimeType,
    );

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
      const totalEsperado = Number(cuerpo.totalEsperado);
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
