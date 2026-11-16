"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBrandOnedrive, IconCloudUpload, IconFileCheck, IconFileText, IconLoader2, IconPaperclip, IconShoppingCart, IconX } from "@tabler/icons-react";
import { BOTON, BOTON_SEC } from "@/components/fin/estilos";
import { ConVentana } from "@/components/fin/ui";
import { avisar } from "@/components/fin/dialogos";

const TIPOS = [
  { tipo: "respaldo", titulo: "Archivo de respaldo", detalle: "Correo, ficha técnica, plano, foto…", Icono: IconFileText },
  { tipo: "oc_cliente", titulo: "Orden de compra", detalle: "La OC que mandó el cliente", Icono: IconShoppingCart },
];
const ACEPTA = ".pdf,.png,.jpg,.jpeg,.webp,.xml,.csv,.xlsx";

/** Ventana para subir documentación (respaldo u OC) a SharePoint, con arrastrar y soltar. */
function Formulario({ entidadTipo, entidadId, destino, cerrar }: { entidadTipo: string; entidadId: string; destino: string; cerrar: () => void }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState("respaldo");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [encima, setEncima] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const subir = async () => {
    if (!archivos.length) return;
    setSubiendo(true);
    let enSharePoint = 0;
    for (const f of archivos) {
      const fd = new FormData();
      fd.set("archivo", f);
      fd.set("entidadTipo", entidadTipo);
      fd.set("entidadId", entidadId);
      fd.set("tipo", tipo);
      const r = await fetch("/api/gestion-financiera/adjunto", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "No se pudo subir." }));
      if (r.error) {
        setSubiendo(false);
        avisar(`${f.name}: ${r.error}`);
        return;
      }
      if (r.sharepoint) enSharePoint++;
    }
    setSubiendo(false);
    avisar(enSharePoint === archivos.length ? "Guardado en SharePoint." : "Guardado. SharePoint no respondió y quedó en el respaldo del Core.", "ok");
    cerrar();
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold text-gris">1. ¿Qué vas a subir?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPOS.map(({ tipo: t, titulo, detalle, Icono }) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${tipo === t ? "border-naranjo bg-naranjo/[0.06] ring-2 ring-naranjo/30" : "border-borde hover:border-naranjo/40"}`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tipo === t ? "bg-naranjo text-white" : "bg-tinta/5 text-gris"}`}><Icono size={20} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-tinta">{titulo}</span>
                <span className="block text-xs text-gris">{detalle}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-gris">2. Elige los archivos</p>
        <input ref={entrada} type="file" multiple accept={ACEPTA} className="sr-only" onChange={(e) => { setArchivos([...archivos, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => { e.preventDefault(); setEncima(false); setArchivos([...archivos, ...Array.from(e.dataTransfer.files)]); }}
          className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${encima ? "border-naranjo bg-naranjo/[0.06]" : "border-borde hover:border-naranjo/50"}`}
        >
          <IconCloudUpload size={30} className="text-naranjo" />
          <span className="text-sm font-semibold text-tinta">Toca para elegir o arrastra aquí</span>
          <span className="text-xs text-gris">PDF, imagen, XML o planilla · hasta 4 MB cada uno</span>
        </button>
        {archivos.length > 0 && (
          <ul className="mt-2 space-y-1">
            {archivos.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-tinta/[0.03] px-3 py-2 text-sm">
                <IconPaperclip size={14} className="shrink-0 text-gris" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <button type="button" aria-label="Quitar" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))} className="text-gris hover:text-alerta"><IconX size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-xl bg-sky-500/[0.07] px-3 py-2 text-xs text-tinta/70">
        <IconBrandOnedrive size={16} className="mt-px shrink-0 text-sky-600" />
        <span>Se guarda en SharePoint, en <b>{destino}</b>.</span>
      </p>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={cerrar} className={BOTON_SEC}>Cancelar</button>
        <button type="button" onClick={subir} disabled={!archivos.length || subiendo} className={BOTON}>
          {subiendo ? <IconLoader2 size={15} className="animate-spin" /> : <IconFileCheck size={15} />}
          {subiendo ? "Subiendo…" : `Subir${archivos.length > 1 ? ` ${archivos.length} archivos` : ""}`}
        </button>
      </div>
    </div>
  );
}

export default function SubirDocumentacion({ entidadTipo, entidadId, destino }: { entidadTipo: string; entidadId: string; destino: string }) {
  return (
    <ConVentana boton={<><IconCloudUpload size={15} /> Documentación</>} titulo="Subir documentación" descripcion="Respaldo u orden de compra, directo a SharePoint." className={BOTON_SEC} ancho="max-w-xl">
      {(cerrar) => <Formulario entidadTipo={entidadTipo} entidadId={entidadId} destino={destino} cerrar={cerrar} />}
    </ConVentana>
  );
}
