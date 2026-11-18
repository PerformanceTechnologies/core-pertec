"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconChevronRight, IconMailForward, IconPlus, IconSearch, IconShieldCheck, IconUsersGroup, IconX } from "@tabler/icons-react";
import { normalizar } from "@/lib/administracion-modelo";
import type { Empresa } from "@/lib/empresas-modelo";
import { BOTON_C, CAMPO_C, HOJA, IconoTile, type TonoIcono } from "@/components/contactos/Visual";
import { AvatarUsuario, CHIP } from "@/components/admin/VisualUsuarios";
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
  /** Las empresas en que se puede parar. Vacío = la de por omisión. */
  empresas: EmpresaDeFila[];
  /** «hace 3 días», «Nunca»: calculado en el servidor para que no cambie al hidratar. */
  ultimoIngreso: string;
}

export type FiltroUsuarios = "todos" | "admin" | "invitados" | "inactivos" | "sin-apps";

const sinApps = (f: FilaUsuario) => f.activo && !f.esAdmin && f.apps === 0;

const FILTROS: { clave: FiltroUsuarios; etiqueta: string; cumple: (f: FilaUsuario) => boolean }[] = [
  { clave: "todos", etiqueta: "Todos", cumple: () => true },
  { clave: "admin", etiqueta: "Administradores", cumple: (f) => f.esAdmin },
  { clave: "invitados", etiqueta: "Invitados", cumple: (f) => f.invitado },
  { clave: "inactivos", etiqueta: "Sin acceso", cumple: (f) => !f.activo },
  { clave: "sin-apps", etiqueta: "Sin aplicaciones", cumple: sinApps },
];

