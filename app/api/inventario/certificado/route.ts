import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { guardarCertificado } from "@/lib/inventario";
import { TIPOS_CERTIFICADO } from "@/lib/inventario-modelo";
import { LIMITE_SUBIDA } from "@/lib/subidas";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * Sube el certificado de un producto. Va por route handler y no por Server Action por el
 * tamaño (las acciones cortan en 1 MB). La extensión sale del MIME aceptado, no del nombre.
 */
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
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (!Object.hasOwn(TIPOS_CERTIFICADO, archivo.type)) {
    return NextResponse.json({ error: `"${archivo.name}" no se acepta. Sube un PDF o una imagen (PNG, JPG, WEBP).` }, { status: 400 });
  }
  if (archivo.size > LIMITE_SUBIDA) return NextResponse.json({ error: "El certificado pasa el tope de 4 MB." }, { status: 413 });

  const { data: producto } = await supabaseAdmin.from("inv_productos").select("id").eq("id", productoId).maybeSingle();
  if (!producto) return NextResponse.json({ error: "Ese producto no existe." }, { status: 404 });

  try {
    await guardarCertificado(productoId, Buffer.from(await archivo.arrayBuffer()), TIPOS_CERTIFICADO[archivo.type], archivo.type, archivo.name);
    revalidatePath("/inventario/productos");
    revalidatePath(`/inventario/productos/${productoId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message.replace(/^\[inventario\]\s*/, "") : "No se pudo subir el certificado.";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
