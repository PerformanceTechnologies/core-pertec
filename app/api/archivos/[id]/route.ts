import { auth } from "@/auth";
import { puedeVerApp } from "@/lib/autorizacion";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { revisarEnlace, type ParametrosEnlace } from "@/lib/archivos/almacen";
import { abrirDeSharePoint, esIdDeItem, PREFIJO_SP } from "@/lib/archivos/sharepoint-core";

export const runtime = "nodejs";
export const maxDuration = 60;

// Entrega un archivo de SharePoint. Solo con un enlace firmado por el Core (ver
// lib/archivos/almacen.ts): el temporal no pide sesión, como una URL firmada de Supabase;
// el permanente pide sesión y acceso a la app con que se firmó.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esIdDeItem(id)) return new Response("No encontrado", { status: 404 });

  const q = new URL(request.url).searchParams;
  const p: ParametrosEnlace = {
    n: q.get("n") ?? undefined,
    d: q.get("d") ?? undefined,
    e: q.get("e") ?? undefined,
    a: q.get("a") ?? undefined,
    f: q.get("f") ?? undefined,
  };
  const permiso = revisarEnlace(id, p);
  if (!permiso) return new Response("Este enlace no es válido o ya venció. Vuelve a abrirlo desde el Core.", { status: 403 });
  if (permiso.tipo === "app") {
    const session = await auth();
    const usuario = await obtenerUsuarioActivo(session?.user?.email);
    if (!usuario) return new Response("Inicia sesión en el Core para ver este archivo.", { status: 401 });
    if (!(await puedeVerApp(usuario, permiso.app))) return new Response("No tienes acceso a este archivo.", { status: 403 });
  }

  try {
    const { respuesta, tipo, nombre } = await abrirDeSharePoint(`${PREFIJO_SP}${id}`);
    const nombreFinal = (p.n || nombre).replace(/[\r\n"]/g, "_");
    // Un HTML, SVG o XML no se muestra: se baja. Así no puede correr código con la sesión del Core.
    const peligroso = /html|svg|xml|javascript/i.test(tipo);
    const cabeceras = new Headers({
      "Content-Type": peligroso ? "application/octet-stream" : tipo,
      "Content-Disposition": `${p.d === "1" || peligroso ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nombreFinal)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    const largo = respuesta.headers.get("content-length");
    if (largo) cabeceras.set("Content-Length", largo);
    return new Response(respuesta.body, { status: 200, headers: cabeceras });
  } catch (e) {
    console.error(`[archivos] No se pudo entregar ${id}:`, e instanceof Error ? e.message : e);
    return new Response("No se pudo abrir el archivo desde SharePoint.", { status: 502 });
  }
}
