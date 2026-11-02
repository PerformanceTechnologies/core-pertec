import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { guardarArchivoDocumento, obtenerDocumento } from "@/lib/flota";
import { SLUG_APP_FLOTA, TIPOS_ARCHIVO } from "@/lib/flota-modelo";
import { LIMITE_SUBIDA } from "@/lib/subidas";

export const runtime = "nodejs";

/**
 * Sube el archivo de un documento de un vehículo. Va por route handler y no por Server
 * Action por el tamaño (las acciones cortan en 1 MB). La extensión sale del MIME aceptado,
 * no del nombre. La fila del documento ya existe: la crea prepararDocumentoAction.
 */
export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP_FLOTA);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario." }, { status: 400 });
  }
  const documentoId = String(fd.get("documentoId") ?? "");
  const archivo = fd.get("archivo");
  if (!/^[0-9a-f-]{36}$/.test(documentoId)) return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (!Object.hasOwn(TIPOS_ARCHIVO, archivo.type)) {
    return NextResponse.json({ error: `"${archivo.name}" no se acepta. Sube un PDF o una imagen (PNG, JPG, WEBP).` }, { status: 400 });
  }
  if (archivo.size > LIMITE_SUBIDA) return NextResponse.json({ error: "El archivo pasa el tope de 4 MB." }, { status: 413 });

  const doc = await obtenerDocumento(documentoId);
  if (!doc) return NextResponse.json({ error: "Ese documento ya no existe." }, { status: 404 });

  try {
    await guardarArchivoDocumento(documentoId, Buffer.from(await archivo.arrayBuffer()), TIPOS_ARCHIVO[archivo.type], archivo.type, archivo.name, acceso.usuario.correo);
    revalidatePath(`/flota/vehiculos/${doc.vehiculoId}`);
    revalidatePath("/flota");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message.replace(/^\[flota\]\s*/, "") : "No se pudo subir el archivo.";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
