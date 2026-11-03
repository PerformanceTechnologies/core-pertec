"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArchive, IconArchiveOff, IconAt, IconBriefcase, IconCloudDownload, IconPencil, IconPhone, IconStar, IconStarFilled, IconTrash, IconUser, IconUserEdit, IconUserPlus } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import RuedaCarga from "@/components/RuedaCarga";
import { BOTON_C, BOTON_SUAVE_C, CAMPO_I, ConIcono, IconoTile } from "@/components/contactos/Visual";
import { LARGO, nombrePropio, type Persona } from "@/lib/contactos-modelo";
import {
  archivarContactoAction,
  eliminarPersonaAction,
  guardarPersonaAction,
  importarDesdeOdooAction,
} from "@/app/(protegido)/finanzas/contactos/acciones";

const BOTON_ICONO = "grid h-9 w-9 place-items-center rounded-full text-gris-suave transition hover:bg-tinta/[0.06] disabled:opacity-50";

/** Un campo del formulario de la persona: etiqueta chica arriba. */
function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-semibold text-gris">{etiqueta}</span>
      {children}
    </label>
  );
}

/** Archivar o reactivar: archivar no borra, solo lo saca de las listas. */
export function ArchivarContacto({ id, activo }: { id: string; activo: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pendiente}
      onClick={() => {
        if (activo && !confirm("¿Archivar este contacto? Sale de las listas pero no se borra: puedes reactivarlo cuando quieras.")) return;
        iniciar(async () => {
          const r = await archivarContactoAction(id, activo);
          if (r.ok) router.refresh();
          else alert(r.error);
        });
      }}
      className={BOTON_SUAVE_C}
    >
      {activo ? <IconArchive size={16} /> : <IconArchiveOff size={16} />}
      {activo ? "Archivar" : "Reactivar"}
    </button>
  );
}

