"use client";

import { useEffect, useRef, useState } from "react";
import type { ClienteOdoo } from "@/lib/cotizador/clientes-odoo";
import { crearClienteOdooAction } from "@/app/(protegido)/cotizador/acciones";

// Autocompletado de Cliente contra Odoo (res.partner) — busca en vivo
// mientras se escribe y, si no hay coincidencia exacta, ofrece crear el
// cliente directamente en Odoo. El <input> mantiene name="cliente" para que
// el <form> que lo envuelve (ParametrosTab/FormularioCotizacion) lo capture
// igual que antes; solo cambia cómo se llena.
export default function ClienteOdooInput({
  name,
  defaultValue,
  disabled,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [valor, setValor] = useState(defaultValue ?? "");
  const [resultados, setResultados] = useState<ClienteOdoo[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const termino = valor.trim();
    if (termino.length < 2) {
      setResultados([]);
      return;
    }
    const idTimeout = setTimeout(async () => {
      setBuscando(true);
      setError(null);
      try {
        const resp = await fetch(`/api/cotizador/clientes-odoo?q=${encodeURIComponent(termino)}`);
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error ?? "Error al buscar en Odoo");
        setResultados(json.clientes ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo buscar en Odoo");
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 400);

    return () => clearTimeout(idTimeout);
  }, [valor]);

  useEffect(() => {
    const alHacerClicFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  const seleccionar = (cliente: ClienteOdoo) => {
    setValor(cliente.nombre);
    setAbierto(false);
  };

  const crear = async () => {
    const nombre = valor.trim();
    if (!nombre) return;
    setCreando(true);
    setError(null);
    try {
      const cliente = await crearClienteOdooAction(nombre);
      seleccionar(cliente);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el cliente en Odoo");
    } finally {
      setCreando(false);
    }
  };

  const terminoNormalizado = valor.trim().toLowerCase();
  const hayCoincidenciaExacta = resultados.some((c) => c.nombre.trim().toLowerCase() === terminoNormalizado);
  const puedeCrear = !buscando && !hayCoincidenciaExacta && valor.trim().length >= 2;

  return (
    <div ref={contenedorRef} className="relative">
      <input
        name={name}
        value={valor}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setValor(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        className="mt-1 h-9 w-full rounded-md border border-borde px-2 text-sm outline-none focus:border-naranjo/50 disabled:bg-crema"
      />

      {abierto && !disabled && valor.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-borde bg-white shadow-md">
          {buscando && <div className="px-3 py-2 text-xs text-tinta/40">Buscando en Odoo…</div>}
          {!buscando && error && <div className="px-3 py-2 text-xs text-red-600">{error}</div>}
          {!buscando &&
            !error &&
            resultados.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => seleccionar(c)}
                className="block w-full px-3 py-2 text-left text-sm text-tinta hover:bg-crema"
              >
                {c.nombre}
                {(c.rut || c.ciudad) && (
                  <span className="ml-2 text-xs text-tinta/40">
                    {[c.rut, c.ciudad].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            ))}
          {!buscando && !error && resultados.length === 0 && (
            <div className="px-3 py-2 text-xs text-tinta/40">Sin coincidencias en Odoo.</div>
          )}
          {puedeCrear && (
            <button
              type="button"
              onClick={crear}
              disabled={creando}
              className="block w-full border-t border-borde bg-crema/40 px-3 py-2 text-left text-sm font-medium text-naranjo hover:bg-crema disabled:opacity-50"
            >
              {creando ? "Creando…" : `+ Crear cliente "${valor.trim()}" en Odoo`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
