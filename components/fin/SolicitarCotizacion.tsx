"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconLink, IconLoader2, IconPlus, IconSend, IconShoppingCart, IconTrash } from "@tabler/icons-react";
import { enviarSolicitudCotizacionAction, cambiarEstadoSolicitudCotizacionAction } from "@/app/(protegido)/gestion-financiera/acciones-solicitud-cotizacion";
import type { SolicitudCotizacion } from "@/lib/fin/solicitud-cotizacion";
import { ComboContacto, type OpcionContacto } from "./ui";
import { BOTON, BOTON_SEC, CAMPO } from "./estilos";
import { avisar } from "./dialogos";

interface Item { descripcion: string; cantidad: string; unidad: string }
const ITEM: Item = { descripcion: "", cantidad: "1", unidad: "un" };
const ESTADO: Record<SolicitudCotizacion["estado"], { t: string; c: string }> = {
  enviada: { t: "Esperando respuesta", c: "bg-amber-500/12 text-amber-700" },
  recibida: { t: "Cotización recibida", c: "bg-sky-500/12 text-sky-700" },
  cerrada: { t: "Cerrada", c: "bg-tinta/[0.07] text-gris" },
};
const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("-");

function mensajeBase(nombre: string | null, empresa: string, yo: string) {
  return `Estimados${nombre ? ` de ${nombre}` : ""}:\n\nJunto con saludar, les escribimos de ${empresa} para solicitarles una cotización por lo siguiente:\n\nFavor indicar precio unitario neto, plazo de entrega, condición de pago y validez de la oferta.\n\nSaludos cordiales,\n${yo}`;
}

