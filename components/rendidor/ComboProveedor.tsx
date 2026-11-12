"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { IconLoader2, IconPlus, IconSearch } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { CAMPO } from "@/lib/estilos";
import { crearProveedorAction } from "@/app/(protegido)/rendir-gastos/acciones";
import type { ProveedorOpcion } from "@/lib/rendidor/proveedores";

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * El proveedor de un gasto: se elige de los que ya existen en Contactos (se busca por nombre o
 * RUT). Si no está, «Agregar proveedor» abre un popup para crearlo sin salir del gasto.
 *
 * El texto que se escribe solo busca: lo que queda en el gasto es siempre un proveedor elegido
 * o recién creado (o el que ya traía el gasto, por ejemplo leído de un comprobante).
 */
export default function ComboProveedor({
  valor,
  opciones,
  deshabilitado,
  alElegir,
  alCrear,
}: {
  valor: string;
  opciones: ProveedorOpcion[];
  deshabilitado?: boolean;
  alElegir: (p: ProveedorOpcion) => void;
  /** Un proveedor recién creado: quien contiene el combo lo suma a su lista. */
  alCrear: (p: ProveedorOpcion) => void;
}) {
  const [q, setQ] = useState<string | null>(null); // null = mostrando el valor elegido
  const [abierto, setAbierto] = useState(false);
  const [popup, setPopup] = useState<{ nombre: string } | null>(null);
  const caja = useRef<HTMLInputElement>(null);
  const texto = q ?? valor;

  const lista = useMemo(() => {
    const t = plano((q ?? "").trim());
    if (!t) return opciones.slice(0, 8);
    return opciones.filter((o) => plano(`${o.nombre} ${o.rut ?? ""}`).includes(t)).slice(0, 8);
  }, [q, opciones]);

  const elegir = (o: ProveedorOpcion) => {
    alElegir(o);
    setQ(null);
    setAbierto(false);
  };

  return (
    <div className="relative">
      <IconSearch size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gris-suave" />
      <input
        ref={caja}
        value={texto}
        disabled={deshabilitado}
        placeholder="Buscar proveedor por nombre o RUT…"
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => {
          setQ("");
          setAbierto(true);
        }}
        onBlur={() => setTimeout(() => { setAbierto(false); setQ(null); }, 150)}
        className="h-8 w-full rounded-md border border-borde bg-superficie pl-8 pr-2 text-sm text-tinta outline-none focus:border-naranjo/50 disabled:bg-crema disabled:text-tinta/50"
      />
      {abierto && !deshabilitado && (
        <ul className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-borde/60 bg-superficie p-1 shadow-[0_18px_40px_-14px_rgba(23,20,17,0.35)]">
          {lista.map((o) => (
            <li key={o.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(o)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-naranjo/[0.08]">
                <span className="truncate text-tinta">{o.nombre}</span>
                {o.rut && <span className="shrink-0 font-mono text-[11px] text-gris">{o.rut}</span>}
              </button>
            </li>
          ))}
          {lista.length === 0 && <li className="px-3 py-2 text-xs text-gris">No hay un proveedor con ese nombre.</li>}
          <li>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setAbierto(false); setPopup({ nombre: (q ?? "").trim() }); }}
              className="flex w-full items-center gap-2 rounded-lg border-t border-borde px-3 py-2 text-left text-sm font-semibold text-naranjo transition hover:bg-naranjo/[0.08]"
            >
              <IconPlus size={14} /> Agregar proveedor{q?.trim() ? ` «${q.trim()}»` : ""}
            </button>
          </li>
        </ul>
      )}
      {popup && (
        <NuevoProveedor
          nombreInicial={popup.nombre}
          alCerrar={() => { setPopup(null); setQ(null); }}
          alCrear={(p) => {
            alCrear(p);
            elegir(p);
            setPopup(null);
          }}
        />
      )}
    </div>
  );
}

function NuevoProveedor({ nombreInicial, alCerrar, alCrear }: { nombreInicial: string; alCerrar: () => void; alCrear: (p: ProveedorOpcion) => void }) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [rut, setRut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const guardar = () =>
    iniciar(async () => {
      setError(null);
      const r = await crearProveedorAction(nombre, rut);
      if (!r.ok) return setError(r.error);
      alCrear(r.proveedor);
    });
  return (
    <VentanaModal abierta alCerrar={alCerrar} titulo="Agregar proveedor" descripcion="Queda guardado en Contactos y elegido en este gasto." ancho="max-w-md">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gris">Nombre o razón social *</span>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={100} className={CAMPO} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gris">RUT</span>
          <input value={rut} onChange={(e) => setRut(e.target.value)} placeholder="76.123.456-7" maxLength={20} className={CAMPO} />
          <span className="mt-1 block text-[11px] text-gris-suave">Opcional. Si ya existe un proveedor con ese RUT, se usa ese.</span>
        </label>
        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={alCerrar} className="inline-flex min-h-10 items-center rounded-lg border border-borde px-4 text-sm font-semibold text-gris hover:text-tinta">Cancelar</button>
          <button type="button" disabled={pendiente || !nombre.trim()} onClick={guardar} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-naranjo px-5 text-sm font-bold text-white disabled:opacity-40">
            {pendiente && <IconLoader2 size={16} className="animate-spin" />} Agregar proveedor
          </button>
        </div>
      </div>
    </VentanaModal>
  );
}