/**
 * La lista de Administración › Usuarios, con la misma forma que la de Contactos: un resumen cuyas
 * cifras filtran, el buscador y las pastillas, y la tabla. Busca mientras se escribe (son decenas
 * de personas, no miles). Toda la fila abre la ficha de la persona.
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

  const cuantos = (c: FiltroUsuarios) => filas.filter(FILTROS.find((f) => f.clave === c)!.cumple).length;
  // Las pastillas que no tienen a nadie no aparecen (salvo «Todos» y la que esté elegida).
  const pastillas = FILTROS.map((f) => ({ ...f, n: cuantos(f.clave) })).filter((f) => f.clave === "todos" || f.n > 0 || f.clave === filtro);
  const cifras: { clave: FiltroUsuarios; etiqueta: string; detalle: string; Icono: typeof IconUsersGroup; tono: TonoIcono; valor: number }[] = [
    { clave: "todos", etiqueta: "Personas", detalle: "con cuenta en el Core", Icono: IconUsersGroup, tono: "azul", valor: filas.length },
    { clave: "admin", etiqueta: "Administradores", detalle: "entran a todo", Icono: IconShieldCheck, tono: "marca", valor: cuantos("admin") },
    { clave: "invitados", etiqueta: "Invitados", detalle: "de fuera de PERTEC", Icono: IconMailForward, tono: "verde", valor: cuantos("invitados") },
  ];

  return (
    <div className="space-y-3">
      {/* ── Resumen: cada cifra es también el filtro ── */}
      <section className={`${HOJA} grid w-full grid-cols-3 gap-1.5 p-1.5`} aria-label="Resumen de usuarios">
        {cifras.map((m) => (
          <button
            key={m.clave}
            type="button"
            onClick={() => setFiltro(m.clave)}
            aria-pressed={filtro === m.clave}
            className={`group flex min-w-0 flex-col items-start gap-2 rounded-[18px] px-3 py-3 text-left transition hover:bg-tinta/[0.04] active:scale-[0.99] sm:flex-row sm:items-center sm:gap-3.5 sm:px-5 ${filtro === m.clave ? "bg-tinta/[0.05]" : ""}`}
          >
            <IconoTile Icono={m.Icono} tono={m.tono} tamano="grande" />
            <span className="min-w-0">
              <span className="block font-condensed text-[28px] font-bold leading-none tabular-nums text-tinta transition group-hover:text-naranjo sm:text-4xl">{m.valor}</span>
              <span className="mt-1 block truncate text-xs font-semibold text-gris">
                {m.etiqueta}
                <span className="hidden font-normal text-gris-suave lg:inline"> · {m.detalle}</span>
              </span>
            </span>
          </button>
        ))}
      </section>

      {/* ── Buscador a la izquierda, filtros al medio, nuevo usuario a la derecha ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Buscar usuarios</span>
          <IconSearch size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gris" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o correo…" autoComplete="off" className={`${CAMPO_C} rounded-full pl-9 pr-9`} />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-gris hover:bg-tinta/[0.06] hover:text-tinta">
              <IconX size={14} />
            </button>
          )}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {pastillas.map((p) => (
            <button
              key={p.clave}
              type="button"
              onClick={() => setFiltro(p.clave)}
              aria-pressed={filtro === p.clave}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filtro === p.clave ? "bg-tinta text-superficie" : "bg-tinta/[0.05] text-gris hover:bg-tinta/[0.09] hover:text-tinta"}`}
            >
              {p.etiqueta} <span className="opacity-60">{p.n}</span>
            </button>
          ))}
        </div>
        <Link href="/usuarios/nuevo" className={`${BOTON_C} ml-auto`}>
          <IconPlus size={17} stroke={2.2} /> Nuevo usuario
        </Link>
      </div>

      {visibles.length === 0 ? (
        <div className={`${HOJA} p-10 text-center text-sm text-gris`}>
          {filas.length === 0 ? "Todavía no hay usuarios. Crea el primero con «Nuevo usuario»." : "Nadie coincide con la búsqueda."}
          {filas.length > 0 && (q || filtro !== "todos") && (
            <button type="button" onClick={() => { setQ(""); setFiltro("todos"); }} className="ml-1.5 font-semibold text-naranjo hover:underline">
              Ver todos
            </button>
          )}
        </div>
      ) : (
        <div className={`${HOJA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde/60 bg-tinta/[0.02] text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-2.5">Usuario</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">Acceso</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Empresas</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">Último ingreso</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde/60">
                {visibles.map((f) => (
                  <Fila key={f.id} f={f} porOmision={porOmision} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Fila({ f, porOmision }: { f: FilaUsuario; porOmision: EmpresaDeFila | null }) {
  const nombre = f.nombre || f.correo;
  const href = `/usuarios/${f.id}`;
  // La barra de la izquierda dice de un vistazo si la cuenta está bien: verde entra y ve algo,
  // ámbar entra pero no ve ninguna aplicación, gris no puede entrar.
  const barra = !f.activo ? "bg-tinta/20" : sinApps(f) ? "bg-amber-400" : "bg-emerald-500";
  const empresas = f.empresas.length > 0 ? f.empresas : porOmision ? [porOmision] : [];
  return (
    <tr className={`group transition hover:bg-tinta/[0.025] ${f.activo ? "" : "opacity-60"}`}>
      <td className="relative px-4 py-2.5">
        <span className={`absolute inset-y-2 left-0 w-1 rounded-r-full ${barra}`} />
        <Link href={href} className="flex items-center gap-3">
          <AvatarUsuario nombre={f.nombre} correo={f.correo} tipo={f.esAdmin ? "admin" : f.invitado ? "invitado" : "usuario"} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="block max-w-[18rem] truncate font-semibold text-tinta group-hover:text-naranjo">{nombre}</span>
              {f.esYo && <span className="rounded-full bg-tinta/[0.07] px-1.5 py-px text-[10px] font-semibold text-gris">Tú</span>}
            </span>
            {f.nombre && <span className="block max-w-[18rem] truncate text-xs text-gris">{f.correo}</span>}
            {/* En celular, el acceso va debajo del nombre. */}
            <span className="mt-0.5 block text-[11px] text-gris sm:hidden">{textoAcceso(f)}</span>
          </span>
        </Link>
      </td>
      <td className="hidden px-4 py-2.5 sm:table-cell">
        <span className="flex flex-wrap items-center gap-1">
          {f.esAdmin ? (
            <span className={`${CHIP} bg-naranjo/12 text-naranjo`}><IconShieldCheck size={12} /> Administrador</span>
          ) : sinApps(f) ? (
            <span className={`${CHIP} tono-aviso fondo-tono`}>Sin aplicaciones</span>
          ) : (
            <span className="text-xs text-tinta"><b className="font-semibold">{f.apps}</b> <span className="text-gris">{f.apps === 1 ? "aplicación" : "aplicaciones"}</span></span>
          )}
          {f.invitado && <span className={`${CHIP} bg-violet-500/15 text-tinta`}>Invitado</span>}
          {!f.activo && <span className={`${CHIP} bg-tinta/[0.07] text-gris`}>Sin acceso</span>}
        </span>
      </td>
      <td className="hidden px-4 py-2.5 md:table-cell">
        {f.esAdmin ? (
          <span className="text-xs text-gris">Todas</span>
        ) : (
          <span className={`flex items-center gap-1 ${f.empresas.length === 0 ? "opacity-50" : ""}`} title={empresas.map((e) => e.nombre).join(", ") + (f.empresas.length === 0 ? " (por omisión)" : "")}>
            {empresas.map((e) => (
              <DistintivoEmpresa key={e.id} empresa={e} />
            ))}
            <span className="sr-only">{empresas.map((e) => e.nombre).join(", ")}</span>
          </span>
        )}
      </td>
      <td className="hidden px-4 py-2.5 text-xs text-gris lg:table-cell">{f.ultimoIngreso}</td>
      <td className="px-4 py-2.5 text-right">
        <Link href={href} className="inline-grid h-9 w-9 place-items-center text-gris-suave group-hover:text-naranjo" aria-label={`Abrir la ficha de ${nombre}`}>
          <IconChevronRight size={18} />
        </Link>
      </td>
    </tr>
  );
}

function textoAcceso(f: FilaUsuario): string {
  const partes = [f.esAdmin ? "Administrador" : sinApps(f) ? "Sin aplicaciones" : `${f.apps} ${f.apps === 1 ? "aplicación" : "aplicaciones"}`];
  if (f.invitado) partes.push("Invitado");
  if (!f.activo) partes.push("Sin acceso");
  partes.push(f.ultimoIngreso);
  return partes.join(" · ");
}
