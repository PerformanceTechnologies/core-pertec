import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { obtenerRendicion, marcarCargadaOdoo } from "@/lib/rendidor/datos";
import { armarPreview, crearGastoOdoo, crearProveedor } from "@/lib/rendidor/odoo";
import type { GastoRendicion } from "@/lib/rendidor/tipos";

const SLUG_APP = "rendir-gastos";

export const runtime = "nodejs";
export const maxDuration = 60;

// Decisión de proveedor por gasto, tomada por quien rinde en la UI. La skill es
// explícita: nunca se adivina el proveedor. O se elige uno existente, o se pide
// crearlo con datos concretos.
interface DecisionProveedor {
  gastoId: string;
  partnerId?: number;
  crear?: { nombre: string; rut: string | null; esPersonaNatural: boolean };
}

interface Cuerpo {
  employeeId: number;
  proveedores: DecisionProveedor[];
}

// Crea los proveedores nuevos y los hr.expense. NO adjunta respaldos: eso va en
// /adjuntar, de a un archivo por request, porque el body de Vercel tope ~4,5 MB
// no aguanta 16 comprobantes juntos.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const { id } = await params;
  const rendicion = await obtenerRendicion(id);
  if (!rendicion) {
    return NextResponse.json({ error: "Rendición no encontrada." }, { status: 404 });
  }
  if (rendicion.creadoPor !== acceso.usuario.id && acceso.usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (rendicion.estado === "cargada_odoo") {
    return NextResponse.json(
      { error: "Esta rendición ya se cargó a Odoo. Crear los gastos otra vez los duplicaría." },
      { status: 409 },
    );
  }

  const cuerpo = (await request.json()) as Cuerpo;
  if (!cuerpo.employeeId) {
    return NextResponse.json({ error: "Falta el empleado de Odoo." }, { status: 400 });
  }

  try {
    // 8.5 — Crear los proveedores nuevos primero, para tener sus ids.
    const partnerPorGasto: Record<string, number> = {};
    const proveedoresCreados: { nombre: string; partnerId: number }[] = [];

    for (const d of cuerpo.proveedores) {
      if (d.partnerId) {
        partnerPorGasto[d.gastoId] = d.partnerId;
      } else if (d.crear) {
        const partnerId = await crearProveedor(d.crear);
        partnerPorGasto[d.gastoId] = partnerId;
        proveedoresCreados.push({ nombre: d.crear.nombre, partnerId });
      }
    }

    // 8.4 — El preview recalcula el desglose con las reglas de iva.ts, así que
    // lo que se carga es exactamente lo que se mostró. Si a algún gasto le falta
    // tipo de documento, categoría, fecha o proveedor, esto lanza antes de
    // escribir nada en Odoo.
    const preview = armarPreview(rendicion, partnerPorGasto);

    // 8.6 — Crear los gastos.
    const gastosActualizados: GastoRendicion[] = [...rendicion.gastos];
    const creados: { gastoId: string; expenseId: number }[] = [];

    for (const p of preview) {
      const expenseId = await crearGastoOdoo(p, cuerpo.employeeId, rendicion.empresaCompanyId);
      creados.push({ gastoId: p.gastoId, expenseId });

      const i = gastosActualizados.findIndex((g) => g.id === p.gastoId);
      if (i !== -1) {
        gastosActualizados[i] = {
          ...gastosActualizados[i],
          odooExpenseId: expenseId,
          odooPartnerId: p.partnerId,
        };
      }
    }

    await marcarCargadaOdoo(id, cuerpo.employeeId, gastosActualizados);

    return NextResponse.json({
      creados,
      proveedoresCreados,
      // La UI usa esto para adjuntar los respaldos uno por uno.
      pendientesDeAdjuntar: creados,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[rendidor] Error al cargar a Odoo:", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
