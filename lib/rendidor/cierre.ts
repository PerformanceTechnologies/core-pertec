import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import type { Rendicion } from "./tipos";
import { auditar, avisar, correosConRol, enlaceFondo, obtenerFondo, pesos, registrarMovimiento, transicion } from "./fondos";

// -----------------------------------------------------------------------------
//  El cierre de un informe aprobado (fase 3).
//
//  Cada boleta aceptada entra al libro como GASTO. Después el saldo del fondo decide:
//    · saldo = 0  → el fondo se cierra.
//    · saldo < 0  → exceso: el informe queda «reembolso pendiente» y se avisa a Tesorería.
//    · saldo > 0  → saldo a favor: el fondo sigue activo y quien rinde decide (devolverlo o,
//                   si es fijo, dejarlo a favor para la reposición). Se le avisa.
// -----------------------------------------------------------------------------

export async function cerrarInformeAprobado(r: Rendicion, revisor: string): Promise<{ estado: "cerrada" | "reembolso_pendiente"; saldo: number }> {
  if (!r.fondoId) throw new Error("El informe no tiene fondo.");
  const fondo = await obtenerFondo(r.fondoId);
  if (!fondo) throw new Error("No encontramos el fondo del informe.");

  // Los gastos al libro (solo los aceptados; al aprobar, las cargadas ya se aceptaron).
  let saldo = fondo.saldo;
  for (const g of r.gastos) {
    if ((g.revision?.estado ?? "cargada") !== "aceptada" || !(Number(g.total) > 0)) continue;
    saldo = await registrarMovimiento(fondo, "GASTO", Number(g.total), revisor, {
      informeId: r.id,
      boletaId: g.id,
      motivo: `${g.proveedor || "Gasto"}${g.numeroDocumento ? ` · folio ${g.numeroDocumento}` : ""}`,
    });
  }

  const ahora = new Date().toISOString();
  const enlace = `/rendir-gastos/${r.id}`;
  const dueno = r.rindeCorreo ? [r.rindeCorreo] : [];

  if (saldo < 0) {
    await supabaseAdmin.from("rendiciones").update({ estado: "reembolso_pendiente", actualizado_en: ahora }).eq("id", r.id);
    await auditar("informe", r.id, "aprobada", "reembolso_pendiente", revisor, `Exceso de ${pesos(-saldo)}`);
    await avisar(await correosConRol(fondo.empresaId, "tesoreria"), revisor, `Reembolso por pagar: ${pesos(-saldo)}`, `${r.nombreQuienRinde} · ${r.tituloRendicion}`, enlace, "reembolso", "alerta");
    return { estado: "reembolso_pendiente", saldo };
  }

  await supabaseAdmin.from("rendiciones").update({ estado: "cerrada", cerrada_en: ahora, actualizado_en: ahora }).eq("id", r.id);
  await auditar("informe", r.id, "aprobada", "cerrada", revisor);

  if (saldo === 0) {
    await transicion(fondo, ["activo"], "cerrado", revisor, { cerrado_en: ahora }, "Gasto igual al fondo");
    await avisar(dueno, revisor, `Tu fondo ${fondo.codigo} quedó cerrado`, "Lo rendido calzó justo con el fondo.", enlaceFondo(fondo.id), "fondo-cerrado");
  } else {
    await avisar(
      dueno,
      revisor,
      `Te quedó saldo a favor en ${fondo.codigo}: ${pesos(saldo)}`,
      fondo.esFijo ? "Puedes devolverlo o dejarlo a favor para la reposición." : "Puedes seguir rindiendo con él o devolverlo.",
      enlaceFondo(fondo.id),
      "saldo-a-favor",
    );
  }
  return { estado: "cerrada", saldo };
}
