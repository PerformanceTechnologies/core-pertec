import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { crearFondo } from "@/lib/rendidor/fondos";

const SLUG_APP = "rendir-gastos";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Crea un "Fondo por Rendir" en Odoo (hr.expense.advance).
 *
 * Solo crear: la LISTA la trae la página del paso de Odoo desde el servidor, que ya está
 * consultando Odoo para resolver los proveedores y no necesita un round-trip más desde el
 * navegador.
 */
export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const cuerpo = (await request.json()) as {
    employeeId?: number;
    companyId?: number;
    descripcion?: string;
    monto?: number;
  };

  const descripcion = (cuerpo.descripcion ?? "").trim();
  if (!cuerpo.employeeId || !cuerpo.companyId) {
    return NextResponse.json({ error: "Falta el empleado o la empresa." }, { status: 400 });
  }
  // Sin nombre el fondo no se puede identificar después en Odoo, y el desplegable de la
  // próxima rendición mostraría una fila que no dice nada.
  if (!descripcion) {
    return NextResponse.json({ error: "El fondo necesita un nombre." }, { status: 400 });
  }

  try {
    const fondo = await crearFondo({
      employeeId: cuerpo.employeeId,
      companyId: cuerpo.companyId,
      descripcion,
      monto: Number(cuerpo.monto ?? 0) || 0,
    });
    return NextResponse.json({ fondo });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[rendidor] Error al crear el fondo por rendir:", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
