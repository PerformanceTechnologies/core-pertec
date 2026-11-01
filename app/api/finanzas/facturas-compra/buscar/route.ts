import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { usuarioPuedeVerSubpanelFinanzas } from "@/lib/finanzas-subpaneles-usuario";
import { buscarFacturasCompraIndexadas } from "@/lib/facturas-historicas";

const SLUG_APP = "finanzas";

// Busqueda sobre el indice propio (texto completo de cada PDF, extraido con
// pdf-parse al indexar) -- no se usa la busqueda de contenido de Microsoft
// Graph porque devuelve error con el permiso Sites.Selected, ver
// lib/sharepoint-facturas.ts.
export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  // La página exige además el subpanel "facturas-historicas" (el admin pasa siempre):
  // sin esta misma regla acá, quien no lo tiene igual podía llamar la API a mano.
  if (
    acceso.usuario.rol !== "admin" &&
    !(await usuarioPuedeVerSubpanelFinanzas(acceso.usuario.id, "facturas-historicas"))
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const termino = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const tiposDocumento = request.nextUrl.searchParams.getAll("tipo").filter(Boolean);

  if (termino.length < 2 && tiposDocumento.length === 0) {
    return NextResponse.json(
      { error: "Escribe al menos 2 caracteres o elige un tipo de documento para buscar." },
      { status: 400 }
    );
  }
  if (termino.length > 0 && termino.length < 2) {
    return NextResponse.json({ error: "Escribe al menos 2 caracteres para buscar." }, { status: 400 });
  }

  try {
    const resultados = await buscarFacturasCompraIndexadas({
      termino: termino || undefined,
      tiposDocumento: tiposDocumento.length > 0 ? tiposDocumento : undefined,
    });
    return NextResponse.json({ resultados });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
