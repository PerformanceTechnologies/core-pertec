"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconChevronRight, IconSearch, IconShieldCheck, IconX } from "@tabler/icons-react";
import { normalizar } from "@/lib/administracion-modelo";
import type { Empresa } from "@/lib/empresas-modelo";
import Avatar from "@/components/admin/Avatar";
import DistintivoEmpresa from "@/components/DistintivoEmpresa";

export type EmpresaDeFila = Pick<Empresa, "id" | "slug" | "logo" | "nombre" | "color">;

/** Una persona, ya resuelta por la página: la lista solo dibuja y filtra. */
export interface FilaUsuario {
  id: string;
  nombre: string | null;
  correo: string;
  esAdmin: boolean;
  invitado: boolean;
  activo: boolean;
  esYo: boolean;
  /** Aplicaciones del catálogo que tiene asignadas. */
  apps: number;
  /** Las empresas en que se puede parar. Vacío = la de por omisión (va en `porOmision`). */
  empresas: EmpresaDeFila[];
  /** «hace 3 días», «Nunca»: calculado en el servidor para que no cambie al hidratar. */
  ultimoIngreso: string;
}

export type FiltroUsuarios = "todos" | "admin" | "invitados" | "inactivos" | "sin-apps";

const FILTROS: { clave: FiltroUsuarios; etiqueta: string; cumple: (f: FilaUsuario) => boolean }[] = [
  { clave: "todos", etiqueta: "Todos", cumple: () => true },
  { clave: "admin", etiqueta: "Administradores", cumple: (f) => f.esAdmin },
  { clave: "invitados", etiqueta: "Invitados", cumple: (f) => f.invitado },
  { clave: "inactivos", etiqueta: "Inactivos", cumple: (f) => !f.activo },
  { clave: "sin-apps", etiqueta: "Sin aplicaciones", cumple: (f) => f.activo && !f.esAdmin && f.apps === 0 },
];

/**
 * La lista de Administración › Usuarios: buscar mientras se escribe, unas pastillas para filtrar
 * y una fila por persona. Toda la fila abre su ficha, donde se edita (y, si hace falta, se elimina):
 * la lista no tiene botones de borrar al lado de cada nombre.
 */
