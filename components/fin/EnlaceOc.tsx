"use client";

import { useState } from "react";
import { IconCheck, IconCopy, IconLink, IconLoader2 } from "@tabler/icons-react";
import { BOTON_SEC } from "./estilos";
import { avisar } from "./dialogos";

/**
 * «Enlace de confirmación»: genera el enlace con que el proveedor confirma la OC (o pide modificarla) y lo copia,
 * para mandarlo por otro medio. Al enviar la OC por correo el enlace ya va como botón; esto es para lo demás.
 */
export default function EnlaceOc({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const generar = async () => {
    setCargando(true);
    const r = await fetch(`/api/finanzas/compras/${id}/enlace-oc`, { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "No se pudo crear el enlace." }));
    setCargando(false);
    if (r.error) return avisar(r.error);
    setUrl(r.url);
    try {
      await navigator.clipboard.writeText(r.url);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  if (!url) {
    return (
      <button type="button" onClick={generar} disabled={cargando} className={BOTON_SEC} title="El enlace con que el proveedor confirma la OC o pide modificarla, para mandarlo por otro medio">
        {cargando ? <IconLoader2 size={14} className="animate-spin" /> : <IconLink size={14} />} Enlace de confirmación
      </button>
    );
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-borde bg-superficie py-1 pl-2.5 pr-1 text-xs">
      <a href={url} target="_blank" rel="noopener" className="max-w-[18rem] truncate font-mono text-naranjo hover:underline">{url}</a>
      <button
        type="button"
        onClick={async () => { await navigator.clipboard.writeText(url).catch(() => null); setCopiado(true); }}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-tinta hover:bg-tinta/[0.06]"
      >
        {copiado ? <><IconCheck size={13} className="text-ok" /> Copiado</> : <><IconCopy size={13} /> Copiar</>}
      </button>
    </span>
  );
}
