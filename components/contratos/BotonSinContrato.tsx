"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconFileOff, IconFileCheck } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import { cambiarSinContratoAction } from "@/app/(protegido)/contratos/[contrato]/acreditacion/acciones";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";

/**
 * «Sin contrato aún», junto a «Guardar datos» y «Creado en BUK».
 *
 * Una persona cuenta como contratada en la dotación si tiene fecha de ingreso en Datos. Este botón
 * es la EXCEPCIÓN: sirve para sacar de la dotación a quien ya tiene fecha cargada pero cuyo contrato
 * todavía no se firma, sin quitarla de la nómina ni de los documentos. Se guarda al tocarlo y va
 * aparte del formulario (`type="button"`): marcarlo no debería obligar a enviar los demás datos.
 */
export default function BotonSinContrato({
  personaId,
  sinContrato,
  tieneFechaDeIngreso,
}: {
  personaId: string;
  sinContrato: boolean;
  /** Si Datos ya trae «Ingreso a contrato»: sin ella la persona no cuenta, esté o no marcada. */
  tieneFechaDeIngreso: boolean;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(sinContrato);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function alternar() {
    const nuevo = !valor;
    setError(null);
    setValor(nuevo);
    iniciar(async () => {
      try {
        const r = await cambiarSinContratoAction(personaId, nuevo);
        if (r.error) {
          setValor(!nuevo);
          setError(r.error);
        } else {
          router.refresh();
        }
      } catch (e) {
        setValor(!nuevo);
        setError(mensajeDeError(e, "No se pudo guardar."));
      }
    });
  }

  const cuenta = tieneFechaDeIngreso && !valor;

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={alternar}
          disabled={pendiente}
          aria-pressed={valor}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition disabled:cursor-progress disabled:opacity-60 ${
            valor
              ? "border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400"
              : "border-borde text-azul hover:border-cian"
          }`}
        >
          {pendiente ? <RuedaCarga className="h-3.5 w-3.5" /> : valor ? <IconFileOff size={15} aria-hidden /> : <IconFileCheck size={15} aria-hidden />}
          {valor ? "Sin contrato aún" : "Marcar sin contrato aún"}
        </button>
        {error && (
          <span role="alert" className="text-xs font-semibold text-red-600">
            {error}
          </span>
        )}
      </span>
      <span className={`text-[11px] ${cuenta ? "text-gris-suave" : "font-semibold text-amber-700"}`}>
        {cuenta
          ? "Cuenta como contratada en la dotación."
          : valor
            ? "No cuenta en la dotación mientras esté marcada."
            : "Sin fecha de «Ingreso a contrato»: todavía no cuenta en la dotación."}
      </span>
    </span>
  );
}
