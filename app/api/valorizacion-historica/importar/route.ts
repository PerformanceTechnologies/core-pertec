import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { importarRegistro } from "@/lib/valorizacion-historica";
import { leerRegistroMaestro } from "@/lib/valorizacion-historica-excel";
import { RUTA_VH, SLUG_APP_VH } from "@/lib/valorizacion-historica-modelo";
import { LIMITE_SUBIDA } from "@/lib/subidas";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Sube una versión del Registro Maestro de Compras. Solo el administrador del Core: el resto solo
 * consulta. Va por route handler y no por Server Action por el tamaño del Excel (las acciones
 * cortan en 1 MB).
 */
export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP_VH);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  if (acceso.usuario.rol !== "admin") return NextResponse.json({ error: "Solo el administrador del Core puede cargar el registro." }, { status: 403 });

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario." }, { status: 400 });
  }
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (!/\.xlsx$/i.test(archivo.name)) return NextResponse.json({ error: "Tiene que ser el Excel (.xlsx) del Registro Maestro de Compras." }, { status: 400 });
  if (archivo.size > LIMITE_SUBIDA) return NextResponse.json({ error: "El archivo pasa el tope de 4 MB." }, { status: 413 });

  try {
    const registro = await leerRegistroMaestro(Buffer.from(await archivo.arrayBuffer()));
    const imp = await importarRegistro(registro, archivo.name, acceso.usuario.correo);
    revalidatePath(RUTA_VH, "layout");
    return NextResponse.json({ ok: true, importacion: imp });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message.replace(/^\[valorizacion-historica\]\s*/, "") : "No se pudo cargar el registro.";
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
}
