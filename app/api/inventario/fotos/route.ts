import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { agregarFotoProducto } from "@/lib/inventario";
import { normalizarFotoProducto } from "@/lib/inventario-fotos";
import { TIPOS_FOTO_PRODUCTO } from "@/lib/inventario-modelo";
import { LIMITE_SUBIDA } from "@/lib/subidas";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Sube UNA foto de un producto (el navegador manda varias de a una). Va a SharePoint. */
export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi("inventario");
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario." }, { status: 400 });
  }
  const productoId = String(fd.get("productoId") ?? "");
  const archivo = fd.get("archivo");
  if (!/^[0-9a-f-]{36}$/.test(productoId)) return NextResponse.json({ error: "Producto inválido." }, { status: 400 });
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
  if (!Object.hasOwn(TIPOS_FOTO_PRODUCTO, archivo.type)) {
    return NextResponse.json({ error: `"${archivo.name}" no es una foto. Sube JPG, PNG, WEBP o HEIC.` }, { status: 400 });
  }
  if (archivo.size > LIMITE_SUBIDA) return NextResponse.json({ error: `"${archivo.name}" pasa el tope de 4 MB.` }, { status: 413 });

  let foto;
  try {
    foto = await normalizarFotoProducto(Buffer.from(await archivo.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: `"${archivo.name}" no se pudo leer como imagen.` }, { status: 400 });
  }
  try {
    await agregarFotoProducto(productoId, { ...foto, nombre: archivo.name });
    revalidatePath("/inventario/productos");
    revalidatePath(`/inventario/productos/${productoId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message.replace(/^\[inventario\]\s*/, "") : "No se pudo subir la foto.";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
