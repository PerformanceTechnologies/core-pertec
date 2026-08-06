"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconSearch, IconX } from "@tabler/icons-react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { EstadoRendicion, ResumenRendicion } from "@/lib/rendidor/tipos";
import type { ResultadoBorrado } from "@/app/(protegido)/rendir-gastos/acciones";
import BotonBorrarRendicion from "./BotonBorrarRendicion";

type Filtro = "todas" | EstadoRendicion;
type Orden = "recientes" | "monto" | "comprobantes" | "titulo";

const ORDENES: { valor: Orden; etiqueta: string }[] = [
  { valor: "recientes", etiqueta: "Más recientes" },
  { valor: "monto", etiqueta: "Mayor monto" },
  { valor: "comprobantes", etiqueta: "Más comprobantes" },
  { valor: "titulo", etiqueta: "Título (A-Z)" },
];

/**
 * Deja un texto comparable: sin mayúsculas y sin tildes.
 *
 * Buscar "operacion" tiene que encontrar "Operación". La gente no escribe las
 * tildes en un buscador, y sin esto la mitad de las rendiciones se vuelven
 * inencontrables por su propio nombre.
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * La lista de rendiciones, con buscador y filtros.
 *
 * Filtra en el cliente y no contra el servidor a propósito: son las rendiciones
 * de una sola persona, o sea decenas, no miles. Ya vienen todas en la respuesta,
 * así que filtrar acá es instantáneo y no cuesta un round-trip por cada tecla.
 * Si algún día esto pasa a ser la vista de TODA la empresa, hay que moverlo a
 * la consulta.
 */
