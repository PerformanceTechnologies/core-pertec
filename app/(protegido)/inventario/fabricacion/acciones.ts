"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import {
  actualizarCostosDesdeInventario,
  actualizarFabricacion,
  actualizarItem,
  agregarItem,
  archivarFabricacion,
  cambiarEstado,
  crearFabricacion,
  duplicarFabricacion,
  eliminarItem,
  restaurarFabricacion,
  type DatosFabricacion,
  type DatosItem,
} from "@/lib/fabricacion";
import { esGrupoCosto, leerNumero, limpiarTexto } from "@/lib/fabricacion-modelo";
import { exigirPermisoDeArchivar } from "@/lib/inventario-archivado";
import type { Resultado } from "@/app/(protegido)/inventario/acciones";

// Server Actions de Fabricación. Cada una vuelve a comprobar el acceso a la app: se pueden invocar
// directo por HTTP, sin pasar por la pantalla. Los ids vienen del cliente y se validan como uuid.

const SLUG = "inventario";
const UUID = /^[0-9a-f-]{36}$/;
const RUTA = "/inventario/fabricacion";

function fallo(e: unknown): Resultado {
  const error = e instanceof Error ? e.message.replace(/^\[inventario\]\s*/, "") : "Ocurrió un error inesperado.";
  return { ok: false, error };
}

function refrescar(id?: string): void {
  revalidatePath(RUTA);
  if (id) revalidatePath(`${RUTA}/${id}`);
}

const uuidONull = (v: FormDataEntryValue | null): string | null => {
  const t = String(v ?? "").trim();
  return UUID.test(t) ? t : null;
};

/** Lee y valida el formulario de la ficha. Devuelve el error en palabras si algo no cuadra. */
function leerFicha(fd: FormData): { ok: true; datos: DatosFabricacion } | { ok: false; error: string } {
  const nombre = limpiarTexto(fd.get("nombre"), 120);
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  const rendimiento = leerNumero(fd.get("rendimiento"));
  const indirectosPct = leerNumero(fd.get("indirectosPct"));
  const margenPct = leerNumero(fd.get("margenPct"));
  const precioVenta = leerNumero(fd.get("precioVenta"));
  if (!Number.isFinite(rendimiento) || rendimiento <= 0) return { ok: false, error: "El rendimiento tiene que ser mayor que 0." };
  if (!Number.isFinite(indirectosPct) || indirectosPct < 0 || indirectosPct > 1000) return { ok: false, error: "Los gastos indirectos van de 0 % a 1000 %." };
  if (!Number.isFinite(margenPct) || margenPct < 0 || margenPct >= 100) return { ok: false, error: "El margen va de 0 % a menos de 100 %." };
  if (!Number.isFinite(precioVenta) || precioVenta < 0) return { ok: false, error: "El precio de venta no puede ser negativo." };
  return {
    ok: true,
    datos: {
      codigo: limpiarTexto(fd.get("codigo"), 40).toUpperCase() || null,
      nombre,
      descripcion: limpiarTexto(fd.get("descripcion"), 600) || null,
      unidadId: uuidONull(fd.get("unidadId")),
      productoId: uuidONull(fd.get("productoId")),
      rendimiento,
      indirectosPct,
      margenPct,
      precioVenta,
      notas: String(fd.get("notas") ?? "").trim().slice(0, 2000) || null,
    },
  };
}

