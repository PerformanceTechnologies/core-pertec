"use client";

import { useState } from "react";
import { IconPlayerPause, IconShieldCheck, IconUser } from "@tabler/icons-react";
import { obtenerIcono } from "@/lib/iconos";

// Lo único del formulario de usuarios que necesita JavaScript: el rol y las aplicaciones se
// influyen entre sí (un administrador ve todas; marcar un módulo entero es un clic), así que
// viven juntos y comparten estado. Todo lo demás del formulario es HTML plano.
//
// Los campos se llaman igual que siempre —`rol`, `aplicaciones`, `rol_extra_<id>`,
// `subpaneles_finanzas`—, así que las Server Actions (app/(protegido)/usuarios/acciones.ts) no
// cambian. Lo que se marca se envía aunque el rol sea administrador: cambiarlo a Usuario después
// no debería obligar a volver a marcar todo.

export interface AppDeSelector {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  icono: string;
  pausada: boolean;
}

export interface GrupoDeSelector {
  slug: string;
  titulo: string;
  apps: AppDeSelector[];
}

/** El rol interno que una aplicación maneja aparte del de usuario/administrador del Core. */
export interface RolInterno {
  /** Lo que lleva la etiqueta del selector: «Rol en Contratos». */
  titulo: string;
  porOmision: string;
  ayuda: string;
  opciones: { valor: string; etiqueta: string }[];
}

const CAJA = "h-4 w-4 shrink-0 rounded border-borde accent-[var(--color-naranjo)]";

