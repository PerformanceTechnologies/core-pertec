import { listarVentas } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { arriendoActivo, esCotizacion, hoyEnChileIso, resumirVentas } from "@/lib/panel-odoo/ventas-filtro";
import { tendenciaMensual } from "@/lib/panel-odoo/ventas-series";
import { GraficoAreaSimple } from "./graficos";
import ListaVentasClickeable from "./ListaVentasClickeable";
import DetalleVentas from "./DetalleVentas";
import TarjetaBase from "./TarjetaBase";

/** Cuántas órdenes se listan en la tarjeta chica (el detalle muestra todas, con filtros). */
const EN_LA_TARJETA = 5;

export default async function TarjetaVentas({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  // Todas las órdenes en una sola consulta: el detalle filtra en el cliente.
  const todas = await listarVentas(companyId);
  const hoy = hoyEnChileIso();
  const resumen = resumirVentas(todas, hoy);

  // La tendencia de la tarjeta chica es lo COTIZADO por mes. Antes mostraba solo lo
  // confirmado y salía en cero: de 65 órdenes, 47 son cotizaciones sin cerrar, así que la
  // tarjeta decía "$0" al lado de media cartera comercial.
  const serie = tendenciaMensual(todas).map((p) => ({ mes: p.mes, monto: Math.round(p.cotizado) }));

  // En la lista chica, lo que hay que mirar hoy: los arriendos en curso primero (es un
  // equipo afuera) y después las cotizaciones más nuevas.
  const paraLaLista = [
    ...todas.filter((v) => arriendoActivo(v)),
    ...todas.filter((v) => esCotizacion(v)),
  ].slice(0, EN_LA_TARJETA);

  return (
    <TarjetaBase
      titulo="Ventas y Arriendo"
      acento="naranjo"
      icono="package"
      ejecucion={ejecucion}
      anchoExpandido="ancho"
      contenidoExpandido={<DetalleVentas ventas={todas} />}
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p title="Cotizaciones abiertas" className="truncate text-[10px] uppercase text-tinta/45">
            Cotizado abierto
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">
            {money(resumen.montoCotizado)}
          </p>
        </div>
        <div className="min-w-0">
          {/* El número más fuerte de la tarjeta: plata vendida que todavía no se factura. */}
          <p title="Confirmado sin facturar" className="truncate text-[10px] uppercase text-tinta/45">
            Por facturar
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">
            {money(resumen.montoPorFacturar)}
          </p>
        </div>
        <div className="min-w-0">
          <p title="Arriendos en curso" className="truncate text-[10px] uppercase text-tinta/45">
            Arriendos en curso
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">
            {resumen.arriendosActivos}
            <span className="ml-1 text-[10px] font-normal text-tinta/45">
              {money(resumen.montoArriendosActivos)}
            </span>
          </p>
        </div>
        <div className="min-w-0">
          <p title="Arriendos pasados de su fecha de fin" className="truncate text-[10px] uppercase text-tinta/45">
            Pasados de fecha
          </p>
          <p
            className={`mt-0.5 truncate font-condensed text-sm font-bold ${
              resumen.arriendosAtrasados > 0 ? "text-red-600" : "text-tinta"
            }`}
          >
            {resumen.arriendosAtrasados}
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">Cotizado por mes</p>
        <GraficoAreaSimple datos={serie} />
      </div>

      <ListaVentasClickeable ventas={paraLaLista} />
    </TarjetaBase>
  );
}
