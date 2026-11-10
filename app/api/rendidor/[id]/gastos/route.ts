import { NextResponse } from "next/server";
import { verificarAccesoRendidorApi } from "@/lib/rendidor/permisos";
import { esEditable, puedeAbrirRendicion } from "@/lib/permisos-rendidor";
import { guardarGastos, obtenerRendicion } from "@/lib/rendidor/datos";
import type { GastoRendicion } from "@/lib/rendidor/tipos";


export const runtime = "nodejs";

// Guarda los gastos corregidos en la tabla de revisión (borrador).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoRendidorApi();
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const { id } = await params;
  const rendicion = await obtenerRendicion(id);
  if (!rendicion) {
    return NextResponse.json({ error: "Rendición no encontrada." }, { status: 404 });
  }
  // Cada quien edita lo suyo; un admin puede corregir cualquiera.
  if (!puedeAbrirRendicion(rendicion.creadoPor, acceso.usuario.id, acceso.usuario.rol, acceso.rol, rendicion.rindeCorreo, acceso.usuario.correo)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  // Enviada, aprobada o pagada: los gastos quedan congelados mientras otro los revisa.
  if (!esEditable(rendicion.estado)) {
    return NextResponse.json(
      { error: "Esta rendición ya se envió a revisión: los gastos quedan congelados. Retírala para corregir." },
      { status: 409 },
    );
  }

  const body = (await request.json()) as { gastos?: GastoRendicion[] };
  if (!Array.isArray(body.gastos)) {
    return NextResponse.json({ error: "Falta el arreglo de gastos." }, { status: 400 });
  }

  // La revisión de cada boleta la pone quien revisa, no quien rinde: se conserva la guardada.
  // Una boleta observada que se corrige vuelve a «cargada» para la próxima revisión.
  const previas = new Map(rendicion.gastos.map((g) => [g.id, g]));
  const firma = (g: GastoRendicion) => JSON.stringify([g.fecha, g.proveedor, g.rutProveedor, g.total, g.tipoDocumento, g.categoria]);
  const gastos = body.gastos.map((g) => {
    const antes = previas.get(g.id);
    let revision = antes?.revision ?? null;
    if (revision?.estado === "observada" && antes && firma(antes) !== firma(g)) revision = { ...revision, estado: "cargada" };
    return { ...g, revision, duplicadoDe: antes?.duplicadoDe ?? null, compraId: antes?.compraId ?? null };
  });

  try {
    await guardarGastos(id, gastos);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[rendidor] Error al guardar gastos:", error);
    return NextResponse.json({ error: "No pudimos guardar los gastos." }, { status: 500 });
  }
}
