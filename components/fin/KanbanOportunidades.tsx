"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconCalendar, IconFileText } from "@tabler/icons-react";
import { guardarOportunidadAction, moverOportunidadAction } from "@/app/(protegido)/gestion-financiera/acciones-ventas";
import { clpCorto, diaChile, diasEntre, fechaCl } from "@/lib/fin/reglas";
import { ETAPAS_OPORTUNIDAD } from "@/lib/fin/modelo";
import type { Oportunidad } from "@/lib/fin/datos";
import { CAMPO, Campo, ComboContacto, ConVentana, FormAccion, type OpcionContacto } from "./ui";
import { avisar, pedirTexto } from "./dialogos";

/** Pipeline tipo monday: columnas por etapa con Σ monto y Σ ponderado; se arrastra para avanzar. */
export default function KanbanOportunidades({ oportunidades, clientes, hoy }: { oportunidades: Oportunidad[]; clientes: OpcionContacto[]; hoy: string }) {
  const router = useRouter();
  const [ops, setOps] = useState(oportunidades);
  const [base, setBase] = useState(oportunidades);
  if (base !== oportunidades) {
    setBase(oportunidades);
    setOps(oportunidades);
  }
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const nombre = (id: string | null) => clientes.find((c) => c.id === id)?.nombre ?? "Sin cliente";

  const mover = async (id: string, etapa: string) => {
    const op = ops.find((o) => o.id === id);
    if (!op || op.etapa === etapa) return;
    let motivo: string | undefined;
    if (etapa === "perdida") {
      const m = await pedirTexto({ titulo: "¿Por qué se perdió?", ayuda: "Sirve para ver después por qué se pierden negocios (precio, plazo, competencia…).", placeholder: "Precio, plazo, la ganó otro…", boton: "Marcar perdida" });
      if (!m?.trim()) return;
      motivo = m;
    }
    const antes = ops;
    setOps((xs) => xs.map((o) => (o.id === id ? { ...o, etapa } : o)));
    iniciar(async () => {
      const r = await moverOportunidadAction(id, etapa, motivo);
      if (!r.ok) {
        avisar(r.error);
        setOps(antes);
      } else router.refresh();
    });
  };

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="grid min-w-[72rem] grid-cols-6 gap-3">
        {ETAPAS_OPORTUNIDAD.map((e) => {
          const xs = ops.filter((o) => o.etapa === e.clave);
          const total = xs.reduce((s, o) => s + o.montoEstimado, 0);
          const pond = xs.reduce((s, o) => s + (o.montoEstimado * o.probabilidad) / 100, 0);
          return (
            <section
              key={e.clave}
              onDragOver={(ev) => (ev.preventDefault(), setSobre(e.clave))}
              onDragLeave={() => setSobre(null)}
              onDrop={(ev) => {
                ev.preventDefault();
                setSobre(null);
                if (arrastrada) mover(arrastrada, e.clave);
              }}
              className={`flex min-h-[20rem] flex-col rounded-2xl border p-2 transition ${sobre === e.clave ? "border-naranjo bg-naranjo/[0.05]" : "border-borde bg-tinta/[0.02]"}`}
            >
              <header className="px-2 pb-2 pt-1">
                <p className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-tinta">
                  {e.etiqueta} <span className="text-gris">{xs.length}</span>
                </p>
                <p className="text-[11px] tabular-nums text-gris">{clpCorto(total)} · pond. {clpCorto(pond)}</p>
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {xs.map((o) => {
                  const ref = diaChile(o.ultimaActividad ?? o.actualizadoEn);
                  const quieta = !["ganada", "perdida"].includes(o.etapa) && diasEntre(ref, hoy) > 7;
                  return (
                    <article
                      key={o.id}
                      draggable
                      onDragStart={() => setArrastrada(o.id)}
                      onDragEnd={() => setArrastrada(null)}
                      className={`cursor-grab rounded-xl border bg-superficie p-3 shadow-sm active:cursor-grabbing ${arrastrada === o.id ? "opacity-40" : ""} ${quieta ? "border-amber-400/60" : "border-borde"}`}
                    >
                      <ConVentana boton={<span className="block text-left text-sm font-semibold leading-snug text-tinta hover:text-naranjo">{o.nombre}</span>} titulo={`${o.codigo} · ${o.nombre}`} className="w-full">
                        {(cerrar) => <FormOportunidad o={o} clientes={clientes} alOk={cerrar} />}
                      </ConVentana>
                      <p className="mt-0.5 truncate text-[11px] text-gris">{nombre(o.clienteId)}</p>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-bold tabular-nums text-tinta">{clpCorto(o.montoEstimado)}</span>
                        {o.fechaCierre && <span className="inline-flex items-center gap-0.5 text-gris"><IconCalendar size={11} /> {fechaCl(o.fechaCierre)}</span>}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-gris">
                        <span className="truncate">{o.responsable?.split("@")[0] ?? "—"}</span>
                        {quieta && <span className="inline-flex items-center gap-0.5 text-aviso"><IconAlertTriangle size={11} /> {diasEntre(ref, hoy)} d sin actividad</span>}
                      </div>
                      {o.etapa === "cotizacion" && (
                        <Link href={`/gestion-financiera/comercial/cotizaciones/nueva?oportunidad=${o.id}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-naranjo hover:underline"><IconFileText size={12} /> Crear cotización</Link>
                      )}
                      {o.etapa === "perdida" && o.motivoPerdida && <p className="mt-1 text-[10px] text-alerta">{o.motivoPerdida}</p>}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function FormOportunidad({ o, clientes, alOk }: { o?: Oportunidad; clientes: OpcionContacto[]; alOk?: () => void }) {
  return (
    <FormAccion accion={guardarOportunidadAction.bind(null, o?.id ?? null)} textoBoton={o ? "Guardar" : "Crear oportunidad"} alOk={alOk}>
      <Campo etiqueta="Nombre *"><input name="nombre" required defaultValue={o?.nombre} autoFocus={!o} className={CAMPO} placeholder="Mantención anual planta X" /></Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Cliente"><ComboContacto name="clienteId" opciones={clientes} inicial={o?.clienteId} /></Campo>
        <Campo etiqueta="Tipo"><select name="tipo" defaultValue={o?.tipo ?? "servicio"} className={CAMPO}><option value="servicio">Servicio</option><option value="arriendo">Arriendo</option><option value="venta">Venta</option></select></Campo>
        <Campo etiqueta="Etapa"><select name="etapa" defaultValue={o?.etapa ?? "prospecto"} className={CAMPO}>{ETAPAS_OPORTUNIDAD.map((e) => <option key={e.clave} value={e.clave}>{e.etiqueta}</option>)}</select></Campo>
        <Campo etiqueta="Monto estimado (neto)"><input name="montoEstimado" defaultValue={o?.montoEstimado ?? ""} inputMode="numeric" className={CAMPO} /></Campo>
        <Campo etiqueta="Probabilidad %" ayuda="Vacío = la de la etapa"><input name="probabilidad" defaultValue={o?.probabilidad ?? ""} inputMode="numeric" className={CAMPO} /></Campo>
        <Campo etiqueta="Cierre estimado"><input name="fechaCierre" type="date" defaultValue={o?.fechaCierre ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Responsable"><input name="responsable" defaultValue={o?.responsable ?? ""} className={CAMPO} placeholder="correo o nombre" /></Campo>
        <Campo etiqueta="Origen"><select name="origen" defaultValue={o?.origen ?? ""} className={CAMPO}><option value="">—</option>{["licitación", "recurrente", "referido", "web", "otro"].map((x) => <option key={x}>{x}</option>)}</select></Campo>
      </div>
      <Campo etiqueta="Motivo de pérdida (si está perdida)"><input name="motivoPerdida" defaultValue={o?.motivoPerdida ?? ""} className={CAMPO} /></Campo>
      <Campo etiqueta="Descripción"><textarea name="descripcion" defaultValue={o?.descripcion ?? ""} rows={3} className={CAMPO} /></Campo>
    </FormAccion>
  );
}
