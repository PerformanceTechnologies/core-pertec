"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirAccesoRendidor } from "@/lib/rendidor/permisos";
import {
  accionesPosibles,
  esEditable,
  problemasParaEnviar,
  puedeAbrirRendicion,
  puedeVerRendicionesAjenas,
  type AccionRendicion,
} from "@/lib/permisos-rendidor";
import {
  actualizarCabecera,
  cambiarEstado,
  correosRevisores,
  crearRendicion,
  eliminarRendicion,
  listarPersonas,
  obtenerRendicion,
} from "@/lib/rendidor/datos";
import { borrarRespaldosDeRendicion } from "@/lib/rendidor/almacenamiento";
import { crearNotificacion } from "@/lib/buzon";
import type { Rendicion } from "@/lib/rendidor/tipos";

export type Resultado = { ok: true } | { ok: false; error: string };

const fallo = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : "Ocurrió un error inesperado.",
});

const money = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const totalDe = (r: Rendicion) => r.gastos.reduce((s, g) => s + (Number(g.total) || 0), 0);

/** Si la rendición es de esta persona: la creó o es quien rinde. */
const esMia = (r: Rendicion, usuario: { id: string; correo: string }) =>
  r.creadoPor === usuario.id || r.rindeCorreo?.toLowerCase() === usuario.correo.toLowerCase();

/** Avisos personales a la campana. Si el buzón falla, la acción igual quedó hecha. */
async function avisar(para: string[], actor: string, r: Rendicion, tipo: string, titulo: string, cuerpo?: string, severidad: "info" | "alerta" = "info") {
  const marca = Date.now();
  await Promise.all(
    [...new Set(para.map((c) => c.toLowerCase()))]
      .filter((c) => c && c !== actor.toLowerCase())
      .map((destinatario) =>
        crearNotificacion({
          modulo: "rendir-gastos",
          tipo,
          titulo,
          cuerpo,
          enlace: `/rendir-gastos/${r.id}`,
          severidad,
          clave: `rendicion:${r.id}:${tipo}:${destinatario}:${marca}`,
          destinatario,
        }).catch(() => false),
      ),
  );
}

// ---------- Crear y editar -----------------------------------------------------

export async function crearRendicionAction(form: FormData) {
  const { usuario, rol } = await exigirAccesoRendidor();

  const tituloRendicion = String(form.get("tituloRendicion") ?? "").trim().slice(0, 200);
  const montoAsignado = Math.max(0, Math.round(Number(form.get("montoAsignado") ?? 0) || 0));
  const empresaCompanyId = Number(form.get("empresaCompanyId") ?? 1) === 2 ? 2 : 1;
  if (!tituloRendicion) throw new Error("El título de la rendición es obligatorio.");

  // Quien rinde: uno mismo, o —si administra gastos— otra persona del Core.
  let rinde = { correo: usuario.correo.toLowerCase(), nombre: usuario.nombre || usuario.correo.split("@")[0] };
  const pedido = String(form.get("rindeCorreo") ?? "").trim().toLowerCase();
  if (pedido && pedido !== rinde.correo) {
    if (!puedeVerRendicionesAjenas(usuario.rol, rol)) throw new Error("Solo quien administra gastos puede crear una rendición a nombre de otra persona.");
    const persona = (await listarPersonas()).find((p) => p.correo === pedido);
    if (!persona) throw new Error("Esa persona no es un usuario activo del Core.");
    rinde = persona;
  }

  const rendicion = await crearRendicion(
    { nombreQuienRinde: rinde.nombre, rindeCorreo: rinde.correo, tituloRendicion, montoAsignado, empresaCompanyId },
    usuario.id,
  );

  revalidatePath("/rendir-gastos");
  redirect(`/rendir-gastos/${rendicion.id}`);
}

