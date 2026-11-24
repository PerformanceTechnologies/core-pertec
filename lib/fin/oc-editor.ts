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
  const [personas, indicadores, empresa, puedeCrearProveedor, catalogo] = await Promise.all([
    candidatosDeFlujo(),
    // Sin red o sin respuesta del proveedor de indicadores: el formulario sigue, pidiendo el valor a mano.
    obtenerIndicadores().then((r) => r.indicadores).catch(() => []),
    supabaseAdmin.from("empresas").select("condiciones_oc").eq("id", ctx.empresa.id).maybeSingle(),
    // Crear un proveedor desde la solicitud pide acceso a Contactos: sin él no se ofrece el botón.
    puedeGestionarContactos(ctx.usuario),
    catalogoDeCompra(ctx.empresa.id),
  ]);
  const valor = (codigo: string) => indicadores.find((i) => i.codigo === codigo)?.valor ?? null;
  return {
    proveedores: v.contrapartes.filter((c) => c.esProveedor || !c.esCliente).map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut })),
    proyectos: v.proyectos.filter((p) => !p.esGeneral && p.estado === "activo").map((p) => ({ id: p.id, nombre: p.nombre })),
    // La lista maestra de gastos de Finanzas, agrupada por categoría (solo egresos que son gasto).
    tiposGasto: v.categorias
      .filter((c) => c.activa && c.sentido === "egreso")
      .sort((a, b) => a.orden - b.orden)
      .map((c) => ({ categoria: c.nombre, opciones: v.subcategorias.filter((s) => s.activa && s.categoriaId === c.id).map((s) => ({ id: s.id, nombre: s.nombre })) }))
      .filter((g) => g.opciones.length > 0),
    personas,
    yo: { id: ctx.usuario.id, nombre: ctx.usuario.nombre?.trim() || ctx.usuario.correo.split("@")[0] },
    indicadores: { uf: valor("uf"), dolar: valor("dolar") },
    tasaIva: v.p.tasaIva,
    puedeCrearProveedor,
    catalogo,
    condicionesEmpresa: ((empresa.data as { condiciones_oc?: string | null } | null)?.condiciones_oc ?? "").trim() || CONDICIONES_OC_POR_OMISION,
  };
}

export type ProductoCatalogo = { id: string; nombre: string; sku: string | null; tipo: string; costo: number; unidad: string | null };

/** Productos y servicios del inventario de la empresa, para elegirlos al armar la compra (con su costo). */
async function catalogoDeCompra(empresaId: string): Promise<ProductoCatalogo[]> {
  const [{ data: ps }, { data: us }] = await Promise.all([
    supabaseAdmin.from("inv_productos").select("id, nombre, sku, tipo, costo, unidad_id").eq("activo", true).eq("empresa_id", empresaId).order("nombre").limit(3000),
    supabaseAdmin.from("inv_unidades").select("id, abreviacion"),
  ]);
  const abrev = new Map((us ?? []).map((u) => [u.id as string, u.abreviacion as string]));
  return (ps ?? []).map((p) => ({ id: p.id as string, nombre: p.nombre as string, sku: (p.sku as string | null) ?? null, tipo: p.tipo as string, costo: Number(p.costo ?? 0), unidad: p.unidad_id ? abrev.get(p.unidad_id as string) ?? null : null }));
}
