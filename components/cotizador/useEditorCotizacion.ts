"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { calcularCotizacion, type QuotationResult } from "@/lib/cotizador/motor/consolidacion";
import type { QuotationInput } from "@/lib/cotizador/motor/types";
import type { CotizacionCompleta } from "@/lib/cotizador";
import { actualizarInputCotizacionAction } from "@/app/(protegido)/cotizador/acciones";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Estado local del editor de una cotización: mantiene el QuotationInput,
 * recalcula en vivo con el motor (mismo cálculo que el server, corre también
 * en el cliente porque lib/cotizador/motor no tiene "server-only") y
 * autoguarda con debounce llamando al Server Action — igual patrón que el
 * store de Zustand del Cotizador standalone, pero persistiendo vía
 * actualizarInputCotizacionAction en vez de un cliente Supabase directo.
 */
export function useEditorCotizacion(cotizacion: CotizacionCompleta) {
  const [quotation, setQuotation] = useState<QuotationInput>(cotizacion.input);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disabled = cotizacion.emitida;

  const result: QuotationResult = useMemo(
    () => calcularCotizacion(quotation, cotizacion.parametrosSnapshot),
    [quotation, cotizacion.parametrosSnapshot],
  );

  const scheduleSave = useCallback(
    (next: QuotationInput) => {
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        actualizarInputCotizacionAction(cotizacion.id, next)
          .then(() => setSaveState("saved"))
          .catch((e) => {
            console.error("[cotizador] guardado falló", e);
            setSaveState("error");
          });
      }, 700);
    },
    [cotizacion.id],
  );

  const update = useCallback(
    (fn: (q: QuotationInput) => QuotationInput) => {
      if (disabled) return;
      setQuotation((prev) => {
        const next = fn(prev);
        scheduleSave(next);
        return next;
      });
    },
    [disabled, scheduleSave],
  );

  return { quotation, result, update, saveState, disabled };
}
