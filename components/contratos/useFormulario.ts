"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { EstadoForm } from "@/lib/contratos/acreditacion-modelo";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";

/**
 * Envía un formulario a una Server Action SIN que React lo reinicie después.
 *
 * Con `<form action={...}>`, React 19 vacía los campos cuando la acción termina,
 * y lo hace aunque haya devuelto un error. Un formulario de veinte campos que
 * rechaza el RUT y devuelve todo en blanco es lo peor que le puede pasar a quien
 * lo estaba llenando. Interceptando el submit, los campos se quedan como están:
 * lo que se limpia, si hace falta, lo decide cada formulario.
 */
export function useFormulario(
  accion: (previo: EstadoForm, form: FormData) => Promise<EstadoForm>,
) {
  const [estado, setEstado] = useState<EstadoForm>({});
  const [pendiente, iniciar] = useTransition();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);
    iniciar(async () => {
      try {
        setEstado(await accion({}, datos));
      } catch (e) {
        // Una acción que lanza —sesión caducada, red caída— no puede quedar como
        // un rechazo sin atender: el botón se quedaría sin decir qué pasó.
        setEstado({ error: mensajeDeError(e, "No se pudo guardar.") });
      }
    });
  }

  return { estado, enviar, pendiente, reiniciar: () => setEstado({}) };
}