function leerItem(fd: FormData): { ok: true; datos: DatosItem } | { ok: false; error: string } {
  const grupo = fd.get("grupo");
  if (!esGrupoCosto(grupo)) return { ok: false, error: "Elige el tipo de costo." };
  const descripcion = limpiarTexto(fd.get("descripcion"), 160);
  if (!descripcion) return { ok: false, error: "Escribe qué es este ítem." };
  const cantidad = leerNumero(fd.get("cantidad"));
  const costoUnitario = leerNumero(fd.get("costoUnitario"));
  const mermaPct = leerNumero(fd.get("mermaPct"));
  if (!Number.isFinite(cantidad) || cantidad < 0) return { ok: false, error: "La cantidad tiene que ser un número de 0 para arriba." };
  if (!Number.isFinite(costoUnitario) || costoUnitario < 0) return { ok: false, error: "El costo unitario tiene que ser un número de 0 para arriba." };
  if (!Number.isFinite(mermaPct) || mermaPct < 0 || mermaPct > 100) return { ok: false, error: "La merma va de 0 % a 100 %." };
  return {
    ok: true,
    datos: {
      grupo,
      descripcion,
      // Solo un material puede venir del catálogo: la mano de obra no es un producto con stock.
      productoId: grupo === "material" ? uuidONull(fd.get("productoId")) : null,
      unidad: limpiarTexto(fd.get("unidad"), 16) || "un",
      cantidad,
      costoUnitario,
      mermaPct,
      nota: limpiarTexto(fd.get("nota"), 300) || null,
    },
  };
}

// -------- Ficha ----------------------------------------------------------------

export async function crearFabricacionAction(fd: FormData): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG);
    const l = leerFicha(fd);
    if (!l.ok) return l;
    const id = await crearFabricacion(l.datos, usuario.correo);
    refrescar();
    return { ok: true, id };
  } catch (e) {
    return fallo(e);
  }
}

export async function actualizarFabricacionAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    if (!UUID.test(id)) return { ok: false, error: "Producto inválido." };
    const l = leerFicha(fd);
    if (!l.ok) return l;
    await actualizarFabricacion(id, l.datos);
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function cambiarEstadoFabricacionAction(id: string, estado: "borrador" | "activo"): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    if (!UUID.test(id)) return { ok: false, error: "Producto inválido." };
    if (estado !== "borrador" && estado !== "activo") return { ok: false, error: "Estado inválido." };
    await cambiarEstado(id, estado);
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function duplicarFabricacionAction(id: string): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG);
    if (!UUID.test(id)) return { ok: false, error: "Producto inválido." };
    const nuevo = await duplicarFabricacion(id, usuario.correo);
    refrescar();
    return { ok: true, id: nuevo };
  } catch (e) {
    return fallo(e);
  }
}

/** Archivar y restaurar: mismo permiso que archivar productos del catálogo (admin del Core o «Administrador de inventario»). */
export async function archivarFabricacionAction(id: string): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG);
    if (!UUID.test(id)) return { ok: false, error: "Producto inválido." };
    await exigirPermisoDeArchivar(usuario);
    await archivarFabricacion(id, usuario.correo);
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function restaurarFabricacionAction(id: string): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG);
    if (!UUID.test(id)) return { ok: false, error: "Producto inválido." };
    await exigirPermisoDeArchivar(usuario);
    await restaurarFabricacion(id);
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// -------- Ítems de costo --------------------------------------------------------

export async function guardarItemAction(fabricacionId: string, itemId: string | null, fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    if (!UUID.test(fabricacionId) || (itemId !== null && !UUID.test(itemId))) return { ok: false, error: "Ítem inválido." };
    const l = leerItem(fd);
    if (!l.ok) return l;
    if (itemId) await actualizarItem(fabricacionId, itemId, l.datos);
    else await agregarItem(fabricacionId, l.datos);
    refrescar(fabricacionId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarItemAction(fabricacionId: string, itemId: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    if (!UUID.test(fabricacionId) || !UUID.test(itemId)) return { ok: false, error: "Ítem inválido." };
    await eliminarItem(fabricacionId, itemId);
    refrescar(fabricacionId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function actualizarCostosAction(fabricacionId: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    if (!UUID.test(fabricacionId)) return { ok: false, error: "Producto inválido." };
    const n = await actualizarCostosDesdeInventario(fabricacionId);
    refrescar(fabricacionId);
    return { ok: true, mensaje: n === 0 ? "Los costos ya estaban al día con el catálogo." : `Se actualizó el costo de ${n} ${n === 1 ? "ítem" : "ítems"}.` };
  } catch (e) {
    return fallo(e);
  }
}
