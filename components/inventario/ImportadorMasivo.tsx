"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDownload,
  IconFileSpreadsheet,
  IconRefresh,
  IconUpload,
} from "@tabler/icons-react";
import { TARJETA } from "@/lib/estilos";
import { leerRespuesta } from "@/lib/subidas";
import { COLUMNAS_IMPORTACION, MAX_FILAS_IMPORTACION, type FilaImportacion } from "@/lib/inventario-importacion-modelo";
import { formatearCantidad, formatearMonto } from "@/lib/inventario-modelo";

type Previa = { filas: FilaImportacion[]; faltan: string[]; reconocidas: string[]; ignoradas: string[] };
type Resultado = { creados: number; actualizados: number; ajustes: number; reglas: number; fallidas: { numero: number; nombre: string; error: string }[] };

export default function ImportadorMasivo() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState<"leyendo" | "importando" | null>(null);
  const [soloErrores, setSoloErrores] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  async function enviar(f: File, modo: "previsualizar" | "importar") {
    const fd = new FormData();
    fd.set("archivo", f);
    fd.set("modo", modo);
    return leerRespuesta<{ ok: true; previa?: Previa; resultado?: Resultado }>(
      await fetch("/api/inventario/importar", { method: "POST", body: fd }),
    );
  }

  async function elegir(f: File | undefined) {
    if (!f) return;
    setArchivo(f);
    setPrevia(null);
    setResultado(null);
    setError(null);
    setCargando("leyendo");
    try {
      const r = await enviar(f, "previsualizar");
      setPrevia(r.previa ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setCargando(null);
    }
  }

  async function confirmar() {
    if (!archivo) return;
    setError(null);
    setCargando("importando");
    try {
      const r = await enviar(archivo, "importar");
      setResultado(r.resultado ?? null);
      setPrevia(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar.");
    } finally {
      setCargando(null);
    }
  }

  function reiniciar() {
    setArchivo(null);
    setPrevia(null);
    setResultado(null);
    setError(null);
    if (entrada.current) entrada.current.value = "";
  }

  const validas = previa?.filas.filter((f) => f.errores.length === 0) ?? [];
  const conError = previa?.filas.filter((f) => f.errores.length > 0) ?? [];
  const visibles = soloErrores ? conError : previa?.filas ?? [];

  return (
    <div className="space-y-5">
      {/* Paso 1 y 2 */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className={`${TARJETA} p-5`}>
          <Paso n={1} titulo="Descarga la plantilla" />
          <p className="mt-2 text-sm text-gris">
            Un Excel con las columnas, una fila de ejemplo, listas desplegables con tus bodegas y una hoja de instrucciones.
          </p>
          <a
            href="/api/inventario/plantilla"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-borde px-4 py-2.5 text-sm font-semibold text-tinta transition hover:border-naranjo/50"
          >
            <IconDownload size={17} /> plantilla-inventario.xlsx
          </a>
          <div className="mt-5 border-t border-borde pt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-gris">Columnas</p>
            <ul className="space-y-1.5 text-xs">
              {COLUMNAS_IMPORTACION.map((c) => (
                <li key={c.clave} className="flex gap-2">
                  <span className={`w-32 shrink-0 font-semibold ${c.obligatoria ? "text-naranjo" : "text-tinta"}`}>
                    {c.titulo}
                    {c.obligatoria && " *"}
                  </span>
                  <span className="text-gris">{c.ayuda}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`${TARJETA} p-5`}>
          <Paso n={2} titulo="Sube el archivo lleno" />
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              elegir(e.dataTransfer.files[0]);
            }}
            className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borde px-6 py-10 text-center transition hover:border-naranjo/50 hover:bg-naranjo/[0.03]"
          >
            <IconFileSpreadsheet size={36} stroke={1.5} className="text-naranjo" />
            {archivo ? (
              <span className="text-sm font-semibold text-tinta">{archivo.name}</span>
            ) : (
              <span className="text-sm font-semibold text-tinta">Arrastra aquí tu Excel o CSV, o haz clic para elegirlo</span>
            )}
            <span className="text-xs text-gris">.xlsx o .csv · hasta 4 MB y {MAX_FILAS_IMPORTACION} filas</span>
            <input
              ref={entrada}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              onChange={(e) => elegir(e.target.files?.[0])}
            />
          </label>
          {cargando === "leyendo" && <p className="mt-3 text-sm text-gris">Leyendo y validando…</p>}
          {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <p className="mt-4 text-xs leading-relaxed text-gris">
            Nada se guarda todavía: primero verás una vista previa con lo que se va a crear, actualizar y los errores de cada fila.
          </p>
        </section>
      </div>

      {/* Paso 3: vista previa */}
      {previa && (
        <section className={`${TARJETA} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-5 py-4">
            <Paso n={3} titulo="Revisa y confirma" />
            {previa.faltan.length === 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Cifra valor={validas.filter((f) => f.accion === "crear").length} etiqueta="nuevos" tono="verde" />
                <Cifra valor={validas.filter((f) => f.accion === "actualizar").length} etiqueta="a actualizar" tono="azul" />
                <Cifra valor={conError.length} etiqueta="con error" tono={conError.length ? "rojo" : "gris"} />
              </div>
            )}
          </div>

          {previa.faltan.length > 0 ? (
            <p className="px-5 py-6 text-sm text-rose-600">
              No encontré la columna obligatoria {previa.faltan.map((f) => `«${f}»`).join(", ")} en el encabezado. Usa la plantilla o revisa que la primera fila tenga los títulos.
            </p>
          ) : previa.filas.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gris">El archivo no tiene filas con datos.</p>
          ) : (
            <>
              {previa.ignoradas.length > 0 && (
                <p className="border-b border-borde bg-amber-500/5 px-5 py-2 text-xs text-amber-700">
                  Columnas que no reconocí y se ignoran: {previa.ignoradas.join(", ")}.
                </p>
              )}
              <div className="flex items-center justify-between px-5 py-2.5 text-xs">
                <label className="inline-flex items-center gap-2 text-gris">
                  <input type="checkbox" checked={soloErrores} onChange={(e) => setSoloErrores(e.target.checked)} /> Ver solo filas con error
                </label>
                <span className="text-gris">{previa.filas.length} filas</span>
              </div>
              <div className="max-h-[28rem] overflow-auto border-t border-borde">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-superficie">
                    <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                      <th className="px-4 py-2.5">Fila</th>
                      <th className="px-4 py-2.5">Acción</th>
                      <th className="px-4 py-2.5">Producto</th>
                      <th className="px-4 py-2.5">Categoría</th>
                      <th className="px-4 py-2.5">Bodega</th>
                      <th className="px-4 py-2.5 text-right">Cantidad</th>
                      <th className="px-4 py-2.5 text-right">Costo</th>
                      <th className="px-4 py-2.5">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {visibles.map((f) => (
                      <tr key={f.numero} className={f.errores.length ? "bg-rose-500/[0.04]" : ""}>
                        <td className="px-4 py-2 tabular-nums text-gris">{f.numero}</td>
                        <td className="px-4 py-2">
                          {f.errores.length ? (
                            <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-bold uppercase text-rose-600">Error</span>
                          ) : f.accion === "crear" ? (
                            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold uppercase text-emerald-700">Nuevo</span>
                          ) : (
                            <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-bold uppercase text-sky-700">Actualiza</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span className="font-semibold text-tinta">{f.nombre || "—"}</span>
                          {f.sku && <span className="ml-1.5 font-mono text-[11px] text-gris">{f.sku}</span>}
                        </td>
                        <td className="px-4 py-2 text-gris">{f.categoria ?? "—"}</td>
                        <td className="px-4 py-2 text-gris">
                          {f.bodega ?? "—"}
                          {f.lote && <span className="ml-1 text-[11px]">· {f.lote}</span>}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-tinta">{f.cantidad !== null ? formatearCantidad(f.cantidad) : "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gris">{f.costo !== null ? formatearMonto(f.costo) : "—"}</td>
                        <td className="px-4 py-2 text-xs text-rose-600">{f.errores.join(" ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde px-5 py-4">
                <p className="text-xs text-gris">
                  {conError.length > 0
                    ? `Las ${conError.length} filas con error no se importan. Puedes corregirlas en el Excel y volver a subirlo.`
                    : "Todo listo. Las cantidades entran como ajustes de inventario, con su documento."}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={reiniciar} className="rounded-lg px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris hover:text-tinta">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmar}
                    disabled={validas.length === 0 || cargando !== null}
                    className="inline-flex items-center gap-2 rounded-lg bg-naranjo px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-naranjo-suave disabled:opacity-50"
                  >
                    <IconUpload size={16} />
                    {cargando === "importando" ? "Importando…" : `Importar ${validas.length} ${validas.length === 1 ? "fila" : "filas"}`}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* Resultado */}
      {resultado && (
        <section className={`${TARJETA} p-5`}>
          <div className="flex items-center gap-2">
            <IconCircleCheck size={22} className="text-emerald-600" />
            <h2 className="text-base font-bold text-tinta">Carga terminada</h2>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Cifra valor={resultado.creados} etiqueta="productos creados" tono="verde" />
            <Cifra valor={resultado.actualizados} etiqueta="actualizados" tono="azul" />
            <Cifra valor={resultado.ajustes} etiqueta="ajustes de stock" tono="gris" />
            <Cifra valor={resultado.reglas} etiqueta="mín/máx guardados" tono="gris" />
          </div>
          {resultado.fallidas.length > 0 && (
            <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
              <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-rose-600">
                <IconAlertTriangle size={16} /> {resultado.fallidas.length} filas no se importaron
              </p>
              <ul className="max-h-60 space-y-1 overflow-y-auto text-xs">
                {resultado.fallidas.map((f) => (
                  <li key={f.numero}>
                    <span className="font-semibold text-tinta">Fila {f.numero} · {f.nombre}:</span> <span className="text-gris">{f.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/inventario/productos" className="rounded-lg bg-azul px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-azul-suave">
              Ver productos
            </Link>
            <button type="button" onClick={reiniciar} className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-tinta hover:border-naranjo/50">
              <IconRefresh size={15} /> Otra carga
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Paso({ n, titulo }: { n: number; titulo: string }) {
  return (
    <h2 className="flex items-center gap-2.5 text-sm font-bold text-tinta">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-naranjo text-xs font-bold text-white">{n}</span>
      {titulo}
    </h2>
  );
}

function Cifra({ valor, etiqueta, tono }: { valor: number; etiqueta: string; tono: "verde" | "azul" | "rojo" | "gris" }) {
  const color = { verde: "bg-emerald-500/10 text-emerald-700", azul: "bg-sky-500/10 text-sky-700", rojo: "bg-rose-500/10 text-rose-600", gris: "bg-tinta/[0.05] text-tinta" }[tono];
  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-lg px-3 py-1.5 text-xs ${color}`}>
      <strong className="text-base tabular-nums">{valor}</strong> {etiqueta}
    </span>
  );
}
