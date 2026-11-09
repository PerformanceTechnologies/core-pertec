"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconCamera, IconFileText, IconPhoto, IconSparkles, IconX } from "@tabler/icons-react";

// En el celular: juntar varias fotos (o archivos) ANTES de analizar. Sacas una foto, otra, otra…
// las ves en miniatura, quitas la que salió mal, y recién ahí «Analizar». En computador se sigue
// usando la zona de arrastrar de siempre, que analiza al tiro.

export default function ColaDeFotos({ ocupado, alAnalizar }: { ocupado: boolean; alAnalizar: (archivos: File[]) => void }) {
  const [cola, setCola] = useState<File[]>([]);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  const vistas = useMemo(() => cola.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [cola]);
  useEffect(() => () => vistas.forEach((u) => u && URL.revokeObjectURL(u)), [vistas]);

  const agregar = (lista: FileList | null) => {
    // Se copian YA: al limpiar el input (para poder elegir la misma foto otra vez) la FileList se vacía.
    const nuevos = lista ? Array.from(lista) : [];
    if (nuevos.length) setCola((c) => [...c, ...nuevos]);
  };

  const analizar = () => {
    if (!cola.length) return;
    alAnalizar(cola);
    setCola([]);
  };

  return (
    <div className="rounded-2xl border-2 border-dashed border-borde bg-superficie p-4 lg:hidden">
      <input ref={camara} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => (agregar(e.target.files), (e.target.value = ""))} />
      <input
        ref={galeria}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
        className="sr-only"
        onChange={(e) => (agregar(e.target.files), (e.target.value = ""))}
      />

      <p className="text-center text-base font-bold text-tinta">{cola.length ? `${cola.length} comprobante${cola.length === 1 ? "" : "s"} listo${cola.length === 1 ? "" : "s"}` : "Sube tus boletas y facturas"}</p>
      <p className="mt-0.5 text-center text-xs text-gris">
        {cola.length ? "Saca más fotos si quieres; cuando estén todas, analízalas." : "Saca una foto por boleta. Puedes sacar varias antes de analizar."}
      </p>

      {cola.length > 0 && (
        <ul className="mt-3 grid grid-cols-4 gap-2">
          {cola.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative aspect-square overflow-hidden rounded-lg border border-borde bg-crema">
              {vistas[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={vistas[i]!} alt={`Comprobante ${i + 1}`} className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center text-gris"><IconFileText size={22} /></span>
              )}
              <button
                type="button"
                onClick={() => setCola((c) => c.filter((_, j) => j !== i))}
                aria-label={`Quitar comprobante ${i + 1}`}
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white"
              >
                <IconX size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" disabled={ocupado} onClick={() => camara.current?.click()} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-naranjo/10 text-sm font-bold text-naranjo disabled:opacity-50">
          <IconCamera size={19} /> {cola.length ? "Otra foto" : "Sacar foto"}
        </button>
        <button type="button" disabled={ocupado} onClick={() => galeria.current?.click()} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-borde text-sm font-bold text-tinta disabled:opacity-50">
          <IconPhoto size={19} /> Galería
        </button>
      </div>
      {cola.length > 0 && (
        <button type="button" disabled={ocupado} onClick={analizar} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-naranjo text-sm font-bold text-white shadow-sm disabled:opacity-50">
          <IconSparkles size={19} /> Analizar {cola.length} comprobante{cola.length === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}
