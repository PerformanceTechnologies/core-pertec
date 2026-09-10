import { listarLeads } from "@/lib/panel-odoo/datos";
import { money, pct } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { hoyEnChileIso, resumirLeads } from "@/lib/panel-odoo/crm-filtro";
import { embudo } from "@/lib/panel-odoo/crm-series";
import { GraficoDona } from "./graficos";
import ListaLeadsClickeable from "./ListaLeadsClickeable";
import DetalleCrm from "./DetalleCrm";
import TarjetaBase from "./TarjetaBase";

// Cuántas oportunidades se listan en la tarjeta chica (el detalle expandido las muestra
// todas, con filtros y gráficos).
const EN_LA_TARJETA = 5;

export default async function TarjetaCrm({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  // Todo el pipeline —abiertas, ganadas y perdidas— en una sola consulta: el detalle
  // filtra en el cliente, y sin las cerradas no hay conversión que mostrar.
  const todos = await listarLeads(companyId);
  const hoy = hoyEnChileIso();
  const resumen = resumirLeads(todos, hoy);
  const abiertas = todos.filter((l) => l.estado === "abierta");
  const escalones = embudo(todos);

  return (
    <TarjetaBase
      titulo="CRM"
      acento="naranjoSuave"
      icono="briefcase"
      ejecucion={ejecucion}
      anchoExpandido="ancho"
      contenidoExpandido={<DetalleCrm leads={todos} />}
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p title="Oportunidades abiertas" className="truncate text-[10px] uppercase text-tinta/45">
            Abiertas
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{resumen.abiertas}</p>
        </div>
        <div className="min-w-0">
          {/* El ponderado y no el bruto: es el número con el que se proyecta. El bruto va
              en el detalle, donde hay lugar para explicar que la mitad tiene monto 0. */}
          <p title="Pipeline ponderado por probabilidad" className="truncate text-[10px] uppercase text-tinta/45">
            Pipeline ponderado
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">
            {money(resumen.montoPonderado)}
          </p>
        </div>
        <div className="min-w-0">
          <p title="Ganadas sobre cerradas" className="truncate text-[10px] uppercase text-tinta/45">
            Conversión
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">
            {resumen.tasaDeConversion === null ? "—" : pct(resumen.tasaDeConversion, 0)}
          </p>
        </div>
        <div className="min-w-0">
          {/* Estancadas en la tarjeta chica: es lo único de esta pantalla sobre lo que hay
              que hacer algo hoy. */}
          <p title="Abiertas sin moverse de etapa hace más de un mes" className="truncate text-[10px] uppercase text-tinta/45">
            Estancadas
          </p>
          <p
            className={`mt-0.5 truncate font-condensed text-sm font-bold ${
              resumen.estancadas > 0 ? "text-red-600" : "text-tinta"
            }`}
          >
            {resumen.estancadas}
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">Embudo por etapa</p>
        <GraficoDona datos={escalones.map((e) => ({ etapa: e.etapa, cantidad: e.cantidad }))} />
      </div>

      <ListaLeadsClickeable leads={abiertas.slice(0, EN_LA_TARJETA)} />
    </TarjetaBase>
  );
}
