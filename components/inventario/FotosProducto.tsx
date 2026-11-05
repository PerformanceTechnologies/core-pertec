"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCamera, IconChevronLeft, IconChevronRight, IconLoader2, IconTrash } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { leerRespuesta } from "@/lib/subidas";
import { MAX_FOTOS_PRODUCTO, type FotoProducto } from "@/lib/inventario-modelo";
import { quitarFotoProductoAction } from "@/app/(protegido)/inventario/acciones";

/**
 * Las fotos de un producto, discretas: una fila de miniaturas chicas bajo el nombre y un
 * botón gris para sumar más. No compiten con los números de la ficha; al tocar una se abre
 * en grande. Se guardan en SharePoint (ver /api/inventario/fotos).
 */
export default function FotosProducto({ productoId, fotos }: { productoId: string; fotos: FotoProducto[] }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [quitando, iniciarQuitar] = useTransition();
  const quedan = MAX_FOTOS_PRODUCTO - fotos.length;

  async function subir(lista: FileList | null) {
    const archivos = Array.from(lista ?? []).slice(0, quedan);
    if (entrada.current) entrada.current.value = "";
    if (archivos.length === 0) return;
    setError(null);
    const fallas: string[] = [];
    for (const [i, archivo] of archivos.entries()) {
      setSubiendo(archivos.length > 1 ? `Subiendo ${i + 1} de ${archivos.length}…` : "Subiendo…");
      try {
        const datos = new FormData();
        datos.set("productoId", productoId);
        datos.set("archivo", archivo);
        await leerRespuesta(await fetch("/api/inventario/fotos", { method: "POST", body: datos }));
      } catch (e) {
        fallas.push(e instanceof Error ? e.message : `${archivo.name}: no se pudo subir.`);
      }
    }
    setSubiendo(null);
    if (fallas.length) setError(fallas.join(" "));
    router.refresh();
  }

  function quitar(indice: number) {
    if (!confirm("¿Quitar esta foto del producto?")) return;
    iniciarQuitar(async () => {
      const r = await quitarFotoProductoAction(productoId, indice);
      if (!r.ok) return setError(r.error);
      setAbierta(null);
      router.refresh();
    });
  }

  const actual = abierta === null ? null : fotos.find((f) => f.indice === abierta) ?? null;
  const posicion = actual ? fotos.indexOf(actual) : -1;
  const mover = (paso: number) => setAbierta(fotos[(posicion + paso + fotos.length) % fotos.length].indice);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {fotos.map((f) => (
          <button
            key={f.indice}
            type="button"
            onClick={() => setAbierta(f.indice)}
            title={f.nombre}
            className="h-11 w-11 overflow-hidden rounded-lg bg-tinta/[0.04] ring-1 ring-borde transition hover:ring-gris-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- viene del Core firmada, sin optimizador */}
            <img src={f.miniatura} alt={f.nombre} loading="lazy" className="h-full w-full object-cover opacity-90 saturate-[.85] transition hover:opacity-100 hover:saturate-100" />
          </button>
        ))}
        {quedan > 0 && (
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={subiendo !== null}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-dashed border-borde px-3 text-xs font-semibold text-gris transition hover:border-gris-suave hover:text-tinta disabled:cursor-progress"
          >
            {subiendo ? <IconLoader2 size={15} className="animate-spin" /> : <IconCamera size={15} stroke={1.8} />}
            {subiendo ?? (fotos.length ? "Agregar" : "Agregar foto")}
          </button>
        )}
        <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="sr-only" onChange={(e) => subir(e.target.files)} />
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}

      <VentanaModal abierta={actual !== null} alCerrar={() => setAbierta(null)} titulo={actual?.nombre ?? "Foto"} ancho="max-w-3xl" variante="hoja">
        {actual && (
          <div className="space-y-3">
            <div className="relative grid place-items-center overflow-hidden rounded-xl bg-tinta/[0.04]">
              {/* eslint-disable-next-line @next/next/no-img-element -- viene del Core firmada, sin optimizador */}
              <img src={actual.url} alt={actual.nombre} className="max-h-[65vh] w-auto object-contain" />
              {fotos.length > 1 && (
                <>
                  <button type="button" onClick={() => mover(-1)} aria-label="Foto anterior" className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-superficie/85 text-tinta shadow-sm transition hover:bg-superficie">
                    <IconChevronLeft size={18} />
                  </button>
                  <button type="button" onClick={() => mover(1)} aria-label="Foto siguiente" className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-superficie/85 text-tinta shadow-sm transition hover:bg-superficie">
                    <IconChevronRight size={18} />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gris">{posicion + 1} de {fotos.length}</span>
              <button type="button" onClick={() => quitar(actual.indice)} disabled={quitando} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gris transition hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-60">
                <IconTrash size={14} /> {quitando ? "Quitando…" : "Quitar foto"}
              </button>
            </div>
          </div>
        )}
      </VentanaModal>
    </div>
  );
}
