"use client";

import { useState } from "react";
import Link from "next/link";
import { IconFileSearch, IconShoppingCart, IconFileText, IconHistory, IconLoader2, IconNote, IconPhone, IconMail, IconTrash, IconUsers } from "@tabler/icons-react";
import { guardarOportunidadAction } from "@/app/(protegido)/gestion-financiera/acciones-ventas";
import { actividadesDeLeadAction, eliminarOportunidadAction, registrarActividadLeadAction } from "@/app/(protegido)/leads/acciones";
import { ETAPAS_OPORTUNIDAD } from "@/lib/fin/modelo";
import type { Actividad, Oportunidad } from "@/lib/fin/datos";
import { BotonAccion, CAMPO, Campo, ComboContacto, FormAccion, type OpcionContacto } from "@/components/fin/ui";
import { avisar } from "@/components/fin/dialogos";
import { BOTON_SEC } from "@/components/fin/estilos";

/** «Se necesita compra»: al marcarlo aparece el botón para pedirle cotización a un proveedor, enlazada a este lead. */
function NecesitaCompra({ leadId, inicial }: { leadId: string | null; inicial: boolean }) {
  const [marcado, setMarcado] = useState(inicial);
  return (
    <div className={`rounded-2xl border p-3 transition ${marcado ? "border-naranjo/40 bg-naranjo/[0.05]" : "border-borde"}`}>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-tinta">
        <input type="checkbox" name="necesitaCompra" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} className="h-4 w-4 accent-[var(--color-naranjo,#c2410c)]" />
        <IconShoppingCart size={16} className="text-naranjo" /> Se necesita compra
      </label>
      {marcado && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
          {leadId ? (
            <>
              <Link href={`/finanzas/ventas/solicitar-cotizacion?lead=${leadId}`} className={BOTON_SEC}><IconFileSearch size={14} /> Solicitar cotización</Link>
              <span className="text-xs text-gris">Se la pides a un proveedor y la compra que salga queda enlazada a este lead.</span>
            </>
          ) : (
            <span className="text-xs text-gris">Crea el lead y después, al abrirlo, aparece el botón «Solicitar cotización».</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Crear o editar un lead: lo que se pide primero es lo mínimo (nombre), lo demás se completa a medida que avanza. */
export function FormLead({ o, clientes, alOk, etapaInicial, responsableInicial, esAdmin = false }: { o?: Oportunidad; clientes: OpcionContacto[]; alOk?: () => void; etapaInicial?: string; responsableInicial?: string; esAdmin?: boolean }) {
  return (
    <div className="space-y-4">
      {o && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/leads/cotizaciones/nueva?oportunidad=${o.id}`} className={BOTON_SEC}><IconFileText size={14} /> Crear cotización para este lead</Link>
          {o.proyectoId && <Link href={`/gestion-financiera/proyectos/${o.proyectoId}`} className={BOTON_SEC}>Ver proyecto</Link>}
          {/* Solo el administrador del sistema (la acción lo vuelve a exigir en el servidor). */}
          {esAdmin && (
            <BotonAccion accion={eliminarOportunidadAction.bind(null, o.id)} motivo="¿Por qué se elimina este lead?" titulo="Eliminar el lead (solo administrador)" className="ml-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/[0.06] px-3 py-2 text-xs font-semibold text-alerta transition hover:bg-rose-500/[0.12] disabled:opacity-50">
              <IconTrash size={14} /> Eliminar lead
            </BotonAccion>
          )}
        </div>
      )}
      {o && <HistorialLead id={o.id} />}
      <FormAccion accion={guardarOportunidadAction.bind(null, o?.id ?? null)} textoBoton={o ? "Guardar" : "Crear lead"} alOk={alOk}>
        <Campo etiqueta="¿Qué se quiere vender? *"><input name="nombre" required defaultValue={o?.nombre} autoFocus={!o} className={CAMPO} placeholder="Mantención anual planta X" /></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Cliente" ayuda="Se elige de Contactos"><ComboContacto name="clienteId" opciones={clientes} inicial={o?.clienteId} /></Campo>
          <Campo etiqueta="Etapa"><select name="etapa" defaultValue={o?.etapa ?? etapaInicial ?? "prospecto"} className={CAMPO}>{ETAPAS_OPORTUNIDAD.map((e) => <option key={e.clave} value={e.clave}>{e.etiqueta}</option>)}</select></Campo>
        </div>
        <fieldset className="grid gap-3 rounded-2xl border border-borde p-3 sm:grid-cols-3">
          <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-gris">Contacto en el cliente</legend>
          <Campo etiqueta="Nombre"><input name="contactoNombre" defaultValue={o?.contactoNombre ?? ""} className={CAMPO} /></Campo>
          <Campo etiqueta="Correo"><input name="contactoCorreo" type="email" defaultValue={o?.contactoCorreo ?? ""} className={CAMPO} /></Campo>
          <Campo etiqueta="Teléfono"><input name="contactoTelefono" type="tel" defaultValue={o?.contactoTelefono ?? ""} className={CAMPO} /></Campo>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Monto estimado (neto)"><input name="montoEstimado" defaultValue={o?.montoEstimado ?? ""} inputMode="numeric" className={CAMPO} placeholder="0" /></Campo>
          <Campo etiqueta="Probabilidad %" ayuda="Vacío = la de la etapa"><input name="probabilidad" defaultValue={o?.probabilidad ?? ""} inputMode="numeric" className={CAMPO} /></Campo>
          <Campo etiqueta="Cierre estimado"><input name="fechaCierre" type="date" defaultValue={o?.fechaCierre ?? ""} className={CAMPO} /></Campo>
          <Campo etiqueta="Tipo"><select name="tipo" defaultValue={o?.tipo ?? "servicio"} className={CAMPO}><option value="servicio">Servicio</option><option value="arriendo">Arriendo</option><option value="venta">Venta</option></select></Campo>
          <Campo etiqueta="Responsable"><input name="responsable" defaultValue={o?.responsable ?? responsableInicial ?? ""} className={CAMPO} placeholder="correo o nombre" /></Campo>
          <Campo etiqueta="Origen"><select name="origen" defaultValue={o?.origen ?? ""} className={CAMPO}><option value="">—</option>{["licitación", "recurrente", "referido", "web", "otro"].map((x) => <option key={x}>{x}</option>)}</select></Campo>
        </div>
        <NecesitaCompra leadId={o?.id ?? null} inicial={o?.necesitaCompra ?? false} />
        <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
          <Campo etiqueta="Próximo paso" ayuda="Lo que sigue y quién lo hace: así no se enfría"><input name="proximoPaso" defaultValue={o?.proximoPaso ?? ""} className={CAMPO} placeholder="Llamar para confirmar visita a terreno" /></Campo>
          <Campo etiqueta="Para el día"><input name="proximoPasoFecha" type="date" defaultValue={o?.proximoPasoFecha ?? ""} className={CAMPO} /></Campo>
        </div>
        <Campo etiqueta="Motivo de pérdida (solo si se perdió)"><input name="motivoPerdida" defaultValue={o?.motivoPerdida ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Notas"><textarea name="descripcion" defaultValue={o?.descripcion ?? ""} rows={3} className={CAMPO} /></Campo>
      </FormAccion>
    </div>
  );
}

const ICONO_TIPO: Record<string, typeof IconNote> = { nota: IconNote, llamada: IconPhone, reunion: IconUsers, correo: IconMail, tarea: IconNote };
const ETIQUETA_TIPO: Record<string, string> = { nota: "Nota", llamada: "Llamada", reunion: "Reunión", correo: "Correo", tarea: "Tarea" };

/** Historial del lead: se carga al abrirlo, y se anota ahí mismo. */
function HistorialLead({ id }: { id: string }) {
  const [lista, setLista] = useState<Actividad[] | null>(null);
  const [tipo, setTipo] = useState("nota");
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cargar = async () => {
    const r = await actividadesDeLeadAction(id);
    if (r.ok) setLista(r.actividades);
    else avisar(r.error);
  };
  return (
    <details className="group rounded-2xl border border-borde bg-tinta/[0.02]" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && lista === null) void cargar(); }}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-tinta">
        <IconHistory size={16} className="text-naranjo" /> Historial y notas
        <span className="ml-auto text-xs font-normal text-gris group-open:hidden">Ver</span>
      </summary>
      <div className="space-y-3 border-t border-borde px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={`${CAMPO} sm:w-36`} aria-label="Tipo de actividad">
            {["nota", "llamada", "reunion", "correo"].map((t) => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
          </select>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} className={CAMPO} placeholder="Qué se habló o qué pasó…" maxLength={1000}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click(); } }} />
          <button type="button" disabled={guardando || !texto.trim()} className={BOTON_SEC}
            onClick={async () => {
              setGuardando(true);
              const r = await registrarActividadLeadAction(id, tipo, texto);
              setGuardando(false);
              if (!r.ok) return avisar(r.error);
              setTexto("");
              await cargar();
            }}>
            {guardando && <IconLoader2 size={14} className="animate-spin" />} Anotar
          </button>
        </div>
        {lista === null ? (
          <p className="text-xs text-gris">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-xs text-gris">Todavía no hay nada anotado.</p>
        ) : (
          <ul className="max-h-56 space-y-2 overflow-auto">
            {lista.map((a) => {
              const Icono = ICONO_TIPO[a.tipo] ?? IconNote;
              return (
                <li key={a.id} className="flex gap-2.5 text-[13px]">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-naranjo/10 text-naranjo"><Icono size={13} /></span>
                  <span className="min-w-0">
                    <span className="block break-words text-tinta">{a.texto}</span>
                    <span className="block text-[11px] text-gris">{ETIQUETA_TIPO[a.tipo] ?? a.tipo} · {new Date(a.creadoEn).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })} · {a.creadoPor?.split("@")[0] ?? "—"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
