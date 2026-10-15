"use client";

import { useRef, useState } from "react";

function llevaArchivos(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

/**
 * Convierte un elemento en un lugar donde soltar archivos.
 *
 * Devuelve las props para ponerle y si hay archivos encima, para resaltarlo. Lleva la marca
 * `data-acepta-archivos`, que es la que mira GuardiaDeArrastre para no bloquear acá.
 *
 * Cuenta las entradas y salidas en vez de mirar un sí/no: al pasar sobre un hijo (el nombre del
 * documento, un botón) el navegador avisa que se salió del padre, y el resaltado parpadeaba.
 *
 * Deshabilitado (subiendo, o un documento que no aplica) no lleva la marca: la guardia muestra el
 * cursor de «no se puede», que es lo que corresponde.
 */
export function useSoltarArchivos(alSoltar: (archivos: FileList) => void, habilitado = true) {
  const [encima, setEncima] = useState(false);
  const capas = useRef(0);

  const props = {
    "data-acepta-archivos": habilitado ? "" : undefined,
    onDragEnter(e: React.DragEvent) {
      if (!habilitado || !llevaArchivos(e)) return;
      e.preventDefault();
      capas.current += 1;
      setEncima(true);
    },
    onDragOver(e: React.DragEvent) {
      if (!habilitado || !llevaArchivos(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(e: React.DragEvent) {
      if (!habilitado || !llevaArchivos(e)) return;
      capas.current = Math.max(0, capas.current - 1);
      if (capas.current === 0) setEncima(false);
    },
    onDrop(e: React.DragEvent) {
      if (!habilitado || !llevaArchivos(e)) return;
      e.preventDefault();
      capas.current = 0;
      setEncima(false);
      if (e.dataTransfer.files.length > 0) alSoltar(e.dataTransfer.files);
    },
  };

  return { encima: habilitado && encima, props };
}
