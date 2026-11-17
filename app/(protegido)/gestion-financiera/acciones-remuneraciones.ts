"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RUTA_FIN, auditar, cargarVista, revienta } from "@/lib/fin/datos";
import { limpiarCacheBuk } from "@/lib/fin/buk";
import { cargarRemuneraciones } from "@/lib/fin/remuneraciones";
import { exigirRemuneraciones } from "@/lib/fin/remuneraciones-acceso";

type Resultado = { ok: true; id?: string } | { ok: false; error: string };

function fallo(e: unknown): Resultado {
  return { ok: false, error: e instanceof Error ? e.message.replace(/^\[(fin|buk)\]\s*/, "") : "Ocurrió un error inesperado." };
}

// Cada acción vuelve a verificar el permiso: una Server Action se puede invocar sin pasar por la pantalla.

/** Vuelve a leer BUK (vacía la memoria con los libros ya leídos). */
export async function actualizarDesdeBukAction(): Promise<Resultado> {
  try {
    await exigirRemuneraciones();
    limpiarCacheBuk();
    revalidatePath(`${RUTA_FIN}/remuneraciones`);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Carga en la fila «Remuneraciones» del flujo de caja la cifra sugerida de ese mes. Solo recibe el mes: el monto se
 * vuelve a calcular acá con BUK y el banco, no se confía en lo que muestre o mande el navegador.
 */
export async function usarSugerenciaEnFlujoAction(mes: string): Promise<Resultado> {
  try {
    const ctx = await exigirRemuneraciones();
    const datos = await cargarRemuneraciones(ctx, await cargarVista());
    if (datos.estado !== "ok") return { ok: false, error: datos.estado === "error" ? datos.mensaje : "BUK no está configurado." };
    const s = datos.sugerencias.find((x) => x.mes === mes);
    if (!s) return { ok: false, error: "Ese mes no está en el flujo de caja." };
    const monto = Math.round(s.monto);
    const comentario = `BUK: ${s.partes.map((p) => p.concepto).join(" + ")}`.slice(0, 200);
    const { error } = await supabaseAdmin
      .from("fin_flujo_partidas")
      .upsert({ empresa_id: ctx.empresa.id, mes, concepto: "remuneraciones", monto, comentario }, { onConflict: "empresa_id,mes,concepto" });
    revienta("guardar la partida de remuneraciones", error);
    const antes = datos.manualFlujo.get(mes) ?? 0;
    await auditar(ctx, "fin_flujo_partidas", null, "editar", `remuneraciones ${mes.slice(0, 7)}: ${monto} (sugerido desde BUK)`, { antes, despues: monto });
    revalidatePath(RUTA_FIN, "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
