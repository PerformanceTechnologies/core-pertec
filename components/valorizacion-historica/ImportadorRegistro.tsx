"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCircleCheck, IconFileSpreadsheet, IconLoader2, IconRestore, IconUpload } from "@tabler/icons-react";
import { leerRespuesta, LIMITE_SUBIDA } from "@/lib/subidas";
import { monto, type Importacion } from "@/lib/valorizacion-historica-modelo";
import { volverACargaAnteriorAction } from "@/app/(protegido)/valorizacion-historica/acciones";

/** Subir el Excel: se suelta o se elige, se lee completo en el servidor y recién ahí reemplaza al anterior. */
export function SubirRegistro() {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<Importacion | null>(null);

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setListo(null);
    if (!/\.xlsx$/i.test(archivo.name)) return setError("Tiene que ser el Excel (.xlsx) del Registro Maestro de Compras.");
    if (archivo.size > LIMITE_SUBIDA) return setError("El archivo pasa el tope de 4 MB.");
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.set("archivo", archivo);
      const r = await leerRespuesta<{ importacion: Importacion }>(await fetch("/api/valorizacion-historica/importar", { method: "POST", body: fd }));
      setListo(r.importacion);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el registro.");
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSobre(false);
          void subir(e.dataTransfer.files[0]);
        }}
        className={`grid cursor-pointer place-items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          sobre ? "border-naranjo bg-naranjo/[0.06]" : "border-borde bg-superficie hover:border-naranjo/50"
        } ${subiendo ? "pointer-events-none opacity-70" : ""}`}
      >
        <input ref={entrada} type="file" accept=".xlsx" className="sr-only" onChange={(e) => void subir(e.target.files?.[0])} />
        {subiendo ? <IconLoader2 size={36} className="animate-spin text-naranjo" /> : <IconFileSpreadsheet size={36} stroke={1.4} className="text-emerald-600" />}
        <p className="text-sm font-semibold text-tinta">{subiendo ? "Leyendo y guardando el registro… (toma unos segundos)" : "Suelta aquí el Excel o haz clic para elegirlo"}</p>
        <p className="text-xs text-gris">Registro_Maestro_Compras_PERTEC.xlsx · hasta 4 MB</p>
        {!subiendo && (
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-naranjo px-4 py-2 text-xs font-bold uppercase tracking-wide text-white">
            <IconUpload size={15} /> Elegir archivo
          </span>
        )}
      </label>
      {error && <p className="rounded-xl border-l-[3px] border-rose-500 bg-rose-500/[0.07] px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {listo && (
        <p className="flex items-center gap-2 rounded-xl border-l-[3px] border-emerald-500 bg-emerald-500/[0.07] px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
          <IconCircleCheck size={17} className="shrink-0" />
          Listo: {listo.lineas.toLocaleString("es-CL")} líneas, {listo.documentos.toLocaleString("es-CL")} documentos y {listo.proveedores} proveedores por {monto(listo.montoTotal)}.
        </p>
      )}
    </div>
  );
}

/** Volver a la carga anterior, por si el Excel nuevo venía malo. */
export function VolverAnterior({ id }: { id: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => {
          if (!confirm("¿Volver a dejar activa esta carga? La actual queda guardada como anterior.")) return;
          iniciar(async () => {
            const r = await volverACargaAnteriorAction(id);
            if (r.ok) router.refresh();
            else setError(r.error);
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-1.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50 disabled:opacity-50"
      >
        {pendiente ? <IconLoader2 size={14} className="animate-spin" /> : <IconRestore size={14} />} Volver a esta
      </button>
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </span>
  );
}
