import { exigirAccesoPanelOdoo } from "@/lib/panel-odoo";
import { COMPANIAS_ODOO, COMPANIA_ODOO_DEFECTO } from "@/lib/panel-odoo/companias";
import { obtenerUltimasEjecuciones } from "@/lib/panel-odoo/sync-ejecuciones";
import SelectorEmpresa from "@/components/panel-odoo/SelectorEmpresa";
import BotonActualizarOdoo from "@/components/panel-odoo/BotonActualizarOdoo";
import EstadoSincronizacion from "@/components/panel-odoo/EstadoSincronizacion";
import TarjetaFacturas from "@/components/panel-odoo/TarjetaFacturas";
import TarjetaContabilidad from "@/components/panel-odoo/TarjetaContabilidad";
import TarjetaCrm from "@/components/panel-odoo/TarjetaCrm";
import TarjetaGastos from "@/components/panel-odoo/TarjetaGastos";

// Sin cache: cada carga vuelve a leer la cache de Supabase (no Odoo en vivo,
// ver lib/panel-odoo/datos.ts), asi que un sync recien terminado o un cambio
// de permisos se ve de inmediato, igual que el resto de los paneles del core.
export const dynamic = "force-dynamic";

export default async function PanelOdooPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const { rol, modulosVisibles } = await exigirAccesoPanelOdoo();
  const { empresa } = await searchParams;
  const companyId = COMPANIAS_ODOO.some((c) => c.id === Number(empresa))
    ? Number(empresa)
    : COMPANIA_ODOO_DEFECTO;
  const ejecuciones = await obtenerUltimasEjecuciones();

  return (
    <div>
      <span className="etiqueta-seccion">Panel Odoo</span>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-condensed text-2xl font-bold uppercase text-tinta">Panel Odoo</h1>
        {rol === "admin" && <BotonActualizarOdoo />}
      </div>
      <p className="mt-1 text-sm text-tinta/60">
        Resumen ejecutivo de Odoo — se actualiza automáticamente cada 30 minutos.
      </p>

      <div className="mt-6">
        <SelectorEmpresa companias={COMPANIAS_ODOO} companyIdActual={companyId} />
      </div>

      <div className="mt-3">
        <EstadoSincronizacion ejecuciones={ejecuciones} modulosVisibles={modulosVisibles} />
      </div>

      {modulosVisibles.length === 0 ? (
        <p className="mt-8 text-sm text-tinta/50">
          No tienes ningún módulo asignado en Panel Odoo. Pídele a un administrador que te
          asigne acceso.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {modulosVisibles.includes("facturas") && <TarjetaFacturas companyId={companyId} />}
          {modulosVisibles.includes("contabilidad") && <TarjetaContabilidad companyId={companyId} />}
          {modulosVisibles.includes("crm") && <TarjetaCrm companyId={companyId} />}
          {modulosVisibles.includes("gastos") && <TarjetaGastos companyId={companyId} />}
        </div>
      )}
    </div>
  );
}
