"use client";

import { useState } from "react";
import RuedaCarga from "./RuedaCarga";
import { cambiarEstadoDeArchivoAction } from "@/app/(protegido)/contratos/[contrato]/acciones";
import {
  ESTADOS_DE_ARCHIVO,
  ETIQUETAS_DE_ARCHIVO,
  type EstadoDeArchivo,
} from "@/lib/contratos/documento-estado";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";
import { usePuede } from "./PermisosDelUsuario";

/**
 * El `data-estado` de cada etapa: el mismo que usan las filas de la lista, para que el
 * Borrador de un archivo y el Borrador de su requisito sean del mismo color (ver globals.css,
 * «Las etapas de revisión»). Índigo, ámbar y verde.
 */
const VISUAL: Record<EstadoDeArchivo, string> = {
  borrador: "borrador",
  en_revision: "revision",
  validado: "validado",
};

/**
 * La etapa de revisión de un archivo —Borrador, En revisión, Validado—, y el control
 * para cambiarla, en la misma pieza.
 *
 * Es una pastilla de color que al tocarla despliega las tres opciones: ocupa lo que
 * ocupa una etiqueta, no suma botones a la fila ni un panel aparte, y quien solo mira
 * ve el estado de un vistazo. Es un <select> nativo a propósito: en el celular abre el
 * selector del propio teléfono, que es lo más cómodo para tocar con el dedo.
 *
 * Se guarda al elegir, sin botón de confirmar: es reversible y no destruye nada. Si el
 * servidor falla vuelve al valor anterior y lo dice, porque dejar «Validado» en pantalla
 * cuando no se guardó es peor que no haberlo puesto.
 */
export default function SelectorDeEstadoDeArchivo({
  seccion,
  itemId,
  ruta,
  estadoInicial,
  cambiadoPor,
}: {
  seccion: string;
  itemId: string;
  /** La ruta del ARCHIVO, no la de su carpeta. */
  ruta: string;
  estadoInicial: EstadoDeArchivo;
  /** «Fulano, 05-10-2026»: quién lo dejó así, para el texto de ayuda. */
  cambiadoPor?: string | null;
}) {
  // Validar un archivo es una decisión: se ve a quién le toca, no se cambia sin permiso de editar.
  const puedeEditar = usePuede("editar");
  const [estado, setEstado] = useState(estadoInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(nuevo: EstadoDeArchivo) {
    const anterior = estado;
    setEstado(nuevo);
    setGuardando(true);
    setError(null);

    try {
      await cambiarEstadoDeArchivoAction(seccion, itemId, ruta, nuevo);
    } catch (e) {
      setEstado(anterior);
      setError(mensajeDeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="relative inline-block" data-estado={VISUAL[estado]}>
        <select
          value={estado}
          disabled={guardando || !puedeEditar}
          onChange={(e) => void elegir(e.target.value as EstadoDeArchivo)}
          aria-label="Estado del documento"
          title={cambiadoPor ? `${ETIQUETAS_DE_ARCHIVO[estado]} · ${cambiadoPor}` : "Cambiar el estado del documento"}
          className="tarjeta-chip cursor-pointer appearance-none pr-6 transition pointer-coarse:min-h-11 hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cian disabled:cursor-progress disabled:opacity-70"
        >
          {ESTADOS_DE_ARCHIVO.map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_DE_ARCHIVO[e]}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] opacity-70">
          {guardando ? <RuedaCarga className="h-3 w-3" /> : "▼"}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-[11px] font-semibold normal-case text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
