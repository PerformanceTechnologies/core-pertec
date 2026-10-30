"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { BOTON_PRIMARIO, CAMPO, TARJETA } from "@/lib/estilos";
import { casoVacio, degradadoDe, COLORES_CASO, type Caso } from "@/lib/pagina-web-modelo";
import { eliminarCasoAction, guardarCasoAction } from "@/app/(protegido)/pagina-web/acciones";
import { Campo, Casilla, ElegirImagenes, PieFormulario } from "./Catalogo";
import { useSubidas } from "./subidas";

type Borrador = Omit<Caso, "id">;

/** Los casos de éxito de pertec.cl/casos. */
export default function Casos({ casos }: { casos: Caso[] }) {
  const [editando, setEditando] = useState<{ id: string | null; datos: Borrador } | null>(null);
  const enHome = casos.filter((c) => c.visible_en_home).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gris">
          {casos.length} {casos.length === 1 ? "caso" : "casos"} · {enHome} marcados para la home
        </p>
        <button type="button" className={`${BOTON_PRIMARIO} inline-flex items-center gap-1.5`} onClick={() => setEditando({ id: null, datos: casoVacio() })}>
          <IconPlus size={15} stroke={2.25} aria-hidden /> Nuevo caso
        </button>
      </div>

      {casos.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center text-sm text-gris`}>Todavía no hay casos.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {casos.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setEditando({ id: c.id, datos: { ...c } })}
              className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-xl p-4 text-left text-white shadow-sm transition hover:-translate-y-0.5"
              style={{ background: degradadoDe(c.color) }}
            >
              {c.imagen_url && (
                // eslint-disable-next-line @next/next/no-img-element -- imagen del storage del sitio
                <img src={c.imagen_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" loading="lazy" />
              )}
              <div className="relative">
                {c.tag && <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">{c.tag}</p>}
                <p className="mt-1 text-lg font-bold leading-tight">{c.titulo}</p>
                <p className="mt-1 text-xs text-white/80">{[c.cliente, c.ano].filter(Boolean).join(" · ")}</p>
                {c.metricas && <p className="mt-0.5 text-xs text-white/70">{c.metricas}</p>}
                <p className="mt-2 flex gap-1 text-[10px] font-semibold">
                  <span className="rounded-full bg-white/15 px-2 py-0.5">orden {c.orden}</span>
                  {c.visible_en_home && <span className="rounded-full bg-white/15 px-2 py-0.5">En home</span>}
                  {c.destacado && <span className="rounded-full bg-white/15 px-2 py-0.5">Destacado</span>}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {editando && (
        <FormularioCaso key={editando.id ?? "nuevo"} id={editando.id} inicial={editando.datos} alCerrar={() => setEditando(null)} />
      )}
    </div>
  );
}

function FormularioCaso({ id, inicial, alCerrar }: { id: string | null; inicial: Borrador; alCerrar: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<Borrador>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const subidas = useSubidas("casos");
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
      const r = await guardarCasoAction(id, f);
      if (!r.ok) return setError(r.error);
      subidas.confirmar([f.imagen_url]);
      alCerrar();
      router.refresh();
    });
  };

  const eliminar = () => {
    if (!id || !confirm(`¿Eliminar el caso "${inicial.titulo}" del sitio?`)) return;
    iniciar(async () => {
      const r = await eliminarCasoAction(id);
      if (!r.ok) return setError(r.error);
      subidas.descartar();
      alCerrar();
      router.refresh();
    });
  };

  return (
    <VentanaModal abierta alCerrar={cerrar} titulo={id ? "Editar caso" : "Nuevo caso"} descripcion="Los cambios se ven en pertec.cl apenas se guardan.">
      <div className="space-y-5 px-5 py-4">
        {/* La tarjeta tal como se ve en el sitio, para elegir color e imagen mirando el resultado. */}
        <div className="relative flex h-40 flex-col justify-end overflow-hidden rounded-xl p-4 text-white" style={{ background: degradadoDe(f.color) }}>
          {f.imagen_url && (
            // eslint-disable-next-line @next/next/no-img-element -- imagen del storage del sitio
            <img src={f.imagen_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          )}
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">{f.tag || "Etiqueta"}</p>
            <p className="text-lg font-bold leading-tight">{f.titulo || "Título del caso"}</p>
            <p className="text-xs text-white/80">{[f.cliente, f.ano].filter(Boolean).join(" · ") || "Cliente · año"}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Título *" ancho>
            <input className={CAMPO} value={f.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Cambio de correa overland" />
          </Campo>
          <Campo etiqueta="Cliente / faena">
            <input className={CAMPO} value={f.cliente} onChange={(e) => set("cliente", e.target.value)} />
          </Campo>
          <Campo etiqueta="Año" ayuda='Texto libre: "2024" o "Continuo".'>
            <input className={CAMPO} value={f.ano} onChange={(e) => set("ano", e.target.value)} />
          </Campo>
          <Campo etiqueta="Métricas">
            <input className={CAMPO} value={f.metricas} onChange={(e) => set("metricas", e.target.value)} placeholder='72" · 2.4 km' />
          </Campo>
          <Campo etiqueta="Etiqueta">
            <input className={CAMPO} value={f.tag} onChange={(e) => set("tag", e.target.value)} placeholder="Overland conveyor" />
          </Campo>
          <Campo etiqueta="Color de fondo">
            <select className={CAMPO} value={f.color} onChange={(e) => set("color", e.target.value)}>
              {COLORES_CASO.map((c) => (
                <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Orden" ayuda="Menor aparece primero.">
            <input className={CAMPO} type="number" value={f.orden} onChange={(e) => set("orden", Number(e.target.value))} />
          </Campo>
        </div>

        <div className="flex flex-wrap gap-5">
          <Casilla etiqueta="Mostrar en la home" valor={f.visible_en_home} alCambiar={(v) => set("visible_en_home", v)} />
          <Casilla etiqueta="Destacado" valor={f.destacado} alCambiar={(v) => set("destacado", v)} />
        </div>

        <div className="border-t border-borde pt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-tinta/70">Imagen</p>
          {f.imagen_url ? (
            <button type="button" className="text-xs font-semibold text-red-700 hover:underline dark:text-red-400" onClick={() => set("imagen_url", "")}>
              Quitar imagen
            </button>
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
        </div>

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
