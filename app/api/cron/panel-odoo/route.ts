import { NextRequest, NextResponse } from "next/server";
import { sincronizarFacturas } from "@/lib/panel-odoo/sincronizar-facturas";
import { sincronizarContabilidad } from "@/lib/panel-odoo/sincronizar-contabilidad";
import { sincronizarCrm } from "@/lib/panel-odoo/sincronizar-crm";
import { sincronizarGastos } from "@/lib/panel-odoo/sincronizar-gastos";
import { sincronizarFlota } from "@/lib/panel-odoo/sincronizar-flota";
import { sincronizarProyectos } from "@/lib/panel-odoo/sincronizar-proyectos";
import { sincronizarVentas } from "@/lib/panel-odoo/sincronizar-ventas";
import { sincronizarCompras } from "@/lib/panel-odoo/sincronizar-compras";
import { registrarEjecucionOdoo, fallaronLasUltimasDos, type ModuloOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { enviarCorreoSoporte } from "@/lib/notificaciones";

export const maxDuration = 60; // limite del plan Hobby de Vercel

// Protegido por CRON_SECRET, mismo patron que los demas cron de este repo
// (ver app/api/cron/finanzas-sii/route.ts). Este endpoint no lo llama Vercel
// Cron -- Vercel Hobby solo permite crons de 1x/dia y este panel necesita
// cadencia de 30 min, asi que lo llama un workflow de GitHub Actions
// (.github/workflows/panel-odoo-sync.yml) con el mismo header Bearer.
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return request.headers.get("authorization") === `Bearer ${secreto}`;
}

const SINCRONIZADORES: Record<ModuloOdoo, () => Promise<number>> = {
  facturas: sincronizarFacturas,
  contabilidad: sincronizarContabilidad,
  crm: sincronizarCrm,
  gastos: sincronizarGastos,
  flota: sincronizarFlota,
  proyectos: sincronizarProyectos,
  ventas: sincronizarVentas,
  compras: sincronizarCompras,
};

// Ramifica por ?modulo=, mismo patron que app/api/cron/finanzas-historico
// (?tipo=compra|venta): un modulo lento o caido nunca bloquea a los demas,
// porque el workflow de GitHub Actions llama a cada uno por separado.
export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const modulo = request.nextUrl.searchParams.get("modulo") as ModuloOdoo | null;
  const sincronizar = modulo ? SINCRONIZADORES[modulo] : null;
  if (!modulo || !sincronizar) {
    return NextResponse.json(
      {
        error:
          "Parametro ?modulo= invalido. Usa facturas | contabilidad | crm | gastos | flota | proyectos | ventas | compras.",
      },
      { status: 400 }
    );
  }

  try {
    const registros = await sincronizar();
    await registrarEjecucionOdoo(modulo, true, registros);
    return NextResponse.json({ ok: true, modulo, registros });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    await registrarEjecucionOdoo(modulo, false, 0, mensaje);
    console.error(`[cron panel-odoo:${modulo}]`, mensaje);

    // Alerta solo en fallas consecutivas: con cadencia de 30 min, alertar en
    // cada falla individual mandaria ~48 correos/dia ante una caida
    // sostenida de Odoo (a diferencia de /finanzas, que corre 1x/dia).
    if (await fallaronLasUltimasDos(modulo)) {
      await enviarCorreoSoporte(
        `Panel Odoo: fallas repetidas sincronizando "${modulo}"`,
        `El modulo "${modulo}" de Panel Odoo lleva al menos 2 corridas seguidas fallando.\n\nUltimo error: ${mensaje}`
      ).catch((errCorreo) => console.error("[cron panel-odoo] fallo al enviar alerta:", errCorreo));
    }

    return NextResponse.json({ ok: false, modulo, error: mensaje }, { status: 500 });
  }
}
