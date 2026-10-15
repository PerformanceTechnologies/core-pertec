"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconUserPlus } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import { cambiarCreadoEnBukAction } from "@/app/(protegido)/contratos/[contrato]/acreditacion/acciones";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";

/**
 * «Creado en BUK» como botón, para la pestaña Datos, junto a «Guardar datos».
 *
 * Es la misma casilla del seguimiento, pero se guarda AL TOCARLA: va aparte del formulario (`type=
 * "button"`) porque marcar que la persona ya está en BUK no debería obligar a enviar —ni arriesgar—
 * los demás datos que se estén editando. Es una afirmación de quien lo marca: el core no consulta BUK.
 *
 * Va dentro del fieldset de permisos del formulario, así que un rol que no puede editar lo ve
 * deshabilitado.
 */
export default function BotonCreadoEnBuk({ personaId, creado }: { personaId: string; creado: boolean }) {
  const router = useRouter();
  const [valor, setValor] = useState(creado);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function alternar() {
    const nuevo = !valor;
    setError(null);
    // Se muestra ya y se devuelve si falla: esperar al servidor para ver que el botón cambió se siente roto.
    setValor(nuevo);
    iniciar(async () => {
      try {
        const r = await cambiarCreadoEnBukAction(personaId, nuevo);
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

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={alternar}
        disabled={pendiente}
        aria-pressed={valor}
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition disabled:cursor-progress disabled:opacity-60 ${
          valor
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400"
            : "border-borde text-azul hover:border-cian"
        }`}
      >
        {pendiente ? <RuedaCarga className="h-3.5 w-3.5" /> : valor ? <IconCheck size={15} aria-hidden /> : <IconUserPlus size={15} aria-hidden />}
        {valor ? "Creado en BUK" : "Marcar creado en BUK"}
      </button>
      {error && (
        <span role="alert" className="text-xs font-semibold text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
