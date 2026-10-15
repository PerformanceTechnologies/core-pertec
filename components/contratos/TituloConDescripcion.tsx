import { useId } from "react";

/**
 * Un título cuya descripción aparece solo al pasar el mouse por encima (o al enfocarlo con el
 * teclado, o al tocarlo en el celular, donde no hay mouse).
 *
 * La descripción está SIEMPRE en el documento, solo transparente: así la lee un lector de pantalla
 * (aria-describedby) y el título no cambia de alto al mostrarla. Es CSS puro (group-hover y
 * group-focus), sin JavaScript de cliente: sirve desde un componente de servidor.
 */
export default function TituloConDescripcion({
  titulo,
  descripcion,
  className = "titular text-3xl text-azul",
}: {
  titulo: string;
  descripcion: string;
  className?: string;
}) {
  const id = useId();
  return (
    <h1
      tabIndex={0}
      aria-describedby={id}
      className={`group relative inline-block cursor-help rounded outline-none focus-visible:ring-2 focus-visible:ring-cian ${className}`}
    >
      {titulo}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-max max-w-[min(24rem,85vw)] rounded-lg bg-azul px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-white opacity-0 shadow-[0_10px_28px_-10px_rgba(15,28,51,0.35)] transition group-hover:opacity-100 group-focus:opacity-100"
      >
        {descripcion}
      </span>
    </h1>
  );
}
