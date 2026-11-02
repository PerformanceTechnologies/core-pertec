"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { CAMPO, TARJETA } from "@/lib/estilos";
import { ETIQUETA_CATEGORIA, type CategoriaModelo, type Marca, type Modelo } from "@/lib/flota-modelo";
import { crearMarcaAction, crearModeloAction } from "@/app/(protegido)/flota/acciones";

/** Marcas como tarjetas, cada una con sus modelos y su botón para agregar uno. */
export default function ConfigMarcas({ marcas, modelos }: { marcas: Marca[]; modelos: Modelo[] }) {
  const [buscar, setBuscar] = useState("");
  const q = buscar.trim().toLowerCase();
  const visibles = q
    ? marcas.filter((m) => m.nombre.toLowerCase().includes(q) || modelos.some((mo) => mo.marcaId === m.id && mo.nombre.toLowerCase().includes(q)))
    : marcas;
  // Primero las marcas que ya tienen modelos.
  const ordenadas = [...visibles].sort((a, b) => cuenta(b.id) - cuenta(a.id) || a.nombre.localeCompare(b.nombre));
  function cuenta(id: string) {
    return modelos.filter((m) => m.marcaId === id).length;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar marca o modelo" className={`${CAMPO} pl-9`} />
        </div>
        <NuevaMarca />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ordenadas.map((m) => (
          <TarjetaMarca key={m.id} marca={m} modelos={modelos.filter((mo) => mo.marcaId === m.id)} />
        ))}
        {ordenadas.length === 0 && <p className="col-span-full py-8 text-center text-sm text-gris">Ninguna marca coincide.</p>}
      </div>
    </div>
  );
}

function NuevaMarca() {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  function enviar(fd: FormData) {
    setError(null);
    iniciar(async () => {
      const r = await crearMarcaAction(fd);
      if (!r.ok) return setError(r.error);
      (document.getElementById("nueva-marca") as HTMLFormElement | null)?.reset();
      router.refresh();
    });
  }
  return (
    <form id="nueva-marca" action={enviar} className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
      <input name="nombre" required placeholder="Nueva marca" className={`${CAMPO} w-full sm:w-48`} />
      <button type="submit" disabled={pendiente} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-naranjo-suave disabled:opacity-60">
        <IconPlus size={15} /> Marca
      </button>
      {error && <p className="w-full text-right text-sm text-rose-600">{error}</p>}
    </form>
  );
}

function TarjetaMarca({ marca, modelos }: { marca: Marca; modelos: Modelo[] }) {
  const [agregando, setAgregando] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaModelo>("camioneta");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function enviar(fd: FormData) {
    setError(null);
    fd.set("marcaId", marca.id);
    fd.set("categoria", categoria);
    iniciar(async () => {
      const r = await crearModeloAction(fd);
      if (!r.ok) return setError(r.error);
      setAgregando(false);
      router.refresh();
    });
  }

  return (
    <section className={`${TARJETA} flex flex-col p-4`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-tinta">{marca.nombre}</h3>
        <span className="text-[11px] text-gris">{modelos.length} {modelos.length === 1 ? "modelo" : "modelos"}</span>
      </div>
      <div className="mt-3 flex flex-1 flex-wrap content-start gap-1.5">
        {modelos.map((mo) => (
          <span key={mo.id} className="rounded-full bg-tinta/[0.05] px-2.5 py-1 text-xs text-tinta">
            {mo.nombre} <span className="text-gris">· {ETIQUETA_CATEGORIA[mo.categoria]}</span>
          </span>
        ))}
        {modelos.length === 0 && !agregando && <span className="text-xs text-gris-suave">Sin modelos todavía.</span>}
      </div>
      {agregando ? (
        <form action={enviar} className="mt-3 space-y-2 border-t border-borde pt-3">
          <div className="flex gap-2">
            <input name="nombre" required autoFocus placeholder={`Modelo de ${marca.nombre}`} className={`${CAMPO} py-2`} />
            <button type="button" onClick={() => setAgregando(false)} className="grid h-10 w-10 shrink-0 place-items-center text-gris hover:text-tinta" aria-label="Cancelar">
              <IconX size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(ETIQUETA_CATEGORIA) as CategoriaModelo[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoria(c)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${categoria === c ? "bg-tinta text-superficie" : "bg-tinta/[0.05] text-gris hover:text-tinta"}`}
              >
                {ETIQUETA_CATEGORIA[c]}
              </button>
            ))}
          </div>
          <button type="submit" disabled={pendiente} className="w-full rounded-lg bg-azul py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave disabled:opacity-60">
            Agregar modelo
          </button>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </form>
      ) : (
        <button type="button" onClick={() => setAgregando(true)} className="mt-3 inline-flex items-center gap-1 self-start text-xs font-semibold text-cian hover:underline">
          <IconPlus size={14} /> Agregar modelo
        </button>
      )}
    </section>
  );
}