export default function SolicitarCotizacion({ contactos, correos, empresa, yo, lead, solicitudes, rutaCompras }: {
  contactos: OpcionContacto[];
  correos: Record<string, string>;
  empresa: string;
  yo: string;
  lead: { id: string; codigo: string; nombre: string } | null;
  solicitudes: SolicitudCotizacion[] | null;
  rutaCompras: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [contactoId, setContactoId] = useState<string | null>(null);
  const [correo, setCorreo] = useState("");
  const [copias, setCopias] = useState("");
  const [asunto, setAsunto] = useState(lead ? `Solicitud de cotización · ${lead.nombre}` : "Solicitud de cotización");
  const [mensaje, setMensaje] = useState(mensajeBase(null, empresa, yo));
  const [mensajeTocado, setMensajeTocado] = useState(false);
  const [items, setItems] = useState<Item[]>([lead ? { ...ITEM, descripcion: lead.nombre } : { ...ITEM }]);
  const [responderAntes, setResponderAntes] = useState("");

  function elegirContacto(id: string | null) {
    setContactoId(id);
    if (id && correos[id]) setCorreo(correos[id]);
    if (!mensajeTocado) setMensaje(mensajeBase(contactos.find((c) => c.id === id)?.nombre ?? null, empresa, yo));
  }
  const cambiar = (i: number, p: Partial<Item>) => setItems((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  function enviar() {
    iniciar(async () => {
      const r = await enviarSolicitudCotizacionAction(JSON.stringify({ contactoId, correo, copias, asunto, mensaje, items, responderAntes, oportunidadId: lead?.id }));
      if (!r.ok) return avisar(r.error);
      avisar("Solicitud enviada. Cuando llegue la cotización, conviértela en solicitud de compra desde la lista de abajo.", "ok");
      setItems([{ ...ITEM }]);
      setContactoId(null);
      setCorreo("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-borde/60 bg-superficie p-4 shadow-sm sm:p-5">
        {lead && (
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-naranjo/[0.08] px-2.5 py-1.5 text-xs font-semibold text-naranjo">
            <IconLink size={14} /> Vinculada al lead {lead.codigo} · {lead.nombre}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-tinta/70">¿A quién? *</span>
            <ComboContacto name="_contacto" opciones={contactos} inicial={null} alCambiar={elegirContacto} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-tinta/70">Correo *</span>
            <input value={correo} onChange={(e) => setCorreo(e.target.value)} type="text" placeholder="ventas@proveedor.cl (varios, separados por coma)" className={CAMPO} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-tinta/70">Asunto *</span>
            <input value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={200} className={CAMPO} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-tinta/70">Con copia</span>
              <input value={copias} onChange={(e) => setCopias(e.target.value)} placeholder="opcional" className={CAMPO} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-tinta/70">Responder antes del</span>
              <input value={responderAntes} onChange={(e) => setResponderAntes(e.target.value)} type="date" className={CAMPO} />
            </label>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-[11px] font-semibold text-tinta/70">¿Qué necesitas que te coticen? *</span>
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2 rounded-xl border border-borde/50 p-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2rem] sm:border-0 sm:p-0">
                <input value={it.descripcion} onChange={(e) => cambiar(i, { descripcion: e.target.value })} placeholder="Producto o servicio" aria-label={`Descripción del ítem ${i + 1}`} className={`${CAMPO} col-span-3 sm:col-span-1`} />
                <input value={it.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value })} inputMode="decimal" aria-label="Cantidad" className={`${CAMPO} text-right`} />
                <input value={it.unidad} onChange={(e) => cambiar(i, { unidad: e.target.value })} aria-label="Unidad" className={CAMPO} />
                <button type="button" onClick={() => setItems((ls) => (ls.length === 1 ? [{ ...ITEM }] : ls.filter((_, j) => j !== i)))} aria-label="Quitar ítem" className="grid h-9 w-8 place-items-center rounded-lg text-gris hover:bg-rose-500/10 hover:text-alerta"><IconTrash size={15} /></button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setItems((ls) => [...ls, { ...ITEM }])} className={`${BOTON_SEC} mt-2`}><IconPlus size={14} /> Agregar ítem</button>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-tinta/70">Mensaje * <span className="font-normal text-gris">(los ítems van en una tabla debajo del mensaje)</span></span>
          <textarea value={mensaje} onChange={(e) => { setMensaje(e.target.value); setMensajeTocado(true); }} rows={8} className={CAMPO} />
        </label>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-xs text-gris">Sale desde tu correo y queda en tus enviados.</span>
          <button type="button" onClick={enviar} disabled={pendiente} className={BOTON}>
            {pendiente ? <IconLoader2 size={15} className="animate-spin" /> : <IconSend size={15} />} Enviar solicitud
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-tinta">Solicitudes enviadas</h3>
        {solicitudes === null ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800">Falta correr el SQL <code>supabase/fin/0009_solicitud_cotizacion.sql</code> para guardar las solicitudes.</p>
        ) : solicitudes.length === 0 ? (
          <p className="text-sm text-gris">Todavía no hay solicitudes.</p>
        ) : (
          <ul className="divide-y divide-borde/60 rounded-2xl border border-borde/60 bg-superficie">
            {solicitudes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                <span className="w-16 shrink-0 font-mono text-xs font-semibold text-tinta">{s.codigo}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-tinta">{s.contactoNombre ?? s.correo} · {s.items.map((i) => i.descripcion).join(", ")}</span>
                  <span className="text-[11px] text-gris">{fecha(s.creadoEn)} · {s.correo}{s.oportunidadCodigo ? ` · Lead ${s.oportunidadCodigo}` : ""}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTADO[s.estado].c}`}>{ESTADO[s.estado].t}</span>
                {s.compraId ? (
                  <Link href={`${rutaCompras}/${s.compraId}`} className={`${BOTON_SEC} !py-1 !text-xs`}>Ver compra</Link>
                ) : (
                  <>
                    {s.estado === "enviada" && (
                      <button type="button" onClick={() => iniciar(async () => { const r = await cambiarEstadoSolicitudCotizacionAction(s.id, "recibida"); if (!r.ok) avisar(r.error); router.refresh(); })} className={`${BOTON_SEC} !py-1 !text-xs`}>Marcar recibida</button>
                    )}
                    <Link href={`${rutaCompras}/nueva?desde=${s.id}`} className={`${BOTON} !py-1 !text-xs`}><IconShoppingCart size={13} /> Crear solicitud de compra</Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
