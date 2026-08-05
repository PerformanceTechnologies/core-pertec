import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { buscarProveedor } from "@/lib/rendidor/odoo";

const SLUG_APP = "rendir-gastos";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Consulta {
  gastos: { gastoId: string; rut: string | null; proveedor: string }[];
}

// 8.2 — Resuelve el proveedor de cada gasto. Busca por RUT en ambos formatos y
// después por nombre. Devuelve los candidatos por gasto: un solo resultado se
// puede autoseleccionar en la UI, varios los elige quien rinde, y ninguno queda
// marcado para creación. pertec_proveedor_id es obligatorio, así que ningún
// gasto puede quedar sin proveedor en silencio.
export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const { gastos } = (await request.json()) as Consulta;
  if (!Array.isArray(gastos)) {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  try {
    const resultados = [];
    for (const g of gastos) {
      const { candidatos, via } = await buscarProveedor(g.rut, g.proveedor);
      resultados.push({ gastoId: g.gastoId, candidatos, via });
    }
    return NextResponse.json({ resultados });
  } catch (error) {
    console.error("[rendidor] Error al buscar proveedores:", error);
    return NextResponse.json({ error: "No pudimos consultar los proveedores en Odoo." }, { status: 500 });
  }
}
