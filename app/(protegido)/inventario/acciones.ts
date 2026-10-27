"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import {
  actualizarProducto,
  ajustarInventario,
  cancelarTransferencia,
  crearAlmacen,
  crearCategoria,
  crearLote,
  crearProducto,
  crearTransferencia,
  crearUbicacion,
  crearUnidad,
  desactivarProducto,
  eliminarRegla,
  guardarRegla,
  reservarTransferencia,
  validarTransferencia,
  type LineaNueva,
} from "@/lib/inventario";

const SLUG = "inventario";

export type Resultado = { ok: true; id?: string; mensaje?: string } | { ok: false; error: string };

function fallo(e: unknown): Resultado {
  const error = e instanceof Error ? e.message.replace(/^\[inventario\]\s*/, "") : "Ocurrió un error inesperado.";
  return { ok: false, error };
}

function refrescar(...rutas: string[]): void {
  for (const r of rutas) revalidatePath(r);
}

// -------- Productos ----------------------------------------------------------

export async function crearProductoAction(fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    const nombre = String(fd.get("nombre") ?? "").trim();
    if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
    const id = await crearProducto({
      nombre,
      sku: String(fd.get("sku") ?? "").trim() || null,
      descripcion: String(fd.get("descripcion") ?? "").trim() || null,
      categoriaId: String(fd.get("categoriaId") ?? "") || null,
      unidadId: String(fd.get("unidadId") ?? "") || null,
      tipo: String(fd.get("tipo") ?? "almacenable"),
      seguimiento: String(fd.get("seguimiento") ?? "ninguno"),
      costo: Number(fd.get("costo") ?? 0) || 0,
      precio: Number(fd.get("precio") ?? 0) || 0,
    });
    refrescar("/inventario", "/inventario/productos");
    return { ok: true, id };
  } catch (e) {
    return fallo(e);
  }
}

