import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { migrarDesdeOdoo, type TipoMigracion } from "@/lib/migracion-odoo-facturas";
import { indexarFacturasVenta } from "@/lib/indexador-facturas-venta";
import { indexarFacturasCompra } from "@/lib/indexador-facturas-compra";
import { credencialesGraphFacturasConfiguradas } from "@/lib/sharepoint-facturas";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Trae de Odoo a Facturas Históricas (SharePoint + índice del Core) las ventas o compras desde una
 * fecha. Solo administradores. Se llama a mano, una vez por tipo:
 *   /api/finanzas/migrar-odoo?tipo=ventas&desde=2026-07-01
 *   /api/finanzas/migrar-odoo?tipo=compras&desde=2026-07-01
 * Se puede repetir: lo que ya está en la carpeta no se vuelve a subir ni a indexar.
 */
export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoAppApi("finanzas");
  if (!acceso.usuario || acceso.usuario.rol !== "admin") return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  if (!credencialesGraphFacturasConfiguradas()) return NextResponse.json({ error: "Faltan las credenciales del sitio de Finanzas." }, { status: 500 });

  const q = request.nextUrl.searchParams;
  const tipo: TipoMigracion = q.get("tipo") === "compras" ? "compras" : "ventas";
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(q.get("desde") ?? "") ? q.get("desde")! : "2026-07-01";
  const limite = q.get("limite") ? Math.max(1, Number(q.get("limite"))) : undefined;

  try {
    const r = await migrarDesdeOdoo({ tipo, desde, correo: acceso.usuario.correo, limite });
    // Después de subir, el indexador de siempre carga cada mes en el Core.
    const indexados: { anio: number; mes: number; nuevos: number }[] = [];
    for (const m of r.meses) {
      const { nuevos } = tipo === "ventas" ? await indexarFacturasVenta(m) : await indexarFacturasCompra(m);
      indexados.push({ ...m, nuevos });
    }
    return NextResponse.json({ ok: r.errores.length === 0, ...r, indexados });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
