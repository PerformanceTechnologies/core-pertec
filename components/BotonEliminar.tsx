"use client";

export default function BotonEliminar({
  accion,
  id,
  mensajeConfirmacion,
}: {
  accion: (form: FormData) => void;
  id: string;
  mensajeConfirmacion: string;
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
        className="text-xs font-medium text-red-600/80 transition hover:text-red-600"
      >
        Eliminar
      </button>
    </form>
  );
}
