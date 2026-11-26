import "server-only";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "../supabase-admin";
import { RUTA_FIN, RUTA_LEADS, auditar, exigirDeEmpresa, fechaValida, montoDe, registrarEvento, revienta, siguienteNumero, type ContextoFin } from "./datos";
import { generarHitos, peso } from "./reglas";

// Aceptar una cotización: crea el proyecto si hace falta y los hitos, y la oportunidad pasa a Ganada. Lo usan el botón
// «Aceptar y generar hitos» del Core (acciones-ventas.ts) y el cliente desde el enlace del correo (cotizacion-enlace.ts).
// Movido tal cual desde aceptarCotizacionAction: la lógica no cambió.

export type ResultadoAceptar = { ok: true; id?: string } | { ok: false; error: string };

const refrescar = () => {
  revalidatePath(RUTA_FIN, "layout");
  revalidatePath(RUTA_LEADS, "layout");
};
const texto = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);
const ahora = () => new Date().toISOString();

/**
 * Aceptar: fecha, evidencia (opcional), N° OC del cliente (decide el camino con OC o sin OC) y el
 * generador de hitos. Crea el proyecto si hace falta y los hitos; la oportunidad pasa a Ganada.
 * `ctx` es quien acepta (en el Core, la sesión; desde el enlace, quien envió la cotización).
 */
export async function aceptarCotizacionCon(ctx: ContextoFin, id: string, fd: FormData): Promise<ResultadoAceptar> {
  const c = await exigirDeEmpresa("fin_cotizaciones", id, ctx.empresa.id);
  if (!["borrador", "enviada"].includes(String(c.estado))) return { ok: false, error: "Esta cotización ya no se puede aceptar." };
  const fecha = fechaValida(fd.get("fechaAceptacion"));
  if (!fecha) return { ok: false, error: "Indica la fecha de aceptación." };
  const oc = texto(fd, "ocCliente", 60);
  const neto = Number(c.neto);
  // La parte exenta se reparte entre los hitos en proporción a su neto (el último se lleva el redondeo).
  const exentoCot = Math.max(0, Math.min(neto, Number(c.exento ?? 0)));

  let proyectoId = uuid(fd.get("proyectoId")) ?? (c.proyecto_id as string | null);
  if (!proyectoId) {
    let nombre = texto(fd, "nombreProyecto", 120) ?? String(c.titulo);
    const tipoProyecto = String(fd.get("tipoProyecto") ?? (c.tipo === "arriendo" ? "arriendo" : "contrato"));
    if (tipoProyecto === "spot" && !/^spot\s*-/i.test(nombre)) nombre = `Spot - ${nombre}`;
    const codigo = await siguienteNumero(ctx.empresa.id, "proyecto", "PRY", 4);
    const { data, error } = await supabaseAdmin
      .from("fin_proyectos")
      .insert({ empresa_id: ctx.empresa.id, codigo, nombre, tipo: ["contrato", "spot", "arriendo", "interno"].includes(tipoProyecto) ? tipoProyecto : "contrato", mandante_id: c.cliente_id, creado_por: ctx.usuario.correo })
      .select("id")
      .single();
    revienta("crear el proyecto", error);
    proyectoId = data!.id;
  }

  const modo = String(fd.get("modo") ?? "unica");
  const generados =
    modo === "partes"
      ? generarHitos({ tipo: "partes", partes: Number(fd.get("partes")) || 2 }, neto)
      : modo === "mensual"
        ? generarHitos(
            {
              tipo: "mensual", desde: fechaValida(fd.get("desde")) ?? fecha, hasta: fechaValida(fd.get("hasta")) ?? fecha,
              prefijo: c.tipo === "arriendo" ? "Arriendo" : "EDP", montoMensual: montoDe(fd.get("montoMensual")) ?? undefined,
            },
            neto,
          )
        : generarHitos({ tipo: "unica" }, neto);
  if (generados.length === 0) return { ok: false, error: "El rango de meses no genera ningún hito." };

  const filas = [];
  let exentoRepartido = 0;
  for (const [i, g] of generados.entries()) {
    const exento = i === generados.length - 1 ? exentoCot - exentoRepartido : neto > 0 ? peso((g.neto * exentoCot) / neto) : 0;
    exentoRepartido += exento;
    filas.push({
      empresa_id: ctx.empresa.id, codigo: await siguienteNumero(ctx.empresa.id, "hito", "V", 4), cotizacion_id: id, cliente_id: c.cliente_id, proyecto_id: proyectoId,
      descripcion: String(c.titulo), tipo: c.tipo, periodo: g.periodo, periodo_desde: g.periodoDesde, periodo_hasta: g.periodoHasta, fecha_aceptacion: fecha,
      neto: g.neto, exento: Math.max(0, Math.min(g.neto, exento)), oc_cliente_numero: oc, oc_cliente_fecha: oc ? fecha : null, estado_trabajo: i === 0 && modo === "mensual" && g.periodoDesde && g.periodoDesde <= ctx.hoy ? "en_curso" : "pendiente",
      requiere_edp: c.requiere_edp, requiere_hes: c.requiere_hes, condicion_pago_dias: c.condicion_pago_dias, orden: i, creado_por: ctx.usuario.correo,
    });
  }
  const { error: eh } = await supabaseAdmin.from("fin_hitos").insert(filas);
  revienta("crear los hitos", eh);
  const { error } = await supabaseAdmin
    .from("fin_cotizaciones")
    .update({ estado: "aceptada", fecha_aceptacion: fecha, oc_cliente_numero: oc, proyecto_id: proyectoId, actualizado_en: ahora() })
    .eq("id", id);
  revienta("aceptar la cotización", error);
  if (c.oportunidad_id) {
    await supabaseAdmin.from("fin_oportunidades").update({ etapa: "ganada", probabilidad: 100, proyecto_id: proyectoId, actualizado_en: ahora() }).eq("id", c.oportunidad_id as string);
  }
  await auditar(ctx, "fin_cotizaciones", id, "aceptar", `Aceptada el ${fecha}: ${filas.length} hito(s)${oc ? `, OC ${oc}` : ", sin OC"}`);
  await registrarEvento(ctx, "cotizacion_aceptada", "cotizacion", id, { hitos: filas.length, neto });
  refrescar();
  return { ok: true, id: proyectoId ?? undefined };
}