export async function actualizarProductoAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    await actualizarProducto(id, {
      nombre: String(fd.get("nombre") ?? "").trim(),
      sku: String(fd.get("sku") ?? "").trim() || null,
      descripcion: String(fd.get("descripcion") ?? "").trim() || null,
      categoria_id: String(fd.get("categoriaId") ?? "") || null,
      unidad_id: String(fd.get("unidadId") ?? "") || null,
      tipo: String(fd.get("tipo") ?? "almacenable"),
      seguimiento: String(fd.get("seguimiento") ?? "ninguno"),
      costo: Number(fd.get("costo") ?? 0) || 0,
      precio: Number(fd.get("precio") ?? 0) || 0,
    });
    refrescar("/inventario", "/inventario/productos", `/inventario/productos/${id}`);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function desactivarProductoAction(id: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    await desactivarProducto(id);
    refrescar("/inventario", "/inventario/productos");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// -------- Catálogos de configuración -----------------------------------------

export async function crearCategoriaAction(fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    const nombre = String(fd.get("nombre") ?? "").trim();
    if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
    await crearCategoria(nombre);
    refrescar("/inventario/configuracion", "/inventario/productos");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function crearUnidadAction(fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    const nombre = String(fd.get("nombre") ?? "").trim();
    const abreviacion = String(fd.get("abreviacion") ?? "").trim();
    if (!nombre || !abreviacion) return { ok: false, error: "Nombre y abreviación son obligatorios." };
    await crearUnidad(nombre, abreviacion);
    refrescar("/inventario/configuracion");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function crearAlmacenAction(fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    const nombre = String(fd.get("nombre") ?? "").trim();
    const codigo = String(fd.get("codigo") ?? "").trim();
    if (!nombre || !codigo) return { ok: false, error: "Nombre y código son obligatorios." };
    await crearAlmacen(nombre, codigo);
    refrescar("/inventario/ubicaciones");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function crearUbicacionAction(fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    const nombre = String(fd.get("nombre") ?? "").trim();
    if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
    await crearUbicacion({
      nombre,
      tipo: String(fd.get("tipo") ?? "interna"),
      codigo: String(fd.get("codigo") ?? "").trim() || null,
      almacenId: String(fd.get("almacenId") ?? "") || null,
    });
    refrescar("/inventario/ubicaciones");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// -------- Lotes y reglas -----------------------------------------------------

export async function crearLoteAction(productoId: string, fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    const nombre = String(fd.get("nombre") ?? "").trim();
    if (!nombre) return { ok: false, error: "El nombre/número del lote es obligatorio." };
    const id = await crearLote(productoId, nombre, String(fd.get("fechaVencimiento") ?? "") || null);
    refrescar(`/inventario/productos/${productoId}`);
    return { ok: true, id };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarReglaAction(fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    const productoId = String(fd.get("productoId") ?? "");
    const ubicacionId = String(fd.get("ubicacionId") ?? "");
    if (!productoId || !ubicacionId) return { ok: false, error: "Falta el producto o la ubicación." };
    await guardarRegla({
      productoId,
      ubicacionId,
      minimo: Number(fd.get("minimo") ?? 0) || 0,
      maximo: Number(fd.get("maximo") ?? 0) || 0,
    });
    refrescar("/inventario/reabastecimiento", `/inventario/productos/${productoId}`);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarReglaAction(id: string, productoId: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    await eliminarRegla(id);
    refrescar("/inventario/reabastecimiento", `/inventario/productos/${productoId}`);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// -------- Transferencias (operaciones) ---------------------------------------

export async function crearTransferenciaAction(datos: {
  tipoOperacionId: string;
  contraparte?: string | null;
  nota?: string | null;
  fechaProgramada?: string | null;
  lineas: LineaNueva[];
}): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG);
    if (!datos.tipoOperacionId) return { ok: false, error: "Elige un tipo de operación." };
    const lineas = (datos.lineas ?? []).filter((l) => l.productoId && l.cantidad > 0);
    if (lineas.length === 0) return { ok: false, error: "Agrega al menos una línea con producto y cantidad." };
    const id = await crearTransferencia({ ...datos, lineas, creadoPor: usuario.correo });
    refrescar("/inventario", "/inventario/operaciones");
    return { ok: true, id };
  } catch (e) {
    return fallo(e);
  }
}

export async function reservarAction(id: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    await reservarTransferencia(id);
    refrescar("/inventario", "/inventario/operaciones", `/inventario/operaciones/${id}`);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function validarAction(id: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    await validarTransferencia(id);
    refrescar("/inventario", "/inventario/operaciones", `/inventario/operaciones/${id}`, "/inventario/productos");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function cancelarAction(id: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG);
    await cancelarTransferencia(id);
    refrescar("/inventario", "/inventario/operaciones", `/inventario/operaciones/${id}`);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// -------- Ajuste de inventario -----------------------------------------------

export async function ajustarAction(datos: {
  productoId: string;
  ubicacionId: string;
  loteId?: string | null;
  cantidadContada: number;
}): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG);
    if (!datos.productoId || !datos.ubicacionId) return { ok: false, error: "Falta el producto o la ubicación." };
    const r = await ajustarInventario({ ...datos, creadoPor: usuario.correo });
    refrescar("/inventario", "/inventario/ajustes", "/inventario/productos", `/inventario/productos/${datos.productoId}`);
    return { ok: true, mensaje: r ? `Ajuste ${r.referencia}: ${r.diferencia > 0 ? "+" : ""}${r.diferencia}` : "Sin diferencia que ajustar." };
  } catch (e) {
    return fallo(e);
  }
}

// Evita el error de "módulo sin acceso" por si se navega directo: las páginas ya
// lo exigen, pero dejamos el guard disponible para acciones futuras.
export async function verificarAcceso(): Promise<void> {
  await exigirAccesoApp(SLUG);
}
