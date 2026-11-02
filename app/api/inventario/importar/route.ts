import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { importar, previsualizar } from "@/lib/inventario-importacion";
import { LIMITE_SUBIDA } from "@/lib/subidas";

export const runtime = "nodejs";
// Cada fila con cantidad es un ajuste (varias consultas): 1.000 filas toman su tiempo.
export const maxDuration = 300;

/**
 * Carga masiva. Con modo=previsualizar solo lee y valida (no escribe nada); con
 * modo=importar vuelve a leer y validar el MISMO archivo en el servidor —no confía en la
 * vista previa que tenga el navegador— e importa las filas válidas.
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
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (!/\.(xlsx|csv)$/i.test(archivo.name)) return NextResponse.json({ error: "Sube un Excel (.xlsx) o un CSV." }, { status: 400 });
  if (archivo.size > LIMITE_SUBIDA) return NextResponse.json({ error: "El archivo pasa el tope de 4 MB." }, { status: 413 });

  const contenido = Buffer.from(await archivo.arrayBuffer());
  try {
    if (fd.get("modo") === "importar") {
      const resultado = await importar(contenido, archivo.name, acceso.usuario.correo);
      for (const r of ["/inventario", "/inventario/productos", "/inventario/ajustes", "/inventario/reabastecimiento", "/inventario/valorizacion"]) {
        revalidatePath(r);
      }
      return NextResponse.json({ ok: true, resultado });
    }
    return NextResponse.json({ ok: true, previa: await previsualizar(contenido, archivo.name) });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message.replace(/^\[inventario\]\s*/, "") : "No se pudo leer el archivo.";
    return NextResponse.json({ error: `No se pudo procesar el archivo: ${mensaje}` }, { status: 400 });
  }
}