export default function ListaDeUsuarios({
  filas,
  porOmision,
  filtroInicial = "todos",
  busquedaInicial = "",
}: {
  filas: FilaUsuario[];
  porOmision: EmpresaDeFila | null;
  filtroInicial?: FiltroUsuarios;
  busquedaInicial?: string;
}) {
  const [q, setQ] = useState(busquedaInicial);
  const [filtro, setFiltro] = useState<FiltroUsuarios>(filtroInicial);

  const visibles = useMemo(() => {
    const cumple = FILTROS.find((f) => f.clave === filtro)?.cumple ?? (() => true);
    const texto = normalizar(q.trim());
    return filas.filter((f) => cumple(f) && (!texto || normalizar(`${f.nombre ?? ""} ${f.correo}`).includes(texto)));
  }, [filas, filtro, q]);

  // Solo las pastillas que tienen a alguien (y «Todos», siempre): con 0 no hay nada que mirar.
  const pastillas = FILTROS.map((f) => ({ ...f, n: filas.filter(f.cumple).length })).filter((f) => f.clave === "todos" || f.n > 0 || f.clave === filtro);

  return (
    <div className="overflow-hidden rounded-2xl border border-borde bg-superficie shadow-[0_1px_2px_rgba(23,20,17,0.04),0_14px_36px_-22px_rgba(23,20,17,0.18)]">
      <div className="flex flex-col gap-3 border-b border-borde px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <label className="relative min-w-0 sm:w-72">
          <span className="sr-only">Buscar por nombre o correo</span>
          <IconSearch size={16} stroke={1.9} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta/45" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o correo"
            autoComplete="off"
            className="min-h-10 w-full rounded-xl border border-transparent bg-tinta/[0.04] py-2 pl-9 pr-9 text-sm text-tinta placeholder:text-tinta/45 focus:border-naranjo/50 focus:bg-superficie focus:outline-none focus:ring-2 focus:ring-naranjo/20"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-tinta/50 hover:bg-tinta/5 hover:text-tinta">
              <IconX size={14} />
            </button>
          )}
        </label>
        <div role="group" aria-label="Filtrar" className="flex flex-wrap gap-1.5">
          {pastillas.map((p) => (
            <button
              key={p.clave}
              type="button"
              onClick={() => setFiltro(p.clave)}
              aria-pressed={filtro === p.clave}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo ${
                filtro === p.clave
                  ? "border-naranjo bg-naranjo text-white"
                  : `border-borde bg-superficie hover:border-naranjo/40 ${p.clave === "sin-apps" ? "text-amber-700 dark:text-amber-400" : "text-tinta/70 hover:text-tinta"}`
              }`}
            >
              {p.etiqueta}
              <span className={`tabular-nums ${filtro === p.clave ? "text-white/80" : "text-tinta/45"}`}>{p.n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Los títulos de las columnas, alineados con las de cada fila (mismos anchos y separaciones). */}
      {visibles.length > 0 && (
        <div aria-hidden className="hidden items-center gap-4 border-b border-borde bg-crema/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-tinta/50 md:flex">
          <span className="min-w-0 flex-1 pl-14">Persona</span>
          <span className="w-36 shrink-0">Acceso</span>
          <span className="hidden w-28 shrink-0 lg:block">Empresas</span>
          <span className="w-24 shrink-0">Último ingreso</span>
          <span className="w-4 shrink-0" />
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-tinta/60">
          {filas.length === 0 ? "Todavía no hay usuarios." : "Nadie calza con la búsqueda."}
          {(q || filtro !== "todos") && filas.length > 0 && (
            <button type="button" onClick={() => { setQ(""); setFiltro("todos"); }} className="ml-1.5 font-semibold text-naranjo hover:underline">
              Ver todos
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-borde/70">
          {visibles.map((f) => (
            <li key={f.id}>
              <Fila f={f} porOmision={porOmision} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Fila({ f, porOmision }: { f: FilaUsuario; porOmision: EmpresaDeFila | null }) {
  const nombre = f.nombre || f.correo;
  return (
    <Link
      href={`/usuarios/${f.id}`}
      className={`group flex items-center gap-3 px-4 py-3 transition hover:bg-naranjo/[0.04] focus-visible:bg-naranjo/[0.06] focus-visible:outline-none sm:gap-4 ${f.activo ? "" : "opacity-60"}`}
    >
      <Avatar nombre={f.nombre} correo={f.correo} admin={f.esAdmin} />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="truncate font-semibold text-tinta">{nombre}</span>
          {f.esYo && <Etiqueta clase="bg-tinta/10 text-tinta/70">Tú</Etiqueta>}
          {f.invitado && <Etiqueta clase="bg-violet-500/12 text-violet-700 dark:text-violet-300">Invitado</Etiqueta>}
          {!f.activo && <Etiqueta clase="border border-borde text-tinta/65">Inactivo</Etiqueta>}
        </span>
        {f.nombre && <span className="block truncate text-xs text-tinta/60">{f.correo}</span>}
        {/* En celular, lo de las columnas va en una línea debajo del nombre. */}
        <span className="mt-1 block text-[11px] text-tinta/55 md:hidden">
          {f.esAdmin ? "Administrador" : f.apps === 0 ? "Sin aplicaciones" : `${f.apps} ${f.apps === 1 ? "aplicación" : "aplicaciones"}`} · {f.ultimoIngreso}
        </span>
      </span>

      <span className="hidden w-36 shrink-0 md:block">
        {f.esAdmin ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-naranjo/10 px-2 py-0.5 text-[11px] font-semibold text-naranjo">
            <IconShieldCheck size={12} stroke={2.2} aria-hidden /> Administrador
          </span>
        ) : f.apps === 0 ? (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Sin aplicaciones</span>
        ) : (
          <span className="text-xs text-tinta/70">
            <b className="font-semibold text-tinta">{f.apps}</b> {f.apps === 1 ? "aplicación" : "aplicaciones"}
          </span>
        )}
      </span>

      <span className="hidden w-28 shrink-0 lg:block">
        {f.esAdmin ? (
          <span className="text-xs text-tinta/55">Todas</span>
        ) : (
          <Empresas empresas={f.empresas.length > 0 ? f.empresas : porOmision ? [porOmision] : []} porOmision={f.empresas.length === 0} />
        )}
      </span>

      <span className="hidden w-24 shrink-0 text-xs text-tinta/60 md:block">{f.ultimoIngreso}</span>

      <IconChevronRight size={16} className="shrink-0 text-tinta/30 transition group-hover:translate-x-0.5 group-hover:text-naranjo" aria-hidden />
    </Link>
  );
}

function Etiqueta({ clase, children }: { clase: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${clase}`}>{children}</span>;
}

/** Los logos de sus empresas, uno al lado del otro; el nombre completo va en el texto para lectores y en el title. */
function Empresas({ empresas, porOmision }: { empresas: EmpresaDeFila[]; porOmision: boolean }) {
  const nombres = empresas.map((e) => e.nombre).join(", ") + (porOmision ? " (por omisión)" : "");
  return (
    <span className={`flex items-center gap-1 ${porOmision ? "opacity-50" : ""}`} title={nombres}>
      {empresas.map((e) => (
        <DistintivoEmpresa key={e.id} empresa={e} />
      ))}
      <span className="sr-only">{nombres}</span>
    </span>
  );
}
