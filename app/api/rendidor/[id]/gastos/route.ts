import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { guardarGastos, obtenerRendicion } from "@/lib/rendidor/datos";
import type { GastoRendicion } from "@/lib/rendidor/tipos";

const SLUG_APP = "rendir-gastos";

export const runtime = "nodejs";

// Guarda los gastos corregidos en la tabla de revisión (borrador).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const { id } = await params;
  const rendicion = await obtenerRendicion(id);
  if (!rendicion) {
    return NextResponse.json({ error: "Rendición no encontrada." }, { status: 404 });
  }
  // Cada quien edita lo suyo; un admin puede corregir cualquiera.
  if (rendicion.creadoPor !== acceso.usuario.id && acceso.usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (rendicion.estado === "cargada_odoo") {
    return NextResponse.json(
      { error: "Esta rendición ya se cargó a Odoo: los gastos quedan congelados." },
      { status: 409 },
    );
  }

  const body = (await request.json()) as { gastos?: GastoRendicion[] };
  if (!Array.isArray(body.gastos)) {
    return NextResponse.json({ error: "Falta el arreglo de gastos." }, { status: 400 });
  }

  try {
    await guardarGastos(id, body.gastos);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[rendidor] Error al guardar gastos:", error);
    return NextResponse.json({ error: "No pudimos guardar los gastos." }, { status: 500 });
  }
}
