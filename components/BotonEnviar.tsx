"use client";

import { useFormStatus } from "react-dom";
import RuedaCarga from "./RuedaCarga";

/**
 * Botón de submit que muestra la rueda mientras corre la Server Action del form.
 *
 * Tiene que ser un componente aparte, y no el `<button>` del propio formulario:
 * useFormStatus lee el estado del form que lo CONTIENE, así que devuelve pending
 * false si se usa en el mismo componente que renderiza el `<form>`.
 *
 * @param children  El texto normal del botón.
 * @param cargando  El texto mientras se envía. Si no se pasa, el texto no cambia
 *                  y solo aparece la rueda.
 */
export default function BotonEnviar({
  children,
  cargando,
  className = "",
}: {
  children: React.ReactNode;
  cargando?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      // aria-busy para que un lector de pantalla anuncie que está trabajando: el
      // giro de la rueda no lo dice, y el disabled solo por sí mismo se puede
      // confundir con un botón que nunca estuvo disponible.
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 disabled:cursor-progress disabled:opacity-60 ${className}`}
    >
      {pending && <RuedaCarga />}
      {pending && cargando ? cargando : children}
    </button>
  );
}
