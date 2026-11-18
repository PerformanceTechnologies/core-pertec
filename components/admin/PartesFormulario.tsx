import type { Icon } from "@tabler/icons-react";

// Las piezas del formulario de Administración › Usuarios. Sin estado ni "use client": las usan
// igual la parte de servidor del formulario (FormularioUsuario) y la de cliente (SelectorDeAcceso).

/**
 * Elegir una de pocas opciones: un control segmentado hecho con radios de verdad (se envían con el
 * formulario y se manejan con el teclado). Con `valor` y `alCambiar` es controlado; sin ellos,
 * `inicial` marca la opción de partida.
 */
export function Segmentado({
  nombre,
  opciones,
  valor,
  inicial,
  alCambiar,
}: {
  nombre: string;
  opciones: { valor: string; etiqueta: string; Icono?: Icon }[];
  valor?: string;
  inicial?: string;
  alCambiar?: (valor: string) => void;
}) {
  return (
    <div role="radiogroup" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-tinta/[0.06] p-1">
      {opciones.map(({ valor: v, etiqueta, Icono }) => (
        <label
          key={v}
          className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-tinta/60 transition hover:text-tinta has-[:checked]:bg-superficie has-[:checked]:font-semibold has-[:checked]:text-tinta has-[:checked]:shadow-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-naranjo"
        >
          <input
            type="radio"
            name={nombre}
            value={v}
            className="sr-only"
            {...(alCambiar ? { checked: valor === v, onChange: () => alCambiar(v) } : { defaultChecked: inicial === v })}
          />
          {Icono && <Icono size={15} stroke={1.9} aria-hidden />}
          {etiqueta}
        </label>
      ))}
    </div>
  );
}

/** Un interruptor de sí/no sobre un checkbox de verdad (se envía como "on"). */
export function Interruptor({ nombre, inicial, etiqueta, ayuda }: { nombre: string; inicial: boolean; etiqueta: string; ayuda: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-borde px-3.5 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-tinta">{etiqueta}</span>
        <span className="block text-xs leading-snug text-tinta/60">{ayuda}</span>
      </span>
      <input type="checkbox" name={nombre} defaultChecked={inicial} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-tinta/20 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-teal peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-naranjo"
      />
    </label>
  );
}
