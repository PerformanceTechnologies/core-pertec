"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArrowDown, IconArrowUp, IconPhoto, IconPlus, IconStarFilled, IconTrash, IconX } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { BOTON_PRIMARIO, CAMPO, TARJETA } from "@/lib/estilos";
import {
  equipoVacio,
  CATEGORIAS_EQUIPO,
  MAX_DESCRIPCION_CORTA,
  TIPOS_EQUIPO,
  type CategoriaEquipo,
  type Equipo,
} from "@/lib/pagina-web-modelo";
import { eliminarEquipoAction, guardarEquipoAction } from "@/app/(protegido)/pagina-web/acciones";
import { useSubidas } from "./subidas";

type Filtro = CategoriaEquipo | "todos";
type Borrador = Omit<Equipo, "id">;

/** El catálogo de equipos (arriendo) y servicios de pertec.cl. */
export default function Catalogo({ equipos }: { equipos: Equipo[] }) {
  const [filtro, setFiltro] = useState<Filtro>("producto");
  const [editando, setEditando] = useState<{ id: string | null; datos: Borrador } | null>(null);

  const cuenta = (c: CategoriaEquipo) => equipos.filter((e) => e.categoria === c).length;
  const visibles = filtro === "todos" ? equipos : equipos.filter((e) => e.categoria === filtro);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["producto", `Productos (${cuenta("producto")})`],
              ["servicio", `Servicios (${cuenta("servicio")})`],
              ["todos", `Todos (${equipos.length})`],
            ] as [Filtro, string][]
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                filtro === valor ? "border-azul bg-azul/10 text-azul" : "border-borde text-gris hover:text-tinta"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${BOTON_PRIMARIO} inline-flex items-center gap-1.5`}
          onClick={() => setEditando({ id: null, datos: equipoVacio(filtro === "servicio" ? "servicio" : "producto") })}
        >
          <IconPlus size={15} stroke={2.25} aria-hidden />
          {filtro === "servicio" ? "Nuevo servicio" : "Nuevo producto"}
        </button>
      </div>

      {visibles.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center text-sm text-gris`}>No hay nada en esta categoría todavía.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEditando({ id: e.id, datos: { ...e } })}
              className={`${TARJETA} group overflow-hidden text-left transition hover:border-azul/40`}
            >
              <div className="relative aspect-[16/9] bg-crema">
                {e.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen del storage del sitio
                  <img src={e.imagen_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="grid h-full place-items-center text-gris-suave">
                    <IconPhoto size={28} stroke={1.5} aria-hidden />
                  </span>
                )}
                <div className="absolute left-2 top-2 flex gap-1">
                  {e.destacado && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-naranjo px-2 py-0.5 text-[10px] font-bold text-white">
                      <IconStarFilled size={10} aria-hidden /> Destacado
                    </span>
                  )}
                  {!e.disponible && (
                    <span className="rounded-full bg-tinta/80 px-2 py-0.5 text-[10px] font-bold text-white">No visible</span>
                  )}
                </div>
              </div>
              <div className="p-3.5">
                <p className="font-semibold text-tinta group-hover:text-azul">{e.nombre}</p>
                {e.descripcion_corta && <p className="mt-0.5 line-clamp-2 text-xs text-gris">{e.descripcion_corta}</p>}
                <p className="mt-2 text-[11px] text-gris">
                  {e.categoria === "servicio" ? "Servicio" : "Producto"}
                  {e.tipo && ` · ${e.tipo}`}
                  {e.ancho_correa_max && ` · ${e.ancho_correa_max}`}
                  {` · orden ${e.orden}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {editando && (
        <FormularioEquipo
          key={editando.id ?? "nuevo"}
          id={editando.id}
          inicial={editando.datos}
          alCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function FormularioEquipo({ id, inicial, alCerrar }: { id: string | null; inicial: Borrador; alCerrar: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<Borrador>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const subidas = useSubidas("equipos");
  const cambiado = useMemo(() => JSON.stringify(f) !== JSON.stringify(inicial), [f, inicial]);

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setF((x) => ({ ...x, [k]: v }));

  const cerrar = () => {
    if (cambiado && !confirm("Hay cambios sin guardar. ¿Cerrar igual?")) return;
    subidas.descartar();
    alCerrar();
  };

  const guardar = () => {
    setError(null);
    iniciar(async () => {
      const r = await guardarEquipoAction(id, f);
      if (!r.ok) return setError(r.error);
      subidas.confirmar([f.imagen_url, ...f.imagenes.map((i) => i.url)]);
      alCerrar();
      router.refresh();
    });
  };

  const eliminar = () => {
    if (!id || !confirm(`¿Eliminar "${inicial.nombre}" del sitio? Se borran también sus imágenes.`)) return;
    iniciar(async () => {
      const r = await eliminarEquipoAction(id);
      if (!r.ok) return setError(r.error);
      subidas.descartar();
      alCerrar();
      router.refresh();
    });
  };

  const mover = <T,>(arr: T[], i: number, d: -1 | 1): T[] => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return arr;
    const copia = [...arr];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  };

  const esProducto = f.categoria === "producto";

  return (
    <VentanaModal
      abierta
      alCerrar={cerrar}
      titulo={id ? `Editar ${esProducto ? "producto" : "servicio"}` : `Nuevo ${esProducto ? "producto" : "servicio"}`}
      descripcion="Los cambios se ven en pertec.cl apenas se guardan."
      ancho="max-w-3xl"
    >
      <div className="space-y-5 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Categoría">
            <select className={CAMPO} value={f.categoria} onChange={(e) => set("categoria", e.target.value as CategoriaEquipo)}>
              {CATEGORIAS_EQUIPO.map((c) => (
                <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Tipo">
            <select className={CAMPO} value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
              <option value="">Sin tipo</option>
              {/* Un tipo guardado que no está en la lista (los sembrados en el sitio) se conserva. */}
              {f.tipo && !(TIPOS_EQUIPO as readonly string[]).includes(f.tipo) && <option value={f.tipo}>{f.tipo}</option>}
              {TIPOS_EQUIPO.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Nombre *" ancho>
            <input className={CAMPO} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} required />
          </Campo>
          {esProducto && (
            <Campo etiqueta="Ancho de correa máximo">
              <input className={CAMPO} value={f.ancho_correa_max} onChange={(e) => set("ancho_correa_max", e.target.value)} placeholder='Hasta 72"' />
            </Campo>
          )}
          <Campo etiqueta="Orden" ayuda="Menor aparece primero.">
            <input className={CAMPO} type="number" value={f.orden} onChange={(e) => set("orden", Number(e.target.value))} />
          </Campo>
          <Campo etiqueta={`Descripción corta (${f.descripcion_corta.length}/${MAX_DESCRIPCION_CORTA})`} ancho>
            <input className={CAMPO} maxLength={MAX_DESCRIPCION_CORTA} value={f.descripcion_corta} onChange={(e) => set("descripcion_corta", e.target.value)} />
          </Campo>
          <Campo etiqueta="Descripción larga" ancho>
            <textarea className={`${CAMPO} min-h-28`} rows={4} value={f.descripcion_larga} onChange={(e) => set("descripcion_larga", e.target.value)} />
          </Campo>
        </div>

        <div className="flex flex-wrap gap-5">
          <Casilla etiqueta="Destacado en la home" valor={f.destacado} alCambiar={(v) => set("destacado", v)} />
          <Casilla etiqueta="Visible en el sitio" valor={f.disponible} alCambiar={(v) => set("disponible", v)} />
        </div>

        <Seccion titulo="Imagen principal">
          {f.imagen_url ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen del storage del sitio */}
              <img src={f.imagen_url} alt="" className="h-28 w-44 rounded-lg border border-borde object-cover" />
              <button type="button" className="text-xs font-semibold text-red-700 hover:underline" onClick={() => set("imagen_url", "")}>
                Quitar imagen
              </button>
            </div>
          ) : (
            <ElegirImagenes
              multiple={false}
              disabled={subidas.subiendo}
              alElegir={async (archivos) => {
                const [url] = await subidas.subir(archivos);
                if (url) set("imagen_url", url);
              }}
            />
          )}
        </Seccion>

        <Seccion titulo={`Galería (${f.imagenes.length})`}>
          {f.imagenes.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {f.imagenes.map((img, i) => (
                <div key={img.url} className="relative overflow-hidden rounded-lg border border-borde">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagen del storage del sitio */}
                  <img src={img.url} alt="" className="aspect-[4/3] w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-tinta/60 p-1">
                    <span className="flex gap-0.5">
                      <BotonIcono titulo="Antes" onClick={() => set("imagenes", mover(f.imagenes, i, -1))}><IconArrowUp size={14} /></BotonIcono>
                      <BotonIcono titulo="Después" onClick={() => set("imagenes", mover(f.imagenes, i, 1))}><IconArrowDown size={14} /></BotonIcono>
                    </span>
                    <BotonIcono titulo="Quitar" onClick={() => set("imagenes", f.imagenes.filter((_, k) => k !== i))}><IconX size={14} /></BotonIcono>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ElegirImagenes
            multiple
            disabled={subidas.subiendo}
            alElegir={async (archivos) => {
              const urls = await subidas.subir(archivos);
              if (urls.length) setF((x) => ({ ...x, imagenes: [...x.imagenes, ...urls.map((url) => ({ url }))] }));
            }}
          />
        </Seccion>

        <Seccion titulo="Descripciones adicionales" ayuda="Bloques con título que aparecen en la ficha del equipo.">
          <div className="space-y-2">
            {f.descripciones_extra.map((d, i) => (
              <div key={i} className="rounded-lg border border-borde p-2.5">
                <div className="flex gap-2">
                  <input className={CAMPO} placeholder="Título" value={d.titulo} onChange={(e) => set("descripciones_extra", f.descripciones_extra.map((x, k) => (k === i ? { ...x, titulo: e.target.value } : x)))} />
                  <BotonIcono titulo="Subir" claro onClick={() => set("descripciones_extra", mover(f.descripciones_extra, i, -1))}><IconArrowUp size={16} /></BotonIcono>
                  <BotonIcono titulo="Bajar" claro onClick={() => set("descripciones_extra", mover(f.descripciones_extra, i, 1))}><IconArrowDown size={16} /></BotonIcono>
                  <BotonIcono titulo="Quitar" claro onClick={() => set("descripciones_extra", f.descripciones_extra.filter((_, k) => k !== i))}><IconTrash size={16} /></BotonIcono>
                </div>
                <textarea className={`${CAMPO} mt-2 min-h-20`} rows={3} placeholder="Contenido" value={d.contenido} onChange={(e) => set("descripciones_extra", f.descripciones_extra.map((x, k) => (k === i ? { ...x, contenido: e.target.value } : x)))} />
              </div>
            ))}
          </div>
          <AgregarFila onClick={() => set("descripciones_extra", [...f.descripciones_extra, { titulo: "", contenido: "" }])}>Agregar descripción</AgregarFila>
        </Seccion>

        <Seccion titulo="Especificaciones técnicas" ayuda='Pares etiqueta / valor, por ejemplo "Potencia" / "380 V".'>
          <div className="space-y-2">
            {f.especificaciones.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input className={CAMPO} placeholder="Etiqueta" value={s.k} onChange={(e) => set("especificaciones", f.especificaciones.map((x, k) => (k === i ? { ...x, k: e.target.value } : x)))} />
                <input className={CAMPO} placeholder="Valor" value={s.v} onChange={(e) => set("especificaciones", f.especificaciones.map((x, k) => (k === i ? { ...x, v: e.target.value } : x)))} />
                <BotonIcono titulo="Quitar" claro onClick={() => set("especificaciones", f.especificaciones.filter((_, k) => k !== i))}><IconTrash size={16} /></BotonIcono>
              </div>
            ))}
          </div>
          <AgregarFila onClick={() => set("especificaciones", [...f.especificaciones, { k: "", v: "" }])}>Agregar especificación</AgregarFila>
        </Seccion>

        {(error || subidas.error) && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error ?? subidas.error}</p>
        )}
      </div>

      <PieFormulario
        eliminar={id ? eliminar : undefined}
        cancelar={cerrar}
        guardar={guardar}
        ocupado={guardando || subidas.subiendo}
        textoOcupado={subidas.subiendo ? "Subiendo imagen…" : "Guardando…"}
      />
    </VentanaModal>
  );
}

// ─── Piezas de formulario, compartidas con Casos ─────────────────────────────

export function Campo({ etiqueta, ayuda, ancho, children }: { etiqueta: string; ayuda?: string; ancho?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${ancho ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-semibold text-tinta/80">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] text-gris">{ayuda}</span>}
    </label>
  );
}

export function Casilla({ etiqueta, valor, alCambiar }: { etiqueta: string; valor: boolean; alCambiar: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-tinta">
      <input type="checkbox" className="h-4 w-4 accent-[var(--color-naranjo)]" checked={valor} onChange={(e) => alCambiar(e.target.checked)} />
      {etiqueta}
    </label>
  );
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-borde pt-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-tinta/70">{titulo}</h3>
      {ayuda && <p className="mb-2 mt-0.5 text-[11px] text-gris">{ayuda}</p>}
      <div className={ayuda ? "" : "mt-2"}>{children}</div>
    </section>
  );
}

function BotonIcono({ titulo, onClick, claro, children }: { titulo: string; onClick: () => void; claro?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      className={`grid shrink-0 place-items-center rounded-md transition ${
        claro ? "h-11 w-9 text-gris hover:bg-borde/60 hover:text-tinta" : "h-6 w-6 text-white hover:bg-white/20"
      }`}
    >
      {children}
    </button>
  );
}

function AgregarFila({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-azul hover:underline">
      <IconPlus size={14} stroke={2.25} aria-hidden /> {children}
    </button>
  );
}

export function ElegirImagenes({ multiple, disabled, alElegir }: { multiple: boolean; disabled: boolean; alElegir: (a: File[]) => void }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-borde px-3 py-2.5 text-xs font-semibold text-gris transition hover:border-azul hover:text-azul ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <IconPhoto size={16} aria-hidden />
      {disabled ? "Subiendo…" : multiple ? "Agregar imágenes" : "Elegir imagen"}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const archivos = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (archivos.length) alElegir(archivos);
        }}
      />
    </label>
  );
}

export function PieFormulario({
  eliminar,
  cancelar,
  guardar,
  ocupado,
  textoOcupado,
}: {
  eliminar?: () => void;
  cancelar: () => void;
  guardar: () => void;
  ocupado: boolean;
  textoOcupado: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-borde px-5 py-3">
      {eliminar && (
        <button type="button" onClick={eliminar} disabled={ocupado} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400">
          Eliminar
        </button>
      )}
      <span className="flex-1" />
      <button type="button" onClick={cancelar} disabled={ocupado} className="rounded-lg px-3 py-2 text-xs font-semibold text-gris transition hover:bg-borde/60 hover:text-tinta disabled:opacity-50">
        Cancelar
      </button>
      <button type="button" onClick={guardar} disabled={ocupado} className={`${BOTON_PRIMARIO} disabled:opacity-60`}>
        {ocupado ? textoOcupado : "Guardar"}
      </button>
    </div>
  );
}
