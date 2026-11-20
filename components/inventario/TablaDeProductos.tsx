"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconChevronRight, IconSearch, IconX } from "@tabler/icons-react";
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

const SELECT = "min-h-9 rounded-lg border border-borde bg-superficie px-2.5 text-xs text-tinta focus:border-naranjo/50 focus:outline-none";

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
}: {
  productos: ProductoConStock[];
  categorias: { id: string; nombre: string }[];
  unidades: Record<string, string>;
  ubicaciones: Record<string, string>;
  miniaturas: Record<string, string>;
  bodegas: { id: string; nombre: string }[];
  bodegasPorProducto: Record<string, string[]>;
}) {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [bodega, setBodega] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [stock, setStock] = useState("");
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

  const hayFiltros = Boolean(q || categoria || bodega || tipo || estado || stock);
  const limpiar = () => {
    setQ(""); setCategoria(""); setBodega(""); setTipo(""); setEstado(""); setStock("");
  };

  return (
    <div className="space-y-3">
      <div className={`${TARJETA} flex flex-wrap items-center gap-2 px-3 py-2.5`}>
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Buscar productos</span>
          <IconSearch size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gris" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, SKU o marca…" className={`${SELECT} w-full pl-8`} />
        </label>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={SELECT} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {[...categorias].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {bodegas.length > 1 && (
          <select value={bodega} onChange={(e) => setBodega(e.target.value)} className={SELECT} aria-label="Bodega">
            <option value="">Todas las bodegas</option>
            {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        )}
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={SELECT} aria-label="Tipo">
          <option value="">Todo tipo</option>
          {Object.entries(ETIQUETA_TIPO_PRODUCTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={SELECT} aria-label="Estado">
          <option value="">Todo estado</option>
          <option value="operativo">Operativo</option>
          <option value="no_operativo">No operativo</option>
        </select>
        <select value={stock} onChange={(e) => setStock(e.target.value)} className={SELECT} aria-label="Stock">
          <option value="">Con y sin stock</option>
          <option value="con">Con stock</option>
          <option value="sin">Sin stock</option>
          <option value="sin-costo">Con stock y costo $0</option>
        </select>
        <span className="ml-auto text-xs text-gris">{visibles.length} de {productos.length}</span>
        {hayFiltros && (
          <button type="button" onClick={limpiar} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-naranjo hover:bg-naranjo/10">
            <IconX size={13} /> Limpiar
          </button>
        )}
      </div>

      {visibles.length === 0 ? (
        <div className={`${TARJETA} p-8 text-center text-sm text-gris`}>Ningún producto coincide con los filtros.</div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Categoría</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">A mano</th>
                  <th className="px-3 py-2 text-right">Disponible</th>
                  <th className="px-3 py-2 text-right" title="A mano + lo que llega - lo que sale en operaciones pendientes">Pronosticado</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {visibles.map((p) => (
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
