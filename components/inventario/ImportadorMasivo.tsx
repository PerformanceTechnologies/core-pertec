"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconCircleCheck,
  IconCloudUpload,
  IconFileCheck,
  IconFlask,
  IconLoader2,
  IconShieldCheck,
  IconDownload,
  IconFileSpreadsheet,
  IconRefresh,
  IconUpload,
} from "@tabler/icons-react";
import { TARJETA } from "@/lib/estilos";
import { leerRespuesta } from "@/lib/subidas";
import {
  COLUMNAS_IMPORTACION,
  MAX_FILAS_IMPORTACION,
  revisarMapeo,
  type ClaveColumna,
  type FilaImportacion,
} from "@/lib/inventario-importacion-modelo";
import { CAMPO } from "@/lib/estilos";
import { formatearCantidad, formatearMonto } from "@/lib/inventario-modelo";

type Columnas = { encabezados: string[]; ejemplos: string[][]; sugerido: (ClaveColumna | null)[]; totalFilas: number };
type Previa = { filas: FilaImportacion[]; faltan: string[]; reconocidas: string[]; ignoradas: string[] };
type Resultado = { creados: number; actualizados: number; ajustes: number; reglas: number; fallidas: { numero: number; nombre: string; error: string }[] };

export default function ImportadorMasivo() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [columnas, setColumnas] = useState<Columnas | null>(null);
  const [mapeo, setMapeo] = useState<(ClaveColumna | null)[]>([]);
  const [crearFaltantes, setCrearFaltantes] = useState(true);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState<"leyendo" | "probando" | "importando" | null>(null);
  const [soloErrores, setSoloErrores] = useState(false);
  const [sobre, setSobre] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  async function enviar(f: File, modo: "columnas" | "previsualizar" | "importar") {
    const fd = new FormData();
    fd.set("archivo", f);
    fd.set("modo", modo);
    if (modo !== "columnas") {
      fd.set("mapeo", JSON.stringify(mapeo));
      fd.set("crearFaltantes", crearFaltantes ? "si" : "no");
    }
    return leerRespuesta<{ ok: true; columnas?: Columnas; previa?: Previa; resultado?: Resultado }>(
      await fetch("/api/inventario/importar", { method: "POST", body: fd }),
    );
  }

  async function elegir(f: File | undefined) {
    if (!f) return;
    setArchivo(f);
    setColumnas(null);
    setPrevia(null);
    setResultado(null);
    setError(null);
    setCargando("leyendo");
    try {
      // Como Odoo: primero las columnas del archivo y a qué campo va cada una.
      const r = await enviar(f, "columnas");
      setColumnas(r.columnas ?? null);
      setMapeo(r.columnas?.sugerido ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setCargando(null);
    }
  }

  async function probar() {
    if (!archivo) return;
    setError(null);
    setCargando("probando");
    try {
      const r = await enviar(archivo, "previsualizar");
      setPrevia(r.previa ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo probar la importación.");
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
      setColumnas(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar.");
    } finally {
      setCargando(null);
    }
  }

  function reiniciar() {
    setArchivo(null);
    setColumnas(null);
    setMapeo([]);
    setPrevia(null);
    setResultado(null);
    setError(null);
    if (entrada.current) entrada.current.value = "";
  }

  const problemasMapeo = columnas ? revisarMapeo(mapeo) : [];
  const elegir1 = (i: number, valor: string) => {
    setMapeo((m) => m.map((c, j) => (j === i ? ((valor || null) as ClaveColumna | null) : c)));
    setPrevia(null); // el mapeo cambió: la prueba anterior ya no vale
  };

  const validas = previa?.filas.filter((f) => f.errores.length === 0) ?? [];
  const conError = previa?.filas.filter((f) => f.errores.length > 0) ?? [];
  const visibles = soloErrores ? conError : previa?.filas ?? [];

  const pasoActual = resultado ? 4 : previa ? 4 : columnas ? 3 : archivo ? 2 : 1;
  const compacto = pasoActual >= 3;

  // Cada paso reemplaza al anterior en vez de apilarse: al cambiar, se vuelve arriba.
  const vista = resultado ? "resultado" : previa ? "prueba" : columnas ? "columnas" : "inicio";
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [vista]);

  /** Volver a un paso anterior desde la banda. */
  function irAPaso(n: number) {
    if (cargando) return;
    if (n <= 2 && (columnas || resultado)) {
      if (!resultado && !confirm("¿Elegir otro archivo? Se pierde el mapeo de columnas.")) return;
      reiniciar();
    } else if (n === 3 && previa) {
      setPrevia(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Banda con los pasos ── */}
      <header className={`banda-contraste overflow-hidden rounded-2xl px-6 sm:px-8 ${compacto ? "py-4" : "py-7"}`}>
        {/* Pasado el archivo, la banda se achica a solo los pasos: lo que importa está abajo. */}
        {!compacto && (
          <>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> Carga masiva
            </span>
            <h2 className="texto-banda mt-3 font-condensed text-3xl font-bold uppercase leading-tight tracking-tight sm:text-4xl">
              Sube tu inventario de una vez
            </h2>
            <p className="texto-banda-65 mt-2 max-w-2xl text-sm">
              Productos, bodegas, cantidades, lotes y mínimos desde un Excel o CSV. Igual que en Odoo: eliges a qué campo va cada
              columna, lo pruebas y recién ahí se guarda.
            </p>
          </>
        )}
        <ol className={`grid gap-2 sm:grid-cols-4 ${compacto ? "" : "mt-6"}`}>
          {[
            { n: 1, t: "Plantilla", d: "Opcional" },
            { n: 2, t: "Archivo", d: ".xlsx o .csv" },
            { n: 3, t: "Columnas", d: "Archivo → Core" },
            { n: 4, t: "Probar e importar", d: "Revisa y confirma" },
          ].map((p) => {
            const hecho = pasoActual > p.n || (p.n === 4 && Boolean(resultado));
            const actual = pasoActual === p.n && !resultado;
            const volver = hecho && (p.n <= 2 || (p.n === 3 && Boolean(previa)));
            return (
              <li
                key={p.n}
                onClick={volver ? () => irAPaso(p.n) : undefined}
                title={volver ? "Volver a este paso" : undefined}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                  actual ? "border-naranjo bg-naranjo/15" : "borde-banda"
                } ${volver ? "cursor-pointer hover:border-naranjo/60" : ""}`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    hecho ? "bg-emerald-500 text-white" : actual ? "bg-naranjo text-white" : "texto-banda-45 border borde-banda"
                  }`}
                >
                  {hecho ? <IconCheck size={15} /> : p.n}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-bold ${actual || hecho ? "texto-banda" : "texto-banda-65"}`}>{p.t}</span>
                  <span className="texto-banda-45 block text-[11px]">{p.d}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </header>

      {/* Ya elegido el archivo: una barra con él, en vez de los pasos 1 y 2 completos. */}
      {columnas && !resultado && archivo && (
        <div className={`${TARJETA} flex flex-wrap items-center gap-3 px-4 py-3`}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white">
            <IconFileSpreadsheet size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-tinta">{archivo.name}</p>
            <p className="text-xs text-gris">
              {columnas.totalFilas} {columnas.totalFilas === 1 ? "fila" : "filas"} · {columnas.encabezados.length} columnas ·{" "}
              {mapeo.filter(Boolean).length} se importan
            </p>
          </div>
          <button
            type="button"
            onClick={() => irAPaso(2)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-xs font-semibold text-tinta transition hover:border-naranjo/50"
          >
            <IconRefresh size={14} /> Cambiar archivo
          </button>
        </div>
      )}

      {/* ── Paso 1 y 2 ── */}
      {!columnas && !resultado && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <section className={`${TARJETA} flex flex-col p-5`}>
            <Paso n={1} titulo="Descarga la plantilla" />
            <p className="mt-2 text-sm text-gris">
              Trae las columnas con su explicación, listas desplegables con <strong className="text-tinta">tus bodegas</strong> y una hoja de
              instrucciones. Si ya tienes tu propio Excel, sáltate este paso.
            </p>
            <a
              href="/api/inventario/plantilla"
              className="group mt-4 flex items-center gap-3 rounded-xl border border-borde bg-tinta/[0.02] p-3 transition hover:border-naranjo/50 hover:bg-naranjo/[0.04]"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
                <IconFileSpreadsheet size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-tinta">plantilla-inventario.xlsx</span>
                <span className="block text-[11px] text-gris">{COLUMNAS_IMPORTACION.length} columnas · {COLUMNAS_IMPORTACION.filter((c) => c.obligatoria).length} obligatorias (*)</span>
              </span>
              <IconDownload size={18} className="text-gris transition group-hover:translate-y-0.5 group-hover:text-naranjo" />
            </a>

            <details className="group mt-4 rounded-xl border border-borde">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-gris">
                Qué va en cada columna
                <IconChevronDown size={15} className="transition group-open:rotate-180" />
              </summary>
              <ul className="space-y-2 border-t border-borde px-3 py-3 text-xs">
                {COLUMNAS_IMPORTACION.map((c) => (
                  <li key={c.clave} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2">
                    <span className={`font-semibold ${c.obligatoria ? "text-naranjo" : "text-tinta"}`}>
                      {c.titulo}
                      {c.obligatoria && " *"}
                    </span>
                    <span className="text-gris">{c.ayuda}</span>
                  </li>
                ))}
              </ul>
            </details>
          </section>

          <section className={`${TARJETA} flex flex-col p-5`}>
            <Paso n={2} titulo="Sube tu archivo" />
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(true);
              }}
              onDragLeave={() => setSobre(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSobre(false);
                elegir(e.dataTransfer.files[0]);
              }}
              className={`mt-4 flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
                sobre ? "scale-[1.01] border-naranjo bg-naranjo/[0.06]" : "border-borde hover:border-naranjo/50 hover:bg-naranjo/[0.03]"
              }`}
            >
              <span className={`grid h-16 w-16 place-items-center rounded-2xl transition ${archivo ? "bg-emerald-500/10 text-emerald-600" : "bg-naranjo/10 text-naranjo"}`}>
                {cargando === "leyendo" ? (
                  <IconLoader2 size={30} className="animate-spin" />
                ) : archivo ? (
                  <IconFileCheck size={30} stroke={1.5} />
                ) : (
                  <IconCloudUpload size={30} stroke={1.5} />
                )}
              </span>
              {archivo ? (
                <span>
                  <span className="block text-sm font-bold text-tinta">{archivo.name}</span>
                  <span className="block text-xs text-gris">
                    {(archivo.size / 1024).toLocaleString("es-CL", { maximumFractionDigits: 0 })} KB · haz clic para cambiarlo
                  </span>
                </span>
              ) : (
                <span>
                  <span className="block text-base font-bold text-tinta">Arrastra tu Excel aquí</span>
                  <span className="block text-sm text-gris">o haz clic para elegirlo</span>
                </span>
              )}
              <span className="flex flex-wrap justify-center gap-1.5">
                {[".xlsx", ".csv", "hasta 4 MB", `${MAX_FILAS_IMPORTACION} filas`].map((t) => (
                  <span key={t} className="rounded-full bg-tinta/[0.05] px-2.5 py-0.5 text-[11px] font-semibold text-gris">{t}</span>
                ))}
              </span>
              <input
                ref={entrada}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="sr-only"
                onChange={(e) => elegir(e.target.files?.[0])}
              />
            </label>
            {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-gris">
              <IconShieldCheck size={14} className="text-emerald-600" /> Nada se guarda hasta que confirmes la importación.
            </p>
          </section>
        </div>
      )}

      {/* Paso 3: columnas → campos, como la pantalla de importación de Odoo */}
      {columnas && !previa && !resultado && (
        <section className={`${TARJETA} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-5 py-4">
            <Paso n={3} titulo="Elige a qué campo va cada columna" />
            <span className="text-xs text-gris">
              {archivo?.name} · {columnas.totalFilas} {columnas.totalFilas === 1 ? "fila" : "filas"}
            </span>
          </div>

          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                    <th className="px-5 py-2.5">Columna del archivo</th>
                    <th className="w-8"></th>
                    <th className="px-5 py-2.5">Campo del Core</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {columnas.encabezados.map((h, i) => {
                    const elegido = mapeo[i];
                    const repetido = elegido && mapeo.filter((c) => c === elegido).length > 1;
                    return (
                      <tr key={i} className={elegido ? "" : "opacity-60"}>
                        <td className="px-5 py-3 align-top">
                          <p className="font-semibold text-tinta">{h}</p>
                          <p className="mt-0.5 truncate text-xs text-gris" title={columnas.ejemplos[i]?.join(" · ")}>
                            {columnas.ejemplos[i]?.length ? columnas.ejemplos[i].join(" · ") : "sin datos"}
                          </p>
                        </td>
                        <td className="align-middle text-gris-suave">
                          <IconArrowRight size={16} />
                        </td>
                        <td className="px-5 py-3">
                          <select
                            value={elegido ?? ""}
                            onChange={(e) => elegir1(i, e.target.value)}
                            className={`${CAMPO} ${repetido ? "border-rose-400" : ""}`}
                            aria-label={`Campo para la columna ${h}`}
                          >
                            <option value="">— No importar —</option>
                            {COLUMNAS_IMPORTACION.map((c) => (
                              <option key={c.clave} value={c.clave}>
                                {c.titulo}
                                {c.obligatoria ? " *" : ""}
                              </option>
                            ))}
                          </select>
                          {elegido && (
                            <p className="mt-1 text-[11px] text-gris">{COLUMNAS_IMPORTACION.find((c) => c.clave === elegido)?.ayuda}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <aside className="space-y-4 border-t border-borde bg-tinta/[0.02] p-5 lg:border-l lg:border-t-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-gris">Opciones</p>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={crearFaltantes} onChange={(e) => { setCrearFaltantes(e.target.checked); setPrevia(null); }} className="mt-1" />
                <span>
                  <span className="font-semibold text-tinta">Crear categorías y unidades que no existan</span>
                  <span className="block text-xs text-gris">Si lo desactivas, una categoría o unidad desconocida deja la fila con error.</span>
                </span>
              </label>
              <div className="rounded-lg border border-borde bg-superficie p-3 text-xs leading-relaxed text-gris">
                Productos: se busca por <strong className="text-tinta">SKU</strong> y, si no hay, por <strong className="text-tinta">nombre</strong>. Los que existen se
                actualizan; el resto se crea. Bodegas, categorías y unidades se buscan por nombre (o código/abreviación).
              </div>
              {problemasMapeo.length > 0 && (
                <ul className="space-y-1 text-xs text-rose-600">
                  {problemasMapeo.map((p) => <li key={p}>• {p}</li>)}
                </ul>
              )}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={probar}
                  disabled={problemasMapeo.length > 0 || cargando !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-borde bg-superficie px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 disabled:opacity-50"
                >
                  <IconFlask size={16} /> {cargando === "probando" ? "Probando…" : "Probar"}
                </button>
                <button
                  type="button"
                  onClick={() => confirm(`¿Importar ${columnas.totalFilas} filas sin probar antes? Las filas con error se saltan.`) && confirmar()}
                  disabled={problemasMapeo.length > 0 || cargando !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-naranjo px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-naranjo-suave disabled:opacity-50"
                >
                  <IconUpload size={16} /> {cargando === "importando" ? "Importando…" : "Importar"}
                </button>
                <button type="button" onClick={reiniciar} className="py-1 text-xs font-semibold text-gris hover:text-tinta">
                  Cancelar
                </button>
              </div>
            </aside>
          </div>
        </section>
      )}

      {/* Paso 4: resultado de la prueba */}
      {previa && (
        <section className={`${TARJETA} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-5 py-4">
            <Paso n={4} titulo="Resultado de la prueba" />
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
                        <td className="px-4 py-2 text-xs">
                          <span className="text-rose-600">{f.errores.join(" ")}</span>
                          {f.errores.length === 0 && f.nuevas.length > 0 && <span className="text-emerald-700">Se crea: {f.nuevas.join(", ")}</span>}
                        </td>
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
                  <button type="button" onClick={() => setPrevia(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-tinta hover:border-naranjo/50">
                    <IconArrowLeft size={15} /> Volver a columnas
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
        <section className={`${TARJETA} p-6`}>
          <div className="flex items-center gap-4">
            <span className={`grid h-14 w-14 place-items-center rounded-2xl ${resultado.fallidas.length ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>
              {resultado.fallidas.length ? <IconAlertTriangle size={28} /> : <IconCircleCheck size={28} />}
            </span>
            <div>
              <h2 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">
                {resultado.fallidas.length ? "Carga terminada con observaciones" : "¡Carga terminada!"}
              </h2>
              <p className="text-sm text-gris">{archivo?.name}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
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
            <Link href="/inventario/productos" className="rounded-lg bg-naranjo px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-naranjo-suave">
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
  // El número va en el mismo naranjo que el paso activo de la banda.
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