export default function SelectorDeAcceso({
  grupos,
  rolInicial,
  asignadas,
  rolesExtra,
  rolesInternos,
  subpaneles,
  subpanelesAsignados,
}: {
  grupos: GrupoDeSelector[];
  rolInicial: "admin" | "usuario";
  asignadas: string[];
  rolesExtra: Record<string, string>;
  rolesInternos: Record<string, RolInterno>;
  subpaneles: { slug: string; nombre: string }[];
  subpanelesAsignados: string[];
}) {
  const [rol, setRol] = useState(rolInicial);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(asignadas));

  const todas = grupos.flatMap((g) => g.apps);
  const marcadasVigentes = todas.filter((a) => marcadas.has(a.id)).length;

  function poner(ids: string[], marcar: boolean) {
    setMarcadas((previas) => {
      const siguientes = new Set(previas);
      for (const id of ids) {
        if (marcar) siguientes.add(id);
        else siguientes.delete(id);
      }
      return siguientes;
    });
  }

  return (
    <div className="space-y-7">
      {/* ── Rol ── */}
      <fieldset>
        <legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/70">Rol en el Core</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              { valor: "usuario", titulo: "Usuario", detalle: "Entra solo a las aplicaciones que le asignes.", Icono: IconUser },
              { valor: "admin", titulo: "Administrador general", detalle: "Ve todas las aplicaciones y administra usuarios y catálogo.", Icono: IconShieldCheck },
            ] as const
          ).map(({ valor, titulo, detalle, Icono }) => (
            <label
              key={valor}
              className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border border-borde bg-superficie p-3.5 transition hover:border-naranjo/40 has-[:checked]:border-naranjo has-[:checked]:bg-naranjo/[0.06] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-naranjo"
            >
              <input
                type="radio"
                name="rol"
                value={valor}
                checked={rol === valor}
                onChange={() => setRol(valor)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-naranjo)]"
              />
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-naranjo/10 text-naranjo">
                <Icono size={17} stroke={1.9} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-tinta">{titulo}</span>
                <span className="block text-xs leading-snug text-tinta/60">{detalle}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* ── Aplicaciones ── */}
      <section aria-labelledby="titulo-apps" className="border-t border-borde pt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <h3 id="titulo-apps" className="text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/70">
              Aplicaciones
            </h3>
            <p className="mt-1 text-xs text-tinta/60" aria-live="polite">
              <strong className="font-semibold text-tinta">{marcadasVigentes}</strong> de {todas.length} asignadas
            </p>
          </div>
          {todas.length > 0 && (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => poner(todas.map((a) => a.id), true)}
                className="min-h-9 rounded-lg border border-borde px-3 text-xs font-semibold text-tinta/75 transition hover:border-naranjo/40 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo"
              >
                Marcar todas
              </button>
              <button
                type="button"
                onClick={() => poner(todas.map((a) => a.id), false)}
                className="min-h-9 rounded-lg border border-borde px-3 text-xs font-semibold text-tinta/75 transition hover:border-naranjo/40 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo"
              >
                Quitar todas
              </button>
            </div>
          )}
        </div>

        {rol === "admin" && (
          <p role="status" className="mb-3 rounded-lg border border-naranjo/30 bg-naranjo/[0.06] px-3.5 py-2.5 text-xs leading-snug text-tinta/75">
            Un administrador ve <strong className="font-semibold text-tinta">todas</strong> las aplicaciones sin importar lo
            marcado. Las marcas solo valen si después cambias el rol a Usuario.
          </p>
        )}

        {todas.length === 0 && (
          <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-xs text-tinta/60">
            Todavía no hay aplicaciones registradas en el catálogo.
          </p>
        )}

        <div className={`space-y-4 transition-opacity duration-200 motion-reduce:transition-none ${rol === "admin" ? "opacity-60" : ""}`}>
          {grupos.map((grupo) => {
            const ids = grupo.apps.map((a) => a.id);
            const delGrupo = ids.filter((id) => marcadas.has(id)).length;
            return (
              <fieldset key={grupo.slug} className="rounded-xl border border-borde">
                <legend className="sr-only">{grupo.titulo}</legend>
                <div className="flex items-center justify-between gap-3 border-b border-borde bg-crema/50 px-3.5 py-2">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-tinta/75" aria-hidden>
                    {grupo.titulo}
                    <span className="ml-2 font-semibold normal-case tracking-normal text-tinta/55">
                      {delGrupo} de {ids.length}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => poner(ids, delGrupo !== ids.length)}
                    className="min-h-8 rounded-md px-2 text-xs font-semibold text-naranjo transition hover:bg-naranjo/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo"
                  >
                    {delGrupo === ids.length ? "Quitar módulo" : "Marcar módulo"}
                    <span className="sr-only"> {grupo.titulo}</span>
                  </button>
                </div>

                <ul className="divide-y divide-borde">
                  {grupo.apps.map((app) => {
                    const Icono = obtenerIcono(app.icono);
                    const marcada = marcadas.has(app.id);
                    const interno = rolesInternos[app.slug];
                    const esFinanzas = app.slug === "finanzas";
                    return (
                      <li key={app.id} className="px-3.5 py-2.5">
                        <label className="flex min-h-11 cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            name="aplicaciones"
                            value={app.id}
                            checked={marcada}
                            onChange={(e) => poner([app.id], e.target.checked)}
                            className={CAJA}
                          />
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${marcada ? "bg-naranjo/10 text-naranjo" : "bg-tinta/5 text-tinta/50"}`}>
                            <Icono size={17} stroke={1.75} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-sm font-semibold text-tinta">{app.nombre}</span>
                              {app.pausada && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-tinta/10 px-2 py-0.5 text-[10px] font-semibold text-tinta/70">
                                  <IconPlayerPause size={10} stroke={2.4} aria-hidden /> En pausa
                                </span>
                              )}
                            </span>
                            {app.descripcion && <span className="block truncate text-xs text-tinta/60">{app.descripcion}</span>}
                          </span>
                        </label>

                        {/* Los campos de rol y subpaneles quedan montados aunque la app esté sin marcar
                            (solo se ocultan): así lo elegido no se pierde al desmarcar y volver a marcar. */}
                        {interno && (
                          <div className={`ml-[3.25rem] mt-1.5 ${marcada ? "" : "hidden"}`}>
                            <label htmlFor={`rol-extra-${app.id}`} className="block text-xs font-semibold text-tinta/70">
                              {interno.titulo}
                            </label>
                            <select
                              id={`rol-extra-${app.id}`}
                              name={`rol_extra_${app.id}`}
                              defaultValue={rolesExtra[app.id] ?? interno.porOmision}
                              className="mt-1 min-h-10 w-full max-w-xs rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm text-tinta focus:border-cian focus:outline-none focus:ring-2 focus:ring-cian/30"
                            >
                              {interno.opciones.map((o) => (
                                <option key={o.valor} value={o.valor}>
                                  {o.etiqueta}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs leading-snug text-tinta/60">{interno.ayuda}</p>
                          </div>
                        )}

                        {esFinanzas && (
                          <fieldset className={`ml-[3.25rem] mt-1.5 ${marcada ? "" : "hidden"}`}>
                            <legend className="text-xs font-semibold text-tinta/70">Subpaneles visibles</legend>
                            <p className="mb-1.5 text-xs leading-snug text-tinta/60">
                              Sin marcar ninguno ve Facturas de Compra y Venta e Históricas. «SII Documentos IH - IL» es
                              información sensible: solo lo ve quien lo tenga marcado aquí.
                            </p>
                            <div className="flex flex-col gap-0.5">
                              {subpaneles.map((sp) => (
                                <label key={sp.slug} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-xs text-tinta/80">
                                  <input
                                    type="checkbox"
                                    name="subpaneles_finanzas"
                                    value={sp.slug}
                                    defaultChecked={subpanelesAsignados.includes(sp.slug)}
                                    className={CAJA}
                                  />
                                  {sp.nombre}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
        </div>
      </section>
    </div>
  );
}
