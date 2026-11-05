import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { MODULOS_TRASPASO, sobrantesDeRendiciones } from "@/lib/archivos/traspaso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // limite del plan Hobby de Vercel

// Traspaso a SharePoint de los archivos que ya estaban en Supabase (ver lib/archivos/traspaso.ts).
// Solo admin, y con SU cuenta de SharePoint (igual que todo lo demás de archivos).
//   GET  → cuántos archivos quedan en Supabase por módulo.
//   POST { modulo, cursor } → pasa una tanda (~40 s) y devuelve por dónde seguir.

async function admin() {
  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  return usuario?.rol === "admin" ? usuario : null;
}

//   GET ?sobrantes=rendiciones[&limpiar=1] → copias sin anotar de tandas cortadas (a la papelera).
export async function GET(request: Request) {
  if (!(await admin())) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const q = new URL(request.url).searchParams;
  if (q.get("sobrantes") === "rendiciones") {
    try {
      return NextResponse.json(await sobrantesDeRendiciones(q.get("limpiar") === "1"));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
  const modulos = await Promise.all(
    MODULOS_TRASPASO.map(async (m) => {
      try {
        return { clave: m.clave, nombre: m.nombre, pendientes: await m.contar() };
      } catch (e) {
        return { clave: m.clave, nombre: m.nombre, pendientes: null, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return NextResponse.json({ modulos });
}

export async function POST(request: Request) {
  if (!(await admin())) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const cuerpo = await request.json().catch(() => null);
  const modulo = MODULOS_TRASPASO.find((m) => m.clave === cuerpo?.modulo);
  if (!modulo) return NextResponse.json({ error: "Módulo desconocido." }, { status: 400 });
  const cursor = typeof cuerpo?.cursor === "string" && cuerpo.cursor ? cuerpo.cursor : null;
  try {
    return NextResponse.json(await modulo.lote(cursor, Date.now() + 40_000));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
