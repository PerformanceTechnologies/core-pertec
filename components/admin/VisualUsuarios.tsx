import { IconMailForward, IconShieldCheck, IconUser, type Icon } from "@tabler/icons-react";
import { iniciales } from "@/lib/administracion-modelo";
import { HOJA } from "@/components/contactos/Visual";

// El vocabulario visual de Administración › Usuarios, en la misma línea que Contactos: avatares
// cuadrados de esquinas redondas con un tono estable por persona, tarjetas «hoja» con un ícono
// naranjo en el título y pastillas para los estados.

/** Un tono estable por correo, para que cada persona tenga siempre el mismo color. */
const TONOS = ["bg-naranjo/12 text-naranjo", "bg-cian/12 text-cian", "bg-sky-500/12 text-sky-500", "bg-violet-500/12 text-violet-500", "bg-amber-500/14 text-amber-500"];

export type TipoAvatar = "admin" | "usuario" | "invitado";

const INSIGNIA: Record<TipoAvatar, Icon> = { admin: IconShieldCheck, usuario: IconUser, invitado: IconMailForward };

/** Las iniciales de la persona, con una insignia abajo a la derecha: administrador, usuario o invitado. */
export function AvatarUsuario({ nombre, correo, tipo, grande = false }: { nombre: string | null; correo: string; tipo: TipoAvatar; grande?: boolean }) {
  let h = 0;
  for (const ch of correo) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const Insignia = INSIGNIA[tipo];
  return (
    <span className={`relative grid shrink-0 place-items-center font-bold ${TONOS[h % TONOS.length]} ${grande ? "h-16 w-16 rounded-[20px] text-xl" : "h-10 w-10 rounded-[14px] text-sm"}`} aria-hidden>
      {iniciales(nombre, correo)}
      <span
        className={`absolute -bottom-1 -right-1 grid place-items-center rounded-full border-2 border-superficie ${tipo === "admin" ? "bg-naranjo text-white" : "bg-superficie text-gris"} ${grande ? "h-6 w-6" : "h-5 w-5"}`}
      >
        <Insignia size={grande ? 13 : 11} stroke={2} />
      </span>
    </span>
  );
}

/** Una tarjeta del formulario: ícono y título arriba (con algo a la derecha si hace falta), una línea de ayuda y el contenido. */
export function Tarjeta({ Icono, titulo, ayuda, extra, children }: { Icono: Icon; titulo: string; ayuda?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${HOJA} p-5`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-tinta">
          <Icono size={18} className="text-naranjo" /> {titulo}
        </h3>
        {extra && <div className="ml-auto">{extra}</div>}
      </div>
      {ayuda && <p className="mt-1 text-xs leading-snug text-gris">{ayuda}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Las pastillas de estado de la cabecera y de la lista. */
export const CHIP = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold";
