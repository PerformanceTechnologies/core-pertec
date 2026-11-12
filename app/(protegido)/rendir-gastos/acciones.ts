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
  obtenerRendicion,
} from "@/lib/rendidor/datos";
import { borrarRespaldosDeRendicion, urlFirmadaDeRespaldo } from "@/lib/rendidor/almacenamiento";
import { crearNotificacion } from "@/lib/buzon";
import type { GastoRendicion, Rendicion } from "@/lib/rendidor/tipos";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { contextoDeEmpresa } from "@/lib/empresas";
import { auditar, aprobacion, correosConRol, leerParametros, obtenerFondo, rolesDe } from "@/lib/rendidor/fondos";
import { cerrarInformeAprobado } from "@/lib/rendidor/cierre";
import { crearProveedorRapido, type ProveedorOpcion } from "@/lib/rendidor/proveedores";
import { repetidosDe } from "@/lib/rendidor/duplicados";
import { empresaActivaRG, enEmpresaRG } from "@/lib/rendidor/empresa";
import { SLUG_POR_OMISION } from "@/lib/empresas-modelo";
import type { Repetido } from "@/lib/rendidor/mis-gastos-modelo";
import type { EstadoBoleta, RolFondos } from "@/lib/rendidor/fondos-modelo";

/** Los roles del módulo de Fondos para un informe con fondo (vacío si es de los antiguos). */
async function rolesParaInforme(r: Rendicion, usuario: Parameters<typeof rolesDe>[0], esAdminModulo: boolean): Promise<RolFondos[]> {
  return r.empresaId ? rolesDe(usuario, esAdminModulo, r.empresaId) : [];
}

/** Boletas con el mismo RUT, folio y monto en otros informes de la empresa. */
async function marcarDuplicados(r: Rendicion): Promise<GastoRendicion[]> {
  if (!r.empresaId) return r.gastos;
  const { data } = await supabaseAdmin.from("rendiciones").select("id, titulo_rendicion, gastos").eq("empresa_id", r.empresaId).neq("id", r.id).limit(500);
  const clave = (g: Pick<GastoRendicion, "rutProveedor" | "numeroDocumento" | "total">) =>
    g.rutProveedor && g.numeroDocumento ? `${g.rutProveedor.replace(/[.\s-]/g, "").toLowerCase()}|${String(g.numeroDocumento).trim()}|${Math.round(Number(g.total) || 0)}` : null;
  const vistas = new Map<string, { informeId: string; titulo: string }>();
  for (const otra of data ?? []) for (const g of (otra.gastos ?? []) as GastoRendicion[]) {
    const k = clave(g);
    if (k) vistas.set(k, { informeId: otra.id as string, titulo: otra.titulo_rendicion as string });
  }
  return r.gastos.map((g) => {
    const k = clave(g);
    return { ...g, duplicadoDe: (k && vistas.get(k)) || null };
  });
}

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

export async function crearRendicionAction(form: FormData): Promise<Resultado> {
  // Los errores vuelven como mensaje (para el formulario); el éxito redirige al informe.
  let id: string;
  try {
    id = await crearInforme(form);
  } catch (e) {
    return fallo(e);
  }
  revalidatePath("/rendir-gastos");
  redirect(`/rendir-gastos/${id}`);
}

