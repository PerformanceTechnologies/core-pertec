import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { buscarEmpleados } from "@/lib/rendidor/odoo";

const SLUG_APP = "rendir-gastos";

export const runtime = "nodejs";

// 8.1 — Busca al empleado en Odoo. Devuelve los candidatos: si hay 0 o varios,
// decide quien rinde. La skill es explícita en que el empleado no se adivina.
export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const nombre = request.nextUrl.searchParams.get("nombre")?.trim();
  if (!nombre) {
    return NextResponse.json({ error: "Falta el nombre a buscar." }, { status: 400 });
  }

  try {
    return NextResponse.json({ empleados: await buscarEmpleados(nombre) });
  } catch (error) {
    console.error("[rendidor] Error al buscar empleado:", error);
    return NextResponse.json({ error: "No pudimos consultar los empleados en Odoo." }, { status: 500 });
  }
}
