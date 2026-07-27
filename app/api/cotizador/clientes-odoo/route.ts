import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { buscarClientesOdoo } from "@/lib/cotizador/clientes-odoo";

const SLUG_APP = "cotizador";

export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const termino = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (termino.length < 2) {
    return NextResponse.json({ error: "Escribe al menos 2 caracteres para buscar." }, { status: 400 });
  }

  try {
    const clientes = await buscarClientesOdoo(termino);
    return NextResponse.json({ clientes });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