export async function actualizarCabeceraAction(id: string, datos: { tituloRendicion: string; montoAsignado: number }): Promise<Resultado> {
  try {
    const { usuario, rol } = await exigirAccesoRendidor();
    const r = await obtenerRendicion(id);
    if (!r || !puedeAbrirRendicion(r.creadoPor, usuario.id, usuario.rol, rol, r.rindeCorreo, usuario.correo)) return { ok: false, error: "No encontramos esa rendición." };
    if (!esEditable(r.estado)) return { ok: false, error: "La rendición ya no se puede editar." };
    const titulo = datos.tituloRendicion.trim().slice(0, 200);
    if (!titulo) return { ok: false, error: "El título no puede quedar vacío." };
    await actualizarCabecera(id, { tituloRendicion: titulo, montoAsignado: Math.max(0, Math.round(Number(datos.montoAsignado) || 0)) });
    revalidatePath(`/rendir-gastos/${id}`);
    revalidatePath("/rendir-gastos");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- El ciclo: enviar, retirar, aprobar, rechazar, pagar, reabrir --------

/**
 * Una sola puerta para los cambios de estado: valida que la acción esté permitida
 * para esta persona en el estado actual (accionesPosibles) y deja el rastro.
 */
export async function moverRendicionAction(id: string, accion: AccionRendicion, nota?: string): Promise<Resultado> {
  try {
    const { usuario, rol } = await exigirAccesoRendidor();
    const r = await obtenerRendicion(id);
    const mia = r ? esMia(r, usuario) : false;
    const revisa = puedeVerRendicionesAjenas(usuario.rol, rol);
    if (!r || (!mia && !revisa)) return { ok: false, error: "No encontramos esa rendición." };
    if (!accionesPosibles({ estado: r.estado, esMia: mia }, revisa, usuario.rol === "admin").includes(accion)) {
      return { ok: false, error: "Esa acción no corresponde en el estado actual de la rendición." };
    }

    const ahora = new Date().toISOString();
    const yo = usuario.correo.toLowerCase();
    const quien = usuario.nombre ?? usuario.correo;
    const total = money(totalDe(r));
    const dueno = r.rindeCorreo ? [r.rindeCorreo] : [];
    let hecho = false;

    switch (accion) {
      case "enviar": {
        const problemas = problemasParaEnviar(r.gastos);
        if (problemas.length) return { ok: false, error: problemas.join(" ") };
        hecho = await cambiarEstado(id, ["borrador", "rechazada"], "enviada", { enviada_en: ahora, motivo_rechazo: null, revisada_por: null, revisada_en: null });
        if (hecho) await avisar(await correosRevisores(), yo, r, "enviada", `Rendición por revisar: ${r.tituloRendicion}`, `${r.nombreQuienRinde} · ${total}`, "alerta");
        break;
      }
      case "retirar":
        hecho = await cambiarEstado(id, ["enviada"], "borrador", { enviada_en: null });
        break;
      case "aprobar":
        hecho = await cambiarEstado(id, ["enviada"], "aprobada", { revisada_por: yo, revisada_en: ahora, motivo_rechazo: null });
        if (hecho) await avisar(dueno, yo, r, "aprobada", `Aprobaron tu rendición: ${r.tituloRendicion}`, `Por ${quien} · ${total}`);
        break;
      case "rechazar": {
        const motivo = (nota ?? "").trim().slice(0, 1000);
        if (!motivo) return { ok: false, error: "Escribe el motivo del rechazo: es lo que quien rinde tiene que corregir." };
        hecho = await cambiarEstado(id, ["enviada"], "rechazada", { revisada_por: yo, revisada_en: ahora, motivo_rechazo: motivo });
        if (hecho) await avisar(dueno, yo, r, "rechazada", `Rechazaron tu rendición: ${r.tituloRendicion}`, motivo, "alerta");
        break;
      }
      case "pagar":
        hecho = await cambiarEstado(id, ["aprobada"], "pagada", { pagada_por: yo, pagada_en: ahora, nota_pago: (nota ?? "").trim().slice(0, 500) || null });
        if (hecho) await avisar(dueno, yo, r, "pagada", `Se pagó tu rendición: ${r.tituloRendicion}`, nota?.trim() || undefined);
        break;
      case "reabrir":
        hecho = await cambiarEstado(id, ["aprobada"], "enviada", { revisada_por: null, revisada_en: null });
        break;
    }

    if (!hecho) return { ok: false, error: "La rendición cambió mientras tanto. Recarga la página." };
    revalidatePath(`/rendir-gastos/${id}`);
    revalidatePath("/rendir-gastos");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Borrar ---------------------------------------------------------------

/**
 * Borra una rendición con sus comprobantes.
 *
 * Quien rinde borra la suya mientras está en sus manos (borrador o rechazada); una ya
 * enviada, aprobada o pagada solo la borra quien administra gastos, porque ya es parte
 * de la contabilidad. Las históricas de Odoo, lo mismo.
 */
export async function eliminarRendicionAction(id: string): Promise<Resultado> {
  try {
    const { usuario, rol } = await exigirAccesoRendidor();
    const r = await obtenerRendicion(id);
    // Ya no existe: éxito, para que un doble clic no muestre un error.
    if (!r) return { ok: true };
    const revisa = puedeVerRendicionesAjenas(usuario.rol, rol);
    const mia = esMia(r, usuario);
    if (!mia && !revisa) return { ok: false, error: "No puedes borrar una rendición de otra persona." };
    if (!revisa && !esEditable(r.estado)) {
      return { ok: false, error: "Ya se envió a revisión: retírala primero, o pide a quien administra gastos que la borre." };
    }
    // Los respaldos primero: si se borrara la fila antes, los archivos quedarían huérfanos.
    await borrarRespaldosDeRendicion(id);
    await eliminarRendicion(id);
    revalidatePath("/rendir-gastos");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
