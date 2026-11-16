"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconExternalLink, IconFile, IconLoader2, IconTrash } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { avisar, confirmar } from "@/components/fin/dialogos";
import { BOTON_SEC } from "@/components/fin/estilos";

/** Un documento de la lista: al tocarlo se previsualiza en una ventana, con opción de abrirlo aparte o quitarlo. */
export default function VerDocumento({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const url = `/api/gestion-financiera/adjunto/${id}`;
  const ext = nombre.split(".").pop()?.toLowerCase() ?? "";
  const esImagen = ["png", "jpg", "jpeg", "webp"].includes(ext);
  const esPdf = ext === "pdf";

  const quitar = async () => {
    if (!(await confirmar({ titulo: `¿Eliminar «${nombre}»?`, ayuda: "Se borra también de SharePoint. No se puede deshacer.", boton: "Eliminar", peligro: true }))) return;
    setQuitando(true);
    const r = await fetch(url, { method: "DELETE" }).then((x) => x.json()).catch(() => ({ error: "No se pudo eliminar." }));
    setQuitando(false);
    if (r.error) return avisar(r.error);
    avisar("Documento eliminado.", "ok");
    setAbierto(false);
    router.refresh();
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="inline-flex max-w-full items-center gap-1.5 truncate text-left text-tinta hover:text-naranjo">
        <IconFile size={14} className="shrink-0 text-gris" /> {nombre}
      </button>
      <VentanaModal abierta={abierto} alCerrar={() => setAbierto(false)} titulo={nombre} ancho="max-w-4xl">
        {abierto && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-borde bg-tinta/[0.03]">
              {esImagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={nombre} className="mx-auto max-h-[70vh] object-contain" />
              ) : esPdf ? (
                <iframe src={url} title={nombre} className="h-[70vh] w-full" />
              ) : (
                <p className="px-4 py-10 text-center text-sm text-gris">Este tipo de archivo no se puede previsualizar. Ábrelo en otra pestaña.</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={quitar} disabled={quitando} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/[0.06] px-3 py-2 text-xs font-semibold text-alerta transition hover:bg-rose-500/[0.12] disabled:opacity-50">
                {quitando ? <IconLoader2 size={14} className="animate-spin" /> : <IconTrash size={14} />} Eliminar
              </button>
              <a href={url} target="_blank" rel="noopener" className={BOTON_SEC}><IconExternalLink size={14} /> Abrir en otra pestaña</a>
            </div>
          </div>
        )}
      </VentanaModal>
    </>
  );
}
