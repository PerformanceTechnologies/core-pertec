import type { QuotationResult } from "@/lib/cotizador/motor/consolidacion";
import type { QuotationInput } from "@/lib/cotizador/motor/types";
import type { CotizacionCompleta } from "@/lib/cotizador";
import { money, fechaCl } from "@/lib/cotizador/formato";
import { lineaIdentidadEmpresa, nombreMostrarEmpresa, type EmpresaIdentidad } from "@/lib/cotizador/empresas";

export default function EcoTab({
  cotizacion,
  result,
  preparadoPor,
  empresa,
}: {
  cotizacion: CotizacionCompleta & { input: QuotationInput };
  result: QuotationResult;
  preparadoPor: { nombre: string; correo: string };
  // Identidad legal de la empresa emisora de ESTA cotización. Puede venir null
  // (la empresa no está en la tabla) o con campos vacíos (aún sin cargar los
  // datos reales): en ambos casos se muestra solo lo que haya, nunca relleno.
  empresa: EmpresaIdentidad | null;
}) {
  const identidad = lineaIdentidadEmpresa(empresa);
  return (
    <div className="mt-6">
      <div className="mb-4 flex justify-center gap-2.5 print:hidden">
        <a
          href={`/api/cotizador/${cotizacion.id}/eco-pdf`}
          target="_blank"
          rel="noopener"
          className="rounded-md border border-borde bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50"
        >
          ↓ Descargar PDF
        </a>
      </div>

      <div className="mx-auto max-w-3xl rounded border border-borde bg-white p-9 shadow-sm">
        <div className="flex items-start justify-between border-b-4 border-tinta pb-3.5">
          <div>
            <div className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
              {nombreMostrarEmpresa(cotizacion.empresa, empresa)}
            </div>
            {identidad ? (
              <div className="mt-1 text-xs text-tinta/60">{identidad}</div>
            ) : (
              <div className="mt-1 text-xs text-naranjo">
                Falta cargar los datos legales de esta empresa (RUT, dirección, correo) en Cotizador →
                Empresas.
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm font-bold uppercase tracking-wide text-tinta">Formulario ECO-1</div>
            <div className="mt-1 text-xs text-tinta/60">
              Oferta económica · {cotizacion.rev} · {fechaCl(cotizacion.parametrosSnapshot.vigenteDesde)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-1 border-b border-borde py-3.5 text-xs text-tinta sm:grid-cols-2">
          <span>
            <b className="font-medium text-tinta/50">MANDANTE:</b> {cotizacion.cliente ?? "—"}
          </span>
          <span>
            <b className="font-medium text-tinta/50">SERVICIO:</b> {cotizacion.nombre}
          </span>
          <span>
            <b className="font-medium text-tinta/50">FAENA:</b> {cotizacion.faena ?? "—"}
          </span>
          <span>
            <b className="font-medium text-tinta/50">PLAZO:</b> {cotizacion.input.duracionMeses}{" "}
            {cotizacion.input.duracionMeses === 1 ? "mes" : "meses"} · {cotizacion.input.diasServicio} días de
            servicio
          </span>
        </div>

        <div className="grid grid-cols-[40px_minmax(200px,2fr)_90px_50px_110px_120px] gap-x-2 border-b-2 border-tinta py-2 text-[10px] font-bold uppercase tracking-wide text-tinta/50">
          <span>Ítem</span>
          <span>Descripción</span>
          <span>Unidad</span>
          <span className="text-right">Cant.</span>
          <span className="text-right">P. unitario</span>
          <span className="text-right">Total CLP</span>
        </div>
        {result.ecoItems.map((e) => (
          <div
            key={e.item}
            className="grid grid-cols-[40px_minmax(200px,2fr)_90px_50px_110px_120px] items-center gap-x-2 border-b border-borde py-2 text-sm"
          >
            <span className="text-xs text-tinta/40">{e.item}</span>
            <span className="text-tinta">{e.descripcion}</span>
            <span className="text-xs text-tinta/40">{e.unidad}</span>
            <span className="text-right tabular-nums">{e.cantidad}</span>
            <span className="text-right tabular-nums">{money(e.precioUnitario)}</span>
            <span className="text-right font-medium tabular-nums">{money(e.total)}</span>
          </div>
        ))}

        {cotizacion.input.tipoServicio === "contrato_permanente" &&
          result.ecoItemsPersonalSpotContrato.length > 0 && (
            <div className="mt-6">
              <div className="border-b-2 border-tinta pb-1.5 text-xs font-bold uppercase tracking-wide text-tinta">
                Personal SPOT del contrato — facturación por HH
              </div>
              <div className="grid grid-cols-[40px_minmax(200px,2fr)_60px_70px_110px_120px] gap-x-2 border-b border-tinta py-2 text-[10px] font-bold uppercase tracking-wide text-tinta/50">
                <span>Ítem</span>
                <span>Cargo</span>
                <span>Unidad</span>
                <span className="text-right">HH/mes</span>
                <span className="text-right">Tarifa HH25</span>
                <span className="text-right">Total CLP</span>
              </div>
              {result.ecoItemsPersonalSpotContrato.map((e) => (
                <div
                  key={e.item}
                  className="grid grid-cols-[40px_minmax(200px,2fr)_60px_70px_110px_120px] items-center gap-x-2 border-b border-borde py-2 text-sm"
                >
                  <span className="text-xs text-tinta/40">{e.item}</span>
                  <span className="text-tinta">{e.descripcion}</span>
                  <span className="text-xs text-tinta/40">{e.unidad}</span>
                  <span className="text-right tabular-nums">{e.cantidad}</span>
                  <span className="text-right tabular-nums">{money(e.precioUnitario)}</span>
                  <span className="text-right font-medium tabular-nums">{money(e.total)}</span>
                </div>
              ))}
              <div className="flex justify-end pt-3">
                <div className="flex w-72 justify-between rounded-md bg-crema px-3 py-2 text-sm font-semibold text-tinta">
                  <span>SUBTOTAL PERSONAL SPOT</span>
                  <span className="tabular-nums">{money(result.ecoSubtotalPersonalSpotContrato)}</span>
                </div>
              </div>
            </div>
          )}

        <div className="mt-6 flex justify-end border-t-2 border-tinta pt-3">
          <div className="w-72">
            <div className="flex justify-between py-1 text-sm font-medium">
              <span>TOTAL NETO MENSUAL</span>
              <span className="tabular-nums">{money(result.ecoTotalNeto)}</span>
            </div>
            <div className="flex justify-between py-1 text-sm text-tinta/60">
              <span>IVA 19%</span>
              <span className="tabular-nums">{money(result.ecoIva)}</span>
            </div>
            <div className="mt-1 flex justify-between rounded-md bg-tinta px-3 py-2 text-sm font-bold text-white">
              <span>TOTAL MENSUAL</span>
              <span className="tabular-nums text-naranjo-suave">{money(result.ecoConIva)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-borde bg-crema/60 p-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-tinta/40">
            Son (valor neto mensual) — glosa generada automáticamente
          </div>
          <div className="mt-1 text-sm font-medium">{result.glosa}</div>
        </div>

        <div className="mt-11 flex items-end justify-between">
          <div className="text-xs leading-relaxed text-tinta/50">
            Oferta válida por 30 días corridos.
            <br />
            Valores netos, no incluyen IVA salvo indicación.
            <br />
            Boleta de garantía según bases de licitación ({money(result.boletaGarantia)}).
          </div>
          <div className="text-center">
            <div className="w-56 border-t border-tinta pt-1.5 text-sm font-medium">{preparadoPor.nombre}</div>
            <div className="text-xs text-tinta/60">
              Preparado por · {cotizacion.empresa}
              <br />
              {preparadoPor.correo}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
