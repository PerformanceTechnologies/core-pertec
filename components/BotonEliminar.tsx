"use client";

export default function BotonEliminar({
  accion,
  id,
  mensajeConfirmacion,
  nombre,
}: {
  accion: (form: FormData) => void;
  id: string;
  mensajeConfirmacion: string;
  /** A quién o qué borra, para el lector de pantalla: sin esto, una lista tiene diez «Eliminar» iguales. */
  nombre?: string;
}) {
  return (
    <form
      action={accion}
      onSubmit={(evento) => {
        if (!window.confirm(mensajeConfirmacion)) evento.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={nombre ? `Eliminar ${nombre}` : undefined}
        className="tono-alerta inline-flex min-h-9 items-center rounded-lg border border-borde px-3 text-xs font-semibold transition hover:border-current hover:bg-red-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        Eliminar
      </button>
    </form>
  );
}
