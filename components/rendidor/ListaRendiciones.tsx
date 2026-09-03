"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconSearch, IconX } from "@tabler/icons-react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { EstadoRendicion, ResumenRendicion } from "@/lib/rendidor/tipos";
import type { ResultadoBorrado } from "@/app/(protegido)/rendir-gastos/acciones";
import BotonBorrarRendicion from "./BotonBorrarRendicion";
import { SOMBRA_CALIDA } from "@/lib/estilos";

/**
 * La grilla de una fila, y la de su encabezado.
 *
 * Una sola definición para los dos: si se separan, el encabezado deja de estar
 * sobre su columna y nadie lo nota hasta que alguien mira de cerca.
 *
 * Las columnas arrancan en `xl` y no en `lg` por una razón concreta: las seis
 * columnas fijas suman 650px y los gaps 96 más, y con el sidebar de 256px un
 * viewport de 1024 (donde empieza `lg`) deja 688px de contenido. La columna
 * flexible del título quedaría en negativo y colapsaría a nada. A 1280 quedan
 * 944px y el título se lleva ~198. Debajo de eso van tarjetas apiladas.
 *
 * Así se veía cuando esto estaba mal: la lista tenía min-w-[880px] con columnas
 * que necesitaban 806, o sea 74px para el título, y "FONDOS 2" se mostraba como
 * "FON...". En cualquier pantalla bajo ~1050px, no solo en el celular.
 */
const GRILLA = "xl:grid xl:grid-cols-[minmax(0,1fr)_130px_72px_104px_112px_112px_120px] xl:gap-x-4";

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
/**
 * Un dato numérico de la fila.
 *
 * En pantalla ancha es una celda alineada a la derecha bajo su encabezado. En
 * angosta el encabezado no existe, así que la etiqueta viaja con el dato: un
 * "$10.000" suelto sin decir si es el fondo o lo rendido no informa nada.
 *
 * Es la única duplicación de la versión móvil y la de escritorio, y es de una
 * palabra por celda. La alternativa —renderizar dos árboles con hidden/block—
 * duplica el DOM entero y garantiza que uno de los dos quede sin actualizar.
 */
