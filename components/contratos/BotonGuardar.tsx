import RuedaCarga from "./RuedaCarga";

/**
 * El botón de enviar de los formularios de Acreditación.
 *
 * No es BotonEnviar: ese lee el estado del <form> con useFormStatus, y estos
 * formularios se envían interceptando el submit (ver useFormulario), así que el
 * estado de "enviando" lo trae quien llama.
 */
export default function BotonGuardar({
  pendiente,
  children,
  cargando = "Guardando...",
  secundario = false,
}: {
  pendiente: boolean;
  children: React.ReactNode;
  cargando?: string;
  secundario?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pendiente}
      aria-busy={pendiente}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition disabled:cursor-progress disabled:opacity-60 ${
        secundario
          ? "border border-borde text-azul hover:border-cian"
          : "bg-azul text-white hover:bg-azul-suave"
      }`}
    >
      {pendiente && <RuedaCarga />}
      {pendiente ? cargando : children}
    </button>
  );
}
