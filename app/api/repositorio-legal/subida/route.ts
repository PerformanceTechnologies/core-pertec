import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { exigirAccion, SinPermisoLegal } from "@/lib/repositorio-legal/datos";
import { abrirSubida, confirmarSubida, rutaSegura, validarId } from "@/lib/repositorio-legal/sharepoint";
import { RUTA_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";

export const runtime = "nodejs";

/**
 * Subida directa del navegador a SharePoint, en dos pasos (como la documentación de Leads):
 *   «abrir»      → el servidor revisa el permiso y abre la sesión de carga en la carpeta de la sociedad.
 *   «confirmar»  → el servidor verifica que el archivo quedó DENTRO del repositorio y le pone su nombre final.
 * El archivo no pasa por Vercel (que corta en ~4,5 MB): va del navegador a SharePoint en trozos.
 */
export async function POST(request: Request) {
  let cuerpo: { paso?: string; carpeta?: string; nombre?: string; reemplazaId?: string | null; itemId?: string; nombreFinal?: string | null };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  try {
    if (cuerpo.paso === "abrir") {
      // Reemplazar es cambiar lo que existe: necesita «editar». Subir algo nuevo, solo «subir».
      await exigirAccion(cuerpo.reemplazaId ? "editar" : "subir");
      const nombre = rutaSegura(String(cuerpo.nombre ?? "")).replace(/\//g, "_");
      if (!nombre) return NextResponse.json({ error: "Falta el nombre del archivo." }, { status: 400 });
      const reemplazaId = cuerpo.reemplazaId ? validarId(cuerpo.reemplazaId) : null;
      const url = await abrirSubida({ carpeta: String(cuerpo.carpeta ?? ""), nombre, reemplazaId });
      return NextResponse.json({ url });
    }
    if (cuerpo.paso === "confirmar") {
      await exigirAccion("subir");
      const r = await confirmarSubida(validarId(String(cuerpo.itemId ?? "")), cuerpo.nombreFinal ? rutaSegura(cuerpo.nombreFinal).replace(/\//g, "_") : null);
      revalidatePath(RUTA_REPOSITORIO_LEGAL, "layout");
      return NextResponse.json({ ok: true, ruta: r.ruta });
    }
    return NextResponse.json({ error: "Paso desconocido." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo subir.";
    return NextResponse.json({ error: msg }, { status: e instanceof SinPermisoLegal ? 403 : 500 });
  }
}
