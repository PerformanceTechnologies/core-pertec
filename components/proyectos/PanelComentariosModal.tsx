"use client";

import { useCallback, useEffect, useState } from "react";
import type { Objetivo, ObjetivoComentario } from "@/lib/proyectos";
import { puedeEnPanel, type RolPanel } from "@/lib/permisos-panel";

export default function PanelComentariosModal({
  objetivo,
  rolPanel,
  onClose,
}: {
  objetivo: Objetivo;
  rolPanel: RolPanel;
  onClose: () => void;
}) {
  const [comentarios, setComentarios] = useState<ObjetivoComentario[] | null>(null);
  const [borrador, setBorrador] = useState("");
  const [enviando, setEnviando] = useState(false);
  const puedeEscribir = puedeEnPanel(rolPanel, "comentar");

  const cargar = useCallback(async () => {
    const respuesta = await fetch(`/api/objetivos/${objetivo.id}/comentarios`, { cache: "no-store" });
    const cuerpo = await respuesta.json();
    if (respuesta.ok) setComentarios(cuerpo.comentarios);
  }, [objetivo.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const enviar = async () => {
    const contenido = borrador.trim();
    if (!contenido) return;
    setEnviando(true);
    const respuesta = await fetch(`/api/objetivos/${objetivo.id}/comentarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido }),
    });
    setEnviando(false);
    if (respuesta.ok) {
      setBorrador("");
      cargar();
    }
  };

  const eliminar = async (id: string) => {
    if (!window.confirm("¿Eliminar comentario?")) return;
    const respuesta = await fetch(`/api/comentarios/${id}`, { method: "DELETE" });
    if (respuesta.ok) cargar();
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-borde bg-white shadow-lg"
      >
        <div className="flex items-start justify-between border-b border-borde px-5 py-3">
          <h2 className="font-condensed text-base font-bold text-tinta">Comentarios · {objetivo.titulo}</h2>
          <button onClick={onClose} className="text-tinta/40 hover:text-tinta" aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          {comentarios === null ? (
            <p className="text-sm text-tinta/40">Cargando…</p>
          ) : comentarios.length === 0 ? (
            <p className="text-sm text-tinta/40">Sin comentarios todavía.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comentarios.map((c) => (
                <li key={c.id} className="rounded-lg bg-crema/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-tinta/70">{c.user_email ?? "Anónimo"}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-tinta/40">{fmt(c.created_at)}</span>
                      {puedeEscribir && (
                        <button onClick={() => eliminar(c.id)} className="text-tinta/35 hover:text-red-600" aria-label="Eliminar">
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-tinta/80">{c.contenido}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {puedeEscribir && (
          <div className="flex gap-2 border-t border-borde px-5 py-3">
            <textarea
              rows={2}
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar();
              }}
              placeholder="Escribir un comentario…"
              className="flex-1 rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
            />
            <button
              onClick={enviar}
              disabled={enviando || !borrador.trim()}
              className="self-end rounded-lg bg-naranjo px-3 py-2 text-sm font-semibold text-white hover:bg-naranjo-suave disabled:opacity-40"
            >
              {enviando ? "…" : "Enviar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
