"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArchive, IconArchiveOff, IconCloudDownload, IconPencil, IconStar, IconStarFilled, IconTrash, IconUserPlus } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { Campo } from "@/components/flota/Campos";
import RuedaCarga from "@/components/RuedaCarga";
import { CAMPO } from "@/lib/estilos";
import { LARGO, type Persona } from "@/lib/contactos-modelo";
import {
  archivarContactoAction,
  eliminarPersonaAction,
  guardarPersonaAction,
  importarDesdeOdooAction,
} from "@/app/(protegido)/finanzas/contactos/acciones";

const BOTON_ICONO = "grid h-9 w-9 place-items-center rounded-lg text-gris-suave transition hover:bg-tinta/[0.04] disabled:opacity-50";

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
      className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-sm font-semibold text-gris transition hover:text-tinta disabled:opacity-50"
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
        <button title="Editar" onClick={() => { setError(null); setAbierta(true); }} className={`${BOTON_ICONO} hover:text-tinta`}>
          <IconPencil size={16} />
        </button>
      ) : (
        <button onClick={() => { setError(null); setAbierta(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-sm font-semibold text-azul transition hover:border-cian">
          <IconUserPlus size={16} /> Agregar persona
        </button>
      )}
      <VentanaModal
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo={persona ? "Editar persona de contacto" : "Nueva persona de contacto"}
        descripcion="Quien recibe la factura en la empresa. La principal sale como «Atención A:» en la factura."
      >
        <form action={enviar} className="space-y-4">
          <Campo etiqueta="Nombre" obligatorio>
            <input name="nombre" required defaultValue={persona?.nombre ?? ""} maxLength={LARGO.persona} className={CAMPO} placeholder="Ej: María González" autoFocus />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Cargo" ayuda="Opcional">
              <input name="cargo" defaultValue={persona?.cargo ?? ""} maxLength={80} className={CAMPO} placeholder="Ej: Jefa de compras" />
            </Campo>
            <Campo etiqueta="Teléfono" ayuda="Opcional">
              <input name="telefono" type="tel" defaultValue={persona?.telefono ?? ""} maxLength={LARGO.telefono} className={CAMPO} placeholder="+56 9 1234 5678" />
            </Campo>
          </div>
          <Campo etiqueta="Correo" ayuda="Opcional">
            <input name="correo" type="email" defaultValue={persona?.correo ?? ""} maxLength={LARGO.correo} className={CAMPO} placeholder="nombre@empresa.cl" />
          </Campo>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-tinta">
            <input type="checkbox" name="principal" defaultChecked={persona?.principal ?? false} className="h-4 w-4 accent-[var(--color-cian)]" />
            Contacto principal (sale como «Atención A:» en la factura)
          </label>
          {error && <p className="tono-alerta fondo-tono rounded-lg px-3 py-2 text-sm font-semibold">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-borde pt-4">
            <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
              Cancelar
            </button>
            <BotonGuardar pendiente={pendiente}>{persona ? "Guardar" : "Agregar"}</BotonGuardar>
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