function Celda({
  etiqueta,
  children,
  className = "",
  title,
}: {
  etiqueta: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div className={`min-w-0 xl:text-right ${className}`} title={title}>
      <span className="block text-[10px] font-medium text-tinta/40 xl:hidden">{etiqueta}</span>
      <span className="text-sm tabular-nums">{children}</span>
    </div>
  );
}

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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Segmentado, no pastillas sueltas: el recuadro que las agrupa deja
              claro que son excluyentes entre sí.
              En angosto ocupa el ancho y los tres botones se reparten en partes
              iguales; apretados a la izquierda dejaban un hueco raro al lado. */}
          <div className="flex h-9 items-center rounded-lg border border-borde bg-superficie p-0.5">
            {filtros.map((f) => {
              const activo = filtro === f.valor;
              return (
                <button
                  key={f.valor}
                  type="button"
                  onClick={() => setFiltro(f.valor)}
                  aria-pressed={activo}
                  className={`flex-1 whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold transition-colors sm:flex-none ${
                    activo ? "bg-naranjo text-white" : "text-tinta/50 hover:text-naranjo"
                  } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-naranjo`}
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
            className="h-9 w-full rounded-lg border border-borde bg-superficie px-3 text-xs font-medium text-tinta/70 outline-none focus:border-naranjo/50 sm:w-auto"
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
        <p className="mx-auto mt-8 max-w-[46ch] rounded-xl border border-dashed border-borde px-4 py-8 text-center text-sm text-pretty text-tinta/50">
          Ninguna rendición coincide con la búsqueda.{" "}
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              setFiltro("todas");
            }}
            className="font-semibold text-naranjo underline underline-offset-2 hover:text-naranjo-suave"
          >
            Limpiar los filtros
          </button>
        </p>
      ) : (
        <>
          {/* Los encabezados aparecen solo cuando hay columnas que encabezar.
              En caja normal y no en mayúsculas con tracking ancho: la barra de
              filtros ya trae mayúsculas y el título de cada fila también, y con
              todo en caja alta la jerarquía se aplana. */}
          <div
            className={`mt-6 hidden border-b border-borde px-4 pb-2 text-[11px] font-medium text-tinta/45 ${GRILLA}`}
          >
            <span>Rendición</span>
            <span>Quién rinde</span>
            <span className="text-right">Comprob.</span>
            <span className="text-right">Fondo</span>
            <span className="text-right">Rendido</span>
            <span className="text-right">Saldo</span>
            <span />
          </div>

          <ul className="mt-3 flex flex-col gap-2 xl:mt-2">
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
                  // La barra de color a la izquierda repite el estado —los mismos
                  // teal y gris de las pastillas del Cotizador— para poder
                  // recorrer la columna de un vistazo.
                  //
                  // En angosto es una tarjeta: el título arriba a todo el ancho y
                  // los cuatro montos en una grilla de 2×2 con su etiqueta. En xl
                  // pasa a fila de columnas alineadas.
                  className={`grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-borde border-l-[3px] bg-superficie px-4 py-3.5 transition-colors duration-200 hover:bg-crema/40 sm:grid-cols-4 xl:items-center xl:gap-y-0 xl:py-3 ${SOMBRA_CALIDA} ${GRILLA} ${
                    cargada ? "border-l-teal" : "border-l-gris"
                  }`}
                >
                  <div className="col-span-2 min-w-0 sm:col-span-4 xl:col-span-1">
                    <Link
                      href={`/rendir-gastos/${r.id}`}
                      title={r.tituloRendicion}
                      className="block truncate font-condensed text-base font-bold uppercase tracking-wide text-tinta transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                    >
                      {r.tituloRendicion}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-tinta/40">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          cargada ? "bg-teal/10 text-teal" : "bg-gris/10 text-gris"
                        }`}
                      >
                        {cargada ? "Cargada" : "Borrador"}
                      </span>
                      {fechaCl(r.creadoEn)}
                      {/* Quién rinde tiene columna propia en xl. En angosto va
                          acá, junto a la fecha, en vez de gastar una celda de la
                          grilla de montos. */}
                      <span className="xl:hidden">
                        · {r.nombreQuienRinde}
                        {!r.esMia && " (de otra persona)"}
                      </span>
                    </p>
                  </div>

                  <span className="hidden min-w-0 truncate text-sm text-tinta/60 xl:block" title={r.nombreQuienRinde}>
                    {r.nombreQuienRinde}
                    {/* Un admin ve las de todos, así que hay que poder distinguir de un
                        vistazo la propia de la de otra persona: las dos se ven igual y las
                        acciones de la fila —borrar— se leen como si fueran sobre lo propio. */}
                    {!r.esMia && (
                      <span className="ml-1.5 rounded bg-gris/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tinta/50">
                        de otra persona
                      </span>
                    )}
                  </span>

                  <Celda etiqueta="Comprob." className="text-tinta/60">
                    {r.cantidadGastos}
                  </Celda>
                  <Celda etiqueta="Fondo" className="text-tinta/60">
                    {money(r.montoAsignado)}
                  </Celda>
                  <Celda etiqueta="Rendido" className="font-semibold text-tinta">
                    {money(r.totalGastos)}
                  </Celda>
                  <Celda
                    etiqueta="Saldo"
                    className={saldoVacio ? "text-tinta/25" : saldo >= 0 ? "text-teal" : "text-naranjo"}
                    title={
                      saldoVacio
                        ? "Sin fondo entregado y sin comprobantes todavía"
                        : saldo >= 0
                          ? `A reembolsar a ${r.nombreQuienRinde}`
                          : "A reintegrar a la empresa"
                    }
                  >
                    {saldoVacio ? "—" : money(Math.abs(saldo))}
                  </Celda>

                  <div className="col-span-2 flex justify-end border-t border-borde pt-3 sm:col-span-4 xl:col-span-1 xl:border-t-0 xl:pt-0">
                    {/* También las cargadas. La confirmación avisa que los gastos
                        quedan vivos en Odoo y muestra sus ids. */}
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
        </>
      )}
    </div>
  );
}
