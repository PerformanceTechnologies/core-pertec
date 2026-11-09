import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEditarGastos, actualizarGastosProyecto } from "@/lib/proyectos";
import type { ArchivoGasto } from "@/lib/proyectos";
import { revisarEnlace } from "@/lib/archivos/almacen";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

/**
 * Solo se aceptan enlaces que armó el propio Core: un enlace firmado de /api/archivos para la app
 * Proyectos, o uno del bucket «gastos» antiguo. Así nadie puede colar un enlace externo (phishing)
 * como si fuera una boleta.
 */
function esEnlaceDelCore(url: string): boolean {
  if (url.startsWith("/api/archivos/")) {
    try {
      const u = new URL(url, "https://core.local");
      const id = decodeURIComponent(u.pathname.slice("/api/archivos/".length));
      const p = Object.fromEntries(u.searchParams.entries());
      const r = id && !id.includes("/") ? revisarEnlace(id, p) : null;
      return r?.tipo === "app" && r.app === SLUG_APP;
    } catch {
      return false;
    }
  }
  const base = process.env.PERTEC_WEB_SUPABASE_URL?.replace(/\/+$/, "");
  return !!base && url.startsWith(`${base}/storage/v1/object/public/gastos/`) && !url.includes("..");
}

function leerArchivos(valor: unknown): ArchivoGasto[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter(
      (a): a is { url: unknown; path: unknown; nombre?: unknown; tipo?: unknown } =>
        !!a && typeof a === "object" && typeof (a as { url?: unknown }).url === "string",
    )
    .map((a) => ({
      url: String(a.url),
      path: String(a.path ?? ""),
      nombre: String(a.nombre ?? ""),
      tipo: String(a.tipo ?? "application/octet-stream"),
    }));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEditarGastos(rol)) {
    return NextResponse.json({ error: "No tienes permiso para editar los gastos." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  // Un adjunto con un enlace que no armó el Core se rechaza (no se descarta en silencio: así
  // ningún adjunto se pierde sin aviso).
  const ajenos = (Array.isArray(body.gastos) ? body.gastos : []).flatMap((g: { archivos?: unknown }) => leerArchivos(g?.archivos)).filter((a: ArchivoGasto) => !esEnlaceDelCore(a.url));
  if (ajenos.length) {
    console.warn(`[gastos] Adjuntos con enlaces que no son del Core en el proyecto ${id}:`, ajenos.map((a: ArchivoGasto) => a.url.slice(0, 120)));
    return NextResponse.json({ error: "Hay un adjunto con un enlace que no es del Core. Vuelve a subir ese archivo." }, { status: 400 });
  }
  const presupuesto = Number(body.presupuesto_inicial) || 0;
  const saldoGlobalAsignado = Number(body.saldo_global_asignado) || 0;
  const gastos = Array.isArray(body.gastos)
    ? body.gastos
        .map(
          (g: {
            categoria?: string;
            tag?: string;
            label?: string;
            monto?: string | number;
            archivos?: unknown;
            objetivo_id?: string | null;
          }) => ({
            categoria: g.categoria || null,
            tag: (g.tag || "").toString().trim() || null,
            label: (g.label || "").toString().trim() || null,
            monto: g.monto === "" || g.monto == null ? 0 : Number(g.monto),
            archivos: leerArchivos(g.archivos),
            objetivo_id: g.objetivo_id || null,
          }),
        )
        .filter(
          (g: { categoria: string | null; tag: string | null; label: string | null; monto: number; archivos: ArchivoGasto[] }) =>
            g.categoria || g.tag || g.label || g.monto > 0 || g.archivos.length > 0,
        )
    : [];

  try {
    await actualizarGastosProyecto(id, {
      presupuesto_inicial: presupuesto,
      saldo_global_asignado: saldoGlobalAsignado,
      gastos,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[proyectos] Error al actualizar gastos:", error);
    return NextResponse.json({ error: "No pudimos guardar los gastos." }, { status: 500 });
  }
}
