"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoPanelOdoo } from "@/lib/panel-odoo";
import { sincronizarFacturas } from "@/lib/panel-odoo/sincronizar-facturas";
import { sincronizarContabilidad } from "@/lib/panel-odoo/sincronizar-contabilidad";
import { sincronizarCrm } from "@/lib/panel-odoo/sincronizar-crm";
import { sincronizarGastos } from "@/lib/panel-odoo/sincronizar-gastos";
import { registrarEjecucionOdoo, type ModuloOdoo } from "@/lib/panel-odoo/sync-ejecuciones";

const SINCRONIZADORES: Record<ModuloOdoo, () => Promise<number>> = {
  facturas: sincronizarFacturas,
  contabilidad: sincronizarContabilidad,
  crm: sincronizarCrm,
  gastos: sincronizarGastos,
};

export interface ResultadoSincronizacionManual {
  modulo: ModuloOdoo;
  exito: boolean;
  registros?: number;
  error?: string;
}

// Mismo patron que actualizarUfUtmAction del Cotizador: llama directo a la
// misma funcion de sincronizacion que usa el cron/GitHub Actions, en vez de
// hacerle fetch a la ruta de la API -- se dispara a mano desde el boton
// "Actualizar ahora" sin depender de esperar la proxima corrida programada.
export async function sincronizarAhoraAction(): Promise<ResultadoSincronizacionManual[]> {
  await exigirAccesoPanelOdoo("sincronizar");

  const modulos = Object.keys(SINCRONIZADORES) as ModuloOdoo[];
  const resultados = await Promise.all(
    modulos.map(async (modulo): Promise<ResultadoSincronizacionManual> => {
      try {
        const registros = await SINCRONIZADORES[modulo]();
        await registrarEjecucionOdoo(modulo, true, registros);
        return { modulo, exito: true, registros };
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        await registrarEjecucionOdoo(modulo, false, 0, mensaje);
        return { modulo, exito: false, error: mensaje };
      }
    })
  );

  revalidatePath("/panel-odoo");
  return resultados;
}
