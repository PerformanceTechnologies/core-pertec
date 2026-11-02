"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCircleCheck,
  IconCircleDashed,
  IconClockExclamation,
  IconFileCheck,
  IconFileUpload,
  IconLoader2,
  IconPlus,
  IconTrash,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { CAMPO, TARJETA } from "@/lib/estilos";
import { leerRespuesta, LIMITE_SUBIDA } from "@/lib/subidas";
import {
  ETIQUETA_SECCION,
  TIPOS_ARCHIVO,
  avanceDocumentos,
  diasHasta,
  type EstadoDocumento,
  type FilaDocumento,
  type SeccionDocumento,
} from "@/lib/flota-modelo";
import {
  agregarDocumentoAction,
  eliminarDocumentoAction,
  fechaDocumentoAction,
  noAplicaDocumentoAction,
  prepararDocumentoAction,
  quitarArchivoDocumentoAction,
  verDocumentoAction,
} from "@/app/(protegido)/flota/acciones";

const ESTILO: Record<EstadoDocumento, { tono: string; Icono: Icon }> = {
  falta: { tono: "bg-tinta/[0.05] text-gris", Icono: IconCircleDashed },
  sin_fecha: { tono: "bg-amber-500/10 text-amber-700 dark:text-amber-300", Icono: IconClockExclamation },
  vigente: { tono: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icono: IconCircleCheck },
  por_vencer: { tono: "bg-amber-500/15 text-amber-700 dark:text-amber-300", Icono: IconClockExclamation },
  vencido: { tono: "bg-rose-500/12 text-rose-700 dark:text-rose-300", Icono: IconAlertTriangle },
  no_aplica: { tono: "bg-tinta/[0.04] text-gris-suave", Icono: IconCircleDashed },
};

type Filtro = "todos" | "al_dia" | "atencion" | "falta";

const FILTROS: { k: Filtro; texto: string; tono: string; cumple: (e: EstadoDocumento) => boolean }[] = [
  { k: "todos", texto: "Todos", tono: "text-tinta", cumple: (e) => e !== "no_aplica" },
  { k: "al_dia", texto: "Al día", tono: "text-emerald-600", cumple: (e) => e === "vigente" || e === "sin_fecha" },
  { k: "atencion", texto: "Vencidos o por vencer", tono: "text-rose-600", cumple: (e) => e === "vencido" || e === "por_vencer" },
  { k: "falta", texto: "Faltan", tono: "text-tinta", cumple: (e) => e === "falta" },
];
const cumple = (f: Filtro, e: EstadoDocumento) => FILTROS.find((x) => x.k === f)!.cumple(e);