/** Agregar o editar una persona de contacto (el «Atención A:» de la factura). */
export function FormularioPersona({ contactoId, persona }: { contactoId: string; persona?: Persona }) {
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function enviar(fd: FormData) {
    setError(null);
    iniciar(async () => {
      const r = await guardarPersonaAction(contactoId, persona?.id ?? null, fd);
      if (!r.ok) return setError(r.error);
      setAbierta(false);
      router.refresh();
    });
  }

  return (
    <>
      {persona ? (
        <button title="Editar" onClick={() => { setError(null); setNombre(persona?.nombre ?? ""); setAbierta(true); }} className={`${BOTON_ICONO} hover:text-tinta`}>
          <IconPencil size={16} />
        </button>
      ) : (
        <button onClick={() => { setError(null); setNombre(""); setAbierta(true); }} className={BOTON_SUAVE_C}>
          <IconUserPlus size={16} /> Agregar persona
        </button>
      )}
      <VentanaModal
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo={persona ? "Editar persona" : "Nueva persona"}
        descripcion="Quien recibe la factura en la empresa. La principal sale como «Atención A:»."
        variante="hoja"
        icono={<IconoTile Icono={persona ? IconUserEdit : IconUserPlus} tono="marca" />}
        ancho="max-w-md"
      >
        <form action={enviar} className="space-y-3">
          <Campo etiqueta="Nombre *">
            <ConIcono Icono={IconUser}>
              <input
                name="nombre"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onBlur={() => setNombre(nombrePropio(nombre))}
                maxLength={LARGO.persona}
                className={CAMPO_I}
                placeholder="Ej: María González"
                autoFocus
              />
            </ConIcono>
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Cargo">
              <ConIcono Icono={IconBriefcase}>
                <input name="cargo" defaultValue={persona?.cargo ?? ""} maxLength={80} className={CAMPO_I} placeholder="Ej: Jefa de compras" />
              </ConIcono>
            </Campo>
            <Campo etiqueta="Teléfono">
              <ConIcono Icono={IconPhone}>
                <input name="telefono" type="tel" defaultValue={persona?.telefono ?? ""} maxLength={LARGO.telefono} className={CAMPO_I} placeholder="+56 9 1234 5678" />
              </ConIcono>
            </Campo>
          </div>
          <Campo etiqueta="Correo">
            <ConIcono Icono={IconAt}>
              <input name="correo" type="email" defaultValue={persona?.correo ?? ""} maxLength={LARGO.correo} className={CAMPO_I} placeholder="nombre@empresa.cl" />
            </ConIcono>
          </Campo>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-tinta/[0.05] px-3 py-2.5 text-[13px] font-semibold text-gris transition has-[:checked]:bg-amber-500/15 has-[:checked]:text-tinta has-[:checked]:[&>svg]:text-amber-500 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-cian/15">
            <input type="checkbox" name="principal" defaultChecked={persona?.principal ?? false} className="sr-only" />
            <IconStar size={16} stroke={1.75} aria-hidden /> Contacto principal
            <span className="ml-auto text-[11px] font-normal text-gris-suave">sale como «Atención A:»</span>
          </label>
          {error && <p className="tono-alerta fondo-tono rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-borde/60 pt-3">
            <button type="button" onClick={() => setAbierta(false)} className={BOTON_SUAVE_C}>
              Cancelar
            </button>
            <button type="submit" disabled={pendiente} aria-busy={pendiente} className={BOTON_C}>
              {pendiente && <RuedaCarga className="h-4 w-4" />}
              {pendiente ? "Guardando…" : persona ? "Guardar" : "Agregar"}
            </button>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}

/** Marcar como principal o quitar, desde la fila de la persona. */
export function AccionesPersona({ contactoId, persona }: { contactoId: string; persona: Persona }) {
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const correr = (f: () => Promise<{ ok: boolean; error?: string }>) =>
    iniciar(async () => {
      const r = await f();
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  const marcarPrincipal = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ nombre: persona.nombre, cargo: persona.cargo, correo: persona.correo, telefono: persona.telefono })) fd.set(k, v ?? "");
    fd.set("principal", "on");
    return guardarPersonaAction(contactoId, persona.id, fd);
  };
  return (
    <span className="inline-flex items-center">
      <button
        title={persona.principal ? "Contacto principal" : "Marcar como principal"}
        disabled={pendiente || persona.principal}
        onClick={() => correr(marcarPrincipal)}
        className={`${BOTON_ICONO} ${persona.principal ? "text-amber-500 disabled:opacity-100" : "hover:text-amber-500"}`}
      >
        {persona.principal ? <IconStarFilled size={16} /> : <IconStar size={16} />}
      </button>
      <FormularioPersona contactoId={contactoId} persona={persona} />
      <button
        title="Quitar"
        disabled={pendiente}
        onClick={() => confirm(`¿Quitar a ${persona.nombre} de este contacto?`) && correr(() => eliminarPersonaAction(contactoId, persona.id))}
        className={`${BOTON_ICONO} hover:text-rose-500`}
      >
        <IconTrash size={16} />
      </button>
    </span>
  );
}

/** Solo el administrador: trae de Odoo los contactos que todavía no están (no pisa los existentes). */
export function ImportarDesdeOdoo() {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        disabled={pendiente}
        onClick={() => {
          if (!confirm("Se leerán todos los contactos de Odoo y se agregarán los que falten. Los que ya están en el Core no se modifican. ¿Seguir?")) return;
          setMensaje(null);
          iniciar(async () => {
            const r = await importarDesdeOdooAction();
            if (!r.ok) return setMensaje({ ok: false, texto: r.error });
            const x = r.resultado;
            setMensaje({
              ok: true,
              texto: x.nuevos || x.personasNuevas
                ? `Listo: ${x.nuevos} contactos nuevos y ${x.personasNuevas} personas de contacto. ${x.yaEstaban} ya estaban.`
                : `No había nada nuevo en Odoo (${x.yaEstaban} contactos ya estaban).`,
            });
            router.refresh();
          });
        }}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-3.5 text-xs font-bold uppercase tracking-wide text-azul transition hover:border-cian disabled:cursor-progress disabled:opacity-60"
      >
        {pendiente ? <RuedaCarga className="h-4 w-4" /> : <IconCloudDownload size={16} />}
        {pendiente ? "Leyendo Odoo…" : "Traer desde Odoo"}
      </button>
      {mensaje && <span className={`${mensaje.ok ? "tono-ok" : "tono-alerta"} fondo-tono rounded-lg px-2.5 py-1.5 text-xs font-semibold`}>{mensaje.texto}</span>}
    </span>
  );
}
