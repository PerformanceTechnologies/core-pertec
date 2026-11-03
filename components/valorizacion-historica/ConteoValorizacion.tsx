"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconCalculator, IconDownload, IconPlus, IconPrinter, IconSearch, IconTrash } from "@tabler/icons-react";
import {
  RUTA_VH,
  aCsv,
  cantidad,
  compilarBusqueda,
  fechaCorta,
  leerNumero,
  monto,
  normalizar,
  pct,
  totalesConteo,
  unidadLegible,
  valorizarConteo,
  type FilaConteo,
  type ItemCatalogo,
} from "@/lib/valorizacion-historica-modelo";
import { TARJETA } from "@/lib/estilos";

/** Lo justo del catálogo para elegir y valorizar (la página no manda las líneas). */
export type ItemConteo = Pick<ItemCatalogo, "clave" | "categoria" | "subcategoria" | "unidad" | "cantidad" | "costoPromedio" | "ultimoCosto" | "ultimaFecha" | "compras" | "marca">;

// ---------- El conteo vive en este navegador ----------------------------------------
// Es una hoja de trabajo de quien está contando, como la plantilla del Excel: no se comparte ni
// cambia el registro. Si el navegador no deja guardar (ventana privada), funciona igual en memoria.

const CLAVE = "vh-conteo-v1";
let enMemoria: string | null = null;
const oyentes = new Set<() => void>();

function leer(): string {
  if (enMemoria !== null) return enMemoria;
  try {
    enMemoria = localStorage.getItem(CLAVE) ?? "[]";
  } catch {
    enMemoria = "[]";
  }
  return enMemoria;
}

