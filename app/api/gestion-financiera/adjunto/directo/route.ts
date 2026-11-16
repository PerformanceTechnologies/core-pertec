import { NextResponse } from "next/server";
import { abrirSesionDeSubida, datosEnSharePoint, nombreUnico, PREFIJO_SP, rutaDeCarpeta } from "@/lib/archivos/sharepoint-core";
import { TIPOS_ADJUNTO, TOPE_ADJUNTO_DIRECTO, prepararAdjunto, registrarAdjunto } from "@/lib/fin/adjuntos";

export const runtime = "nodejs";

/**
 * Subida directa a SharePoint, para archivos grandes:
 *  1. { paso: "abrir", ... }     → URL de la sesión de carga (el navegador sube los trozos).
 *  2. { paso: "confirmar", ... } → con el id que devolvió SharePoint, queda registrado.
 */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  const entidadTipo = String(b.entidadTipo ?? "");
  const entidadId = String(b.entidadId ?? "");
  const nombre = String(b.nombre ?? "").slice(0, 200);
  const mime = String(b.mime ?? "");
  const tamano = Number(b.tamano ?? 0);
  if (!Object.hasOwn(TIPOS_ADJUNTO, mime)) return NextResponse.json({ error: "Sube un PDF, Word, Excel, imagen o XML." }, { status: 400 });
  if (!(tamano > 0) || tamano > TOPE_ADJUNTO_DIRECTO) return NextResponse.json({ error: "El archivo pasa el tope de 100 MB." }, { status: 413 });
  const p = await prepararAdjunto(entidadTipo, entidadId);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });

  try {
    if (b.paso === "abrir") {
      const url = await abrirSesionDeSubida(p.carpeta, nombreUnico(nombre, TIPOS_ADJUNTO[mime]));
      return NextResponse.json({ ok: true, url });
    }
    if (b.paso === "confirmar") {
      const itemId = String(b.itemId ?? "");
      if (!/^[A-Za-z0-9!_-]{8,}$/.test(itemId)) return NextResponse.json({ error: "Falta el archivo subido." }, { status: 400 });
      const ref = `${PREFIJO_SP}${itemId}`;
      const d = await datosEnSharePoint(ref);
      // Que sea de verdad el archivo recién subido, en la carpeta que corresponde.
      if (!d || d.tamano !== tamano || !d.ruta.endsWith(rutaDeCarpeta(p.carpeta))) return NextResponse.json({ error: "SharePoint no confirmó el archivo." }, { status: 400 });
      const r = await registrarAdjunto({ ctx: p.ctx, tabla: p.tabla, entidadTipo, entidadId, tipo: String(b.tipo ?? "respaldo"), ruta: ref, nombre, mime, tamano });
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: 500 });
      return NextResponse.json({ ok: true, id: r.id, sharepoint: true });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "SharePoint no respondió." }, { status: 502 });
  }
  return NextResponse.json({ error: "Paso inválido." }, { status: 400 });
}
