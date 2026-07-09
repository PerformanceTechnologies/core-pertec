"use client";

import { useState } from "react";
import type { Objetivo } from "@/lib/proyectos";
import type { RolPanel } from "@/lib/permisos-panel";
import { colorDe, diasEntre, parseFecha } from "@/lib/proyectos-utilidades";
import PanelComentariosModal from "./PanelComentariosModal";

interface Props {
  objetivos: Objetivo[];
  objetivosPorPadre: Record<string, Objetivo[]>;
  rolPanel: RolPanel;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  puedeAlternar: boolean;
  onAlternar: (o: Objetivo) => void;
  onEditar: (o: Objetivo) => void;
  onEliminar: (o: Objetivo) => void;
  onAgregarSub: (padre: Objetivo, titulo: string) => Promise<boolean>;
}

export default function TableroObjetivos(props: Props) {
  const pendientes = props.objetivos.filter((o) => !o.hecho);
  const completados = props.objetivos.filter((o) => o.hecho);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Columna titulo="Pendientes" items={pendientes} {...props} />
      <Columna titulo="Completados" items={completados} {...props} />
    </div>
  );
}

function Columna({
  titulo,
  items,
  objetivosPorPadre,
  rolPanel,
  puedeEditar,
  puedeEliminar,
  puedeAlternar,
  onAlternar,
  onEditar,
  onEliminar,
  onAgregarSub,
}: Props & { titulo: string; items: Objetivo[] }) {
  const esAdmin = rolPanel === "admin";
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [comentariosDe, setComentariosDe] = useState<Objetivo | null>(null);
  const [borradorSub, setBorradorSub] = useState<Record<string, string>>({});

  const enviarSub = async (padre: Objetivo) => {
    const t = (borradorSub[padre.id] ?? "").trim();
    if (!t) return;
    const ok = await onAgregarSub(padre, t);
    if (ok) setBorradorSub((s) => ({ ...s, [padre.id]: "" }));
  };

  return (
    <div className="animar-revelar rounded-2xl border border-borde bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-condensed text-sm font-bold uppercase text-tinta/70">{titulo}</h3>
        <span className="rounded-full bg-crema px-2 py-0.5 text-xs font-semibold text-tinta/60">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-tinta/40">Sin elementos.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((o, i) => {
            const inicio = parseFecha(o.fecha_inicio);
            const fin = parseFecha(o.fecha_fin);
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const diff = diasEntre(hoy, fin);
            const urgente = !o.hecho && diff >= 0 && diff <= 3;
            const vencido = !o.hecho && diff < 0;
            const subs = objetivosPorPadre[o.id] ?? [];
            const subsHechos = subs.filter((s) => s.hecho).length;
            const abierto = !!expandido[o.id];
            const color = colorDe(o.color);

            return (
              <li
                key={o.id}
                className={`animar-revelar overflow-hidden rounded-xl border-l-4 border p-3 transition hover:shadow-md ${
                  vencido ? "border-red-300 bg-red-50" : urgente ? "border-naranjo/40 bg-naranjo/5" : "border-borde"
                }`}
                style={{ borderLeftColor: color.bg, animationDelay: `${Math.min(i, 10) * 50}ms` }}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={o.hecho}
                    disabled={!puedeAlternar}
                    onChange={() => onAlternar(o)}
                    className="mt-0.5 h-4 w-4 accent-naranjo"
                  />
                  <button
                    type="button"
                    onClick={() => puedeEditar && onEditar(o)}
                    disabled={!puedeEditar}
                    className="flex-1 text-left disabled:cursor-default"
                  >
                    <p className={`text-sm font-semibold text-tinta ${o.hecho ? "text-tinta/40 line-through" : ""}`}>{o.titulo}</p>
                    {o.descripcion && <p className="mt-0.5 text-xs text-tinta/55">{o.descripcion}</p>}
                  </button>
                  {(puedeEditar || puedeEliminar) && (
                    <div className="flex gap-1">
                      {puedeEditar && (
                        <button onClick={() => onEditar(o)} className="rounded p-1 text-tinta/40 hover:text-naranjo" aria-label="Editar">
                          ✎
                        </button>
                      )}
                      {puedeEliminar && (
                        <button onClick={() => onEliminar(o)} className="rounded p-1 text-tinta/40 hover:text-red-600" aria-label="Eliminar">
                          ×
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-tinta/50">
                  <span>
                    {inicio.toLocaleDateString("es-CL", { day: "2-digit", month: "short" })} →{" "}
                    {fin.toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                  </span>
                  {urgente && <span className="rounded-full bg-naranjo/15 px-2 py-0.5 font-semibold text-naranjo">Urgente</span>}
                  {vencido && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-600">Vencido</span>}
                  <button onClick={() => setExpandido((s) => ({ ...s, [o.id]: !s[o.id] }))} className="ml-auto hover:text-naranjo">
                    {subs.length > 0 ? `${subsHechos}/${subs.length} ` : "+ "}sub-objetivos
                  </button>
                  <button onClick={() => setComentariosDe(o)} className="hover:text-naranjo">
                    comentarios
                  </button>
                </div>

                {o.responsables.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {o.responsables.map((r, i) => (
                      <span key={i} className="rounded-full bg-crema px-2 py-0.5 text-[11px] text-tinta/60" title={r}>
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                {abierto && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-borde pt-3">
                    {subs.length === 0 && <p className="text-xs text-tinta/40">Sin sub-objetivos.</p>}
                    {subs.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={sub.hecho}
                          disabled={!puedeAlternar}
                          onChange={() => onAlternar(sub)}
                          className="h-3.5 w-3.5 accent-naranjo"
                        />
                        <button
                          onClick={() => esAdmin && onEditar(sub)}
                          disabled={!esAdmin}
                          className={`flex-1 text-left text-xs disabled:cursor-default ${sub.hecho ? "text-tinta/40 line-through" : "text-tinta/80"}`}
                        >
                          {sub.titulo}
                        </button>
                        <button onClick={() => setComentariosDe(sub)} className="text-tinta/35 hover:text-naranjo" aria-label="Comentarios">
                          💬
                        </button>
                        {esAdmin && (
                          <button onClick={() => onEliminar(sub)} className="text-tinta/35 hover:text-red-600" aria-label="Eliminar">
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    {esAdmin && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={borradorSub[o.id] ?? ""}
                          onChange={(e) => setBorradorSub((s) => ({ ...s, [o.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              enviarSub(o);
                            }
                          }}
                          placeholder="Agregar sub-objetivo…"
                          className="flex-1 rounded-lg border border-borde px-2.5 py-1.5 text-xs outline-none focus:border-naranjo/50"
                        />
                        <button
                          onClick={() => enviarSub(o)}
                          disabled={!(borradorSub[o.id] ?? "").trim()}
                          className="rounded-lg border border-borde px-3 text-xs font-medium text-tinta/70 hover:border-naranjo/40 disabled:opacity-40"
                        >
                          + Agregar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {comentariosDe && <PanelComentariosModal objetivo={comentariosDe} rolPanel={rolPanel} onClose={() => setComentariosDe(null)} />}
    </div>
  );
}
