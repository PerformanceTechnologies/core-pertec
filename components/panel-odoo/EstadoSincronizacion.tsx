import type { EjecucionOdoo, ModuloOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import type { ModuloVisiblePanelOdoo } from "@/lib/panel-odoo/modulos-usuario";

const ETIQUETAS: Record<ModuloOdoo, string> = {
  facturas: "Facturas",
  contabilidad: "Contabilidad",
  crm: "CRM",
  gastos: "Gastos",
};

function haceCuanto(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} d`;
}

export default function EstadoSincronizacion({
  ejecuciones,
  modulosVisibles,
}: {
  ejecuciones: Record<ModuloOdoo, EjecucionOdoo | null>;
  modulosVisibles: ModuloVisiblePanelOdoo[];
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta/50">
      {modulosVisibles.map((modulo) => {
        const ejecucion = ejecuciones[modulo];
        return (
          <span key={modulo}>
            {ETIQUETAS[modulo]}:{" "}
            {ejecucion ? (
              <span className={ejecucion.exito ? "" : "text-red-600"}>
                {ejecucion.exito ? haceCuanto(ejecucion.ejecutado_en) : `error ${haceCuanto(ejecucion.ejecutado_en)}`}
              </span>
            ) : (
              "sin sincronizar aún"
            )}
          </span>
        );
      })}
    </div>
  );
}
