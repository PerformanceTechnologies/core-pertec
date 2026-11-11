import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import { obtenerIndicadores } from "../indicadores";
import type { ContextoFin, VistaFin } from "./datos";
import { candidatosDeFlujo } from "./flujos";
import { puedeGestionarContactos } from "../contactos";
import { CONDICIONES_OC_POR_OMISION } from "./oc-modelo";

/**
 * Todo lo que el formulario de solicitud necesita además de la propia compra: proveedores, proyectos, a quién se puede
 * poner como solicitante, el valor de hoy de la UF y el dólar, y las condiciones generales de la empresa.
 */
export async function apoyoDelEditor(ctx: ContextoFin, v: VistaFin) {
  const [personas, indicadores, empresa, puedeCrearProveedor] = await Promise.all([
    candidatosDeFlujo(),
    // Sin red o sin respuesta del proveedor de indicadores: el formulario sigue, pidiendo el valor a mano.
    obtenerIndicadores().then((r) => r.indicadores).catch(() => []),
    supabaseAdmin.from("empresas").select("condiciones_oc").eq("id", ctx.empresa.id).maybeSingle(),
    // Crear un proveedor desde la solicitud pide acceso a Contactos: sin él no se ofrece el botón.
    puedeGestionarContactos(ctx.usuario),
  ]);
  const valor = (codigo: string) => indicadores.find((i) => i.codigo === codigo)?.valor ?? null;
  return {
    proveedores: v.contrapartes.filter((c) => c.esProveedor || !c.esCliente).map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut })),
    proyectos: v.proyectos.filter((p) => !p.esGeneral && p.estado === "activo").map((p) => ({ id: p.id, nombre: p.nombre })),
    personas,
    yo: { id: ctx.usuario.id, nombre: ctx.usuario.nombre?.trim() || ctx.usuario.correo.split("@")[0] },
    indicadores: { uf: valor("uf"), dolar: valor("dolar") },
    tasaIva: v.p.tasaIva,
    puedeCrearProveedor,
    condicionesEmpresa: ((empresa.data as { condiciones_oc?: string | null } | null)?.condiciones_oc ?? "").trim() || CONDICIONES_OC_POR_OMISION,
  };
}
