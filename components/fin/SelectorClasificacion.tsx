"use client";

import { useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { CAMPO, Campo } from "./ui";

export interface OpcionCategoria {
  id: string;
  nombre: string;
  sentido: "ingreso" | "egreso" | "ambos";
  requiereProyecto: boolean;
  afectaResultado: boolean;
}

export interface OpcionSubcategoria {
  id: string;
  categoriaId: string;
  nombre: string;
}

const normal = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Elegir la clasificación de un movimiento con la lista maestra de Finanzas: primero la categoría, después la
 * subcategoría (solo las de esa categoría). Un buscador encuentra la subcategoría escribiendo («combus», «previred»)
 * y elige las dos de una. Solo se ofrecen categorías del sentido del monto: un cargo no puede ser un ingreso.
 * Envía `categoriaId` y `subcategoriaId` en el formulario que lo contiene.
 */
export default function SelectorClasificacion({
  monto,
  categorias,
  subcategorias,
  categoriaInicial,
  subcategoriaInicial,
}: {
  monto: number;
  categorias: OpcionCategoria[];
  subcategorias: OpcionSubcategoria[];
  categoriaInicial: string | null;
  subcategoriaInicial: string | null;
}) {
  const sentido = monto < 0 ? "egreso" : "ingreso";
  const posibles = categorias.filter((c) => c.sentido === "ambos" || c.sentido === sentido || c.id === categoriaInicial);
  const [categoriaId, setCategoriaId] = useState(categoriaInicial ?? "");
  const [subcategoriaId, setSubcategoriaId] = useState(subcategoriaInicial ?? "");
  const [busqueda, setBusqueda] = useState("");
  const subs = subcategorias.filter((s) => s.categoriaId === categoriaId);
  const categoria = posibles.find((c) => c.id === categoriaId) ?? null;

  const resultados = buscar();

  function buscar() {
    const q = normal(busqueda.trim());
    if (q.length < 2) return [];
    const ids = new Set(posibles.map((c) => c.id));
    const porSub = subcategorias
      .filter((s) => ids.has(s.categoriaId) && normal(s.nombre).includes(q))
      .map((s) => ({ categoriaId: s.categoriaId, subcategoriaId: s.id, texto: s.nombre, detalle: posibles.find((c) => c.id === s.categoriaId)?.nombre ?? "" }));
    const porCat = posibles
      .filter((c) => normal(c.nombre).includes(q) && !subcategorias.some((s) => s.categoriaId === c.id))
      .map((c) => ({ categoriaId: c.id, subcategoriaId: "", texto: c.nombre, detalle: c.sentido === "ingreso" ? "Ingreso" : "" }));
    return [...porCat, ...porSub].slice(0, 8);
  }

  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="relative block">
          <IconSearch size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gris" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={sentido === "egreso" ? "Buscar el tipo de gasto: combustible, Previred, arriendo…" : "Buscar el tipo de ingreso: servicios, arriendos…"}
            aria-label="Buscar en la lista de categorías"
            className={`${CAMPO} pl-8`}
          />
        </label>
        {resultados.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {resultados.map((r) => (
              <button
                key={`${r.categoriaId}-${r.subcategoriaId}`}
                type="button"
                onClick={() => {
                  setCategoriaId(r.categoriaId);
                  setSubcategoriaId(r.subcategoriaId);
                  setBusqueda("");
                }}
                className="rounded-lg border border-borde bg-superficie px-2 py-1 text-left text-xs transition hover:border-naranjo hover:bg-naranjo/5"
              >
                <span className="font-semibold text-tinta">{r.texto}</span>
                {r.detalle && <span className="ml-1 text-gris">· {r.detalle}</span>}
              </button>
            ))}
          </div>
        )}
        {busqueda.trim().length >= 2 && resultados.length === 0 && (
          <p className="mt-1 text-[11px] text-gris">No está en la lista. Si falta, pídela a quien mantiene las categorías en Finanzas.</p>
        )}
      </div>
      <Campo etiqueta="Categoría">
        <select
          name="categoriaId"
          value={categoriaId}
          onChange={(e) => {
            setCategoriaId(e.target.value);
            setSubcategoriaId("");
          }}
          className={CAMPO}
        >
          <option value="">— Sin clasificar</option>
          {posibles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {!c.afectaResultado ? " (no es ingreso ni gasto)" : ""}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta={subs.length > 0 ? "Subcategoría *" : "Subcategoría"}>
        <select name="subcategoriaId" value={subcategoriaId} onChange={(e) => setSubcategoriaId(e.target.value)} disabled={subs.length === 0} className={CAMPO}>
          <option value="">{subs.length > 0 ? "Elige…" : categoriaId ? "No lleva" : "Primero la categoría"}</option>
          {subs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </Campo>
      {categoria && !categoria.afectaResultado && (
        <p className="text-[11px] text-gris sm:col-span-2">
          «{categoria.nombre}» mueve caja pero no es ingreso ni gasto: no suma en los totales del resultado.
        </p>
      )}
      {categoria?.requiereProyecto && <p className="text-[11px] text-aviso sm:col-span-2">«{categoria.nombre}» pide el proyecto.</p>}
    </div>
  );
}
