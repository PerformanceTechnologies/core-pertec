"use client";

import { useState } from "react";
import { IconAdjustmentsHorizontal, IconApps, IconBuildingSkyscraper, IconCheck, IconPlayerPause, IconShieldCheck, IconUser } from "@tabler/icons-react";
import { obtenerIcono } from "@/lib/iconos";
import DistintivoEmpresa from "@/components/DistintivoEmpresa";
import type { Empresa } from "@/lib/empresas-modelo";
import { Segmentado } from "@/components/admin/PartesFormulario";
import { Tarjeta } from "@/components/admin/VisualUsuarios";

// Lo del formulario de usuarios que necesita JavaScript: el rol cambia qué se muestra (un
// administrador entra a todo, así que no tiene sentido pedirle aplicaciones ni empresas) y marcar
// un módulo entero es un clic.
//
// Los campos se llaman igual que siempre —`rol`, `aplicaciones`, `rol_extra_<id>`,
// `subpaneles_finanzas`, `empresas`—, así que las Server Actions (app/(protegido)/usuarios/
// acciones.ts) no cambian. Con el rol en Administrador, aplicaciones y empresas se OCULTAN pero
// siguen en el formulario: si después se vuelve a Usuario, lo marcado sigue ahí.

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

/** Una opción que se marca con un clic: igual a las de aplicaciones, pero sin estado (defaultChecked). */
const PASTILLA =
  "group inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-borde bg-superficie px-3 py-1 text-[13px] text-tinta/70 transition hover:border-naranjo/40 hover:text-tinta has-[:checked]:border-naranjo has-[:checked]:bg-naranjo has-[:checked]:font-semibold has-[:checked]:text-white has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-naranjo";
const BOTON_TEXTO = "rounded-md px-2 py-1 text-xs font-semibold text-naranjo transition hover:bg-naranjo/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo";

