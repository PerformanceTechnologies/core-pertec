"use client";

import { useRef, useState } from "react";
import RuedaCarga from "./RuedaCarga";
import { LARGO_MAXIMO_DE_DETALLE } from "@/lib/contratos/contratos-estado";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";
import { CAMPO } from "@/lib/contratos/estilos";
import { usePuede } from "./PermisosDelUsuario";

/**
 * El detalle del documento que pide un requisito, al pie de su tarjeta.
 *
 * Es la indicación para quien lo tiene que subir: qué documento es, de qué fecha, si va
 * firmado. Va a todo el ancho de la tarjeta y SIEMPRE en negrita —lo que se escribe, no el
 * texto de ayuda—, para que se lea como lo que es: lo que hay que cumplir.
 *
 * Se guarda al salir de la caja, sin botón: es lo mismo que hacen el estado y el
 * responsable de la tarjeta. Si el servidor falla, el texto escrito se conserva en la caja y
 * se dice, porque borrarlo obligaría a escribirlo de nuevo.
 *
 * Quien solo puede ver lo lee como texto, sin caja; y si no hay detalle, no se dibuja nada.
 */
export default function DetalleDelRequisito({
  seccion,
  itemId,
  ruta,
  detalleInicial,
  guardar,
}: {
  seccion: string;
  itemId: string;
  ruta: string;
  detalleInicial: string | null;
  guardar: (seccion: string, itemId: string, ruta: string, detalle: string) => Promise<void>;
}) {
  const puedeEditar = usePuede("editar");
  const [texto, setTexto] = useState(detalleInicial ?? "");
  // Lo último que el servidor confirmó, para no guardar lo que no cambió.
  const guardado = useRef((detalleInicial ?? "").trim());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recienGuardado, setRecienGuardado] = useState(false);

  if (!puedeEditar) {
    const leido = (detalleInicial ?? "").trim();
    if (!leido) return null;
    return (
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gris">Detalle del documento</p>
        <p className="mt-1 whitespace-pre-line text-sm font-bold leading-relaxed text-tinta [overflow-wrap:anywhere]">
          {leido}
        </p>
      </div>
    );
  }

  async function guardarSiCambio() {
    const limpio = texto.trim();
    if (limpio === guardado.current) return;

    setGuardando(true);
    setError(null);
    setRecienGuardado(false);

    try {
      await guardar(seccion, itemId, ruta, limpio);
      guardado.current = limpio;
      setRecienGuardado(true);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo guardar el detalle."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <label
        htmlFor={`detalle-${itemId}`}
        className="text-xs font-bold uppercase tracking-wide text-gris"
      >
        Detalle del documento
      </label>
      <textarea
        id={`detalle-${itemId}`}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setRecienGuardado(false);
        }}
        onBlur={() => void guardarSiCambio()}
        rows={3}
        maxLength={LARGO_MAXIMO_DE_DETALLE}
        placeholder="Escribe qué documento se pide: por ejemplo, vigente, firmado y con timbre notarial."
        // font-bold en la caja entera: lo escrito sale en negrita. El texto de ayuda
        // (placeholder) vuelve a peso normal para que no parezca ya escrito.
        className={`${CAMPO} mt-1.5 block resize-y font-bold leading-relaxed placeholder:font-normal`}
      />
      <div className="mt-1 flex min-h-4 flex-wrap items-center justify-between gap-2 text-[11px]">
        <span aria-live="polite" className="flex items-center gap-1.5">
          {guardando ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-gris">
              <RuedaCarga className="h-3 w-3" />
              Guardando…
            </span>
          ) : error ? (
            <span className="font-semibold text-red-600">{error}</span>
          ) : recienGuardado ? (
            <span className="font-semibold text-emerald-700">Guardado</span>
          ) : (
            <span className="text-gris-suave">Se guarda al salir de la caja.</span>
          )}
        </span>
        {texto.length > LARGO_MAXIMO_DE_DETALLE * 0.8 && (
          <span className="tabular-nums text-gris-suave">
            {texto.length}/{LARGO_MAXIMO_DE_DETALLE}
          </span>
        )}
      </div>
    </div>
  );
}
