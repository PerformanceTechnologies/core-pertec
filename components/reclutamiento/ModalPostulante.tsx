"use client";

import { useEffect, useState } from "react";
import type { PostulacionGuardada } from "@/lib/reclutamiento";

function formatearFechaLarga(iso: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-tinta/40">{etiqueta}</p>
      <p className="mt-0.5 text-sm text-tinta">{valor?.trim() ? valor : "—"}</p>
    </div>
  );
}

export default function ModalPostulante({
  postulante,
  onClose,
  esAdmin,
  onEliminado,
}: {
  postulante: PostulacionGuardada;
  onClose: () => void;
  esAdmin: boolean;
  onEliminado: (id: string) => void;
}) {
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onClose]);

  const otrosDocumentos = postulante.otrosDocumentosUrl
    ? postulante.otrosDocumentosUrl.split(";").map((s) => s.trim()).filter(Boolean)
    : [];

  async function eliminar() {
    if (
      !window.confirm(
        `¿Eliminar la postulación de ${postulante.nombreCompleto}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setEliminando(true);
    setErrorEliminar(null);
    try {
      const respuesta = await fetch(`/api/postulaciones/${postulante.id}`, { method: "DELETE" });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "No pudimos eliminar la postulación.");
      onEliminado(postulante.id);
      onClose();
    } catch (err) {
      setErrorEliminar(err instanceof Error ? err.message : "No pudimos eliminar la postulación.");
      setEliminando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-borde bg-white shadow-lg"
      >
        <div className="flex items-start justify-between border-b border-borde px-6 py-4">
          <div>
            <h2 className="font-condensed text-xl font-bold text-tinta">
              {postulante.nombreCompleto}
            </h2>
            <p className="mt-0.5 text-xs text-tinta/45">
              Postuló el {formatearFechaLarga(postulante.creadaEn)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-tinta/40 transition hover:bg-crema hover:text-tinta"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section>
            <h3 className="etiqueta-seccion mb-3">Datos personales</h3>
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="RUT" valor={postulante.rut} />
              <Campo etiqueta="Fecha de nacimiento" valor={postulante.fechaNacimiento} />
              <Campo etiqueta="Teléfono" valor={postulante.telefono} />
              <Campo etiqueta="Correo" valor={postulante.correo} />
              <Campo etiqueta="Región" valor={postulante.region} />
              <Campo etiqueta="Comuna" valor={postulante.comuna} />
            </div>
          </section>

          <section>
            <h3 className="etiqueta-seccion mb-3">Datos laborales</h3>
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="Cargo" valor={postulante.cargo} />
              <Campo etiqueta="Experiencia" valor={postulante.experiencia} />
              <Campo etiqueta="Turno disponible" valor={postulante.turno} />
              <Campo etiqueta="Disponibilidad faena/traslado" valor={postulante.disponibilidadFaena} />
              <Campo etiqueta="Licencias / certificaciones" valor={postulante.licencias} />
              <Campo etiqueta="Exámenes preocupacionales" valor={postulante.examenesVigentes} />
              {postulante.institucionExamenes && (
                <Campo etiqueta="Institución exámenes" valor={postulante.institucionExamenes} />
              )}
              <Campo etiqueta="¿Cómo se enteró?" valor={postulante.comoSeEntero} />
            </div>
          </section>

          <section>
            <h3 className="etiqueta-seccion mb-3">Documentos</h3>
            <div className="flex flex-wrap gap-2">
              {postulante.cvUrl && (
                <a
                  href={postulante.cvUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-borde px-3 py-1.5 text-sm font-medium text-naranjo hover:border-naranjo/40 hover:underline"
                >
                  Ver CV
                </a>
              )}
              {otrosDocumentos.map((url, i) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-borde px-3 py-1.5 text-sm font-medium text-naranjo hover:border-naranjo/40 hover:underline"
                >
                  Otro documento {i + 1}
                </a>
              ))}
              {postulante.linkedin && (
                <a
                  href={postulante.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-borde px-3 py-1.5 text-sm font-medium text-teal hover:border-teal/40 hover:underline"
                >
                  Ver LinkedIn
                </a>
              )}
              {!postulante.cvUrl && !postulante.linkedin && otrosDocumentos.length === 0 && (
                <p className="text-sm text-tinta/40">Sin documentos.</p>
              )}
            </div>
          </section>

          {esAdmin && (
            <section className="border-t border-borde pt-5">
              {errorEliminar && <p className="mb-3 text-sm font-medium text-red-600">{errorEliminar}</p>}
              <button
                onClick={eliminar}
                disabled={eliminando}
                className="text-sm font-medium text-red-600 transition hover:underline disabled:opacity-50"
              >
                {eliminando ? "Eliminando..." : "Eliminar esta postulación"}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
