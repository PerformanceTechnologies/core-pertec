"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { calcularObra } from "@/lib/cotizador/obra/calculo";
import type { ObraInput, ObraResult } from "@/lib/cotizador/obra/tipos";
import type { CotizacionCompleta } from "@/lib/cotizador";
import { actualizarInputCotizacionAction } from "@/app/(protegido)/cotizador/acciones";
import type { SaveState } from "../useEditorCotizacion";

/**
 * Estado local del editor de una obra.
 *
 * Es el gemelo de useEditorCotizacion —mismo debounce de 700 ms, mismo Server
 * Action, mismos estados de guardado— con el cálculo de obra en vez del motor.
 * Se mantienen separados a propósito: fundirlos en un hook genérico obligaría a
 * que cada línea supiera de los dos modelos, y el editor de cotizaciones
 * mensuales no tiene por qué cambiar porque exista este.
 */
export function useEditorObra(cotizacion: CotizacionCompleta & { input: ObraInput }, puedeEditar: boolean) {
  const [obra, setObra] = useState<ObraInput>(cotizacion.input);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disabled = cotizacion.emitida || !puedeEditar;

  const result: ObraResult = useMemo(
    () => calcularObra(obra, cotizacion.parametrosSnapshot),
    [obra, cotizacion.parametrosSnapshot],
  );

  const scheduleSave = useCallback(
    (next: ObraInput) => {
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        actualizarInputCotizacionAction(cotizacion.id, next)
          .then(() => setSaveState("saved"))
          .catch((e) => {
            console.error("[cotizador] guardado de la obra falló", e);
            setSaveState("error");
          });
      }, 700);
    },
    [cotizacion.id],
  );

  const update = useCallback(
    (fn: (o: ObraInput) => ObraInput) => {
      if (disabled) return;
      setObra((prev) => {
        const next = fn(prev);
        scheduleSave(next);
        return next;
      });
    },
    [disabled, scheduleSave],
  );

  return { obra, result, update, saveState, disabled };
}