export default function SelectorDeAcceso({
  grupos,
  rolInicial,
  asignadas,
  rolesExtra,
  rolesInternos,
  subpaneles,
  subpanelesAsignados,
  empresas,
  empresasAsignadas,
  nombrePorOmision,
  persona,
}: {
  grupos: GrupoDeSelector[];
  rolInicial: "admin" | "usuario";
  asignadas: string[];
  rolesExtra: Record<string, string>;
  rolesInternos: Record<string, RolInterno>;
  subpaneles: { slug: string; nombre: string }[];
  subpanelesAsignados: string[];
  empresas: Pick<Empresa, "id" | "slug" | "logo" | "nombre" | "color">[];
  empresasAsignadas: string[];
  /** La empresa que ve quien no tiene ninguna marcada. */
  nombrePorOmision: string;
  /** La tarjeta de quién es (la arma el servidor): va arriba de la columna derecha. */
  persona: React.ReactNode;
}) {
  const [rol, setRol] = useState(rolInicial);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(asignadas));
  const esAdmin = rol === "admin";

  const todas = grupos.flatMap((g) => g.apps);
  const cuantas = todas.filter((a) => marcadas.has(a.id)).length;
  // Las que tienen algo más que elegir (un rol propio o los subpaneles de Finanzas).
  const conAjustes = todas.filter((a) => rolesInternos[a.slug] || a.slug === "finanzas");

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
    // Dos columnas, como la ficha de un contacto: lo grande (aplicaciones) a la izquierda y quién es,
    // su rol y sus empresas a la derecha. En celular la de la derecha va primero.
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="space-y-5 lg:order-2">
        {persona}

        <Tarjeta Icono={IconShieldCheck} titulo="Rol" ayuda={esAdmin ? "Entra a todas las aplicaciones y empresas, y administra el Core." : "Entra solo a las aplicaciones y empresas que le marques."}>
          <Segmentado
            nombre="rol"
            valor={rol}
            alCambiar={(v) => setRol(v as "admin" | "usuario")}
            opciones={[
              { valor: "usuario", etiqueta: "Usuario", Icono: IconUser },
              { valor: "admin", etiqueta: "Administrador", Icono: IconShieldCheck },
            ]}
          />
        </Tarjeta>

        {/* Oculta (no desmontada) con el rol en Administrador: así lo marcado se sigue enviando. */}
        {empresas.length > 1 && (
          <div className={esAdmin ? "hidden" : ""}>
            <Tarjeta Icono={IconBuildingSkyscraper} titulo="Empresas" ayuda={`En cuáles se puede parar desde el selector de arriba. Sin marcar ninguna, ve ${nombrePorOmision}.`}>
              <div className="flex flex-col gap-2">
                {empresas.map((e) => (
                  <label
                    key={e.id}
                    className="group flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-borde bg-superficie py-1.5 pl-2 pr-3 text-sm text-tinta/70 transition hover:border-naranjo/40 has-[:checked]:border-naranjo has-[:checked]:bg-naranjo/[0.07] has-[:checked]:font-semibold has-[:checked]:text-tinta has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-naranjo"
                  >
                    <input type="checkbox" name="empresas" value={e.id} defaultChecked={empresasAsignadas.includes(e.id)} className="sr-only" />
                    <DistintivoEmpresa empresa={e} tamano="medio" />
                    <span className="min-w-0 flex-1 truncate">{e.nombre}</span>
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-borde text-transparent group-has-[:checked]:border-naranjo group-has-[:checked]:bg-naranjo group-has-[:checked]:text-white" aria-hidden>
                      <IconCheck size={12} stroke={3} />
                    </span>
                  </label>
                ))}
              </div>
            </Tarjeta>
          </div>
        )}
      </div>

      <div className="space-y-5 lg:order-1">
        {esAdmin && (
          <Tarjeta Icono={IconApps} titulo="Aplicaciones">
            <p className="rounded-xl bg-naranjo/[0.07] px-3.5 py-3 text-sm text-tinta/75">
              Como administrador entra a <b className="font-semibold text-tinta">todas</b> las aplicaciones y empresas. Si después lo vuelves a Usuario, se mantiene lo que tenía marcado.
            </p>
          </Tarjeta>
        )}

        <div className={esAdmin ? "hidden" : "space-y-5"}>
          <Tarjeta
            Icono={IconApps}
            titulo="Aplicaciones"
            ayuda={`${cuantas} de ${todas.length} marcadas. Toca el nombre de un módulo para marcar todas las suyas.`}
            extra={
              todas.length > 0 && (
                <span className="flex gap-1">
                  <button type="button" onClick={() => poner(todas.map((a) => a.id), true)} className={BOTON_TEXTO}>Todas</button>
                  <button type="button" onClick={() => poner(todas.map((a) => a.id), false)} className={BOTON_TEXTO}>Ninguna</button>
                </span>
              )
            }
          >
          {todas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-borde px-4 py-6 text-center text-xs text-tinta/60">Todavía no hay aplicaciones en el catálogo.</p>
          ) : (
            // Un renglón por módulo: su nombre a la izquierda y sus aplicaciones como pastillas que
            // se marcan con un clic. Tocar el nombre del módulo marca (o quita) todas las suyas.
            <div className="divide-y divide-borde/60 rounded-2xl bg-tinta/[0.02]">
              {grupos.map((grupo) => {
                const ids = grupo.apps.map((a) => a.id);
                const completo = ids.every((id) => marcadas.has(id));
                return (
                  <fieldset key={grupo.slug} className="grid gap-2 px-3.5 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-start sm:gap-3">
                    <legend className="sr-only">{grupo.titulo}</legend>
                    <button
                      type="button"
                      onClick={() => poner(ids, !completo)}
                      title={completo ? `Quitar todas las de ${grupo.titulo}` : `Marcar todas las de ${grupo.titulo}`}
                      className="justify-self-start pt-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-gris transition hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo"
                    >
                      {grupo.titulo}
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      {grupo.apps.map((app) => {
                        const Icono = obtenerIcono(app.icono);
                        const marcada = marcadas.has(app.id);
                        return (
                          <label
                            key={app.id}
                            title={app.descripcion ?? undefined}
                            className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-3 text-[13px] transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-naranjo ${
                              marcada
                                ? "border-naranjo bg-naranjo font-semibold text-white shadow-sm hover:bg-naranjo-suave"
                                : "border-borde bg-superficie text-tinta/70 hover:border-naranjo/40 hover:text-tinta"
                            }`}
                          >
                            <input type="checkbox" name="aplicaciones" value={app.id} checked={marcada} onChange={(e) => poner([app.id], e.target.checked)} className="sr-only" />
                            {marcada ? <IconCheck size={14} stroke={2.6} aria-hidden /> : <Icono size={14} stroke={1.9} className="text-tinta/45" aria-hidden />}
                            {app.nombre}
                            {app.pausada && <IconPlayerPause size={12} className={marcada ? "text-white/70" : "text-tinta/40"} aria-label="En pausa" />}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          )}
          </Tarjeta>

          {conAjustes.length > 0 && (
            <Tarjeta Icono={IconAdjustmentsHorizontal} titulo="Permisos dentro de cada app" ayuda="Solo para las aplicaciones marcadas que tienen niveles propios.">
            {/* Todos montados (los de apps sin marcar, ocultos) para que lo elegido no se pierda al desmarcar y volver a marcar. */}
            <div className="space-y-2">
              {conAjustes.map((app) => {
                const interno = rolesInternos[app.slug];
                const marcada = marcadas.has(app.id);
                return (
                  <div key={app.id} className={marcada ? "rounded-xl border border-borde px-3.5 py-3" : "hidden"}>
                    {interno && (
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <label htmlFor={`rol-extra-${app.id}`} className="min-w-0">
                          <span className="block text-sm font-semibold text-tinta">{app.nombre}</span>
                          <span className="block text-xs leading-snug text-tinta/55">{interno.ayuda}</span>
                        </label>
                        <select
                          id={`rol-extra-${app.id}`}
                          name={`rol_extra_${app.id}`}
                          defaultValue={rolesExtra[app.id] ?? interno.porOmision}
                          className="min-h-10 w-full shrink-0 rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm text-tinta focus:border-naranjo/50 focus:outline-none focus:ring-2 focus:ring-naranjo/20 sm:w-48"
                        >
                          {interno.opciones.map((o) => (
                            <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {app.slug === "finanzas" && (
                      <fieldset>
                        <legend className="text-sm font-semibold text-tinta">{app.nombre}: subpaneles</legend>
                        <p className="mb-1.5 text-xs leading-snug text-tinta/55">
                          Sin marcar ninguno ve Facturas de Compra y Venta e Históricas. «SII Documentos IH - IL» es sensible: solo lo ve quien lo tenga marcado.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {subpaneles.map((sp) => (
                            <label key={sp.slug} className={PASTILLA}>
                              <input type="checkbox" name="subpaneles_finanzas" value={sp.slug} defaultChecked={subpanelesAsignados.includes(sp.slug)} className="sr-only" />
                              <IconCheck size={13} stroke={2.6} className="hidden group-has-[:checked]:block" aria-hidden />
                              {sp.nombre}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </div>
                );
              })}
              {conAjustes.every((a) => !marcadas.has(a.id)) && <p className="text-xs text-tinta/50">Ninguna de las aplicaciones marcadas tiene niveles propios.</p>}
            </div>
            </Tarjeta>
          )}
        </div>
      </div>
    </div>
  );
}
