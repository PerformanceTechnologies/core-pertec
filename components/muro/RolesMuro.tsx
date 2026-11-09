"use client";

import { useState } from "react";
import { IconChevronDown, IconLoader2, IconShieldCheck } from "@tabler/icons-react";
import { DETALLE_ROL_MURO, NOMBRE_ROL_MURO, ROLES_MURO, type PersonaMuro, type RolMuro } from "@/lib/muro-modelo";
import { asignarRolAction } from "@/app/(protegido)/muro/acciones";
import { Avatar } from "./Avatar";

// Solo para administradores: quién puede borrar mensajes en el muro de esta empresa.
// Vive en Administración > Roles del Muro.

export default function RolesMuro({ personas, roles: iniciales, yo }: { personas: PersonaMuro[]; roles: Record<string, RolMuro>; yo: string }) {
  const [abierto, setAbierto] = useState(true);
  const [roles, setRoles] = useState(iniciales);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const moderadores = Object.values(roles).filter((r) => r === "moderador").length;

  async function cambiar(correo: string, rol: RolMuro) {
    const antes = roles[correo] ?? "miembro";
    if (rol === antes) return;
    setRoles((r) => ({ ...r, [correo]: rol }));
    setGuardando(correo);
    setError(null);
    const r = await asignarRolAction(correo, rol);
    setGuardando(null);
    if (!r.ok) {
      setRoles((x) => ({ ...x, [correo]: antes }));
      setError(r.error);
    }
  }

  return (
    <section className="rounded-2xl border border-borde bg-superficie">
      <button type="button" onClick={() => setAbierto((a) => !a)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm">
        <IconShieldCheck size={18} className="text-naranjo" />
        <span className="font-bold text-tinta">Roles del muro</span>
        <span className="text-gris">· {moderadores === 1 ? "1 moderador" : `${moderadores} moderadores`}</span>
        <IconChevronDown size={16} className={`ml-auto text-gris transition ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className="border-t border-borde px-4 pb-4 pt-3">
          <p className="mb-3 text-xs text-gris">
            {ROLES_MURO.map((r) => (
              <span key={r} className="mr-3 inline-block">
                <b className="text-tinta">{NOMBRE_ROL_MURO[r]}:</b> {DETALLE_ROL_MURO[r].toLowerCase()}
              </span>
            ))}
            <span className="inline-block">Los administradores siempre pueden borrar todo.</span>
          </p>
          {error && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <ul className="max-h-80 divide-y divide-borde overflow-y-auto">
            {personas.map((p) => (
              <li key={p.correo} className="flex items-center gap-3 py-2">
                <Avatar correo={p.correo} nombre={p.nombre} tamano="h-8 w-8 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-tinta">
                    {p.nombre}
                    {p.correo === yo && <span className="font-normal text-gris"> (tú)</span>}
                  </span>
                  <span className="block truncate text-[11px] text-gris">{p.correo}</span>
                </span>
                {guardando === p.correo && <IconLoader2 size={15} className="animate-spin text-gris" />}
                <select
                  value={roles[p.correo] ?? "miembro"}
                  onChange={(e) => cambiar(p.correo, e.target.value as RolMuro)}
                  disabled={guardando === p.correo}
                  className="rounded-lg border border-borde bg-superficie px-2 py-1.5 text-sm text-tinta focus:border-naranjo focus:outline-none"
                >
                  {ROLES_MURO.map((r) => (
                    <option key={r} value={r}>
                      {NOMBRE_ROL_MURO[r]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
