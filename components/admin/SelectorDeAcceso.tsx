"use client";

import { useState } from "react";
import { IconCheck, IconPlayerPause, IconShieldCheck, IconUser } from "@tabler/icons-react";
import { obtenerIcono } from "@/lib/iconos";
import DistintivoEmpresa from "@/components/DistintivoEmpresa";
import type { Empresa } from "@/lib/empresas-modelo";
import { Bloque, Segmentado } from "@/components/admin/PartesFormulario";

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

const CAJA = "h-4 w-4 shrink-0 rounded border-borde accent-[var(--color-naranjo)]";
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
    <>
      <Bloque titulo="Rol" ayuda={esAdmin ? "Entra a todas las aplicaciones y empresas, y administra el Core." : "Entra solo a las aplicaciones y empresas que marques abajo."}>
        <Segmentado
          nombre="rol"
          valor={rol}
          alCambiar={(v) => setRol(v as "admin" | "usuario")}
          opciones={[
            { valor: "usuario", etiqueta: "Usuario", Icono: IconUser },
            { valor: "admin", etiqueta: "Administrador", Icono: IconShieldCheck },
          ]}
        />
      </Bloque>

      {esAdmin && (
        <Bloque titulo="Aplicaciones y empresas" ayuda="">
          <p className="rounded-xl bg-naranjo/[0.07] px-3.5 py-3 text-sm text-tinta/75">
            Como administrador entra a <b className="font-semibold text-tinta">todo</b>. Si después lo vuelves a Usuario, se mantiene lo que tenía marcado.
          </p>
        </Bloque>
      )}

      {/* Oculto (no desmontado) con el rol en Administrador: así lo marcado se sigue enviando. */}
      <div className={esAdmin ? "hidden" : "contents"}>
        <Bloque
          titulo="Aplicaciones"
          ayuda={`${cuantas} de ${todas.length} marcadas.`}
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
            <div className="space-y-4">
              {grupos.map((grupo) => {
                const ids = grupo.apps.map((a) => a.id);
                const delGrupo = ids.filter((id) => marcadas.has(id)).length;
                const completo = delGrupo === ids.length;
                return (
                  <fieldset key={grupo.slug}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <legend className="text-[11px] font-bold uppercase tracking-[0.1em] text-tinta/60">{grupo.titulo}</legend>
                      {ids.length > 1 && (
                        <button type="button" onClick={() => poner(ids, !completo)} className={BOTON_TEXTO}>
                          {completo ? "Quitar" : "Marcar"} {grupo.titulo.toLowerCase()}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {grupo.apps.map((app) => {
                        const Icono = obtenerIcono(app.icono);
                        const marcada = marcadas.has(app.id);
                        return (
                          <label
                            key={app.id}
                            title={app.descripcion ?? undefined}
                            className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-naranjo ${
                              marcada ? "border-naranjo/60 bg-naranjo/[0.06]" : "border-borde bg-superficie hover:border-naranjo/30"
                            }`}
                          >
                            <input type="checkbox" name="aplicaciones" value={app.id} checked={marcada} onChange={(e) => poner([app.id], e.target.checked)} className="sr-only" />
                            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${marcada ? "bg-naranjo text-white" : "bg-tinta/[0.06] text-tinta/50"}`}>
                              <Icono size={15} stroke={1.9} aria-hidden />
                            </span>
                            <span className={`min-w-0 flex-1 truncate text-sm ${marcada ? "font-semibold text-tinta" : "text-tinta/75"}`}>{app.nombre}</span>
                            {app.pausada && <IconPlayerPause size={13} className="shrink-0 text-tinta/40" aria-label="En pausa" />}
                            {marcada && <IconCheck size={15} stroke={2.4} className="shrink-0 text-naranjo" aria-hidden />}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          )}
        </Bloque>

        {conAjustes.length > 0 && (
          <Bloque titulo="Permisos dentro de cada app" ayuda="Solo para las aplicaciones marcadas que tienen niveles propios.">
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
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {subpaneles.map((sp) => (
                            <label key={sp.slug} className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-tinta/80">
                              <input type="checkbox" name="subpaneles_finanzas" value={sp.slug} defaultChecked={subpanelesAsignados.includes(sp.slug)} className={CAJA} />
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
          </Bloque>
        )}

        {empresas.length > 1 && (
          <Bloque titulo="Empresas" ayuda={`En cuáles se puede parar desde el selector de arriba. Sin marcar ninguna, ve ${nombrePorOmision}.`}>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {empresas.map((e) => (
                <label
                  key={e.id}
                  className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-borde bg-superficie px-3 py-2 text-sm text-tinta/75 transition hover:border-naranjo/30 has-[:checked]:border-naranjo/60 has-[:checked]:bg-naranjo/[0.06] has-[:checked]:font-semibold has-[:checked]:text-tinta has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-naranjo"
                >
                  <input type="checkbox" name="empresas" value={e.id} defaultChecked={empresasAsignadas.includes(e.id)} className={CAJA} />
                  <DistintivoEmpresa empresa={e} />
                  <span className="truncate">{e.nombre}</span>
                </label>
              ))}
            </div>
          </Bloque>
        )}
      </div>
    </>
  );
}
