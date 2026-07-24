import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEditarGastos, actualizarGastosProyecto } from "@/lib/proyectos";
import type { ArchivoGasto } from "@/lib/proyectos";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

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
  const presupuesto = Number(body.presupuesto_inicial) || 0;
  const gastos = Array.isArray(body.gastos)
    ? body.gastos
        .map((g: { categoria?: string; tag?: string; label?: string; monto?: string | number; archivos?: unknown }) => ({
          categoria: g.categoria || null,
          tag: (g.tag || "").toString().trim() || null,
          label: (g.label || "").toString().trim() || null,
          monto: g.monto === "" || g.monto == null ? 0 : Number(g.monto),
          archivos: leerArchivos(g.archivos),
        }))
        .filter(
          (g: { categoria: string | null; tag: string | null; label: string | null; monto: number; archivos: ArchivoGasto[] }) =>
            g.categoria || g.tag || g.label || g.monto > 0 || g.archivos.length > 0,
        )
    : [];

  try {
    await actualizarGastosProyecto(id, { presupuesto_inicial: presupuesto, gastos });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[proyectos] Error al actualizar gastos:", error);
    return NextResponse.json({ error: "No pudimos guardar los gastos." }, { status: 500 });
  }
}
