import "server-only";
import { crearNotificacion } from "@/lib/buzon";
import { cargarRepositorioCompleto } from "./datos";
import { diasHasta, formatearFecha, requierenAtencion, RUTA_REPOSITORIO_LEGAL, SLUG_REPOSITORIO_LEGAL } from "./modelo";

/**
 * El hito en que está un documento: 30 días antes, 7 días antes o vencido (0). Un aviso por hito y
 * por fecha de vencimiento: si se renueva el documento, cambia la fecha y los avisos vuelven a correr.
 */
function hito(dias: number): 0 | 7 | 30 | null {
  if (dias <= 0) return 0;
  if (dias <= 7) return 7;
  if (dias <= 30) return 30;
  return null;
}

/**
 * Revisa todo el repositorio (con la app del Core: corre en un cron, sin sesión) y deja en el Buzón un
 * aviso por cada documento vencido o por vencer. Es idempotente: la clave evita repetir el mismo aviso.
 * Lo confidencial no se nombra en el Buzón (lo ve todo el módulo): se queda en la pantalla.
 */
export async function avisarVencimientosLegales(): Promise<{ revisados: number; creados: number }> {
  const repo = await cargarRepositorioCompleto({ soloApp: true, fresco: true });
  const nombre = new Map(repo.sociedades.map((s) => [s.slug, s.nombre]));
  const alerta = requierenAtencion(repo.documentos).filter((d) => !d.confidencial && !d.restringido && d.vence);
  let creados = 0;
  for (const d of alerta) {
    const dias = diasHasta(d.vence)!;
    const h = hito(dias);
    if (h === null) continue;
    const sociedad = d.sociedad ? nombre.get(d.sociedad) ?? "" : "";
    const titulo = h === 0 ? `Venció: ${d.tipoNombre}${sociedad ? ` · ${sociedad}` : ""}` : `Vence en ${dias} ${dias === 1 ? "día" : "días"}: ${d.tipoNombre}${sociedad ? ` · ${sociedad}` : ""}`;
    const ok = await crearNotificacion({
      modulo: SLUG_REPOSITORIO_LEGAL,
      tipo: "legal-vencimiento",
      titulo,
      cuerpo: `${d.nombre} — emitido ${formatearFecha(d.emision)}, ${h === 0 ? "venció" : "vence"} el ${formatearFecha(d.vence)}. Sube uno nuevo con «Renovar».`,
      enlace: d.sociedad ? `${RUTA_REPOSITORIO_LEGAL}/sociedades/${d.sociedad}` : `${RUTA_REPOSITORIO_LEGAL}/vencimientos`,
      severidad: h === 0 ? "urgente" : h === 7 ? "alerta" : "info",
      clave: `legal-vence:${d.id}:${d.vence}:${h}`,
      empresaId: null,
    });
    if (ok) creados += 1;
  }
  return { revisados: alerta.length, creados };
}
