"use client";

import { useState, useTransition } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import { CAMPO } from "@/lib/estilos";
import { Campo } from "@/components/flota/Campos";
import { ROLES_FONDOS, type Parametros, type RolFondos } from "@/lib/rendidor/fondos-modelo";
import { guardarParametrosAction, ponerRolAction } from "@/app/(protegido)/rendir-gastos/acciones-fondos";

/** Administración del módulo: quién tiene cada rol y los parámetros. */
export default function ConfiguracionFondos({
  personas,
  roles: iniciales,
  parametros,
}: {
  personas: { correo: string; nombre: string }[];
  roles: { correo: string; rol: RolFondos }[];
  parametros: Parametros;
}) {
  const [roles, setRoles] = useState(() => new Set(iniciales.map((r) => `${r.correo}|${r.rol}`)));
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  async function cambiar(correo: string, rol: RolFondos, activo: boolean) {
    const k = `${correo}|${rol}`;
    setGuardando(k);
    setRoles((s) => { const n = new Set(s); if (activo) n.add(k); else n.delete(k); return n; });
    const r = await ponerRolAction(correo, rol, activo);
    setGuardando(null);
    if (!r.ok) {
      setRoles((s) => { const n = new Set(s); if (activo) n.delete(k); else n.add(k); return n; });
      alert(r.error);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
        <h2 className="text-base font-bold text-tinta">Roles</h2>
        <p className="mt-0.5 text-xs text-gris">
          Todos pueden rendir. Marca quién valida, asigna, transfiere, revisa o administra. Nadie puede aprobar, transferir ni confirmar lo propio. Los administradores del Core tienen todos los roles.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-borde text-left text-[11px] uppercase tracking-wide text-gris">
                <th className="py-2 pr-3 font-semibold">Persona</th>
                {ROLES_FONDOS.map((r) => (
                  <th key={r.rol} className="px-2 py-2 text-center font-semibold" title={r.detalle}>{r.nombre}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {personas.map((p) => (
                <tr key={p.correo}>
                  <td className="py-2 pr-3">
                    <span className="block font-semibold text-tinta">{p.nombre}</span>
                    <span className="block text-[11px] text-gris">{p.correo}</span>
                  </td>
                  {ROLES_FONDOS.map((r) => {
                    const k = `${p.correo}|${r.rol}`;
                    return (
                      <td key={r.rol} className="px-2 py-2 text-center">
                        {guardando === k ? (
                          <IconLoader2 size={16} className="mx-auto animate-spin text-gris" />
                        ) : (
                          <input type="checkbox" checked={roles.has(k)} onChange={(e) => cambiar(p.correo, r.rol, e.target.checked)} aria-label={`${r.nombre}: ${p.nombre}`} className="h-4 w-4 accent-[var(--color-naranjo)]" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
        <h2 className="text-base font-bold text-tinta">Parámetros</h2>
        <form
          action={(fd) =>
            iniciar(async () => {
              const r = await guardarParametrosAction(fd);
              setAviso(r.ok ? "Guardado." : r.error);
            })
          }
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <Campo etiqueta="Avisar al llegar al (% del fondo)">
            <input name="umbral" inputMode="decimal" defaultValue={Math.round(parametros.umbralAvisoLimite * 100)} className={CAMPO} />
          </Campo>
          <Campo etiqueta="Días para rendir un fondo">
            <input name="plazo" type="number" min={1} max={365} defaultValue={parametros.plazoRendicionDias} className={CAMPO} />
          </Campo>
          <Campo etiqueta="Informes abiertos por fondo">
            <input name="maxInformes" type="number" min={1} max={10} defaultValue={parametros.maxInformesAbiertos} className={CAMPO} />
          </Campo>
          <Campo etiqueta="Validar asignaciones directas sobre ($, vacío = nunca)">
            <input name="umbralDirecta" inputMode="numeric" defaultValue={parametros.umbralValidacionDirecta ?? ""} className={CAMPO} />
          </Campo>
          <label className="flex items-center gap-3 sm:col-span-2">
            <input type="checkbox" name="bloquear" value="si" defaultChecked={parametros.bloquearConVencidos} className="h-4 w-4 accent-[var(--color-naranjo)]" />
            <span className="text-sm text-tinta">No entregar un fondo nuevo a quien tiene uno vencido sin rendir</span>
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={pendiente} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-naranjo px-5 text-sm font-bold text-white disabled:opacity-50">
              {pendiente && <IconLoader2 size={15} className="animate-spin" />} Guardar parámetros
            </button>
            {aviso && <span className="text-sm text-gris">{aviso}</span>}
          </div>
        </form>
      </section>
    </div>
  );
}
