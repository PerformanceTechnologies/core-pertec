"use client";

import { useRutaDelContrato } from "./ContratoProvider";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import RuedaCarga from "./RuedaCarga";
import { MODULOS, type ModuloArranque } from "@/lib/contratos/arranque-modelo";
import { eliminarPartidaAction } from "@/app/(protegido)/contratos/[contrato]/acciones-partidas";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";

/**
 * Eliminar una partida, con confirmación y el error a la vista.
 *
 * `window.confirm` y no un diálogo propio, por lo mismo que BotonEliminarPersona: es
 * una acción rara y sin vuelta atrás, y lo que se necesita es que frene. Para sacar
 * algo de la cuenta SIN perderlo está el estado «Cancelado» / «Anulado».
 */
export default function BotonEliminarPartida({
  modulo,
  partidaId,
  descripcion,
}: {
  modulo: ModuloArranque;
  partidaId: string;
  descripcion: string;
}) {
  const config = MODULOS[modulo];
  const router = useRouter();
  const ruta = useRutaDelContrato();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function eliminar() {
    const aviso =
      `¿Eliminar «${descripcion}»?\n\nSe borra del registro y no se puede deshacer.\n` +
      `Si solo dejó de aplicar, cámbiale el estado a «${config.estados.at(-1)?.etiqueta}»: ` +
      "sale de la cuenta pero queda anotado.";
    if (!window.confirm(aviso)) return;

    setError(null);
    iniciar(async () => {
      try {
        const resultado = await eliminarPartidaAction(modulo, partidaId);
        if (resultado.error) setError(resultado.error);
        else router.push(ruta(config.ruta));
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo eliminar."));
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={eliminar}
        disabled={pendiente}
        className="inline-flex min-h-11 items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-600/80 transition hover:text-red-600 disabled:cursor-progress disabled:opacity-60"
      >
        {pendiente && <RuedaCarga className="h-3.5 w-3.5" />}
        {pendiente ? "Eliminando..." : `Eliminar ${config.singular}`}
      </button>
      {error && (
        <p role="alert" className="mt-1.5 max-w-md text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