function escribir(filas: FilaConteo[]): void {
  enMemoria = JSON.stringify(filas);
  try {
    localStorage.setItem(CLAVE, enMemoria);
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
  oyentes.forEach((f) => f());
}

function suscribir(f: () => void): () => void {
  const deOtraPestana = (e: StorageEvent) => {
    if (e.key === CLAVE) {
      enMemoria = null;
      f();
    }
  };
  oyentes.add(f);
  window.addEventListener("storage", deOtraPestana);
  return () => {
    oyentes.delete(f);
    window.removeEventListener("storage", deOtraPestana);
  };
}

function parsear(s: string): FilaConteo[] {
  try {
    const x = JSON.parse(s);
    return Array.isArray(x) ? x.filter((f) => f && typeof f.clave === "string") : [];
  } catch {
    return [];
  }
}


export default function ConteoValorizacion({ items }: { items: ItemConteo[] }) {
  const crudo = useSyncExternalStore(suscribir, leer, () => "[]");
  const filas = useMemo(() => parsear(crudo), [crudo]);
  const catalogo = useMemo(() => new Map(items.map((i) => [i.clave, i as ItemCatalogo])), [items]);
  const valorizadas = useMemo(() => valorizarConteo(filas, catalogo), [filas, catalogo]);
  const totales = totalesConteo(valorizadas);

  // Viene de la ficha de un ítem con «Valorizar en un conteo»: se agrega y se limpia la URL.
  const params = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  const agregarDeUrl = params.get("agregar");
  useEffect(() => {
    if (!agregarDeUrl) return;
    const actuales = parsear(leer());
    if (catalogo.has(agregarDeUrl) && !actuales.some((f) => f.clave === agregarDeUrl)) {
      escribir([...actuales, { clave: agregarDeUrl, contado: null, observacion: "" }]);
    }
    router.replace(ruta, { scroll: false });
  }, [agregarDeUrl, catalogo, router, ruta]);

  const cambiar = (clave: string, cambio: Partial<FilaConteo>) => escribir(filas.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));
  const agregar = (clave: string) => {
    if (!filas.some((f) => f.clave === clave)) escribir([...filas, { clave, contado: null, observacion: "" }]);
  };

  const exportar = () => {
    const csv = aCsv(
      ["Ítem", "Categoría", "Unidad", "Cantidad comprada histórica", "Cantidad contada", "Diferencia (consumo/merma)", "% diferencia", "Último costo unitario", "Costo prom. ponderado", "Valor inventario (último costo)", "Valor diferencia (costo prom.)", "Observaciones"],
      valorizadas.map((f) => [
        f.clave,
        f.item?.categoria ?? "No está en el catálogo",
        unidadLegible(f.item?.unidad),
        f.comprado,
        f.contado,
        f.diferencia,
        f.participacionDiferencia === null ? null : Math.round(f.participacionDiferencia * 10000) / 100,
        f.item?.ultimoCosto === null || f.item?.ultimoCosto === undefined ? null : Math.round(f.item.ultimoCosto),
        f.item?.costoPromedio === null || f.item?.costoPromedio === undefined ? null : Math.round(f.item.costoPromedio),
        f.valorInventario === null ? null : Math.round(f.valorInventario),
        f.valorDiferencia === null ? null : Math.round(f.valorDiferencia),
        f.observacion,
      ]),
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `valorizacion-conteo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-5">
      {/* ── Totales ── */}
      <section className="banda-contraste overflow-hidden rounded-2xl px-6 py-6 sm:px-8 print:bg-none print:text-black">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> Valor del inventario contado
            </span>
            <p className="texto-banda mt-3 font-condensed text-4xl font-bold leading-none tabular-nums sm:text-5xl">{monto(totales.valorInventario)}</p>
            <p className="texto-banda-65 mt-2 max-w-2xl text-sm">A último costo de compra (reposición). La diferencia con lo comprado se valoriza a costo promedio y es lo consumido, entregado o perdido que hay que explicar con las salidas de bodega.</p>
          </div>
          <dl className="borde-banda grid grid-cols-3 gap-x-8 gap-y-4 rounded-xl border px-5 py-4 lg:min-w-[28rem]">
            <div>
              <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">Ítems</dt>
              <dd className="texto-banda mt-1 font-condensed text-2xl font-bold tabular-nums">{filas.length}</dd>
            </div>
            <div>
              <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">Contados</dt>
              <dd className="texto-banda mt-1 font-condensed text-2xl font-bold tabular-nums">{totales.contadas}</dd>
            </div>
            <div>
              <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">Diferencia</dt>
              <dd className="texto-banda mt-1 font-condensed text-2xl font-bold tabular-nums">{monto(totales.valorDiferencia)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Selector items={items} yaEstan={new Set(filas.map((f) => f.clave))} onElegir={agregar} />
        <button type="button" onClick={exportar} disabled={filas.length === 0} className="inline-flex items-center gap-1.5 rounded-xl border border-borde bg-superficie px-3 py-2.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50 disabled:opacity-40">
          <IconDownload size={15} /> Exportar CSV
        </button>
        <button type="button" onClick={() => window.print()} disabled={filas.length === 0} className="inline-flex items-center gap-1.5 rounded-xl border border-borde bg-superficie px-3 py-2.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50 disabled:opacity-40">
          <IconPrinter size={15} /> Imprimir
        </button>
        {filas.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm("¿Vaciar el conteo? Se quitan todos los ítems de esta hoja (el registro de compras no cambia).")) escribir([]);
            }}
            className="rounded-xl px-2.5 py-2.5 text-xs font-semibold text-gris hover:text-rose-600"
          >
            Vaciar
          </button>
        )}
      </div>

      {filas.length === 0 ? (
        <div className={`${TARJETA} grid place-items-center gap-3 p-12 text-center`}>
          <IconCalculator size={38} stroke={1.4} className="text-gris-suave" />
          <p className="text-sm font-semibold text-tinta">Agrega los ítems que contaste en bodega</p>
          <ol className="max-w-lg space-y-1 text-left text-xs text-gris">
            <li><strong className="text-tinta">1.</strong> Busca cada ítem arriba (o desde su ficha con «Valorizar en un conteo»).</li>
            <li><strong className="text-tinta">2.</strong> Escribe la cantidad contada en la casilla amarilla.</li>
            <li><strong className="text-tinta">3.</strong> El valor y la diferencia se calculan solos. Exporta o imprime cuando termines.</li>
          </ol>
          <p className="text-[11px] text-gris-suave">La hoja se guarda en este navegador mientras trabajas.</p>
        </div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[72rem] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Ítem</th>
                  <th className="px-3 py-3 text-right">Comprado</th>
                  <th className="px-3 py-3 text-center">Contado</th>
                  <th className="px-3 py-3 text-right">Diferencia</th>
                  <th className="px-3 py-3 text-right">Último costo</th>
                  <th className="px-3 py-3 text-right">Costo prom.</th>
                  <th className="px-3 py-3 text-right">Valor inventario</th>
                  <th className="px-3 py-3 text-right">Valor diferencia</th>
                  <th className="px-3 py-3">Observación</th>
                  <th className="px-2 py-3 print:hidden" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {valorizadas.map((f) => (
                  <tr key={f.clave} className="align-top">
                    <td className="max-w-[22rem] px-4 py-3">
                      <Link href={`${RUTA_VH}/item?c=${encodeURIComponent(f.clave)}`} className="font-semibold leading-snug text-tinta hover:text-naranjo">{f.clave}</Link>
                      <span className="block text-[11px] text-gris">{f.item ? `${f.item.subcategoria} · ${unidadLegible(f.item.unidad) || "sin unidad"}` : "Ya no está en el catálogo"}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gris">{cantidad(f.comprado)}</td>
                    <td className="px-3 py-2">
                      <CampoContado valor={f.contado} etiqueta={`Cantidad contada de ${f.clave}`} onCambio={(contado) => cambiar(f.clave, { contado })} />
                    </td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${f.diferencia && f.diferencia < 0 ? "text-rose-600" : "text-tinta"}`}>
                      {f.diferencia === null ? "—" : cantidad(f.diferencia)}
                      {f.participacionDiferencia !== null && <span className="block text-[10px] text-gris">{pct(f.participacionDiferencia, 0)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gris">
                      {f.item?.ultimoCosto == null ? "—" : monto(f.item.ultimoCosto)}
                      {f.item?.ultimaFecha && <span className="block text-[10px]">{fechaCorta(f.item.ultimaFecha)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gris">{f.item?.costoPromedio == null ? "—" : monto(f.item.costoPromedio)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-tinta">{f.valorInventario === null ? "—" : monto(f.valorInventario)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-tinta">{f.valorDiferencia === null ? "—" : monto(f.valorDiferencia)}</td>
                    <td className="px-3 py-2">
                      <input
                        value={f.observacion}
                        onChange={(e) => cambiar(f.clave, { observacion: e.target.value.slice(0, 300) })}
                        placeholder="Entregado a faena, merma…"
                        className="w-48 rounded-lg border border-borde bg-transparent px-2.5 py-1.5 text-xs text-tinta outline-none focus:border-naranjo/60"
                      />
                    </td>
                    <td className="px-2 py-2.5 print:hidden">
                      <button type="button" onClick={() => escribir(filas.filter((x) => x.clave !== f.clave))} className="rounded-md p-1.5 text-gris hover:bg-rose-500/10 hover:text-rose-600" aria-label={`Quitar ${f.clave}`}>
                        <IconTrash size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borde font-bold text-tinta">
                  <td className="px-4 py-3" colSpan={6}>Total ({totales.contadas} de {filas.length} contados)</td>
                  <td className="px-3 py-3 text-right tabular-nums">{monto(totales.valorInventario)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{monto(totales.valorDiferencia)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** La casilla amarilla: guarda lo escrito tal cual («1,») mientras se escribe y el número aparte. */
function CampoContado({ valor, etiqueta, onCambio }: { valor: number | null; etiqueta: string; onCambio: (n: number | null) => void }) {
  const [texto, setTexto] = useState(valor === null ? "" : String(valor).replace(".", ","));
  return (
    <input
      inputMode="decimal"
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        onCambio(leerNumero(e.target.value));
      }}
      placeholder="—"
      aria-label={etiqueta}
      className="w-24 rounded-lg border border-amber-400/60 bg-amber-300/15 px-2.5 py-1.5 text-right font-semibold tabular-nums text-tinta outline-none focus:border-naranjo focus:ring-2 focus:ring-naranjo/20"
    />
  );
}

/** Buscar un ítem del catálogo y agregarlo: escribir, flechas y Enter. */
function Selector({ items, yaEstan, onElegir }: { items: ItemConteo[]; yaEstan: Set<string>; onElegir: (clave: string) => void }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const caja = useRef<HTMLInputElement>(null);
  const idLista = useId();
  const textos = useMemo(() => items.map((i) => normalizar(`${i.clave} ${i.marca ?? ""} ${i.subcategoria}`)), [items]);
  const resultados = useMemo(() => {
    if (!q.trim()) return [];
    const coincide = compilarBusqueda(q);
    const r: ItemConteo[] = [];
    for (let i = 0; i < items.length && r.length < 12; i++) if (coincide(textos[i])) r.push(items[i]);
    return r;
  }, [q, items, textos]);

  const elegir = (clave: string) => {
    onElegir(clave);
    setQ("");
    setMarcado(0);
    caja.current?.focus();
  };

  return (
    <div className="relative min-w-[18rem] flex-1">
      <IconSearch size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
      <input
        ref={caja}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
          setMarcado(0);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setMarcado((m) => Math.min(m + 1, resultados.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setMarcado((m) => Math.max(m - 1, 0));
          } else if (e.key === "Enter" && resultados[marcado]) {
            e.preventDefault();
            elegir(resultados[marcado].clave);
          } else if (e.key === "Escape") setAbierto(false);
        }}
        placeholder="Agregar un ítem al conteo: escribe para buscar en el catálogo…"
        role="combobox"
        aria-controls={idLista}
        aria-expanded={abierto && resultados.length > 0}
        className="w-full rounded-xl border border-borde bg-superficie py-2.5 pl-10 pr-3 text-sm text-tinta outline-none transition placeholder:text-gris-suave focus:border-naranjo/60 focus:ring-4 focus:ring-naranjo/10"
      />
      {abierto && resultados.length > 0 && (
        <ul id={idLista} role="listbox" className="absolute z-30 mt-1 max-h-96 w-full overflow-auto rounded-xl border border-borde bg-superficie p-1 shadow-xl">
          {resultados.map((i, k) => {
            const esta = yaEstan.has(i.clave);
            return (
              <li key={i.clave} role="option" aria-selected={k === marcado}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(i.clave)}
                  onMouseEnter={() => setMarcado(k)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${k === marcado ? "bg-naranjo/[0.08]" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-tinta">{i.clave}</span>
                    <span className="block truncate text-[11px] text-gris">
                      {i.subcategoria} · {i.compras} {i.compras === 1 ? "compra" : "compras"} · {cantidad(i.cantidad)} {unidadLegible(i.unidad)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs font-bold tabular-nums text-tinta">{i.ultimoCosto == null ? "—" : monto(i.ultimoCosto)}</span>
                  {esta ? <span className="text-[10px] font-semibold text-emerald-600">Ya está</span> : <IconPlus size={16} className="shrink-0 text-naranjo" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
