"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { IconArrowDownRight, IconArrowUpRight, IconChartLine, IconRefresh } from "@tabler/icons-react";

// Los indicadores económicos (UF, dólar, UTM, IPC, TPM) al costado derecho del módulo Finanzas y de
// todos sus submódulos. En pantallas grandes es una columna fija a la derecha; en las chicas, una
// franja arriba que se desliza de lado. Se actualiza solo cada 10 minutos.

const RUTAS = ["/modulos/finanzas", "/finanzas", "/gestion-financiera", "/rendir-gastos"];

interface Indicador {
  codigo: string;
  nombre: string;
  valor: number;
  fecha: string;
  unidad: "pesos" | "porcentaje";
  variacion?: number | null;
}

const pesos = (n: number, dec = 2) => `$${n.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const valorDe = (i: Indicador) => (i.unidad === "porcentaje" ? `${i.valor.toLocaleString("es-CL")}%` : pesos(i.valor, i.codigo === "utm" ? 0 : 2));
const fechaCorta = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "UTC" });

export default function PanelIndicadores() {
  const ruta = usePathname();
  const visible = RUTAS.some((r) => ruta === r || ruta.startsWith(`${r}/`));
  const [datos, setDatos] = useState<{ indicadores: Indicador[]; fuente: string } | null>(null);
  const [error, setError] = useState(false);
  const [monto, setMonto] = useState("1");

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    const cargar = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/indicadores");
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (vivo) {
          setDatos(j);
          setError(false);
        }
      } catch {
        if (vivo) setError(true);
      }
    };
    cargar();
    const t = setInterval(cargar, 10 * 60 * 1000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [visible]);

  const uf = datos?.indicadores.find((i) => i.codigo === "uf")?.valor;
  const dolar = datos?.indicadores.find((i) => i.codigo === "dolar")?.valor;
  const cantidad = useMemo(() => Number(monto.replace(/\./g, "").replace(",", ".")) || 0, [monto]);

  if (!visible) return null;

  return (
    <aside aria-label="Indicadores económicos" className="order-first mb-5 xl:order-none xl:mb-0 xl:w-64 xl:shrink-0">
      <div className="xl:sticky xl:top-6">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gris">
          <IconChartLine size={14} /> Indicadores de hoy
        </p>

        {error && !datos && (
          <p className="flex items-center gap-2 rounded-xl border border-borde bg-superficie px-3 py-2.5 text-xs text-gris">
            <IconRefresh size={14} /> No se pudieron cargar ahora; se reintenta solo.
          </p>
        )}
        {!datos && !error && <div className="h-24 animate-pulse rounded-xl bg-tinta/[0.05] xl:h-80" />}

        {datos && (
          <>
            {/* Celular y tablet: franja deslizable. Escritorio: lista. */}
            <ul className="desliza -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:mx-0 xl:flex-col xl:overflow-visible xl:px-0">
              {datos.indicadores.map((i) => (
                <li
                  key={i.codigo}
                  className={`shrink-0 rounded-xl border bg-superficie px-3.5 py-3 shadow-[0_1px_2px_rgba(23,20,17,0.04)] ${
                    i.codigo === "uf" ? "border-naranjo/30 bg-naranjo/[0.04]" : "border-borde"
                  } min-w-[9.5rem] xl:min-w-0`}
                >
                  <p className="text-[11px] font-semibold text-gris">{i.nombre}</p>
                  <p className="mt-0.5 flex items-baseline gap-1.5 font-condensed text-xl font-bold tabular-nums text-tinta">
                    {valorDe(i)}
                    {typeof i.variacion === "number" && i.variacion !== 0 && (
                      <span className={`inline-flex items-center text-[11px] font-semibold ${i.variacion > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {i.variacion > 0 ? <IconArrowUpRight size={12} /> : <IconArrowDownRight size={12} />}
                        {Math.abs(i.variacion).toLocaleString("es-CL", { maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-gris-suave">{fechaCorta(i.fecha)}</p>
                </li>
              ))}
            </ul>

            {/* Convertidor rápido. En el celular va compacto: la cantidad a la izquierda y los dos
                resultados a la derecha. */}
            {uf && dolar && (
              <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-borde bg-superficie p-3 xl:mt-3 xl:block xl:p-3.5">
                <div className="w-24 shrink-0 xl:w-auto">
                  <p className="text-[11px] font-semibold text-gris">Convertir</p>
                  <input
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    inputMode="decimal"
                    aria-label="Cantidad a convertir"
                    className="mt-1 h-10 w-full rounded-lg border border-borde bg-crema/40 px-3 text-base tabular-nums text-tinta focus:border-naranjo/50 focus:outline-none xl:mt-1.5 xl:h-9 xl:text-sm"
                  />
                </div>
                <dl className="min-w-0 flex-1 space-y-1 text-xs xl:mt-2">
                  <div className="flex justify-between gap-2"><dt className="text-gris">{cantidad.toLocaleString("es-CL")} UF</dt><dd className="font-semibold tabular-nums text-tinta">{pesos(cantidad * uf, 0)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-gris">US$ {cantidad.toLocaleString("es-CL")}</dt><dd className="font-semibold tabular-nums text-tinta">{pesos(cantidad * dolar, 0)}</dd></div>
                </dl>
              </div>
            )}
            <p className="mt-2 hidden text-[10px] text-gris-suave xl:block">Fuente: {datos.fuente} · se actualiza solo</p>
          </>
        )}
      </div>
    </aside>
  );
}
