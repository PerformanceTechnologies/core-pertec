"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowBackUp,
  IconFileCheck,
  IconFiles,
  IconLoader2,
  IconPaperclip,
  IconPlus,
  IconTrash,
  IconX,
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

const CHIP: Record<EstadoDocumento, { texto: string; tono: string }> = {
  falta: { texto: "Falta", tono: "bg-borde/70 text-gris" },
  sin_fecha: { texto: "Sin fecha", tono: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  vigente: { texto: "Vigente", tono: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  por_vencer: { texto: "Por vencer", tono: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  vencido: { texto: "Vencido", tono: "bg-rose-500/12 text-rose-700 dark:text-rose-300" },
  no_aplica: { texto: "No aplica", tono: "bg-borde/50 text-gris-suave" },
};

/** La documentación del vehículo, en sus dos secciones, como en el Odoo de PERTEC. */
export default function Documentacion({
  vehiculoId,
  secciones,
  editable,
}: {
  vehiculoId: string;
  secciones: Record<SeccionDocumento, FilaDocumento[]>;
  editable: boolean;
}) {
  const todas = [...secciones.base, ...secciones.acreditacion];
  const { listos, total } = avanceDocumentos(todas);
  const pct = total ? Math.round((listos / total) * 100) : 0;

  return (
    <section className={`${TARJETA} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-4 border-b border-borde px-4 py-3">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gris">
          <IconFiles size={15} /> Documentación
        </h3>
        <div className="ml-auto flex min-w-48 items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-tinta/[0.06]">
            <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-naranjo"}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-semibold tabular-nums text-tinta">{listos}/{total} al día</span>
        </div>
      </div>
      {(Object.keys(secciones) as SeccionDocumento[]).map((s) => (
        <Seccion key={s} vehiculoId={vehiculoId} seccion={s} filas={secciones[s]} editable={editable} />
      ))}
    </section>
  );
}

function Seccion({ vehiculoId, seccion, filas, editable }: { vehiculoId: string; seccion: SeccionDocumento; filas: FilaDocumento[]; editable: boolean }) {
  const [verOcultos, setVerOcultos] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const visibles = filas.filter((f) => !f.noAplica);
  const ocultos = filas.filter((f) => f.noAplica);
  const { listos, total } = avanceDocumentos(filas);

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

  return (
    <div className="border-b border-borde last:border-b-0">
      <div className="flex items-center justify-between bg-tinta/[0.02] px-4 py-2.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-tinta">{ETIQUETA_SECCION[seccion]}</p>
        <span className="text-[11px] tabular-nums text-gris">{listos}/{total}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gris-suave">
              <th className="px-4 py-2">Documento</th>
              <th className="w-44 px-2 py-2">Vence</th>
              <th className="w-28 px-2 py-2">Estado</th>
              <th className="px-2 py-2">Archivo</th>
              <th className="w-10 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {visibles.map((f) => <Fila key={f.clave} vehiculoId={vehiculoId} fila={f} editable={editable} />)}
            {verOcultos && ocultos.map((f) => <Fila key={f.clave} vehiculoId={vehiculoId} fila={f} editable={editable} />)}
          </tbody>
        </table>
      </div>
      {(editable || ocultos.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
          {editable && !agregando && (
            <button type="button" onClick={() => setAgregando(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cian hover:underline">
              <IconPlus size={15} /> Agregar una línea
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
          {ocultos.length > 0 && (
            <button type="button" onClick={() => setVerOcultos((v) => !v)} className="ml-auto text-xs font-semibold text-gris hover:text-tinta">
              {verOcultos ? "Ocultar los que no aplican" : `Ver ${ocultos.length} que no ${ocultos.length === 1 ? "aplica" : "aplican"}`}
            </button>
          )}
          {error && <p className="w-full text-sm text-rose-600">{error}</p>}
        </div>
      )}
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
  const chip = CHIP[fila.estado];
  const dias = diasHasta(fila.vence);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo.");
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

  const ocupado = pendiente || subiendo;

  return (
    <tr className={`align-middle transition hover:bg-tinta/[0.02] ${fila.noAplica ? "opacity-50" : ""}`}>
      <td className="px-4 py-2.5">
        <span className={fila.noAplica ? "text-gris line-through" : "text-tinta"}>{fila.nombre}</span>
        {error && <span className="block text-xs text-rose-600">{error}</span>}
      </td>
      <td className="px-2 py-1.5">
        {fila.noAplica ? (
          <span className="text-xs text-gris-suave">—</span>
        ) : (
          <input
            type="date"
            defaultValue={fila.vence ?? ""}
            disabled={!editable || ocupado}
            onBlur={(e) => e.target.value !== (fila.vence ?? "") && correr(() => fechaDocumentoAction(ref, e.target.value || null))}
            className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm text-tinta transition hover:border-borde focus:border-cian focus:outline-none disabled:opacity-70"
            aria-label={`Vencimiento de ${fila.nombre}`}
          />
        )}
      </td>
      <td className="px-2 py-2.5">
        <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ${chip.tono}`} title={dias !== null && fila.estado === "por_vencer" ? `Vence en ${dias} días` : undefined}>
          {fila.estado === "por_vencer" && dias !== null ? (dias === 0 ? "Vence hoy" : `En ${dias} d`) : chip.texto}
        </span>
      </td>
      <td className="px-2 py-2.5">
        {subiendo ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-gris"><IconLoader2 size={15} className="animate-spin" /> Subiendo…</span>
        ) : fila.tieneArchivo ? (
          <span className="inline-flex max-w-full items-center gap-1.5">
            <IconFileCheck size={16} className="shrink-0 text-emerald-600" />
            <button type="button" onClick={ver} className="truncate text-left text-sm font-semibold text-cian hover:underline" title="Ver archivo">
              {fila.archivoNombre ?? "Ver archivo"}
            </button>
            {editable && (
              <>
                <button type="button" onClick={() => entrada.current?.click()} className="shrink-0 text-xs font-semibold text-gris hover:text-tinta">Reemplazar</button>
                <button
                  type="button"
                  onClick={() => confirm("¿Quitar el archivo de este documento?") && correr(() => quitarArchivoDocumentoAction(vehiculoId, fila.documentoId!))}
                  className="shrink-0 text-gris-suave hover:text-rose-500"
                  aria-label="Quitar archivo"
                >
                  <IconX size={14} />
                </button>
              </>
            )}
          </span>
        ) : editable && !fila.noAplica ? (
          <button type="button" onClick={() => entrada.current?.click()} disabled={ocupado} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cian hover:underline disabled:opacity-60">
            <IconPaperclip size={15} /> Agregar archivo
          </button>
        ) : (
          <span className="text-xs text-gris-suave">—</span>
        )}
        <input ref={entrada} type="file" accept=".pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => subir(e.target.files?.[0])} />
      </td>
      <td className="px-2 py-2.5 text-right">
        {editable &&
          (fila.noAplica ? (
            <button type="button" title="Volver a pedir" disabled={ocupado} onClick={() => correr(() => noAplicaDocumentoAction(ref, false))} className="text-gris-suave hover:text-tinta">
              <IconArrowBackUp size={16} />
            </button>
          ) : fila.tipoId ? (
            <button type="button" title="No aplica a este vehículo" disabled={ocupado} onClick={() => correr(() => noAplicaDocumentoAction(ref, true))} className="text-gris-suave hover:text-rose-500">
              <IconTrash size={16} />
            </button>
          ) : (
            <button
              type="button"
              title="Eliminar"
              disabled={ocupado}
              onClick={() => confirm(`¿Eliminar «${fila.nombre}»${fila.tieneArchivo ? " y su archivo" : ""}?`) && correr(() => eliminarDocumentoAction(vehiculoId, fila.documentoId!))}
              className="text-gris-suave hover:text-rose-500"
            >
              <IconTrash size={16} />
            </button>
          ))}
      </td>
    </tr>
  );
}
