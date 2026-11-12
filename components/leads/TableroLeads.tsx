"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconChevronDown, IconFileText, IconPhone, IconPlus, IconSearch } from "@tabler/icons-react";
import { moverOportunidadAction } from "@/app/(protegido)/gestion-financiera/acciones-ventas";
import { clpCorto, diaChile, diasEntre, fechaCl } from "@/lib/fin/reglas";
import { ETAPAS_OPORTUNIDAD } from "@/lib/fin/modelo";
import type { Oportunidad } from "@/lib/fin/datos";
import { CAMPO, ConVentana, type OpcionContacto } from "@/components/fin/ui";
import { avisar, pedirTexto } from "@/components/fin/dialogos";
import { FormLead } from "./FormLead";

/** Color de cada etapa: la franja de la columna y la pastilla de la tabla. */
const TONO: Record<string, { franja: string; chip: string }> = {
  prospecto: { franja: "border-t-slate-400", chip: "bg-slate-500/10 text-gris" },
  calificada: { franja: "border-t-sky-500", chip: "bg-sky-500/10 text-info" },
  cotizacion: { franja: "border-t-violet-500", chip: "bg-violet-500/10 text-violet-600" },
  negociacion: { franja: "border-t-amber-500", chip: "bg-amber-500/12 text-aviso" },
  ganada: { franja: "border-t-emerald-500", chip: "bg-emerald-500/12 text-ok" },
  perdida: { franja: "border-t-rose-500", chip: "bg-rose-500/12 text-alerta" },
};

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cerrada = (e: string) => e === "ganada" || e === "perdida";

/**
 * Panel de leads: tablero (se arrastra de etapa en etapa; en el celular, con el selector de cada tarjeta)
 * o tabla, con búsqueda y filtro por responsable. Todo movimiento queda registrado en Finanzas.
 */
