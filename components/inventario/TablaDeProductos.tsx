"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconArchive, IconArrowDown, IconArrowUp, IconArrowsSort, IconChevronLeft, IconChevronRight, IconSearch, IconX } from "@tabler/icons-react";
import { ChipEstadoOperativo, FichaProducto, tonoDeTexto } from "@/components/inventario/Visual";
import {
  ETIQUETA_CERTIFICADO,
  ETIQUETA_SEGUIMIENTO,
  ETIQUETA_TIPO_PRODUCTO,
  diasHasta,
  estadoCertificado,
  formatearCantidad,
  formatearMonto,
} from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";
import type { ProductoConStock } from "@/lib/inventario";

/** Productos por página. */
const POR_PAGINA = 100;

type Columna = "nombre" | "categoria" | "tipo" | "estado" | "aMano" | "disponible" | "pronosticado" | "valor";
const COLUMNAS_NUMERICAS: Columna[] = ["aMano", "disponible", "pronosticado", "valor"];
type Orden = { col: Columna; asc: boolean };

/** Un encabezado que ordena la tabla: clic ordena por esa columna; otro clic invierte el sentido. */
function Encabezado({ col, children, derecha = false, title, orden, ordenarPor }: { col: Columna; children: React.ReactNode; derecha?: boolean; title?: string; orden: Orden; ordenarPor: (c: Columna) => void }) {
  return (
    <th className={`px-3 py-2 ${derecha ? "text-right" : ""}`} title={title} aria-sort={orden.col === col ? (orden.asc ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => ordenarPor(col)} className={`inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-tinta ${orden.col === col ? "text-tinta" : ""}`}>
        {children}
        {orden.col === col ? (orden.asc ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />) : <IconArrowsSort size={12} className="opacity-40" />}
      </button>
    </th>
  );
}

const SELECT = "min-h-8 rounded-lg border border-borde bg-superficie px-2.5 text-xs text-tinta focus:border-naranjo/50 focus:outline-none";

/**
 * La lista de Productos con una línea de filtros arriba: buscar (nombre, SKU o marca), categoría,
 * bodega donde tiene stock, tipo, estado y stock. Filtra en el navegador, mientras se escribe.
 */
export default function TablaDeProductos({
  productos,
  categorias,
  unidades,
  ubicaciones,
  miniaturas,
  bodegas,
  bodegasPorProducto,
  archivados,
  nuevo,
}: {
  productos: ProductoConStock[];
  categorias: { id: string; nombre: string }[];
  unidades: Record<string, string>;
  ubicaciones: Record<string, string>;
  miniaturas: Record<string, string>;
  bodegas: { id: string; nombre: string }[];
  bodegasPorProducto: Record<string, string[]>;
  /** Cuántos productos archivados hay (para el enlace). */
  archivados: number;
  /** El botón «Nuevo producto» (lo arma la página, que tiene los catálogos). */
  nuevo: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [bodega, setBodega] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [stock, setStock] = useState("");
  const [masFiltros, setMasFiltros] = useState(false);
  const [orden, setOrden] = useState<Orden>({ col: "nombre", asc: true });
  const nombreCat = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre])), [categorias]);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return productos.filter((p) => {
      if (texto && !`${p.nombre} ${p.sku ?? ""} ${p.marca ?? ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(texto)) return false;
      if (categoria && p.categoriaId !== categoria) return false;
      if (bodega && !(bodegasPorProducto[p.id] ?? []).includes(bodega)) return false;
      if (tipo && p.tipo !== tipo) return false;
      if (estado && p.estadoOperativo !== estado) return false;
      if (stock === "con" && !(p.aMano > 0)) return false;
      if (stock === "sin" && p.aMano > 0) return false;
      if (stock === "sin-costo" && !(p.aMano > 0 && !(Number(p.costo) > 0))) return false;
      return true;
    });
  }, [productos, q, categoria, bodega, tipo, estado, stock, bodegasPorProducto]);

  // Ordenar: clic en el encabezado; otro clic invierte el sentido.
  const ordenados = useMemo(() => {
    const texto = (p: ProductoConStock): string =>
      orden.col === "categoria" ? (p.categoriaId ? nombreCat.get(p.categoriaId) ?? "" : "") : orden.col === "tipo" ? ETIQUETA_TIPO_PRODUCTO[p.tipo] : orden.col === "estado" ? p.estadoOperativo ?? "" : p.nombre;
    const numero = (p: ProductoConStock): number => Number(p[orden.col as "aMano" | "disponible" | "pronosticado" | "valor"]) || 0;
    const esNumero = COLUMNAS_NUMERICAS.includes(orden.col);
    const lista = [...visibles].sort((a, b) => {
      const r = esNumero ? numero(a) - numero(b) : texto(a).localeCompare(texto(b), "es", { sensitivity: "base" }) || a.nombre.localeCompare(b.nombre, "es");
      return orden.asc ? r : -r;
    });
    return lista;
  }, [visibles, orden, nombreCat]);
  // La página vale para estos filtros y este orden: si cambian, se vuelve a la primera.
  const firma = JSON.stringify([q, categoria, bodega, tipo, estado, stock, orden]);
  const [pagina, setPaginaCon] = useState({ firma, n: 0 });
  const setPagina = (n: number) => setPaginaCon({ firma, n });
  const paginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA));
  const pag = Math.min(pagina.firma === firma ? pagina.n : 0, paginas - 1);
  const enPagina = ordenados.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);
  const ordenarPor = (col: Columna) => setOrden((o) => (o.col === col ? { col, asc: !o.asc } : { col, asc: !COLUMNAS_NUMERICAS.includes(col) }));
  const enc = { orden, ordenarPor };

  const hayFiltros = Boolean(q || categoria || bodega || tipo || estado || stock);
  const limpiar = () => {
    setQ(""); setCategoria(""); setBodega(""); setTipo(""); setEstado(""); setStock("");
  };

  return (
    <div className="space-y-3">
      {/* Una sola cartilla: arriba el título, cuántos hay y las acciones; abajo buscar y filtrar.
          Lo que se usa menos (tipo y estado) queda en «Más filtros». */}
      <div className={`${TARJETA} divide-y divide-borde/70`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2">
          <h1 className="text-sm font-bold text-tinta">Productos</h1>
          <span className="text-xs text-gris">
            {hayFiltros ? `${visibles.length} de ${productos.length}` : productos.length} {productos.length === 1 ? "producto" : "productos"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/inventario/productos/archivados" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-gris transition hover:bg-tinta/[0.04] hover:text-tinta">
              <IconArchive size={14} /> Archivados{archivados > 0 ? ` (${archivados})` : ""}
            </Link>
            {nuevo}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3.5 py-2">
          <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <span className="sr-only">Buscar productos</span>
            <IconSearch size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gris" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, SKU o marca…" className={`${SELECT} w-full pl-8`} />
          </label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={SELECT} aria-label="Categoría">
            <option value="">Categoría</option>
            {[...categorias].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {bodegas.length > 1 && (
            <select value={bodega} onChange={(e) => setBodega(e.target.value)} className={SELECT} aria-label="Bodega">
              <option value="">Bodega</option>
              {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          )}
          <select value={stock} onChange={(e) => setStock(e.target.value)} className={SELECT} aria-label="Stock">
            <option value="">Stock</option>
            <option value="con">Con stock</option>
            <option value="sin">Sin stock</option>
            <option value="sin-costo">Con stock y costo $0</option>
          </select>
          {masFiltros || tipo || estado ? (
            <>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={SELECT} aria-label="Tipo">
                <option value="">Tipo</option>
                {Object.entries(ETIQUETA_TIPO_PRODUCTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className={SELECT} aria-label="Estado">
                <option value="">Estado</option>
                <option value="operativo">Operativo</option>
                <option value="no_operativo">No operativo</option>
              </select>
            </>
          ) : (
            <button type="button" onClick={() => setMasFiltros(true)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-gris transition hover:bg-tinta/[0.04] hover:text-tinta">
              Más filtros
            </button>
          )}
          {hayFiltros && (
            <button type="button" onClick={limpiar} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-naranjo hover:bg-naranjo/10">
              <IconX size={13} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className={`${TARJETA} p-8 text-center text-sm text-gris`}>Ningún producto coincide con los filtros.</div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <Encabezado {...enc} col="nombre">Producto</Encabezado>
                  <Encabezado {...enc} col="categoria">Categoría</Encabezado>
                  <Encabezado {...enc} col="tipo">Tipo</Encabezado>
                  <Encabezado {...enc} col="estado">Estado</Encabezado>
                  <Encabezado {...enc} col="aMano" derecha>A mano</Encabezado>
                  <Encabezado {...enc} col="disponible" derecha>Disponible</Encabezado>
                  <Encabezado {...enc} col="pronosticado" derecha title="A mano + lo que llega - lo que sale en operaciones pendientes">Pronosticado</Encabezado>
                  <Encabezado {...enc} col="valor" derecha>Valor</Encabezado>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {enPagina.map((p) => (
                  <tr key={p.id} className="group transition hover:bg-tinta/[0.02]">
                    <td className="px-3 py-1.5">
                      <Link href={`/inventario/productos/${p.id}`} className="flex items-center gap-2.5">
                        <FichaProducto chica nombre={p.nombre} categoria={p.categoriaId ? nombreCat.get(p.categoriaId) ?? null : null} foto={miniaturas[p.id]} />
                        <span className="min-w-0">
                        <span className="font-semibold text-tinta group-hover:text-naranjo">{p.nombre}</span>
                        <span className="block text-xs text-gris">
                          {p.sku ? <span className="font-mono">{p.sku}</span> : "sin SKU"}
                          {p.marca ? ` · ${p.marca}` : ""}
                          {p.seguimiento !== "ninguno" ? ` · ${ETIQUETA_SEGUIMIENTO[p.seguimiento]}` : ""}
                          {p.ubicacionId && ubicaciones[p.ubicacionId] ? ` · ${ubicaciones[p.ubicacionId]}` : ""}
                        </span>
                        <Avisos producto={p} />
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      {p.categoriaId && nombreCat.get(p.categoriaId) ? (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tonoDeTexto(nombreCat.get(p.categoriaId)!)}`}>{nombreCat.get(p.categoriaId)}</span>
                      ) : (
                        <span className="text-gris-suave">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-gris">{ETIQUETA_TIPO_PRODUCTO[p.tipo]}</td>
                    <td className="px-3 py-1.5"><ChipEstadoOperativo estado={p.estadoOperativo} /></td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-tinta">
                      {p.tipo === "servicio" ? "—" : `${formatearCantidad(p.aMano)} ${unidades[p.unidadId ?? ""] ?? ""}`}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gris">
                      {p.tipo === "servicio" ? "—" : formatearCantidad(p.disponible)}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${p.pronosticado < 0 ? "font-semibold text-rose-600" : "text-gris"}`}
                      title={p.tipo === "servicio" ? undefined : `+${formatearCantidad(p.entrante)} entrante · −${formatearCantidad(p.saliente)} saliente`}
                    >
                      {p.tipo === "servicio" ? "—" : formatearCantidad(p.pronosticado)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gris">{formatearMonto(p.valor)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Link href={`/inventario/productos/${p.id}`} className="inline-grid h-7 w-7 place-items-center rounded-lg text-gris-suave transition group-hover:text-cian">
                        <IconChevronRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {paginas > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-borde px-3.5 py-2 text-xs text-gris">
              <span>
                {pag * POR_PAGINA + 1}–{Math.min((pag + 1) * POR_PAGINA, ordenados.length)} de {ordenados.length}
              </span>
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => setPagina(pag - 1)} disabled={pag === 0} className="inline-grid h-8 w-8 place-items-center rounded-lg transition hover:bg-tinta/[0.05] disabled:opacity-30" aria-label="Página anterior">
                  <IconChevronLeft size={16} />
                </button>
                <span className="px-1 font-semibold text-tinta">Página {pag + 1} de {paginas}</span>
                <button type="button" onClick={() => setPagina(pag + 1)} disabled={pag >= paginas - 1} className="inline-grid h-8 w-8 place-items-center rounded-lg transition hover:bg-tinta/[0.05] disabled:opacity-30" aria-label="Página siguiente">
                  <IconChevronRight size={16} />
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Certificado faltante o vencido y vencimiento del producto, como etiquetas bajo el nombre. */
function Avisos({ producto: p }: { producto: Parameters<typeof estadoCertificado>[0] & { fechaVencimiento: string | null } }) {
  const cert = ETIQUETA_CERTIFICADO[estadoCertificado(p)];
  const dias = diasHasta(p.fechaVencimiento);
  const venc =
    dias === null ? null : dias < 0 ? { texto: "Producto vencido", tono: "bg-rose-500/10 text-rose-600" } : dias <= 30 ? { texto: `Vence en ${dias} d`, tono: "bg-amber-500/10 text-amber-700" } : null;
  if (!cert && !venc) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {cert && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cert.tono}`}>{cert.texto}</span>}
      {venc && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${venc.tono}`}>{venc.texto}</span>}
    </span>
  );
}