export default function ListaRendiciones({
  rendiciones,
  borrar,
}: {
  rendiciones: ResumenRendicion[];
  borrar: (id: string) => Promise<ResultadoBorrado>;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [orden, setOrden] = useState<Orden>("recientes");

  const conteos = useMemo(
    () => ({
      todas: rendiciones.length,
      borrador: rendiciones.filter((r) => r.estado === "borrador").length,
      cargada_odoo: rendiciones.filter((r) => r.estado === "cargada_odoo").length,
    }),
    [rendiciones],
  );

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const filtradas = rendiciones.filter((r) => {
      if (filtro !== "todas" && r.estado !== filtro) return false;
      if (!q) return true;
      // Título y persona: son los dos campos que alguien recuerda de memoria.
      return normalizar(`${r.tituloRendicion} ${r.nombreQuienRinde}`).includes(q);
    });

    // Copia antes de ordenar: sort muta, y `rendiciones` es la prop del padre.
    return [...filtradas].sort((a, b) => {
      switch (orden) {
        case "monto":
          return b.totalGastos - a.totalGastos;
        case "comprobantes":
          return b.cantidadGastos - a.cantidadGastos;
        case "titulo":
          return a.tituloRendicion.localeCompare(b.tituloRendicion, "es");
        default:
          return b.creadoEn.localeCompare(a.creadoEn);
      }
    });
  }, [rendiciones, busqueda, filtro, orden]);

  const filtros: { valor: Filtro; etiqueta: string; cuenta: number }[] = [
    { valor: "todas", etiqueta: "Todas", cuenta: conteos.todas },
    { valor: "borrador", etiqueta: "Borrador", cuenta: conteos.borrador },
    { valor: "cargada_odoo", etiqueta: "Cargadas", cuenta: conteos.cargada_odoo },
  ];

  return (
    <div>
      {/* Barra de herramientas: buscador a la izquierda, filtros y orden a la
          derecha. Se apila en pantalla angosta. */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:w-72">
          <IconSearch
            size={16}
            stroke={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta/35"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por título o persona..."
            aria-label="Buscar rendiciones"
            className="h-9 w-full rounded-lg border border-borde bg-superficie pl-9 pr-9 text-sm text-tinta outline-none focus:border-naranjo/50"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              aria-label="Limpiar la búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-tinta/35 transition hover:bg-tinta/5 hover:text-tinta"
            >
              <IconX size={14} stroke={2} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmentado, no pastillas sueltas: el recuadro que las agrupa deja
              claro que son excluyentes entre sí. */}
          <div className="inline-flex h-9 items-center rounded-lg border border-borde bg-superficie p-0.5">
            {filtros.map((f) => {
              const activo = filtro === f.valor;
              return (
                <button
                  key={f.valor}
                  type="button"
                  onClick={() => setFiltro(f.valor)}
                  aria-pressed={activo}
                  className={`rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                    activo ? "bg-naranjo text-white" : "text-tinta/50 hover:text-naranjo"
                  }`}
                >
                  {f.etiqueta}
                  <span className={`ml-1.5 tabular-nums ${activo ? "text-white/60" : "text-tinta/30"}`}>
                    {f.cuenta}
                  </span>
                </button>
              );
            })}
          </div>

          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            aria-label="Ordenar las rendiciones"
            className="h-9 rounded-lg border border-borde bg-superficie px-3 text-xs font-semibold uppercase tracking-wide text-tinta/70 outline-none focus:border-naranjo/50"
          >
            {ORDENES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-borde px-4 py-8 text-center text-sm text-tinta/50">
          Ninguna rendición coincide con lo que buscás.{" "}
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              setFiltro("todas");
            }}
            className="font-semibold text-naranjo underline underline-offset-2"
          >
            Limpiar los filtros
          </button>
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="min-w-[880px]">
            {/* Los encabezados van sueltos sobre las filas, sin barra de fondo ni
                caja alrededor: la lista son listones separados, no una tabla. La
                grilla se define una sola vez acá abajo y se repite igual en cada
                fila, que es lo que mantiene las cifras en columna. */}
            <div className="grid grid-cols-[minmax(0,1fr)_130px_86px_112px_112px_120px_150px] gap-x-4 px-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-tinta/35">
              <span>Rendición</span>
              <span>Quién rinde</span>
              <span className="text-right">Comprob.</span>
              <span className="text-right">Fondo</span>
              <span className="text-right">Rendido</span>
              <span className="text-right">Saldo</span>
              <span />
            </div>

            <ul className="flex flex-col gap-1.5">
              {visibles.map((r) => {
                // Positivo: la persona puso más que el fondo y hay que
                // reembolsarle. Negativo: sobró fondo y lo tiene que devolver.
                const saldo = r.totalGastos - r.montoAsignado;
                const cargada = r.estado === "cargada_odoo";
                // Una rendición recién creada, sin fondo ni comprobantes, tiene
                // saldo 0 — pero pintarlo de verde como "a reembolsar" es ruido:
                // todavía no hay nada que devolver ni cobrar.
                const saldoVacio = r.totalGastos === 0 && r.montoAsignado === 0;

                return (
                  <li
                    key={r.id}
                    // La barra de color a la izquierda repite el estado —los
                    // mismos teal y gris de las pastillas del Cotizador— para
                    // poder recorrer la columna de un vistazo.
                    className={`grid grid-cols-[minmax(0,1fr)_130px_86px_112px_112px_120px_150px] items-center gap-x-4 rounded-lg border border-borde border-l-[3px] bg-superficie px-4 py-3 transition hover:bg-crema/40 ${
                      cargada ? "border-l-teal" : "border-l-gris"
                    }`}
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/rendir-gastos/${r.id}`}
                        title={r.tituloRendicion}
                        className="block truncate font-condensed text-base font-bold uppercase tracking-wide text-tinta transition hover:text-naranjo"
                      >
                        {r.tituloRendicion}
                      </Link>
                      <p className="mt-1 flex items-center gap-2 text-[11px] text-tinta/40">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            cargada ? "bg-teal/10 text-teal" : "bg-gris/10 text-gris"
                          }`}
                        >
                          {cargada ? "Cargada" : "Borrador"}
                        </span>
                        {fechaCl(r.creadoEn)}
                      </p>
                    </div>

                    <span className="truncate text-sm text-tinta/60" title={r.nombreQuienRinde}>
                      {r.nombreQuienRinde}
                    </span>

                    <span className="text-right text-sm tabular-nums text-tinta/60">{r.cantidadGastos}</span>
                    <span className="text-right text-sm tabular-nums text-tinta/60">
                      {money(r.montoAsignado)}
                    </span>
                    <span className="text-right text-sm font-semibold tabular-nums text-tinta">
                      {money(r.totalGastos)}
                    </span>

                    <span
                      className={`text-right text-sm tabular-nums ${
                        saldoVacio ? "text-tinta/25" : saldo >= 0 ? "text-teal" : "text-naranjo"
                      }`}
                      title={
                        saldoVacio
                          ? "Sin fondo entregado y sin comprobantes todavía"
                          : saldo >= 0
                            ? `A reembolsar a ${r.nombreQuienRinde}`
                            : "A reintegrar a la empresa"
                      }
                    >
                      {saldoVacio ? "—" : money(Math.abs(saldo))}
                    </span>

                    <div className="flex justify-end">
                      {/* También las cargadas. La confirmación avisa que los
                          gastos quedan vivos en Odoo y muestra sus ids. */}
                      <BotonBorrarRendicion
                        id={r.id}
                        titulo={r.tituloRendicion}
                        cargada={cargada}
                        idsOdoo={r.odooExpenseIds}
                        borrar={borrar}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
