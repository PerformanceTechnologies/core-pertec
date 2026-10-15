"use client";

import { useRutaDelContrato } from "./ContratoProvider";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import { eliminarPersonaAction } from "@/app/(protegido)/contratos/[contrato]/acreditacion/acciones";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";

/**
 * Eliminar la ficha de una persona, y su carpeta de SharePoint con ella.
 *
 * Con confirmación que dice QUÉ se va a perder, y con el error a la vista si
 * SharePoint no deja eliminar la carpeta: en ese caso la ficha NO se borra
 * (lo decide la acción), y quien pulsó tiene que saber por qué sigue ahí.
 *
 * `window.confirm` y no un diálogo propio, por lo mismo que BotonEliminar: es una
 * acción rara y sin vuelta atrás, y lo que se necesita es que frene.
 */
export default function BotonEliminarPersona({
  personaId,
  nombre,
  tieneCarpeta,
  compacto = false,
}: {
  personaId: string;
  nombre: string;
  tieneCarpeta: boolean;
  /**
   * En la nómina: solo el icono, y al terminar se refresca la lista en vez de
   * navegar. Desde la ficha hay que salir —la página que uno está mirando deja
   * de existir—; desde la lista, salir sería ir a donde ya se está.
   */
  compacto?: boolean;
}) {
  const router = useRouter();
  const ruta = useRutaDelContrato();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function eliminar() {
    const aviso =
      `¿Eliminar la ficha de ${nombre}?\n\n` +
      "• Se borran sus documentos anotados, sus cursos y su historial. No se puede deshacer.\n" +
      (tieneCarpeta
        ? "• Su carpeta en SharePoint, con TODOS sus archivos, va a la papelera del sitio, de donde se puede restaurar.\n"
        : "• No tiene carpeta en SharePoint.\n") +
      "\nSi solo dejó de trabajar, usa «Dar de baja»: conserva todo el expediente.";
    if (!window.confirm(aviso)) return;

    setError(null);
    iniciar(async () => {
      try {
        const resultado = await eliminarPersonaAction(personaId);
        if (resultado.error) setError(resultado.error);
        else if (compacto) router.refresh();
        else router.push(ruta("/contratos/acreditacion"));
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo eliminar."));
      }
    });
  }

  if (compacto) {
    return (
      <>
        <button
          type="button"
          onClick={eliminar}
          disabled={pendiente}
          title={`Eliminar la ficha de ${nombre}`}
          aria-label={`Eliminar la ficha de ${nombre}`}
          className="inline-flex items-center rounded-lg p-2 text-gris-suave transition hover:bg-red-50 hover:text-red-600 disabled:cursor-progress disabled:opacity-60"
        >
          {pendiente ? <RuedaCarga className="h-[17px] w-[17px]" /> : <IconTrash size={17} />}
        </button>
        {error && (
          <p role="alert" className="basis-full text-xs font-semibold text-red-600">
            {error}
          </p>
        )}
      </>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={eliminar}
        disabled={pendiente}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-600/80 transition hover:text-red-600 disabled:cursor-progress disabled:opacity-60"
      >
        {pendiente && <RuedaCarga className="h-3.5 w-3.5" />}
        {pendiente ? "Eliminando..." : "Eliminar ficha"}
      </button>
      {error && (
        <p role="alert" className="mt-1.5 max-w-md text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