async function crearInforme(form: FormData): Promise<string> {
  const { usuario, rol } = await exigirAccesoRendidor();

  const tituloRendicion = String(form.get("tituloRendicion") ?? "").trim().slice(0, 200);
  if (!tituloRendicion) throw new Error("El título del informe es obligatorio.");

  const fondoId = String(form.get("fondoId") ?? "").trim();
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  // Reembolsa la empresa en la que se está (en Odoo: 2 = Performance Service; el resto, 1).
  const empresaCompanyId = activa?.slug === "performance-service" ? 2 : 1;
  // Sin fondo: el informe se crea igual, a nombre de quien lo crea, y queda en borrador hasta que se
  // asocie a un fondo activo (con empresa pero sin fondo es justo lo que lo distingue de los antiguos).
  if (!fondoId) {
    if (!activa) throw new Error("No tienes una empresa activa.");
    const sinFondo = await crearRendicion(
      { nombreQuienRinde: usuario.nombre || usuario.correo.split("@")[0], rindeCorreo: usuario.correo.toLowerCase(), tituloRendicion, montoAsignado: 0, empresaCompanyId, empresaId: activa.id },
      usuario.id,
    );
    return sinFondo.id;
  }
  const fondo = await obtenerFondo(fondoId);
  if (!fondo || !activa || fondo.empresaId !== activa.id) throw new Error("Elige el fondo contra el que vas a rendir.");
  if (fondo.estado !== "activo") throw new Error("Ese fondo no está activo.");
  const params = await leerParametros(fondo.empresaId);
  const { count: abiertos } = await supabaseAdmin
    .from("rendiciones").select("id", { count: "exact", head: true })
    .eq("fondo_id", fondo.id).in("estado", ["borrador", "enviada", "rechazada"]);
  if ((abiertos ?? 0) >= params.maxInformesAbiertos) throw new Error("Ese fondo ya tiene un informe abierto: termínalo o envíalo antes de crear otro.");
  const montoAsignado = Math.max(0, fondo.saldo);

  // Quien rinde es el dueño del fondo: uno mismo, o —si administra gastos— a su nombre.
  const rinde = { correo: fondo.rendidorCorreo, nombre: fondo.rendidorNombre };
  if (rinde.correo !== usuario.correo.toLowerCase() && !puedeVerRendicionesAjenas(usuario.rol, rol)) {
    throw new Error("Ese fondo es de otra persona.");
  }

  const rendicion = await crearRendicion(
    { nombreQuienRinde: rinde.nombre, rindeCorreo: rinde.correo, tituloRendicion, montoAsignado, empresaCompanyId, fondoId: fondo.id, empresaId: fondo.empresaId },
    usuario.id,
  );

  return rendicion.id;
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
    if (r?.fondoId) return await moverInformeConFondo(r, accion, nota, usuario, rol === "admin");
    const mia = r ? esMia(r, usuario) : false;
    // Informe sin fondo de una empresa: también lo revisa quien tiene el rol de revisor en ella.
    const revisorEmpresa = r?.empresaId && !mia ? (await rolesDe(usuario, rol === "admin", r.empresaId)).includes("revisor") : false;
    const revisa = puedeVerRendicionesAjenas(usuario.rol, rol) || revisorEmpresa;
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
        const obs = (nota ?? "").trim().slice(0, 1000);
        const problemas = problemasParaEnviar(r.gastos, Boolean(obs));
        if (problemas.length) return { ok: false, error: problemas.join(" ") };
        hecho = await cambiarEstado(id, ["borrador", "rechazada"], "enviada", { enviada_en: ahora, motivo_rechazo: null, revisada_por: null, revisada_en: null });
        if (hecho) {
          if (obs) await auditar("informe", id, r.estado, "enviada", yo, `Enviada con observaciones: ${obs}`);
          await avisar(await correosRevisores(), yo, r, "enviada", `Rendición por revisar: ${r.tituloRendicion}`, `${r.nombreQuienRinde} · ${total}${obs ? ` · Observaciones: ${obs}` : ""}`, "alerta");
        }
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

/**
 * El ciclo de un informe con fondo: enviar → (observar ⇄ reenviar) → aprobar → cierre.
 * Solo un revisor (que no sea quien rinde) aprueba u observa. Al aprobar se ejecuta el cierre.
 */
async function moverInformeConFondo(
  r: Rendicion,
  accion: AccionRendicion,
  nota: string | undefined,
  usuario: Awaited<ReturnType<typeof exigirAccesoRendidor>>["usuario"],
  esAdminModulo: boolean,
): Promise<Resultado> {
  const yo = usuario.correo.toLowerCase();
  const mia = esMia(r, usuario);
  const roles = await rolesParaInforme(r, usuario, esAdminModulo);
  // Lo propio es lo de quien rinde: quien lo creó a su nombre (un admin) sí puede revisarlo.
  const rinde = r.rindeCorreo?.toLowerCase() === yo;
  const revisor = roles.includes("revisor") && !rinde;
  if (!mia && !revisor && usuario.rol !== "admin") return { ok: false, error: "No encontramos ese informe." };
  const ahora = new Date().toISOString();
  const total = money(totalDe(r));
  const condicionado = async (desde: string[], hacia: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabaseAdmin.from("rendiciones").update({ estado: hacia, ...extra, actualizado_en: ahora }).eq("id", r.id).in("estado", desde).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("El informe cambió mientras tanto. Recarga la página.");
    await auditar("informe", r.id, r.estado, hacia, yo, (extra.motivo_rechazo as string) ?? null);
  };

  switch (accion) {
    case "enviar": {
      if (!mia && usuario.rol !== "admin") return { ok: false, error: "Solo quien rinde (o el administrador) envía el informe." };
      const fondo = r.fondoId ? await obtenerFondo(r.fondoId) : null;
      if (fondo?.estado !== "activo") return { ok: false, error: "El fondo de este informe ya no está activo." };
      const obs = (nota ?? "").trim().slice(0, 1000);
      const problemas = problemasParaEnviar(r.gastos, Boolean(obs));
      if (problemas.length) return { ok: false, error: problemas.join(" ") };
      // Las observadas que se corrigieron vuelven a «cargada»; se marcan los posibles duplicados.
      const gastos = (await marcarDuplicados(r)).map((g) => (g.revision?.estado === "observada" ? { ...g, revision: { ...g.revision, estado: "cargada" as EstadoBoleta } } : g));
      await condicionado(["borrador", "rechazada"], "enviada", { enviada_en: ahora, motivo_rechazo: null, revisada_por: null, revisada_en: null, gastos, ciclo_revision: r.cicloRevision + 1 });
      if (obs) await auditar("informe", r.id, "enviada", "enviada", yo, `Enviado con observaciones: ${obs}`);
      const dup = gastos.filter((g) => g.duplicadoDe).length;
      await avisarInforme(await correosConRol(r.empresaId!, "revisor"), yo, r, "enviada", `Informe por revisar: ${r.tituloRendicion}`, `${r.nombreQuienRinde} · ${total}${dup ? ` · ${dup} posible(s) duplicado(s)` : ""}${obs ? ` · Observaciones: ${obs}` : ""}`, "alerta");
      break;
    }
    case "retirar":
      if (!mia) return { ok: false, error: "Solo quien rinde retira el informe." };
      await condicionado(["enviada"], "borrador", { enviada_en: null });
      break;
    case "aprobar": {
      if (!revisor) return { ok: false, error: "Solo un revisor (que no sea quien rinde) aprueba informes." };
      if (r.gastos.some((g) => g.revision?.estado === "observada")) return { ok: false, error: "Hay boletas observadas: acéptalas o devuelve el informe con «Observar»." };
      const gastos = r.gastos.map((g) => ((g.revision?.estado ?? "cargada") === "cargada" ? { ...g, revision: { estado: "aceptada" as EstadoBoleta, por: yo, en: ahora } } : g));
      await condicionado(["enviada"], "aprobada", { revisada_por: yo, revisada_en: ahora, motivo_rechazo: null, gastos });
      await aprobacion("informe", r.id, yo, "aprueba");
      const cierre = await cerrarInformeAprobado({ ...r, estado: "aprobada", gastos }, yo);
      await avisarInforme(
        r.rindeCorreo ? [r.rindeCorreo] : [], yo, r, "aprobada", `Aprobaron tu informe: ${r.tituloRendicion}`,
        cierre.estado === "reembolso_pendiente" ? `Gastaste más que el fondo: Tesorería te reembolsará ${money(-cierre.saldo)}.` : `Por ${usuario.nombre ?? yo} · ${total}`,
      );
      break;
    }
    case "rechazar": {
      if (!revisor) return { ok: false, error: "Solo un revisor observa informes." };
      const motivo = (nota ?? "").trim().slice(0, 1000);
      if (!motivo) return { ok: false, error: "Escribe qué hay que corregir." };
      await condicionado(["enviada"], "rechazada", { revisada_por: yo, revisada_en: ahora, motivo_rechazo: motivo });
      await aprobacion("informe", r.id, yo, "observa", motivo);
      await avisarInforme(r.rindeCorreo ? [r.rindeCorreo] : [], yo, r, "observada", `Observaron tu informe: ${r.tituloRendicion}`, motivo, "alerta");
      break;
    }
    default:
      return { ok: false, error: "Ese paso no corresponde a un informe con fondo." };
  }
  revalidatePath(`/rendir-gastos/${r.id}`);
  revalidatePath("/rendir-gastos", "layout");
  return { ok: true };
}

async function avisarInforme(para: string[], actor: string, r: Rendicion, tipo: string, titulo: string, cuerpo?: string, severidad: "info" | "alerta" = "info") {
  await avisar(para, actor, r, tipo, titulo, cuerpo, severidad);
}

/** Quien revisa marca una boleta: aceptada, observada (con qué corregir) o rechazada (con motivo). */
export async function revisarBoletaAction(id: string, gastoId: string, estado: EstadoBoleta, motivo?: string): Promise<Resultado> {
  try {
    const { usuario, rol } = await exigirAccesoRendidor();
    const r = await obtenerRendicion(id);
    if (!r?.fondoId) return { ok: false, error: "Ese informe no se revisa boleta por boleta." };
    const roles = await rolesParaInforme(r, usuario, rol === "admin");
    if (!roles.includes("revisor") || r.rindeCorreo?.toLowerCase() === usuario.correo.toLowerCase()) return { ok: false, error: "Solo un revisor (que no sea quien rinde) revisa boletas." };
    if (r.estado !== "enviada") return { ok: false, error: "El informe no está en revisión." };
    if (!["aceptada", "observada", "rechazada"].includes(estado)) return { ok: false, error: "Estado inválido." };
    const m = (motivo ?? "").trim().slice(0, 500);
    if (estado !== "aceptada" && !m) return { ok: false, error: "Escribe el motivo." };
    const yo = usuario.correo.toLowerCase();
    const gastos = r.gastos.map((g) => (g.id === gastoId ? { ...g, revision: { estado, motivo: m || null, por: yo, en: new Date().toISOString() } } : g));
    const { error } = await supabaseAdmin.from("rendiciones").update({ gastos, actualizado_en: new Date().toISOString() }).eq("id", id).eq("estado", "enviada");
    if (error) throw new Error(error.message);
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

// ---------- «Mis gastos» → informe ------------------------------------------------------

/**
 * Pasa gastos de una rendición a otra: de la bolsa («Mis gastos») a un informe, o de vuelta.
 * Las dos tienen que ser de esta persona y estar en sus manos (borrador u observada).
 */
export async function moverGastosAction(desdeId: string, haciaId: string, gastoIds: string[]): Promise<Resultado> {
  try {
    const { usuario } = await exigirAccesoRendidor();
    const [desde, hacia] = await Promise.all([obtenerRendicion(desdeId), obtenerRendicion(haciaId)]);
    if (!desde || !hacia) return { ok: false, error: "No encontramos el origen o el destino." };
    if (!esMia(desde, usuario) || !esMia(hacia, usuario)) return { ok: false, error: "Solo puedes mover tus propios gastos." };
    // Cada empresa es independiente: un gasto no pasa a un informe de otra empresa.
    const empresa = await empresaActivaRG(usuario);
    if (!empresa || !enEmpresaRG(desde.empresaId, empresa) || !enEmpresaRG(hacia.empresaId, empresa)) return { ok: false, error: "Ese informe es de otra empresa: cambia de empresa para usarlo." };
    if (!esEditable(desde.estado) || !esEditable(hacia.estado)) return { ok: false, error: "Ese informe ya no se puede editar." };
    const ids = new Set(gastoIds);
    const mover = desde.gastos.filter((g) => ids.has(g.id));
    if (!mover.length) return { ok: false, error: "Elige al menos un gasto." };
    const quedan = desde.gastos.filter((g) => !ids.has(g.id)).map((g, i) => ({ ...g, orden: i }));
    const llegan = [...hacia.gastos, ...mover.map((g) => ({ ...g, revision: null, duplicadoDe: null }))].map((g, i) => ({ ...g, orden: i }));
    // Primero se agregan al destino y después se sacan del origen: si falla a medias, se duplica
    // (visible y corregible) en vez de perderse.
    const ahora = new Date().toISOString();
    const e1 = (await supabaseAdmin.from("rendiciones").update({ gastos: llegan, actualizado_en: ahora }).eq("id", haciaId).in("estado", ["borrador", "rechazada"])).error;
    if (e1) throw new Error(e1.message);
    const e2 = (await supabaseAdmin.from("rendiciones").update({ gastos: quedan, actualizado_en: ahora }).eq("id", desdeId)).error;
    if (e2) throw new Error(e2.message);
    revalidatePath("/rendir-gastos", "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Proveedores --------------------------------------------------------

/** Alta rápida de un proveedor desde el popup de un gasto (queda en Contactos). */
export async function crearProveedorAction(razonSocial: string, rut: string): Promise<{ ok: true; proveedor: ProveedorOpcion } | { ok: false; error: string }> {
  try {
    const { usuario } = await exigirAccesoRendidor();
    const proveedor = await crearProveedorRapido(razonSocial, rut, usuario.correo);
    return { ok: true, proveedor };
  } catch (e) {
    if (typeof e === "object" && e !== null && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
    return { ok: false, error: e instanceof Error ? e.message.replace(/^\[contactos\]\s*/, "") : "No pudimos crear el proveedor." };
  }
}

// ---------- Gastos repetidos ---------------------------------------------------------

/** Los gastos de esta rendición que parecen repetidos (en cualquier estado), para avisar al ingresarlos. */
export async function repetidosAction(rendicionId: string): Promise<Record<string, Repetido[]>> {
  try {
    const { usuario, rol } = await exigirAccesoRendidor();
    const r = await obtenerRendicion(rendicionId);
    if (!r || !puedeAbrirRendicion(r.creadoPor, usuario.id, usuario.rol, rol, r.rindeCorreo, usuario.correo)) return {};
    const empresa = await empresaActivaRG(usuario);
    if (!empresa || !enEmpresaRG(r.empresaId, empresa)) return {};
    return await repetidosDe([rendicionId], empresa);
  } catch {
    return {};
  }
}

// ---------- Ver el documento de un gasto ---------------------------------------------------

/** Un enlace temporal para ver el documento de respaldo de un gasto (de quien puede abrir esa rendición). */
export async function respaldoDeGastoAction(rendicionId: string, gastoId: string): Promise<{ ok: true; url: string; nombre: string; esPdf: boolean } | { ok: false; error: string }> {
  try {
    const { usuario, rol } = await exigirAccesoRendidor();
    const r = await obtenerRendicion(rendicionId);
    if (!r) return { ok: false, error: "No encontramos ese gasto." };
    if (!puedeAbrirRendicion(r.creadoPor, usuario.id, usuario.rol, rol, r.rindeCorreo, usuario.correo)) {
      // Quien administra Fondos también ve los documentos de todos.
      const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
      const roles = activa && enEmpresaRG(r.empresaId, { id: activa.id, porOmision: activa.slug === SLUG_POR_OMISION }) ? await rolesDe(usuario, false, activa.id) : [];
      if (!roles.includes("administrador")) return { ok: false, error: "No encontramos ese gasto." };
    }
    const g = r.gastos.find((x) => x.id === gastoId);
    if (!g?.archivoPath) return { ok: false, error: "Este gasto no tiene documento." };
    const url = await urlFirmadaDeRespaldo(g.archivoPath);
    if (!url) return { ok: false, error: "No pudimos abrir el documento." };
    return { ok: true, url, nombre: g.archivoNombre || "documento", esPdf: g.archivoTipo === "application/pdf" || g.archivoNombre?.toLowerCase().endsWith(".pdf") };
  } catch (e) {
    if (typeof e === "object" && e !== null && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
    return { ok: false, error: "No pudimos abrir el documento." };
  }
}

// ---------- Informe sin fondo: asociarlo a un fondo ------------------------------------------

/** Liga un informe en borrador (creado sin fondo) a uno de los fondos ACTIVOS de quien rinde. */
export async function asociarFondoAction(informeId: string, fondoId: string): Promise<Resultado> {
  try {
    const { usuario } = await exigirAccesoRendidor();
    const r = await obtenerRendicion(informeId);
    if (!r || !esMia(r, usuario)) return { ok: false, error: "No encontramos ese informe." };
    if (r.fondoId || !r.empresaId) return { ok: false, error: "Este informe ya tiene fondo." };
    if (!esEditable(r.estado)) return { ok: false, error: "El informe ya no se puede editar." };
    const fondo = await obtenerFondo(fondoId);
    if (!fondo || fondo.empresaId !== r.empresaId || fondo.rendidorCorreo !== usuario.correo.toLowerCase()) return { ok: false, error: "Elige uno de tus fondos." };
    if (fondo.estado !== "activo") return { ok: false, error: "Ese fondo no está activo." };
    const params = await leerParametros(fondo.empresaId);
    const { count: abiertos } = await supabaseAdmin
      .from("rendiciones").select("id", { count: "exact", head: true })
      .eq("fondo_id", fondo.id).in("estado", ["borrador", "enviada", "rechazada"]);
    if ((abiertos ?? 0) >= params.maxInformesAbiertos) return { ok: false, error: "Ese fondo ya tiene un informe abierto: termínalo o envíalo antes de asociar otro." };
    const { error } = await supabaseAdmin
      .from("rendiciones")
      .update({ fondo_id: fondo.id, monto_asignado: Math.max(0, fondo.saldo), actualizado_en: new Date().toISOString() })
      .eq("id", informeId)
      .is("fondo_id", null);
    if (error) throw new Error(error.message);
    await auditar("informe", informeId, r.estado, r.estado, usuario.correo.toLowerCase(), `Asociado al fondo ${fondo.codigo}`);
    revalidatePath(`/rendir-gastos/${informeId}`);
    revalidatePath("/rendir-gastos", "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
