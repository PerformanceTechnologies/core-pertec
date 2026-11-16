import { NextResponse } from "next/server";
import { esReferenciaSharePoint, guardarArchivo } from "@/lib/archivos/almacen";
import { nombreUnico } from "@/lib/archivos/sharepoint-core";
import { randomUUID } from "node:crypto";
import { LIMITE_SUBIDA } from "@/lib/subidas";
import { TIPOS_ADJUNTO, prepararAdjunto, registrarAdjunto } from "@/lib/fin/adjuntos";

export const runtime = "nodejs";

/** Sube un respaldo (hasta ~4 MB, pasa por el servidor): a SharePoint, o al bucket «finanzas» si SharePoint no responde. Los grandes van por /directo. */
export async function POST(request: Request) {
  const fd = await request.formData().catch(() => null);
  const archivo = fd?.get("archivo");
  const entidadTipo = String(fd?.get("entidadTipo") ?? "");
  const entidadId = String(fd?.get("entidadId") ?? "");
  const tipo = String(fd?.get("tipo") ?? "otro").slice(0, 30);
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (!Object.hasOwn(TIPOS_ADJUNTO, archivo.type)) return NextResponse.json({ error: "Sube un PDF, Word, Excel, imagen o XML." }, { status: 400 });
  if (archivo.size > LIMITE_SUBIDA) return NextResponse.json({ error: "El archivo pasa el tope de 4 MB." }, { status: 413 });
  const p = await prepararAdjunto(entidadTipo, entidadId);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });

  let ruta: string;
  try {
    ruta = await guardarArchivo({
      carpeta: p.carpeta,
      nombre: nombreUnico(archivo.name, TIPOS_ADJUNTO[archivo.type]),
      contenido: Buffer.from(await archivo.arrayBuffer()),
      tipo: archivo.type,
      respaldo: { bucket: "finanzas", ruta: `${p.ctx.empresa.id}/${entidadTipo}/${entidadId}/${randomUUID()}.${TIPOS_ADJUNTO[archivo.type]}` },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar el archivo." }, { status: 500 });
  }
  const r = await registrarAdjunto({ ctx: p.ctx, tabla: p.tabla, entidadTipo, entidadId, tipo, ruta, nombre: archivo.name, mime: archivo.type, tamano: archivo.size });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: r.id, sharepoint: esReferenciaSharePoint(ruta) });
}