export default function TableroLeads({ oportunidades, clientes, hoy, vista, yo, esAdmin = false }: { oportunidades: Oportunidad[]; clientes: OpcionContacto[]; hoy: string; vista: "tablero" | "tabla"; yo: string; esAdmin?: boolean }) {
  const router = useRouter();
  const [ops, setOps] = useState(oportunidades);
  const [base, setBase] = useState(oportunidades);
  if (base !== oportunidades) {
    setBase(oportunidades);
    setOps(oportunidades);
  }
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [resp, setResp] = useState("");
  const [, iniciar] = useTransition();
  const nombre = (id: string | null) => clientes.find((c) => c.id === id)?.nombre ?? "Sin cliente";

  const responsables = useMemo(() => [...new Set(oportunidades.map((o) => o.responsable).filter((x): x is string => Boolean(x)))].sort(), [oportunidades]);
  const visibles = useMemo(() => {
    const t = plano(q.trim());
    return ops.filter((o) => (!resp || o.responsable === resp) && (!t || plano(`${o.codigo} ${o.nombre} ${nombre(o.clienteId)} ${o.contactoNombre ?? ""} ${o.proximoPaso ?? ""}`).includes(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops, q, resp, clientes]);

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
    const prob = ETAPAS_OPORTUNIDAD.find((e) => e.clave === etapa)?.probabilidad ?? op.probabilidad;
    setOps((xs) => xs.map((o) => (o.id === id ? { ...o, etapa, probabilidad: prob } : o)));
    iniciar(async () => {
      const r = await moverOportunidadAction(id, etapa, motivo);
      if (!r.ok) {
        avisar(r.error);
        setOps(antes);
      } else router.refresh();
    });
  };

  const tarjeta = (o: Oportunidad, arrastrable: boolean) => (
    <TarjetaLead key={o.id} o={o} cliente={nombre(o.clienteId)} hoy={hoy} clientes={clientes} esAdmin={esAdmin} arrastrable={arrastrable} arrastrando={arrastrada === o.id}
      alArrastrar={() => setArrastrada(o.id)} alSoltar={() => setArrastrada(null)} alMover={(e) => mover(o.id, e)} />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <IconSearch size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-suave" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por lead, cliente, contacto o código…" className={`${CAMPO} pl-9`} aria-label="Buscar leads" />
        </div>
        {responsables.length > 1 && (
          <select value={resp} onChange={(e) => setResp(e.target.value)} className={`${CAMPO} sm:w-56`} aria-label="Filtrar por responsable">
            <option value="">Todos los responsables</option>
            {responsables.map((r) => <option key={r} value={r}>{r.split("@")[0]}</option>)}
          </select>
        )}
      </div>

      {visibles.length === 0 && <p className="rounded-xl border border-dashed border-borde px-4 py-8 text-center text-sm text-gris">Ningún lead coincide con la búsqueda.</p>}

      {vista === "tablero" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-1 sm:px-1">
          <div className="flex snap-x snap-mandatory gap-3 md:grid md:min-w-[72rem] md:snap-none md:grid-cols-6">
            {ETAPAS_OPORTUNIDAD.map((e) => {
              const xs = visibles.filter((o) => o.etapa === e.clave);
              const total = xs.reduce((s, o) => s + o.montoEstimado, 0);
              const pond = xs.reduce((s, o) => s + (o.montoEstimado * o.probabilidad) / 100, 0);
              return (
                <section
                  key={e.clave}
                  aria-label={`Etapa ${e.etiqueta}`}
                  onDragOver={(ev) => (ev.preventDefault(), setSobre(e.clave))}
                  onDragLeave={() => setSobre(null)}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    setSobre(null);
                    // Se suelta el «arrastrando» acá y no solo en dragend: al caer en otra columna la tarjeta original
                    // se desmonta y su dragend nunca llega, y la tarjeta nueva se quedaba semitransparente (gris).
                    const id = arrastrada;
                    setArrastrada(null);
                    if (id) void mover(id, e.clave);
                  }}
                  className={`flex min-h-[18rem] w-[82vw] max-w-[19rem] shrink-0 snap-start flex-col rounded-2xl border border-t-4 p-2 transition md:w-auto md:max-w-none md:shrink ${TONO[e.clave].franja} ${sobre === e.clave ? "border-naranjo bg-naranjo/[0.05]" : "border-borde bg-tinta/[0.02]"}`}
                >
                  <header className="flex items-start justify-between gap-2 px-2 pb-2 pt-1">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-tinta">{e.etiqueta} <span className="rounded-full bg-tinta/[0.07] px-1.5 text-[11px] font-semibold text-gris">{xs.length}</span></p>
                      <p className="truncate text-[11px] tabular-nums text-gris">{clpCorto(total)}{!cerrada(e.clave) && <> · pond. {clpCorto(pond)}</>}</p>
                    </div>
                    {!cerrada(e.clave) && (
                      <ConVentana boton={<IconPlus size={15} />} titulo={`Nuevo lead · ${e.etiqueta}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-gris transition hover:bg-naranjo/10 hover:text-naranjo">
                        {(cerrar) => <FormLead clientes={clientes} alOk={cerrar} etapaInicial={e.clave} responsableInicial={yo} />}
                      </ConVentana>
                    )}
                  </header>
                  <div className="flex flex-1 flex-col gap-2">
                    {xs.map((o) => tarjeta(o, true))}
                    {xs.length === 0 && <p className="mt-2 rounded-xl border border-dashed border-borde px-3 py-6 text-center text-[11px] text-gris-suave">Arrastra un lead hasta acá</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          {/* Celular: tarjetas apiladas; la tabla de 9 columnas no se lee en una pantalla angosta. */}
          <div className="grid gap-2 md:hidden">{visibles.map((o) => tarjeta(o, false))}</div>
          <div className="hidden overflow-x-auto rounded-xl border border-borde bg-superficie md:block">
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-3 py-2.5">Lead</th><th className="px-3 py-2.5">Cliente</th><th className="px-3 py-2.5">Etapa</th><th className="px-3 py-2.5 text-right">Monto</th>
                  <th className="px-3 py-2.5 text-right">Prob.</th><th className="px-3 py-2.5">Cierre</th><th className="px-3 py-2.5">Próximo paso</th><th className="px-3 py-2.5">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {visibles.map((o) => {
                  const ref = diaChile(o.ultimaActividad ?? o.actualizadoEn);
                  const quieta = !cerrada(o.etapa) && diasEntre(ref, hoy) > 7;
                  return (
                    <tr key={o.id} className="hover:bg-tinta/[0.02]">
                      <td className="max-w-[16rem] px-3 py-2.5 align-top">
                        <ConVentana boton={<span className="block truncate text-left font-semibold text-tinta hover:text-naranjo">{o.nombre}</span>} titulo={`${o.codigo} · ${o.nombre}`} className="w-full">
                          {(cerrar) => <FormLead o={o} clientes={clientes} alOk={cerrar} esAdmin={esAdmin} />}
                        </ConVentana>
                        <span className="text-[11px] text-gris">{o.codigo}{quieta && <span className="ml-1.5 inline-flex items-center gap-0.5 text-aviso"><IconAlertTriangle size={11} /> {diasEntre(ref, hoy)} d sin actividad</span>}</span>
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-2.5 align-top text-xs">{nombre(o.clienteId)}</td>
                      <td className="px-3 py-2.5 align-top"><SelectorEtapa o={o} alMover={(e) => mover(o.id, e)} /></td>
                      <td className="px-3 py-2.5 text-right align-top font-semibold tabular-nums">{clpCorto(o.montoEstimado)}</td>
                      <td className="px-3 py-2.5 text-right align-top text-xs tabular-nums text-gris">{o.probabilidad}%</td>
                      <td className="px-3 py-2.5 align-top text-xs text-gris">{fechaCl(o.fechaCierre)}</td>
                      <td className="max-w-[14rem] px-3 py-2.5 align-top text-xs text-gris">{o.proximoPaso ? <>{o.proximoPaso}{o.proximoPasoFecha && <span className="block">{fechaCl(o.proximoPasoFecha)}</span>}</> : "—"}</td>
                      <td className="px-3 py-2.5 align-top text-xs text-gris">{o.responsable?.split("@")[0] ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** Cambiar de etapa sin arrastrar: lo que se usa en el celular y con teclado. */
function SelectorEtapa({ o, alMover, className = "max-w-full" }: { o: Oportunidad; alMover: (etapa: string) => void; className?: string }) {
  return (
    <select value={o.etapa} onChange={(e) => alMover(e.target.value)} aria-label={`Etapa de ${o.nombre}`} onClick={(e) => e.stopPropagation()}
      className={`${className} cursor-pointer truncate rounded-full border-0 py-1 pl-2.5 pr-6 text-[11px] font-semibold ${TONO[o.etapa]?.chip ?? ""}`}>
      {ETAPAS_OPORTUNIDAD.map((e) => <option key={e.clave} value={e.clave}>{e.etiqueta}</option>)}
    </select>
  );
}

/** Lo que no cabe en la tarjeta: se ve al pasar el cursor (en computador) o con «Ver más» (en el celular). */
function DetalleLead({ o, hoy, conLlamar = false }: { o: Oportunidad; hoy: string; conLlamar?: boolean }) {
  const ref = diaChile(o.ultimaActividad ?? o.actualizadoEn);
  const hace = diasEntre(ref, hoy);
  const vencido = !cerrada(o.etapa) && o.proximoPasoFecha && o.proximoPasoFecha < hoy;
  const filas: [string, React.ReactNode][] = [];
  if (o.contactoNombre || o.contactoTelefono || o.contactoCorreo) {
    filas.push(["Contacto", <span key="c" className="break-words">{[o.contactoNombre, o.contactoTelefono, o.contactoCorreo].filter(Boolean).join(" · ")}{conLlamar && o.contactoTelefono && <a href={`tel:${o.contactoTelefono.replace(/[^\d+]/g, "")}`} onClick={(e) => e.stopPropagation()} className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-naranjo"><IconPhone size={11} /> llamar</a>}</span>]);
  }
  if (o.proximoPaso) filas.push(["Próximo paso", <span key="p" className={vencido ? "font-semibold text-alerta" : ""}>{o.proximoPaso}{o.proximoPasoFecha && ` · ${fechaCl(o.proximoPasoFecha)}`}{vencido && " (vencido)"}</span>]);
  if (o.fechaCierre) filas.push(["Cierre estimado", fechaCl(o.fechaCierre)]);
  filas.push(["Responsable", o.responsable?.split("@")[0] ?? "—"]);
  filas.push(["Tipo y origen", [o.tipo, o.origen].filter(Boolean).join(" · ")]);
  filas.push(["Última actividad", hace <= 0 ? "hoy" : `hace ${hace} ${hace === 1 ? "día" : "días"}${!cerrada(o.etapa) && hace > 7 ? " (sin seguimiento)" : ""}`]);
  if (o.descripcion) filas.push(["Notas", <span key="n" className="line-clamp-4 break-words">{o.descripcion}</span>]);
  if (o.etapa === "perdida" && o.motivoPerdida) filas.push(["Motivo de pérdida", <span key="m" className="text-alerta">{o.motivoPerdida}</span>]);
  return (
    <dl className="space-y-1.5 text-[11px] leading-snug">
      {filas.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[5.5rem_1fr] gap-2">
          <dt className="font-semibold text-gris">{k}</dt>
          <dd className="min-w-0 text-tinta">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * La tarjeta, concisa: qué es, de quién, cuánto y en qué etapa. El resto (contacto, próximo paso, cierre, notas…)
 * aparece al pasar el cursor por encima, o con «Ver más» en el celular, donde no hay cursor.
 */
function TarjetaLead({ o, cliente, hoy, clientes, esAdmin, arrastrable, arrastrando, alArrastrar, alSoltar, alMover }: {
  o: Oportunidad; cliente: string; hoy: string; clientes: OpcionContacto[]; esAdmin: boolean; arrastrable: boolean; arrastrando: boolean; alArrastrar: () => void; alSoltar: () => void; alMover: (etapa: string) => void;
}) {
  const ref = diaChile(o.ultimaActividad ?? o.actualizadoEn);
  const quieta = !cerrada(o.etapa) && diasEntre(ref, hoy) > 7;
  const vencido = !cerrada(o.etapa) && Boolean(o.proximoPasoFecha && o.proximoPasoFecha < hoy);
  const aviso = vencido ? "Próximo paso vencido" : quieta ? `${diasEntre(ref, hoy)} días sin actividad` : null;
  const tarjeta = useRef<HTMLElement>(null);
  const espera = useRef<number | undefined>(undefined);
  const [flotante, setFlotante] = useState<{ x: number; y: number } | null>(null);
  const [masAbierto, setMasAbierto] = useState(false);

  const ocultar = () => {
    window.clearTimeout(espera.current);
    setFlotante(null);
  };
  useEffect(() => () => window.clearTimeout(espera.current), []);
  // pointerleave no llega si se abre una ventana encima, se navega o se hace scroll: mientras el detalle está
  // a la vista se revisa en cada movimiento que el cursor siga sobre la tarjeta, y cualquier clic, tecla o scroll lo cierra.
  useEffect(() => {
    if (!flotante) return;
    const fuera = (e: PointerEvent) => {
      const el = tarjeta.current;
      if (!el || !el.isConnected || !el.contains(document.elementFromPoint(e.clientX, e.clientY))) ocultar();
    };
    const cerrar = () => ocultar();
    window.addEventListener("pointermove", fuera, { passive: true });
    window.addEventListener("pointerdown", cerrar, true);
    window.addEventListener("keydown", cerrar, true);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("blur", cerrar);
    return () => {
      window.removeEventListener("pointermove", fuera);
      window.removeEventListener("pointerdown", cerrar, true);
      window.removeEventListener("keydown", cerrar, true);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("blur", cerrar);
    };
  }, [flotante]);
  // Un instante de espera: pasar el cursor de largo no abre nada. Solo con mouse (el táctil usa «Ver más»).
  const mostrar = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || arrastrando) return;
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => {
      const r = tarjeta.current?.getBoundingClientRect();
      if (!r) return;
      const ancho = 296;
      const aLaDerecha = r.right + 10 + ancho <= window.innerWidth;
      setFlotante({ x: aLaDerecha ? r.right + 10 : Math.max(8, r.left - 10 - ancho), y: Math.max(8, Math.min(r.top, window.innerHeight - 320)) });
    }, 300);
  };

  return (
    <article
      ref={tarjeta}
      draggable={arrastrable}
      onDragStart={arrastrable ? () => (ocultar(), alArrastrar()) : undefined}
      onDragEnd={arrastrable ? alSoltar : undefined}
      onPointerEnter={mostrar}
      onPointerLeave={ocultar}
      onPointerDown={ocultar}
      className={`rounded-xl border bg-superficie p-2.5 shadow-sm transition-shadow hover:shadow-md ${arrastrable ? "cursor-grab active:cursor-grabbing" : ""} ${arrastrando ? "opacity-40" : ""} ${aviso ? "border-amber-400/60" : "border-borde"}`}
    >
      <div className="flex items-start gap-1.5">
        <ConVentana boton={<span className="line-clamp-2 text-left text-[13px] font-semibold leading-snug text-tinta hover:text-naranjo">{o.nombre}</span>} titulo={`${o.codigo} · ${o.nombre}`} className="min-w-0 flex-1 text-left">
          {(cerrar) => <FormLead o={o} clientes={clientes} alOk={cerrar} esAdmin={esAdmin} />}
        </ConVentana>
        {aviso && <span title={aviso} aria-label={aviso} className={`mt-0.5 shrink-0 ${vencido ? "text-alerta" : "text-aviso"}`}><IconAlertTriangle size={14} /></span>}
      </div>
      <p className="mt-0.5 truncate text-[11px] text-gris">{cliente}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-bold tabular-nums text-tinta">{clpCorto(o.montoEstimado)}</span>
        <span className="rounded-full bg-tinta/[0.06] px-1.5 py-px font-semibold tabular-nums text-gris">{o.probabilidad}%</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-borde/60 pt-2">
        <div className="min-w-0 flex-1"><SelectorEtapa o={o} alMover={alMover} className="w-full" /></div>
        <button type="button" onClick={() => setMasAbierto((v) => !v)} aria-expanded={masAbierto} aria-label={masAbierto ? "Ver menos" : "Ver más del lead"} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-gris transition hover:bg-tinta/[0.06] md:hidden"><IconChevronDown size={15} className={`transition ${masAbierto ? "rotate-180" : ""}`} /></button>
        {!cerrada(o.etapa) && <Link href={`/leads/cotizaciones/nueva?oportunidad=${o.id}`} title="Crear cotización" aria-label="Crear cotización para este lead" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-naranjo transition hover:bg-naranjo/10"><IconFileText size={15} /></Link>}
      </div>
      {masAbierto && <div className="mt-2 border-t border-borde/60 pt-2 md:hidden"><DetalleLead o={o} hoy={hoy} conLlamar /></div>}
      {flotante && typeof document !== "undefined" && createPortal(
        <div role="tooltip" style={{ position: "fixed", left: flotante.x, top: flotante.y, width: 296 }} className="pointer-events-none z-[60] rounded-xl border border-borde bg-superficie p-3 shadow-[0_18px_40px_-14px_rgba(23,20,17,0.35)]">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gris">{o.codigo} · {cliente}</p>
          <DetalleLead o={o} hoy={hoy} />
        </div>,
        document.body,
      )}
    </article>
  );
}