const fechaLarga = (f: string) => new Date(f + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

/** La documentación del vehículo, en su pestaña: resumen arriba, sección y filtro, y una fila por documento. */
export default function Documentacion({
  vehiculoId,
  secciones,
  editable,
}: {
  vehiculoId: string;
  secciones: Record<SeccionDocumento, FilaDocumento[]>;
  editable: boolean;
}) {
  const [seccion, setSeccion] = useState<SeccionDocumento>("base");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [verOcultos, setVerOcultos] = useState(false);
  const todas = [...secciones.base, ...secciones.acreditacion];
  const { listos, total } = avanceDocumentos(todas);
  const pct = total ? Math.round((listos / total) * 100) : 0;

  const filas = secciones[seccion];
  const visibles = filas.filter((f) => cumple(filtro, f.estado));
  const ocultos = filas.filter((f) => f.noAplica);

  return (
    <div className="space-y-5">
      {/* ── Resumen: los contadores también filtran ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
        <div className="banda-contraste rounded-2xl p-5">
          <p className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">Documentación al día</p>
          <p className="texto-banda mt-1 font-condensed text-4xl font-bold tabular-nums">{pct}%</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-naranjo"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="texto-banda-65 mt-2 text-xs">{listos} de {total} documentos</p>
        </div>
        {FILTROS.slice(1).map((f) => {
          const n = todas.filter((x) => cumple(f.k, x.estado)).length;
          const on = filtro === f.k;
          return (
            <button
              key={f.k}
              type="button"
              onClick={() => setFiltro(on ? "todos" : f.k)}
              className={`${TARJETA} p-4 text-left transition hover:-translate-y-0.5 hover:border-naranjo/40 ${on ? "border-naranjo ring-2 ring-naranjo/15" : ""}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gris">{f.texto}</p>
              <p className={`mt-1 font-condensed text-3xl font-bold tabular-nums ${n > 0 ? f.tono : "text-gris-suave"}`}>{n}</p>
              <p className="text-[11px] text-gris-suave">{on ? "Filtrando · tocar para quitar" : "Tocar para filtrar"}</p>
            </button>
          );
        })}
      </div>

      {/* ── Sección ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-xl border border-borde bg-superficie p-1">
          {(Object.keys(ETIQUETA_SECCION) as SeccionDocumento[]).map((s) => {
            const a = avanceDocumentos(secciones[s]);
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSeccion(s)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                  seccion === s ? "bg-tinta text-superficie" : "text-gris hover:bg-tinta/[0.05] hover:text-tinta"
                }`}
              >
                {s === "base" ? "Documentos base" : "Acreditación"}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${seccion === s ? "bg-white/15" : "bg-tinta/[0.06]"}`}>
                  {a.listos}/{a.total}
                </span>
              </button>
            );
          })}
        </div>
        {filtro !== "todos" && (
          <button type="button" onClick={() => setFiltro("todos")} className="inline-flex items-center gap-1 rounded-full bg-naranjo/10 px-3 py-1 text-xs font-semibold text-naranjo">
            {FILTROS.find((f) => f.k === filtro)!.texto} <IconX size={13} />
          </button>
        )}
      </div>

      {/* ── Documentos ── */}
      <section className={`${TARJETA} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-borde px-5 py-3">
          <h3 className="text-sm font-bold text-tinta">{ETIQUETA_SECCION[seccion]}</h3>
          <span className="text-xs text-gris">{visibles.length} {visibles.length === 1 ? "documento" : "documentos"}</span>
        </div>
        {visibles.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gris">Ningún documento en este filtro.</p>
        ) : (
          <ul className="divide-y divide-borde">
            {visibles.map((f) => <Fila key={f.clave} vehiculoId={vehiculoId} fila={f} editable={editable} />)}
          </ul>
        )}
        {verOcultos && ocultos.length > 0 && (
          <ul className="divide-y divide-borde border-t border-dashed border-borde bg-tinta/[0.015]">
            {ocultos.map((f) => <Fila key={f.clave} vehiculoId={vehiculoId} fila={f} editable={editable} />)}
          </ul>
        )}
        <Pie vehiculoId={vehiculoId} seccion={seccion} editable={editable} ocultos={ocultos.length} verOcultos={verOcultos} alternar={() => setVerOcultos((v) => !v)} />
      </section>
    </div>
  );
}

function Pie({
  vehiculoId, seccion, editable, ocultos, verOcultos, alternar,
}: {
  vehiculoId: string; seccion: SeccionDocumento; editable: boolean; ocultos: number; verOcultos: boolean; alternar: () => void;
}) {
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function agregar() {
    setError(null);
    iniciar(async () => {
      const r = await agregarDocumentoAction(vehiculoId, seccion, nombre);
      if (!r.ok) return setError(r.error);
      setNombre("");
      setAgregando(false);
      router.refresh();
    });
  }

  if (!editable && ocultos === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-borde bg-tinta/[0.015] px-5 py-3">
      {editable && !agregando && (
        <button type="button" onClick={() => setAgregando(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cian hover:underline">
          <IconPlus size={15} /> Agregar otro documento
        </button>
      )}
      {agregando && (
        <form action={agregar} className="flex flex-1 flex-wrap items-center gap-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Nombre del documento" className={`${CAMPO} min-w-56 flex-1`} />
          <button type="submit" disabled={pendiente} className="min-h-11 rounded-lg bg-azul px-4 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave disabled:opacity-60">
            Agregar
          </button>
          <button type="button" onClick={() => { setAgregando(false); setNombre(""); }} className="grid h-11 w-10 place-items-center text-gris hover:text-tinta" aria-label="Cancelar">
            <IconX size={16} />
          </button>
        </form>
      )}
      {ocultos > 0 && (
        <button type="button" onClick={alternar} className="ml-auto text-xs font-semibold text-gris hover:text-tinta">
          {verOcultos ? "Ocultar los que no aplican" : `Ver ${ocultos} que no ${ocultos === 1 ? "aplica" : "aplican"}`}
        </button>
      )}
      {error && <p className="w-full text-sm text-rose-600">{error}</p>}
    </div>
  );
}

function Fila({ vehiculoId, fila, editable }: { vehiculoId: string; fila: FilaDocumento; editable: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const ref = { vehiculoId, documentoId: fila.documentoId, tipoId: fila.tipoId };
  const e = ESTILO[fila.estado];
  const dias = diasHasta(fila.vence);
  const ocupado = pendiente || subiendo;

  const correr = (f: () => Promise<{ ok: boolean; error?: string }>) =>
    iniciar(async () => {
      setError(null);
      const r = await f();
      if (r.ok) router.refresh();
      else setError(r.error ?? "No se pudo guardar.");
    });

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    if (!Object.hasOwn(TIPOS_ARCHIVO, archivo.type)) return setError(`"${archivo.name}" no se acepta: sube un PDF o una imagen.`);
    if (archivo.size > LIMITE_SUBIDA) return setError(`"${archivo.name}" pasa el tope de 4 MB.`);
    setSubiendo(true);
    try {
      const prep = await prepararDocumentoAction(ref);
      if (!prep.ok || !prep.id) throw new Error(prep.ok ? "No se pudo preparar el documento." : prep.error);
      const fd = new FormData();
      fd.set("documentoId", prep.id);
      fd.set("archivo", archivo);
      await leerRespuesta(await fetch("/api/flota/documento", { method: "POST", body: fd }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function ver() {
    const r = await verDocumentoAction(fila.documentoId!);
    if (r.ok) window.open(r.url, "_blank", "noopener");
    else setError(r.error);
  }

  // La segunda línea: cuándo vence, en palabras.
  const detalle = fila.noAplica
    ? "No se pide para este vehículo"
    : fila.vence && dias !== null
      ? dias < 0
        ? `Venció el ${fechaLarga(fila.vence)} (hace ${-dias} ${-dias === 1 ? "día" : "días"})`
        : dias === 0
          ? "Vence hoy"
          : `Vence el ${fechaLarga(fila.vence)} · en ${dias} ${dias === 1 ? "día" : "días"}`
      : fila.pideFecha
        ? "Sin fecha de vencimiento"
        : "No vence";

  return (
    <li className={`grid items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-tinta/[0.015] md:grid-cols-[minmax(0,1fr)_auto] ${fila.noAplica ? "opacity-55" : ""}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${e.tono}`}>
          <e.Icono size={18} stroke={1.75} />
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold leading-snug ${fila.noAplica ? "text-gris line-through" : "text-tinta"}`}>{fila.nombre}</p>
          <p className={`mt-0.5 text-xs ${fila.estado === "vencido" ? "text-rose-600" : fila.estado === "por_vencer" ? "text-amber-700" : "text-gris"}`}>{detalle}</p>
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-12 md:justify-end md:pl-0">
        {!fila.noAplica && fila.pideFecha && editable && (
          <input
            type="date"
            defaultValue={fila.vence ?? ""}
            disabled={ocupado}
            title="Fecha de vencimiento"
            aria-label={`Vencimiento de ${fila.nombre}`}
            onBlur={(ev) => ev.target.value !== (fila.vence ?? "") && correr(() => fechaDocumentoAction(ref, ev.target.value || null))}
            className="h-9 rounded-lg border border-borde bg-superficie px-2.5 text-xs text-tinta transition hover:border-naranjo/50 focus:border-cian focus:outline-none disabled:opacity-60"
          />
        )}

        {subiendo ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borde px-3 text-xs text-gris">
            <IconLoader2 size={14} className="animate-spin" /> Subiendo…
          </span>
        ) : fila.tieneArchivo ? (
          <span className="inline-flex h-9 max-w-64 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] pl-2.5 pr-1.5">
            <IconFileCheck size={15} className="shrink-0 text-emerald-600" />
            <button type="button" onClick={ver} className="truncate text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300" title={fila.archivoNombre ?? "Ver archivo"}>
              {fila.archivoNombre ?? "Ver archivo"}
            </button>
            {editable && (
              <>
                <button type="button" onClick={() => entrada.current?.click()} className="shrink-0 rounded px-1 text-[11px] font-semibold text-gris hover:text-tinta">
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={() => confirm("¿Quitar el archivo de este documento?") && correr(() => quitarArchivoDocumentoAction(vehiculoId, fila.documentoId!))}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-gris-suave hover:text-rose-500"
                  aria-label="Quitar archivo"
                >
                  <IconX size={13} />
                </button>
              </>
            )}
          </span>
        ) : editable && !fila.noAplica ? (
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={ocupado}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-naranjo/50 px-3 text-xs font-semibold text-naranjo transition hover:bg-naranjo/[0.06] disabled:opacity-60"
          >
            <IconFileUpload size={15} /> Subir archivo
          </button>
        ) : null}
        <input ref={entrada} type="file" accept=".pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(ev) => subir(ev.target.files?.[0])} />

        {editable &&
          (fila.noAplica ? (
            <button type="button" disabled={ocupado} onClick={() => correr(() => noAplicaDocumentoAction(ref, false))} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-gris hover:text-tinta">
              <IconArrowBackUp size={15} /> Volver a pedir
            </button>
          ) : fila.tipoId ? (
            <button type="button" title="No aplica a este vehículo" disabled={ocupado} onClick={() => correr(() => noAplicaDocumentoAction(ref, true))} className="grid h-9 w-9 place-items-center rounded-lg text-gris-suave transition hover:bg-rose-500/10 hover:text-rose-500">
              <IconTrash size={16} />
            </button>
          ) : (
            <button
              type="button"
              title="Eliminar"
              disabled={ocupado}
              onClick={() => confirm(`¿Eliminar «${fila.nombre}»${fila.tieneArchivo ? " y su archivo" : ""}?`) && correr(() => eliminarDocumentoAction(vehiculoId, fila.documentoId!))}
              className="grid h-9 w-9 place-items-center rounded-lg text-gris-suave transition hover:bg-rose-500/10 hover:text-rose-500"
            >
              <IconTrash size={16} />
            </button>
          ))}
      </div>
    </li>
  );
}
